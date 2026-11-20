/**
 * T06: prueba OPCIONAL y MANUAL de dos Writers Pi reales en Git worktrees.
 * Modo local: dos respuestas humanas distintas en una terminal TTY.
 * Modo GitHub: DOS revisiones de entornos independientes, comprobadas mediante
 * la API oficial para el mismo run y SHA ANTES de cada intento de escritura.
 * Nunca acepta un parámetro, archivo o respuesta simulada como consentimiento.
 * No sustituye la confirmación dentro de Pi TUI ni permite merge.
 */
import {blockUnisolatedGeneratedCodeTrial} from "../src/runtime/agents/generated-code-trial-admission.js";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute,join} from "node:path";
import {createInterface} from "node:readline/promises";
import ts from "typescript";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueOddDecision} from "../tests/helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {requireDistinctT06Approvals,t06LiveApprovalChallenge,type T06LiveWriterIntent} from "../src/runtime/agents/t06-live-consent.js";
import {runT06NativeIndependentReviews} from "./t06-native-independent-review.js";
import {checkT06Behavior} from "../src/runtime/agents/t06-behavior-isolation.js";
import {requireLiveT06GithubApprovals} from "../src/runtime/agents/t06-github-approvals.js";
import {PersistentWorkspaceStore} from "../src/runtime/workspace-store.js";
import {assessT06WriterEvidence,verifyT06WorkspaceAttribution} from "../src/runtime/agents/t06-writer-evidence.js";
import {assessT06StaticWriteOnly} from "../src/runtime/agents/t06-static-write-evidence.js";
import {stageT06BehaviorSources} from "../src/runtime/agents/t06-behavior-handoff.js";
import {isT06JavaScriptSyntaxValid} from "../src/runtime/agents/t06-javascript-syntax.js";

