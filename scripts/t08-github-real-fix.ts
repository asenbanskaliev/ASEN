/** Prueba T08 auténtica y acotada. Dos revisores Pi -> dictamen y propuesta
 * original ASEN -> aprobación GitHub -> plan ODD -> Writer Pi -> dos revisores.
 * NO simula revisiones, NO reutiliza aprobaciones, NO fusiona y NO declara FULL.
 * Nunca modifica el worktree del repositorio original.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute,join} from "node:path";
import type {PiReviewRegistry,PiReviewerModel,PiReviewEvent} from "../src/review/pi-model-reviewer.js";
import {runJudgmentDay} from "../src/review/judgment-day.js";
import {proposeJudgmentFixHandoff} from "../src/review/odd-agent-review-flow.js";
import {JudgmentFixProposalJournal,type StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";
import {draftOddFromStoredFix} from "../src/review/judgment-fix-odd-draft.js";
import {inspectLiveFixCandidate} from "../src/review/judgment-fix-odd-preflight.js";
import {validateFreshFixOddRequest} from "../src/review/judgment-fix-odd-planning.js";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {inspectFixOddRecovery} from "../src/review/judgment-fix-odd-recovery.js";
import {controlledInstructionPlanCommand} from "../src/runtime/lifecycle/route-command.js";
import {requireLiveT08GithubApprovals,type T08ApprovalStage} from "../src/runtime/agents/t08-github-approvals.js";
import {T08_TARGET,T08_BUGGY_SOURCE,checkT08Behavior} from "../src/runtime/agents/t08-controlled-fixture.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {issueOddDecision} from "../tests/helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {PersistentWorkspaceStore} from "../src/runtime/workspace-store.js";
import {assessT06WriterEvidence} from "../src/runtime/agents/t06-writer-evidence.js";
import {createT08IsolatedRepository,removeT08IsolatedRepository,t08TemporaryRoot}
 from "../src/runtime/agents/t08-isolated-repository.js";

const sha256=(x:string|Buffer)=>createHash("sha256").update(x).digest("hex");
const git=(root:string,...args:string[])=>execFileSync("git",["-C",root,...args],{
 encoding:"utf8",timeout:10_000,stdio:["ignore","pipe","pipe"]
}).trim();
const reportSchema="asen.t08.real-fix-report/v1";
const sourceSchema="asen.t08.real-initial-review/v1";
const required="sumEvenNumbers(numbers) recibe exclusivamente un array de enteros finitos. "+
 "Debe lanzar TypeError para cualquier otro dato o elemento; sumar todos los valores pares "+
 "(positivos o negativos), devolver cero para un array vacío y no modificar la entrada. "+
 "Busca en el archivo t08-fix.mjs el fallo de validación de los elementos. "+
 "No inventes ejecuciones de pruebas ni cambies el código. "+
 "Cada fallo debe citar exactamente t08-fix.mjs y describir el defecto concreto.";

type Models=Readonly<{reviewerA:string;reviewerB:string;writer:string}>;
const reviewer=(value:string):PiReviewerModel=>({provider:"nvidia",id:value.slice("nvidia/".length)});
function nativeReviewerOutput(output:string):string{
 if(output.length>512_000)throw Error("Respuesta Pi demasiado grande");
 let lines:unknown[];
 try{lines=output.trim().split(/\r?\n/u).filter(Boolean).map(s=>JSON.parse(s));}
 catch{throw Error("Flujo de revisión Pi no válido");}
 const tools=lines.filter(e=>typeof e==="object"&&e!==null&&"type" in e&&
  typeof e.type==="string"&&(e.type.startsWith("tool_execution_")||
   e.type.startsWith("toolcall_")));
 if(tools.length)throw Error("Un revisor intentó utilizar herramientas");
 const messages=lines.filter(e=>typeof e==="object"&&e!==null&&
  "type" in e&&e.type==="message_end"&&"message" in e&&
  !!e.message&&typeof e.message==="object"&&
  "role" in e.message&&e.message.role==="assistant");
 if(messages.length!==1)throw Error("El revisor no emitió un único dictamen Pi final");
 const msg=messages[0] as {message:{content:unknown}};
 if(!Array.isArray(msg.message.content)||msg.message.content.length!==1)
  throw Error("El dictamen Pi tiene contenido no permitido");
 const first:unknown=msg.message.content[0];
 if(!first||typeof first!=="object"||!("type" in first)||
  first.type!=="text"||!("text" in first)||typeof first.text!=="string"||
  first.text.length>24_000)
  throw Error("El revisor no devolvió solo texto acotado");
 return first.text;
}
/** Adaptador del modelo nativo Pi al protocolo de revisores auténticos de ASEN.
 * No fabrica aprobaciones ni respuestas: un error Pi aborta toda la etapa. */