const model="nvidia/nemotron-3.5-lightning-30b-a3b";
const definitions=[
 {suffix:"a",target:"t06-writer-a.mjs",fn:"sumEvenNumbers",
  instruction:"Implement export function sumEvenNumbers(numbers). Only arrays of finite integers are allowed; throw TypeError otherwise. Sum all even numbers, including negative ones. Return zero for an empty array. Do not mutate the input."},
 {suffix:"b",target:"t06-writer-b.mjs",fn:"normalizeNames",
  instruction:"Implement export function normalizeNames(items). Only arrays of strings are allowed; throw TypeError otherwise. Trim spaces, convert to lower case, ignore empty strings, deduplicate and return names sorted alphabetically. Do not mutate the input."}
] as const;
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const git=(cwd:string,...args:string[])=>execFileSync("git",["-C",cwd,...args],{
 encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:12_000
}).trim();
function verifySource(file:string,fn:string):void{
 const code=readFileSync(file,"utf8");
 if(!code||code.length>10_000)throw Error("Writer output is missing or oversized");
 if(!isT06JavaScriptSyntaxValid(code))throw Error("Writer output is not valid plain JavaScript");
 const parsed=ts.createSourceFile(file,code,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
 if(parsed.parseDiagnostics.length||parsed.statements.length!==1)throw Error("Writer output is not one syntactically valid exported function");
 const declaration=parsed.statements[0];
 if(!declaration||!ts.isFunctionDeclaration(declaration)||declaration.name?.text!==fn||
  !declaration.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword))
  throw Error("Writer output does not export the requested function");
 const forbidden=new Set(["process","globalThis","require","eval","Function",
  "fetch","Deno","Bun","module","Buffer","WebAssembly","constructor","__proto__"]);
 const walk=(node:ts.Node):void=>{
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)||
   ts.isImportEqualsDeclaration(node)||ts.isAwaitExpression(node)||
   ts.isIdentifier(node)&&forbidden.has(node.text)||
   ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)
   throw Error("Writer output contains prohibited runtime access");
  ts.forEachChild(node,walk);
 };
 walk(declaration);
}
/** Las pruebas semánticas se ejecutan en otro proceso SIN claves de proveedor. */
async function nativeWriter(
 root:string,intent:T06LiveWriterIntent,fn:string,instruction:string,policyRoot:string,
 staticOnly:boolean
){
 const target=intent.writeSurface,sha=git(root,"rev-parse","HEAD");
 const candidate={id:intent.taskId,repository:root,revision:sha,createdAt:new Date().toISOString()};
 const decision=issueOddDecision({
  taskId:intent.taskId,repository:root,paths:[target],writes:[{path:target,changeKind:"behavior"}]
 });
 const plan=buildOrchestrationPlan({taskId:intent.taskId,repository:root,prompt:instruction,candidate},decision);
 if(!plan.routeEvidence)throw Error("Native Writer has no candidate-bound route evidence");
 const applicability=decideLifecycleApplicability(decision,{
  taskIdentity:intent.taskId,repositoryIdentity:root,
  candidate:{id:candidate.id,repository:root,revision:sha},
  explicitMode:"organic",affectedSubsystems:["runtime"],
  expectedPaths:[target],requiredArtifacts:[]
 });
 const writerAdmission=issueOrganicWriterAdmission(applicability,[target]);
 const skillContext=issueSkillContext(intent.taskId+":worker",root,candidate,{
  phase:"apply",codeChange:true,risk:"medium"
 });
 const skillPaths=selectSkills(skillContext).map(skill=>skill.path);
 const evidence=new EvidenceStore();
 evidence.addRouteDecision(candidate,plan.routeEvidence,{
  id:intent.taskId+":route",summary:"Ruta ODD acotada de prueba T06",createdAt:new Date().toISOString()
 });
 for(const [name,kind] of [["work-unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const){
  evidence.add(candidate,{id:intent.taskId+":"+name,kind,status:"pass",
   summary:"Autorización humana individual para el único archivo declarado",createdAt:new Date().toISOString()});
 }
 // La extensión de autoridad deniega cualquier write sin un diario atribuible.
 // El diario debe existir FUERA del worktree, en un directorio privado por hijo:
 // almacenarlo dentro produciría un cambio Git fuera del único archivo autorizado.
 const attributionDir=mkdtempSync(join(tmpdir(),"asen-t06-attribution-"));
 const attributionFile=join(attributionDir,"workspace.json");
 const attributionStore=await PersistentWorkspaceStore.open(attributionFile);
 let pid:number|null=null,startedAt:number|null=null,endedAt:number|null=null,observedModel:string|null=null;
 const events:Array<{type:"tool_execution_start"|"tool_execution_end";name?:string;id?:string;error?:boolean}>=[];
 const runner=new PiProcessRunner({
  command:process.env.PI_EXECUTABLE??"pi",policyRoot,providerCredential:"NVIDIA_API_KEY",
  attributionFile,
  oneShotWritePath:target,
  // No permitir siquiera la primera petición de pago o write si Pi no
  // acredita antes el proveedor y el modelo exactos con get_state.
  requireChildModelBeforePrompt:true,
  timeoutMs:180_000,maxOutputBytes:80_000,maxStreamBytes:512_000,
  onProcessStart:processId=>{pid=processId;startedAt=performance.now();},
  onProcessClose:()=>{endedAt=performance.now();},
  onToolExecution:e=>events.push({type:e.type,...(e.toolName?{name:e.toolName}:{}),
   ...(e.toolCallId?{id:e.toolCallId}:{}),...(e.isError!==undefined?{error:e.isError}:{})})
 });
 runner.subscribeChildSelection(value=>{
  if(value.taskId!==intent.taskId+":worker"||value.sessionId!==intent.sessionId||
   value.projectId!==root||!value.model)return;
  observedModel=value.model.id.startsWith(value.model.provider+"/")?
   value.model.id:value.model.provider+"/"+value.model.id;
 });
 const prompt=[
  "TAREA DE ESCRITURA REAL: usa exactamente UNA llamada a la herramienta nativa write de Pi.",
  "Ruta EXACTA y ÚNICA permitida en el worktree actual: "+target+".",
  "Escribe en esa ruta el contenido íntegro del archivo. No basta una respuesta de texto o un bloque de código.",
  "Función exportada obligatoria: "+fn+"; JavaScript ES2022, un único export function.",
  instruction,
  staticOnly?"El supervisor SOLO comprobará escritura y sintaxis SIN EJECUTAR el código. Comportamiento: NO COMPROBADO.":
   "Esta prueba tiene comprobaciones de comportamiento ya definidas por el supervisor, que se ejecutarán fuera de Pi.",
  "No crees archivos de pruebas ni otros archivos; sin imports, dependencias, red, comandos o fusiones.",
  "Después de la llamada write confirma brevemente qué archivo solicitaste escribir. No afirmes haber ejecutado pruebas."
 ].join("\n");
 const result=await new Dispatcher(runner,evidence).dispatch({
  id:intent.taskId+":worker",role:"worker",repository:root,
  isolationKey:intent.sessionId,prompt,candidate,writeSurfaces:[target],
  skillContext,skillPaths,writerAdmission,model,thinking:"minimal"
 });
 // No asumir escritura exitosa a partir del texto de Pi ni de result.ok.
 // La extensión ASEN debe haber persistido una atribución del hijo correcto.
 const attribution=await verifyT06WorkspaceAttribution({
  store:attributionStore,root,sessionId:intent.sessionId,
  agentId:intent.taskId+":worker",target
 });
 const {verified:attributionVerified,entries:attributionEntries}=attribution;
 const file=join(root,target),present=existsSync(file);
 const observedPaths=git(root,"status","--porcelain=v1","--untracked-files=all")
  .split(/\r?\n/u).filter(Boolean).map(row=>row.slice(3));
 const exactScope=observedPaths.length===1&&observedPaths[0]===target;
 let syntaxOk=false,behaviorOk=false;
 if(present&&exactScope){
  try{verifySource(file,fn);syntaxOk=true;if(!staticOnly)behaviorOk=checkT06Behavior(root,target,fn);}catch{}
 }
 const assessment=assessT06WriterEvidence({
  events,requestedModel:model,observedModel,
  processObserved:pid!==null,nativeResultOk:result.ok,
  attributionVerified,exactScope,syntaxOk,behaviorOk
 });
 const staticAssessment=staticOnly?assessT06StaticWriteOnly({
  events,requestedModel:model,observedModel,
  processObserved:pid!==null,nativeResultOk:result.ok,
  attributionVerified,exactScope,syntaxOk
 }):null;
 return Object.freeze({
  worker:intent.taskId,session:intent.sessionId,scope:target,
  requestedModel:model,observedModel:observedModel??"unknown",
  processObserved:pid!==null,writeToolObserved:assessment.writeToolObserved,
  nativeResultOk:result.ok,exactScope,syntaxOk,behaviorOk,
  attributionVerified,attributionEntries,
  writeStarts:assessment.writeStarts,writeSuccesses:assessment.writeSuccesses,
  writeFailures:assessment.writeFailures,blockers:assessment.blockers,
  durationMs:startedAt!==null&&endedAt!==null?Math.round(endedAt-startedAt):null,
  startedAt,endedAt,
  fileSha256:present?digest(readFileSync(file)):null,
  writeOnlyVerified:staticAssessment?.writeOnlyVerified??false,
  behaviorVerified:false as const,
  passed:assessment.passed
 });
}
async function main():Promise<void>{
 const staticOnly=process.env.ASEN_T06_STATIC_WRITE_ONLY==="1";
 // El modo completo sigue bloqueado: solo se permite escribir sin ejecutar el código.
 if(!staticOnly)blockUnisolatedGeneratedCodeTrial("T06");
 if(staticOnly&&(process.env.ASEN_T06_GITHUB_MODE!=="1"||
   process.env.GITHUB_ACTIONS!=="true"||process.env.GITHUB_RUN_ATTEMPT!=="1"))
  throw Error("T06 estático bloqueado: solo la primera ejecución manual aprobada en GitHub");
 const policyRoot=realpathSync(process.env.GITHUB_WORKSPACE??process.cwd());
 const expected=process.env.ASEN_T06_EXPECTED_SHA;
 if(!expected||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(expected)||
  git(policyRoot,"rev-parse","HEAD")!==expected)
  throw Error("T06 bloqueado: especifica el SHA exacto del repositorio para la prueba");
 if(git(policyRoot,"status","--porcelain=v1","--untracked-files=all")!=="")
  throw Error("T06 bloqueado: el repositorio debe permanecer limpio");
 if(!process.env.NVIDIA_API_KEY)throw Error("T06 bloqueado: falta NVIDIA_API_KEY");
 const version=execFileSync(process.env.PI_EXECUTABLE??"pi",["--version"],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:5_000
 }).trim();
 if(!/(?:^|\s)1\.2\.0(?:\s|$)/u.test(version))throw Error("T06 bloqueado: se requiere Pi 1.2.0");
 const githubMode=process.env.ASEN_T06_GITHUB_MODE==="1";
 if(githubMode)await requireLiveT06GithubApprovals();
 else if(!process.stdin.isTTY||!process.stdout.isTTY)
  throw Error("T06 bloqueado: exige dos consentimientos humanos TTY o dos revisiones reales de GitHub");
 const dir=process.env.ASEN_T06_WRITER_REPORT_DIR?
  process.env.ASEN_T06_WRITER_REPORT_DIR:mkdtempSync(join(tmpdir(),"asen-t06-native-receipts-"));
 if(!isAbsolute(dir))throw Error("Directorio de informe T06 inválido");
 mkdirSync(dir,{recursive:true,mode:0o700});
 const roots=definitions.map(item=>realpathSync(mkdtempSync(join(tmpdir(),"asen-pi-writer-"+item.suffix+"-"))));
 let prepared=false,launched=false;
 try{
  for(const root of roots){
   execFileSync("git",["-C",policyRoot,"worktree","add","--detach",root,expected],{
    stdio:"ignore",timeout:15_000
   });
   if(git(root,"rev-parse","HEAD")!==expected||git(root,"status","--porcelain")!=="")
    throw Error("T06 bloqueado: el worktree no coincide con el candidato");
  }
  prepared=true;
  const intents=definitions.map((item,i)=>({
   taskId:"t06-writer-"+item.suffix,sessionId:"t06-child-"+randomUUID(),
   candidateSha:expected,model,writeSurface:item.target,
   nonce:randomBytes(8).toString("hex")
  }));
  if(githubMode){
   // Segunda consulta DESPUÉS de crear los worktrees y justo antes de lanzar
   // ambos Writers. El run no puede heredar aprobaciones de otro intento.
   await requireLiveT06GithubApprovals();
  }else{
   const reader=createInterface({input:process.stdin,output:process.stdout});
   let replies:string[]=[];
   try{
    for(let i=0;i<intents.length;i++){
     const task=intents[i]!,spec=definitions[i]!;
     process.stdout.write("\nWorker "+(i+1)+"/2 · Modelo: "+model+
      " · Coste real: DESCONOCIDO · Archivo: "+task.writeSurface+
      " · SHA: "+expected+"\n"+
      "Sesión Pi propia, worktree separado. Tarea: "+spec.instruction+"\n"+
      "No habrá commits, fusiones ni reintentos automáticos.\n");
     replies.push(await reader.question("Escribe EXACTAMENTE «"+t06LiveApprovalChallenge(task)+"» o pulsa Intro para denegar: "));
    }
   }finally{reader.close();}
   requireDistinctT06Approvals(intents[0]!,replies[0],intents[1]!,replies[1]);
   replies=[];
  }
  launched=true;
  const results=await Promise.allSettled(definitions.map((item,i)=>
   nativeWriter(roots[i]!,intents[i]!,item.fn,item.instruction,policyRoot,staticOnly)
  ));
  const workers=results.map((outcome,i)=>outcome.status==="fulfilled"?outcome.value:{
   worker:intents[i]!.taskId,scope:intents[i]!.writeSurface,
   passed:false,writeOnlyVerified:false,blockers:["worker-exception-needs-manual-inspection"],error:"Worker failed ambiguously; inspect its worktree and Pi process; do not retry"
  });
  const passed=results.every(r=>r.status==="fulfilled"&&
   (staticOnly?r.value.writeOnlyVerified:r.value.passed));
  const intervals=results.flatMap(r=>r.status==="fulfilled"?[r.value]:[]);
  const concurrent=intervals.length===2&&intervals.every(r=>r.startedAt!==null&&r.endedAt!==null)&&
   Math.max(...intervals.map(r=>r.startedAt!))<Math.min(...intervals.map(r=>r.endedAt!));
  // Intervalos reales observados por el proceso padre; no son latencia de red,
  // coste ni una comparación con un sistema externo.
  const observedWindowMs=concurrent?
   Math.ceil(Math.max(...intervals.map(r=>r.endedAt!))-
    Math.min(...intervals.map(r=>r.startedAt!))):null;
  const observedOverlapMs=concurrent?
   Math.ceil(Math.min(...intervals.map(r=>r.endedAt!))-
    Math.max(...intervals.map(r=>r.startedAt!))):null;
  let review:{status:string;reviews:readonly unknown[]}={
   status:"NOT_RUN_WRITERS_UNVERIFIED",reviews:[]
  };
  if(passed&&concurrent&&!staticOnly){
   try{review=await runT06NativeIndependentReviews(roots,policyRoot,model);}
   catch{
    // La escritura ya ocurrió: guardar siempre un informe de la ejecución,
    // aunque la selección o el proveedor revisor sean erróneos.
    review={status:"REVIEW_BLOCKED_CONFIG_OR_PROVIDER",reviews:[]};
   }
  }
  const evidence={
   schema:"asen.t06.native-dual-writer/v1",sha:expected,piVersion:version,
   executionKind:githubMode?
    "NATIVE_PI_RPC_WRITER_WITH_TWO_GITHUB_APPROVALS":
    "NATIVE_PI_RPC_WRITER_WITH_TWO_MANUAL_TERMINAL_APPROVALS",
   consentMethod:githubMode?
    "two-distinct-github-environment-human-approvals-not-native-pi-TUI":
    "two-distinct-interactive-parent-terminal-prompts-not-native-pi-TUI",
   requestedModel:model,modelCostVerified:false,billingVerified:false,
   staticOnly,generatedCodeExecuted:false,behaviorVerified:false,
   distinctWorktrees:true,distinctSessions:true,concurrent,
   observedWindowMs,observedOverlapMs,
   workers:workers.map(r=>{
    const {startedAt:_start,endedAt:_end,...safe}=r;
    return safe;
   }),
   independentReview:review,autoRetry:false,autoMerge:false,
   accepted:false,globalFull:false,
   result:staticOnly?
    (passed&&concurrent?"PASS_TWO_WRITERS_STATIC_ONLY_BEHAVIOR_NOT_TESTED":
     "BLOCKED_OR_PARTIAL_NEEDS_REVIEW"):
    passed&&concurrent?
    (review.status==="PASS_TWO_PI_REVIEWS_NOT_T10"?
     "PASS_TWO_REAL_WRITERS_AND_PI_REVIEWS_NEEDS_T10":
     "PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW"):
    "BLOCKED_OR_PARTIAL_NEEDS_REVIEW"
  };
  if(staticOnly&&passed&&concurrent){
   // Conservar solo fuentes ya acreditadas. La prueba se realizará en otro
   // trabajo GitHub sin NVIDIA_API_KEY, nunca en este proceso privilegiado.
   try{
    stageT06BehaviorSources({report:evidence,expectedSha:expected,
     worktrees:roots,outputDir:dir});
   }catch{
    evidence.result="BLOCKED_OR_PARTIAL_NEEDS_REVIEW";
    process.exitCode=1;
   }
  }
  const file=join(dir,"t06-dual-native-evidence.json");
  writeFileSync(file,JSON.stringify(evidence,null,2)+"\n",{mode:0o600,flag:"wx"});
  process.stdout.write(JSON.stringify({result:evidence.result,sha:expected,report:file,
   independentReview:review.status,worktreeRoots:roots})+"\n");
  if(!passed||!concurrent||
   review.status==="REVIEW_FAILED_OR_UNVERIFIED"||
   review.status==="REVIEW_DECLINED_NO_RETRY"||
   review.status==="REVIEW_BLOCKED_CONFIG_OR_PROVIDER")process.exitCode=1;
 }finally{
  // Un intento de Writer que ha arrancado puede haber dejado efectos
  // ambiguos: no eliminar los worktrees ni reintentar automáticamente.
  if(!launched){
   for(const root of roots){
    try{execFileSync("git",["-C",policyRoot,"worktree","remove","--force",root],{stdio:"ignore"});}catch{
     if(!prepared)try{rmSync(root,{recursive:true,force:true});}catch{}
    }
   }
  }
 }
}
await main();