function nativeRegistry(
 root:string,policyRoot:string,models:Models
):PiReviewRegistry{
 const candidates=[reviewer(models.reviewerA),reviewer(models.reviewerB)];
 return {
  getAvailable:()=>candidates,
  hasConfiguredAuth:entry=>Boolean(process.env.NVIDIA_API_KEY)&&
   candidates.some(candidate=>candidate.provider===entry.provider&&candidate.id===entry.id),
  streamSimple:(entry,context,options)=> (async function*():AsyncIterable<PiReviewEvent>{
   const requested=entry.provider+"/"+entry.id;
   if(!candidates.some(x=>x.provider===entry.provider&&x.id===entry.id))
    throw Error("Modelo revisor no seleccionado");
   const taskId="t08-judge-"+randomUUID(),session="t08-review-"+randomUUID();
   let pid=0,observed:string|null=null,toolEvents=0;
   const runner=new PiProcessRunner({
    command:process.env.PI_EXECUTABLE??"pi",policyRoot,
    providerCredential:"NVIDIA_API_KEY",noTools:true,
    timeoutMs:150_000,maxOutputBytes:95_000,maxStreamBytes:512_000,
    onProcessStart:p=>{pid=p;},onToolExecution:()=>{toolEvents++;}
   });
   runner.subscribeChildSelection(value=>{
    if(value.taskId===taskId&&value.sessionId===session&&
     value.projectId===root&&value.model)
     observed=value.model.id.startsWith(value.model.provider+"/")?
      value.model.id:value.model.provider+"/"+value.model.id;
   });
   const inputText=context.messages.map(m=>m.content.map(c=>c.text).join("\n")).join("\n");
   const prompt=context.systemPrompt+"\n\n"+
    "Responde solo en JSON estricto, sin formato Markdown. No utilices herramientas.\n"+
    inputText;
   if(options?.signal?.aborted)throw Error("Revisión cancelada");
   const result=await runner.run({
    id:taskId,role:"reviewer",repository:root,isolationKey:session,
    prompt,model:requested,thinking:"minimal"
   });
   if(options?.signal?.aborted||!result.ok||!pid||observed!==requested||toolEvents)
    throw Error("No se pudo verificar el proceso, modelo o aislamiento del juez Pi");
   const text=nativeReviewerOutput(result.output);
   yield {type:"done",reason:"stop",message:{content:[{type:"text",text}]}};
  })()
 };
}
async function judgment(
 root:string,policyRoot:string,session:string,models:Models,author:PiReviewerModel
){
 const workspace=openWorkspaceReview({
  repositoryRoot:root,intendedUntracked:[T08_TARGET],sessionId:session,
  reviewerId:"asen-t08-independent-judges",viewParent:tmpdir(),
  risk:{riskId:"t08-e2e",reason:"Error controlado de validación",severity:"high",
   lenses:["risk","reliability"]}
 },{reviewPaths:[T08_TARGET]});
 try{
  const evidence=readWorkspaceReviewEvidence(workspace);
  const registry=nativeRegistry(root,policyRoot,models);
  const result=await runJudgmentDay({
   registry,author,judgeA:reviewer(models.reviewerA),
   judgeB:reviewer(models.reviewerB),evidence,requirements:required
  });
  return {result,evidence};
 }finally{closeWorkspaceReview(workspace);}
}
function checkModels():Models{
 const models:Models={
  reviewerA:process.env.ASEN_T08_REVIEW_A??"",
  reviewerB:process.env.ASEN_T08_REVIEW_B??"",
  writer:process.env.ASEN_T08_WRITER_MODEL??""
 };
 if(new Set(Object.values(models)).size!==3||Object.values(models).some(
  s=>!/^nvidia\/[A-Za-z0-9][A-Za-z0-9_./:@-]{2,190}$/u.test(s)))
  throw Error("T08 necesita tres modelos NVIDIA distintos");
 return models;
}
async function firstReview(root:string,policyRoot:string,models:Models,dir:string,sha:string):Promise<void>{
 assert.equal(checkT08Behavior(root),false,"El defecto inicial no puede pasar las pruebas");
 const session="t08-original-"+randomUUID();
 const {result,evidence}=await judgment(root,policyRoot,session,models,
  {provider:"fixture",id:"error-controlado"});
 if(result.status!=="findings-require-review"||
  result.judges.length!==2||result.judges.some(j=>j.verdict!=="fail")||
  result.findings.filter(f=>f.finding.path===T08_TARGET).length<2)
  throw Error("Dos jueces no acreditaron el mismo defecto; se requiere análisis humano");
 const handoff=proposeJudgmentFixHandoff({
  report:result,evidence,fixProfile:{model:models.writer}
 });
 if(handoff.status!=="fix-planning-required"||
  handoff.paths.length!==1||handoff.paths[0]!==T08_TARGET||
  handoff.writerAuthority!==false||handoff.autoLaunch!==false)
  throw Error("Dictamen auténtico no generó propuesta Fix segura");
 const proposal=await new JudgmentFixProposalJournal(join(dir,"proposals.json")).record(handoff);
 const draft=draftOddFromStoredFix({proposal,identity:{sessionId:session,projectId:root}});
 if(draft.status!=="draft-only"||draft.writerAuthority!==false)
  throw Error("La propuesta persistida no es un ODD pendiente");
 const record={
  schema:sourceSchema,sha,runId:process.env.GITHUB_RUN_ID,attempt:1,
  sourceFileSha256:sha256(T08_BUGGY_SOURCE),
  fixtureHead:git(root,"rev-parse","HEAD"),
  sourceTree:result.candidateTreeIdentity,
  judgeCount:2,judgeVerdicts:result.judges.map(x=>x.verdict),
  models,proposal,writerExecuted:false,autoMerge:false,
  accepted:false,globalFull:false
 };
 writeFileSync(join(dir,"t08-first-review.json"),JSON.stringify(record,null,2)+"\n",{
  flag:"wx",mode:0o600
 });
 console.log(JSON.stringify({status:"PROPOSED_FIX_WAITING_HUMAN_APPROVAL",
  proposalId:proposal.id,sourceTree:record.sourceTree,models,globalFull:false}));
}
interface FirstReviewData{
 readonly schema:string;readonly sha:string;readonly runId:string;readonly attempt:number;
 readonly sourceFileSha256:string;readonly sourceTree:string;
 readonly fixtureHead:string;
 readonly judgeCount:number;readonly judgeVerdicts:readonly string[];
 readonly models:Models;readonly proposal:StoredJudgmentFixProposal;
 readonly writerExecuted:false;readonly autoMerge:false;
 readonly accepted:false;readonly globalFull:false;
}
function parseFirstReview(dir:string,root:string,sha:string,models:Models):FirstReviewData{
 const file=process.env.ASEN_T08_SOURCE_REPORT;
 if(!file||!isAbsolute(file))throw Error("Falta informe original de revisión");
 const raw=readFileSync(file,"utf8");
 if(raw.length>25_000)throw Error("Informe inicial demasiado grande");
 const report:FirstReviewData=JSON.parse(raw);
 if(report.schema!==sourceSchema||report.sha!==sha||
  report.runId!==process.env.GITHUB_RUN_ID||report.attempt!==1||
  report.sourceFileSha256!==sha256(T08_BUGGY_SOURCE)||
  !/^[a-f0-9]{40}$/u.test(report.sourceTree)||
  !/^[a-f0-9]{40}$/u.test(report.fixtureHead)||
  report.fixtureHead!==git(root,"rev-parse","HEAD")||
  report.judgeCount!==2||
  JSON.stringify(report.judgeVerdicts)!=='["fail","fail"]'||
  JSON.stringify(report.models)!==JSON.stringify(models)||
  report.writerExecuted!==false||report.autoMerge!==false||
  report.accepted!==false||report.globalFull!==false||
  !report.proposal||report.proposal.repositoryRoot!==root||
  report.proposal.candidateTreeIdentity!==report.sourceTree||
  report.proposal.requiredAction!=="new-odd-plan")
  throw Error("La propuesta guardada no pertenece al mismo run, modelo o fuente");
 // Recibos JSON se comprueban mediante la identidad original calculada,
 // NUNCA se convierten por sí mismos en permiso Writer.
 const draft=draftOddFromStoredFix({
  proposal:report.proposal,identity:{
   sessionId:report.proposal.sessionId,projectId:root
  }
 });
 const live=inspectLiveFixCandidate(draft);
 if(live.candidateTreeIdentity!==report.sourceTree||
  live.repositoryHead!==report.fixtureHead)
  throw Error("El código cambió desde los dictámenes, prohibido reparar");
 return report;
}
async function saveOddPlan(root:string,source:FirstReviewData,dir:string){
 const proposal=source.proposal,identity={
  sessionId:proposal.sessionId,projectId:root
 };
 const draft=draftOddFromStoredFix({proposal,identity});
 const raw=JSON.stringify({
  instruction:"Corregir el defecto controlado de t08-fix.mjs. "+
   "Validar que solo se acepten arrays de enteros finitos, devolver la suma "+
   "de pares sin mutación y mantener el cambio limitado al único archivo autorizado.",
  taskIdentity:"fix-"+proposal.id.slice(0,24),intent:"defect",
  scope:{kind:"known",expectedPaths:[T08_TARGET]},
  writes:[{path:T08_TARGET,changeKind:"behavior"}],
  riskOperations:[],session:{estimatedMinutes:15,continuation:false},
  testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:10},
  unresolvedDecisions:[]
 });
 const checked=validateFreshFixOddRequest(draft,raw);
 if(!checked.readyToSavePlan||checked.authorized!==false)
  throw Error("La solicitud ODD no pasó las comprobaciones");
 const candidate={id:"fix-"+proposal.id.slice(0,24),repository:root,
  revision:git(root,"rev-parse","HEAD"),createdAt:new Date().toISOString()};
 const out=JSON.parse(controlledInstructionPlanCommand(raw,root,candidate)) as {
  executablePlan:{route:string;topologicalOrder:string[];tasks:Array<{
   id:string;title:string;role:string;instruction:string;dependsOn:string[];
   skillPaths:string[];priority:number;model?:string;thinking?:string;
   skillSelection?:unknown;candidate?:unknown;candidateRevision?:string;
   writeSurfaces?:string[];writerAuthorizationBasis?:string
  }>};
 };
 if(out.executablePlan?.route!=="orchestrate")
  throw Error("La planificación ODD no generó un flujo válido");
 const ordered=out.executablePlan.topologicalOrder.map(id=>{
  const task=out.executablePlan.tasks.find(x=>x.id===id);
  if(!task)throw Error("Tarea ODD no encontrada");return task;
 });
 const drafts=ordered.map(task=>({
  title:task.title,requestId:"asen-plan:"+task.id,
  dependsOn:task.dependsOn.map(id=>"asen-plan:"+id),
  description:task.instruction,
  plan:{
   role:task.role,skillPaths:task.skillPaths,priority:task.priority,
   ...(task.model?{model:task.model}:{}),
   ...(task.thinking?{thinking:task.thinking}:{}),
   ...(task.skillSelection?{skillSelection:task.skillSelection}:{}),
   ...(task.candidate?{candidate:task.candidate}:{}),
   ...(task.candidateRevision?{candidateRevision:task.candidateRevision}:{}),
   ...(task.writeSurfaces?{writeSurfaces:task.writeSurfaces}:{}),
   ...(task.writerAuthorizationBasis?{writerAuthorizationBasis:task.writerAuthorizationBasis}:{}),
   ...(task.role==="worker"?{fixSource:{
    proposalId:proposal.id,treeIdentity:proposal.candidateTreeIdentity
   }}:{})
  }
 }));
 const store=await SessionTodoStore.open(join(dir,"todos.json"));
 await store.addPlan(drafts as unknown as Parameters<typeof store.addPlan>[0],identity);
 const rows=await store.list(identity);
 const recovery=inspectFixOddRecovery({draft,identity,todos:rows,archivedTodos:[]});
 if(recovery.status!=="worker-observed"||recovery.workerState!=="planned"||
  !rows.find(r=>r.taskId===recovery.workerTodoId&&r.plan?.writerAuthorizationBasis))
  throw Error("El Worker Fix no quedó guardado en ODD de forma comprobable");
 const live=inspectLiveFixCandidate(draft);
 if(live.candidateTreeIdentity!==source.sourceTree)
  throw Error("La fuente revisada cambió durante el plan ODD");
 return {identity,workerId:recovery.workerTodoId,proposalId:proposal.id,
  planSaved:true,writerAuthorized:false as const};
}
async function fixWorker(
 root:string,policyRoot:string,models:Models,source:FirstReviewData,
 dir:string,approval:{writerId:string;session:string}
){
 const expected=git(root,"rev-parse","HEAD");
 // El agente que recibe autoridad es EXACTAMENTE el Todo creado y validado
 // por ODD, no un identificador nuevo decidido por el controlador del ensayo.
 const taskId=approval.writerId,workerId=taskId+":worker";
 if(!/^todo-[a-z0-9-]{6,128}$/u.test(taskId))
  throw Error("T08 no concede Writer a un identificador ajeno al Todo guardado");
 const candidate={id:taskId,repository:root,revision:expected,
  createdAt:new Date().toISOString()};
 const instruction="Corregir la validación de enteros finitos en sumEvenNumbers, "+
  "sumar los pares incluyendo negativos, sin mutar la entrada";
 const decision=issueOddDecision({
  taskId,repository:root,paths:[T08_TARGET],
  writes:[{path:T08_TARGET,changeKind:"behavior"}]
 });
 const plan=buildOrchestrationPlan({
  taskId,repository:root,prompt:instruction,candidate
 },decision);
 if(!plan.routeEvidence)throw Error("La reparación no dispone de ruta ODD");
 const applicable=decideLifecycleApplicability(decision,{
  taskIdentity:taskId,repositoryIdentity:root,
  candidate:{id:taskId,repository:root,revision:expected},
  explicitMode:"organic",affectedSubsystems:["runtime"],
  expectedPaths:[T08_TARGET],requiredArtifacts:[]
 });
 const admission=issueOrganicWriterAdmission(applicable,[T08_TARGET]);
 const skillContext=issueSkillContext(workerId,root,candidate,{
  phase:"apply",codeChange:true,risk:"medium"
 });
 const evidence=new EvidenceStore();
 evidence.addRouteDecision(candidate,plan.routeEvidence,{
  id:taskId+":route",summary:"Fix T08 controlado",createdAt:new Date().toISOString()
 });
 for(const [name,kind] of [["work-unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const){
  evidence.add(candidate,{id:taskId+":"+name,kind,status:"pass",
   summary:"Aprobación real GitHub limitada a "+T08_TARGET,
   createdAt:new Date().toISOString()});
 }
 const attributionPath=join(dir,"workspace.json");
 const store=await PersistentWorkspaceStore.open(attributionPath);
 const events:Array<{type:"tool_execution_start"|"tool_execution_end";name?:string;id?:string;error?:boolean}>=[];
 let observed:string|null=null,pid=0;
 const runner=new PiProcessRunner({
  command:process.env.PI_EXECUTABLE??"pi",policyRoot,
  providerCredential:"NVIDIA_API_KEY",attributionFile:attributionPath,
  timeoutMs:180_000,maxOutputBytes:90_000,maxStreamBytes:512_000,
  onProcessStart:value=>{pid=value;},
  onToolExecution:e=>events.push({type:e.type,
   ...(e.toolName?{name:e.toolName}:{}),
   ...(e.toolCallId?{id:e.toolCallId}:{}),
   ...(e.isError!==undefined?{error:e.isError}:{})})
 });
 runner.subscribeChildSelection(value=>{
  if(value.taskId===workerId&&value.sessionId===approval.session&&
   value.projectId===root&&value.model)
   observed=value.model.id.startsWith(value.model.provider+"/")?
    value.model.id:value.model.provider+"/"+value.model.id;
 });
 const prompt=[
  "El usuario autorizó esta reparación controlada y ninguna otra.",
  "Usa exactamente UNA llamada a la herramienta nativa write para SUSTITUIR "+
   T08_TARGET+". No respondas solamente con código.",
  "Escribe una única función exportada sumEvenNumbers(numbers), JavaScript ES2022.",
  instruction,
  "Devuelve TypeError para entradas que no sean arrays de enteros finitos.",
  "No crees archivos nuevos, no uses imports, comandos, red, herramientas extra, "+
   "no hagas commit y no modifiques ningún otro archivo.",
  "No afirmes haber ejecutado pruebas; el controlador las hará tras escribir."
 ].join("\n");
 const result=await new Dispatcher(runner,evidence).dispatch({
  id:workerId,role:"worker",repository:root,isolationKey:approval.session,
  prompt,candidate,writeSurfaces:[T08_TARGET],
  skillContext,skillPaths:selectSkills(skillContext).map(x=>x.path),
  writerAdmission:admission,model:models.writer,thinking:"minimal"
 });
 const records=await store.list({
  sessionId:approval.session,projectId:root,worktree:root
 });
 const attributionVerified=records.length===1&&
  records[0]?.change.actor.kind==="agent"&&
  records[0]?.change.actor.id===workerId&&
  records[0]?.change.path===T08_TARGET&&
  records[0]?.change.sessionId===approval.session&&
  records[0]?.change.operation==="modify";
 const exactScope=git(root,"status","--porcelain","--untracked-files=all")===
  "?? "+T08_TARGET;
 const checks=assessT06WriterEvidence({
  events,requestedModel:models.writer,observedModel:observed,
  processObserved:pid>0,nativeResultOk:result.ok,
  attributionVerified,exactScope,
  syntaxOk:exactScope&&checkT08Behavior(root),
  behaviorOk:exactScope&&checkT08Behavior(root)
 });
 if(!checks.passed)throw Error("El Writer real no acreditó escritura y pruebas: "+
  checks.blockers.join(","));
 const resultSha=sha256(readFileSync(join(root,T08_TARGET)));
 if(resultSha===source.sourceFileSha256)
  throw Error("El Worker no cambió el código defectuoso");
 return {workerPidObserved:true,modelActual:observed,
  fileSha256:resultSha,toolCalls:checks.writeStarts,
  exactScope,attributionVerified,behaviorOk:true};
}
async function finalFix(
 root:string,policyRoot:string,models:Models,dir:string,sha:string
):Promise<void>{
 const source=parseFirstReview(dir,root,sha,models);
 // La aprobación para reparar NO se infiere del primer visto bueno.
 await requireLiveT08GithubApprovals("fix");
 const plan=await saveOddPlan(root,source,dir);
 await requireLiveT08GithubApprovals("fix");
 const outcome=await fixWorker(root,policyRoot,models,source,dir,{
  writerId:plan.workerId,session:"t08-writer-"+randomUUID()
 });
 assert.equal(checkT08Behavior(root),true);
 const {result}=await judgment(root,policyRoot,
  "t08-postfix-"+randomUUID(),models,reviewer(models.writer));
 if(result.status!=="analysis-complete"||result.judges.length!==2||
  result.judges.some(j=>j.verdict!=="pass"))
  throw Error("La revisión posterior no validó la corrección; requiere intervención");
 const report=Object.freeze({
  schema:reportSchema,sha,runId:process.env.GITHUB_RUN_ID,
  initialJudges:["fail","fail"],finalJudges:["pass","pass"],
  modelRoutes:models,writer:outcome,
  oddPlanPersisted:true,
  sourceTree:source.sourceTree,proposalId:source.proposal.id,
  result:"T08_SCOPED_REAL_PASS_NEEDS_EXTERNAL_ACCEPTANCE",
  providerCostVerified:false,billingVerified:false,
  userInterfaceValidated:false,productionFixFlowValidated:false,
  accepted:false,autoRetry:false,autoMerge:false,globalFull:false
 });
 writeFileSync(join(dir,"t08-result.json"),JSON.stringify(report,null,2)+"\n",{
  flag:"wx",mode:0o600
 });
 console.log(JSON.stringify({result:report.result,sha,
  modelRoutes:models,globalFull:false}));
}
async function main():Promise<void>{
 const stage=process.argv[2];
 if(stage!=="review"&&stage!=="fix")throw Error("T08 requiere fase review o fix");
 const phase: T08ApprovalStage=stage;
 const policyRoot=realpathSync(process.env.GITHUB_WORKSPACE??process.cwd());
 const sha=process.env.ASEN_T08_EXPECTED_SHA??"";
 if(!/^[a-f0-9]{40}$/u.test(sha)||git(policyRoot,"rev-parse","HEAD")!==sha||
  git(policyRoot,"status","--porcelain")!=="")
  throw Error("Repositorio T08 no coincide con el SHA exacto o contiene cambios");
 const dir=process.env.ASEN_T08_REPORT_DIR??"";
 if(!isAbsolute(dir))throw Error("Informe T08 necesita carpeta absoluta");
 mkdirSync(dir,{recursive:true,mode:0o700});
 if(!process.env.NVIDIA_API_KEY)throw Error("No hay NVIDIA_API_KEY");
 const version=execFileSync(process.env.PI_EXECUTABLE??"pi",["--version"],{
  encoding:"utf8",timeout:5_000,stdio:["ignore","pipe","pipe"]
 }).trim();
 if(!/(?:^|\s)1\.2\.0(?:\s|$)/u.test(version))throw Error("T08 requiere Pi 1.2.0");
 const models=checkModels(),runId=process.env.GITHUB_RUN_ID??"";
 const root=t08TemporaryRoot(runId);
 await requireLiveT08GithubApprovals(phase);
 let created=false;
 try{
  const fixture=createT08IsolatedRepository({
   root,controllerSha:sha,originalSource:T08_BUGGY_SOURCE
  });
  created=true;
  if(fixture.controllerSha!==sha||fixture.target!==T08_TARGET)
   throw Error("La identidad del controlador T08 cambió");
  if(phase==="review")await firstReview(root,policyRoot,models,dir,sha);
  else await finalFix(root,policyRoot,models,dir,sha);
 }finally{if(created)removeT08IsolatedRepository(root,runId);}
}
try{await main();}
catch(error){
 console.error("T08 BLOQUEADO: "+(error instanceof Error?error.message:"error no identificado"));
 process.exitCode=1;
}
