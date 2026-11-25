/** E3 focalizado: usa un defecto sintético conocido, no resultados Writer
 * ficticios ni una repetición de E2A. El mismo recorrido pasa primero por un
 * transporte simulado (sin credenciales), después por Pi/NVIDIA real.
 * Nunca autoriza una integración de producción. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,isAbsolute,join,resolve} from "node:path";
import {SessionManager,ModelRuntime,ModelRegistry} from "@earendil-works/pi-coding-agent";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRunner} from "../src/agents/dispatcher.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";
import type {RuntimeProfilesFile} from "../src/runtime/lifecycle/profiles.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {TaskAgentTodoReconciler} from "../src/runtime/agents/task-agent-reconciler.js";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {runJudgmentDay} from "../src/review/judgment-day.js";
import {proposeJudgmentFixHandoff} from "../src/review/odd-agent-review-flow.js";
import {JudgmentFixProposalJournal} from "../src/review/judgment-fix-proposal-journal.js";
import type {PiReviewRegistry,PiReviewerModel} from "../src/review/pi-model-reviewer.js";
import {createReviewReceiptSigned,loadReceiptSigningKey,writeReviewReceipt} from "../src/evidence/review-receipt.js";
import {ReceiptVerifierService} from "../src/evidence/receipt-verifier.js";
import {selectSkills} from "../src/skills/registry.js";
import {executeRddRepositoryInspection,prepareRddRepositoryInspection} from "../src/defects/rdd-repository-inspection.js";
import {parseRddPolicyBytes} from "../src/defects/rdd-policy-source.js";
import {authorizeRepositoryOperation,type RepositoryOperationBinding} from "../src/repository/operation-policy.js";
import {recordRddReproduction} from "../src/defects/rdd-reproduction.js";
import {bindRddDefectEvidence} from "../src/defects/rdd-defect-binding.js";
import {executeNodeTestObservation,executeNodePassingObservation} from "../src/test/tdd-observation.js";
import {normalizeT06PiChildSelection} from "../src/runtime/agents/t06-pi-receipt-validator.js";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";

const real=process.argv[2]==="--real";
if(!real&&process.argv[2]!=="--offline")throw Error("Indicar --offline o --real");
if(real&&!process.env.NVIDIA_API_KEY)throw Error("Falta credencial NVIDIA");
if(real){
 const dir=process.env.PI_CODING_AGENT_DIR;
 if(!dir||!isAbsolute(dir))throw Error("Falta configuración Pi aislada para el ensayo");
 const settings=JSON.parse(readFileSync(join(dir,"settings.json"),"utf8"));
 if(settings?.retry?.enabled!==false||settings?.retry?.maxRetries!==0||settings?.retry?.provider?.maxRetries!==0)
  throw Error("Los reintentos Pi deben estar desactivados antes de cualquier inferencia");
}
const fixPhaseBudgetMs=110000;
for(const key of Object.keys(process.env))if(key.toUpperCase().startsWith("GIT_"))delete process.env[key];
const root=realpathSync(resolve(process.env.GITHUB_WORKSPACE??process.cwd()));
const expected=process.env.ASEN_EXPECTED_SHA,output=process.env.ASEN_E3_FOCUSED_REPORT;
const raw=(cwd:string,...args:string[])=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:isolatedGitEnvironment(),timeout:15000});
const git=(cwd:string,...args:string[])=>raw(cwd,...args).trim();
if(!expected||!output||git(root,"rev-parse","HEAD")!==expected||raw(root,"status","--porcelain=v1","--untracked-files=all"))throw Error("Checkout de ensayo no autorizado");
const temp=realpathSync(mkdtempSync(join(tmpdir(),"asen-e3-fix-")));
const project=join(temp,"repo"),home=join(temp,"home"),privateDir=join(home,".asen");
const model="nvidia/nemotron-3.5-lightning-30b-a3b",wrong="ASEN-NATIVE-LOT-A",correct="ASEN-NATIVE-CORRECT-A";
const testPath="reproduction.test.mjs";
const requirements="The reproduction test is an intentional failing test to preserve unchanged. Review only the exact requirement: a.txt must contain ASEN-NATIVE-CORRECT-A with no newline. If it differs, fail and quote both observed and expected tokens verbatim in an a.txt finding. If exact, pass with no findings. Tests are verified separately; do not treat the not-run evidence field as a defect. Return the required JSON object only.";
// Los IDs físicos pueden contener la familia del modelo además del proveedor.
function judgeIdentityForms(descriptor:Pick<PiReviewerModel,"provider"|"id">):readonly string[]{
 const qualified=descriptor.id.startsWith(descriptor.provider+"/")?descriptor.id:descriptor.provider+"/"+descriptor.id;
 return [...new Set([descriptor.id,qualified,descriptor.provider+"/"+descriptor.id,qualified.slice(descriptor.provider.length+1)])];
}
function matchesJudgeIdentity(descriptor:Pick<PiReviewerModel,"provider"|"id">,provider:string,observed:string):boolean{
 return provider===descriptor.provider&&judgeIdentityForms(descriptor).includes(observed);
}
// Controles deterministas antes de cualquier llamada real.
for(const id of ["nvidia/nemotron-3-ultra-550b-a55b","nvidia/nemotron-3.5-super-vl-120b-a12b","nvidia/nemotron-3-super-120b-a12b","openai/gpt-oss-20b","deepseek-ai/deepseek-v4.1-flash"]){
 const descriptor={provider:"nvidia",id};
 assert.ok(matchesJudgeIdentity(descriptor,"nvidia",id));
 assert.ok(matchesJudgeIdentity(descriptor,"nvidia","nvidia/"+id));
 assert.equal(matchesJudgeIdentity(descriptor,"otro",id),false);
 assert.equal(matchesJudgeIdentity(descriptor,"nvidia",id+"-otro"),false);
}
const report={schema:"asen.e3.focused-fix/v1",sha:expected,mode:real?"REAL_NVIDIA":"OFFLINE_SIMULATION",fixture:"DETERMINISTIC_DEFECT_NOT_WRITER_OUTPUT",authorization:"TEST_HOST_CONSENT_ONLY",globalFull:false,autoMerge:false,autoRetry:false,costVerified:false,status:"BLOCKED",stage:"fixture",judgeModels:[] as string[],catalogModels:[] as string[],judgeCalls:0,judgeDiagnostics:[] as {model:string;result:string;providerMatches?:boolean;modelMatches?:boolean;responseMatches?:boolean;responseModel?:string;contentKinds?:string[]}[],failureCategory:"none",firstVerdicts:[] as string[],secondVerdicts:[] as string[],fixPlanSaved:false,defectReproduced:false,fixApproved:false,fixStarted:false,nativeFixModel:"unknown",nativeWriteStarts:0,nativeWriteEnds:0,nativeErrors:0,exactTreeScope:false,signedTests:false,finalTree:"unknown"};
let agents:AgentRuntime|undefined,owner:{sessionId:string;projectId:string}|undefined;
try{
 mkdirSync(project);mkdirSync(privateDir,{recursive:true,mode:0o700});
 git(project,"init","-qb","ensayo-fix");git(project,"config","user.name","ASEN ensayo");git(project,"config","user.email","test@example.invalid");git(project,"config","core.autocrlf","false");
 const hooks=join(temp,"empty-hooks");mkdirSync(hooks);git(project,"config","core.hooksPath",hooks);
 // El host sintético ofrece únicamente la herramienta que autoriza el ensayo.
 // Los perfiles y herramientas de producción permanecen intactos.
 for(const name of ["a.txt","b.txt","c.txt"])writeFileSync(join(project,name),"original");
 writeFileSync(join(project,testPath),`import test from "node:test";test("negative control",()=>{});\n`);
 const skillPaths=new Set((["low","medium","high"] as const).flatMap(risk=>[false,true].flatMap(verification=>selectSkills({selectionProfile:"organic",phase:"apply",risk,defect:true,codeChange:false,behaviorChange:false,filesTouched:1,verification}).map(s=>s.path))));
 for(const path of skillPaths){const file=join(project,path);mkdirSync(dirname(file),{recursive:true});copyFileSync(join(root,path),file);}
 git(project,"add",".");git(project,"commit","-qm","Base de ensayo");
 const original=git(project,"rev-parse","HEAD");
 writeFileSync(join(project,"a.txt"),wrong);
 writeFileSync(join(project,testPath),[
  'import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";',
  'test("defect case",()=>assert.equal(readFileSync(new URL("./a.txt",import.meta.url),"utf8"),'+JSON.stringify(correct)+'));',
  'test("negative control",()=>assert.equal(readFileSync(new URL("./b.txt",import.meta.url),"utf8"),"original"));',
 ].join("\n")+"\n");
 const session=SessionManager.create(project,join(temp,"sessions"));
 session.appendMessage({role:"user",content:"Ensayo sintético: corregir únicamente a.txt.",timestamp:Date.now()});
 owner={sessionId:session.getSessionId(),projectId:project};
 const profiles:RuntimeProfilesFile={schema:"asen.runtime-profiles/v1",active:"ensayo",profiles:[{name:"ensayo",mode:"full-delegation",routes:{worker:{model,thinking:"minimal"}}}]};
 writeFileSync(join(privateDir,"profiles.json"),JSON.stringify(profiles),{mode:0o600});
 const todos=await SessionTodoStore.openProjectScoped(join(privateDir,"todos"),join(privateDir,"todos.json"));
 const links=new TaskAgentLinkStore(join(privateDir,"task-agent-links.json"));
 const journal=new JudgmentFixProposalJournal(join(privateDir,"judgment-fix-proposals.json"));
 let launches=0;
 const runner:AgentRunner={run:async(request,signal)=>{
  launches++;
  if(launches!==1||request.role!=="worker"||request.model!==model||request.repository!==project||request.isolationKey!==owner!.sessionId||JSON.stringify(request.writeSurfaces)!=='["a.txt"]'||!request.id.startsWith("fix-"))return {id:request.id,ok:false,output:"Ámbito de ensayo no admitido"};
  if(!real){report.fixStarted=true;writeFileSync(join(project,"a.txt"),correct);return {id:request.id,ok:true,output:"Writer simulado de prueba local"};}
  const pi=new PiProcessRunner({command:"pi",policyRoot:root,providerCredential:"NVIDIA_API_KEY",requireChildModelBeforePrompt:true,
   oneShotWritePath:"a.txt",exactWriteReceipt:{path:"a.txt",fileSha256:createHash("sha256").update(correct).digest("hex")},
   attributionFile:join(privateDir,"fix-attribution.json"),timeoutMs:fixPhaseBudgetMs,maxOutputBytes:60000,maxStreamBytes:240000,
   onProcessStart:()=>{report.fixStarted=true;},
   onToolExecution:event=>{if(event.type==="tool_execution_end"&&event.isError)report.nativeErrors++;
    if(event.toolName==="write"){if(event.type==="tool_execution_start")report.nativeWriteStarts++;else report.nativeWriteEnds++;}}});
  const unsubscribe=pi.subscribeChildSelection(event=>{if(event.taskId===request.id&&event.sessionId===owner!.sessionId&&event.projectId===project)report.nativeFixModel=normalizeT06PiChildSelection(event.model,model)??"unknown";});
  try{return await pi.run(request,signal);}finally{unsubscribe();}
 }};
 agents=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner,maxConcurrency:1});
 const commands=new Map<string,any>();
 createAsenExtension({homeDir:()=>home,packageRoot:root,agentRuntimeFactory:async()=>agents!,todoStoreFactory:async()=>todos,
  enableWorkspaceRuntime:false,enableMemoryRuntime:false,enableTodoRuntime:false,deferSessionStart:true})({
  registerCommand(name,command){commands.set(name,command);},registerTool(){},on(){}
 });
 report.stage="judge-catalog";
 let judgeA:PiReviewerModel,judgeB:PiReviewerModel,registry:PiReviewRegistry;
 const key=(m:PiReviewerModel)=>m.provider+"/"+m.id;
 if(real){
  const native=new ModelRegistry(await ModelRuntime.create({authPath:join(privateDir,"auth.json"),modelsPath:join(privateDir,"models.json"),allowModelNetwork:true,modelRefreshTimeoutMs:30000}));
  const available=native.getAvailable().filter(m=>m.provider==="nvidia"&&native.hasConfiguredAuth(m)&&typeof m.api==="string"&&!["virtual","pi-virtual"].includes(String(m.api)));
  // El catálogo efectivo, no una lista supuesta de modelos, determina la
  // selección. Se excluyen las cinco rutas fallidas y el autor. Identidades
  // ambiguas (incluidas variantes con prefijo NVIDIA redundante) no se usan.
  const physical=(id:string)=>id.replace(/^(?:nvidia\/)+/u,"").toLowerCase();
  const excluded=new Set(["openai/gpt-oss-20b","deepseek-ai/deepseek-v4.1-flash","nemotron-3.5-super-vl-120b-a12b","google/gemma-3-12b-it","moonshotai/kimi-k2.6",physical(model)]);
  const isText=(id:string)=>/^[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/u.test(id)&&
   !/(?:embed|rerank|retriev|guard|safety|vision|(?:^|[-/])vl(?:[-/]|$)|audio|speech|image|video|ocr|diffusion|reward|moderation|classifier|asr|tts)/iu.test(id)&&
   /(?:nemotron|llama|mistral|mixtral|qwen|gemma|kimi|glm|gpt-oss|deepseek|command|minimax|phi|granite|dbrx|falcon|yi-)/iu.test(id);
  const counts=new Map<string,number>();
  for(const m of available){const id=physical(m.id);counts.set(id,(counts.get(id)??0)+1);}
  report.catalogModels=[...new Set(available.map(m=>m.id).filter(id=>/^[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/u.test(id)))].sort().slice(0,150);
  const eligible=available.filter(m=>isText(m.id)&&counts.get(physical(m.id))===1&&!excluded.has(physical(m.id))&&
   !matchesJudgeIdentity(m,"nvidia",model)&&(!("input" in m)||!Array.isArray(m.input)||m.input.includes("text")));
  // El ensayo 45487655375 rechazó Kimi K2.6. Nano Omni consta en el
  // catálogo autenticado observado; comprobarlo primero, sin reintentos.
  // Si falta una ruta, cerrar sin llamadas en vez de elegir otra a ciegas.
  const planned=["nemotron-3-nano-omni-30b-a3b-reasoning","nemotron-3-ultra-550b-a55b"];
  const selected=planned.flatMap(id=>eligible.filter(m=>physical(m.id)===id));
  // No probar varios modelos hasta conseguir el veredicto deseado: elegir
  // exactamente dos y conservar la pareja para ambas revisiones.
  assert.equal(selected.length,2,"Catálogo NVIDIA sin dos jueces físicos elegibles");
  assert.notEqual(physical(selected[0]!.id),physical(selected[1]!.id));
  assert.ok(selected.every(m=>!matchesJudgeIdentity(m,"nvidia",model)));
  [judgeA,judgeB]=[selected[0]!,selected[1]!];
  registry={getAvailable:()=>selected,hasConfiguredAuth:m=>selected.some(x=>key(x)===key(m)),async *streamSimple(m,ctx,options){
   const descriptor=selected.find(x=>key(x)===key(m));if(!descriptor||++report.judgeCalls>4)throw Error("Límite de cuatro revisiones");
   const diagnostic={model:key(descriptor),result:"started"};report.judgeDiagnostics.push(diagnostic);
   // El diagnóstico solo conserva categorías fijas; ni errorMessage, ni
   // texto del modelo, ni cabeceras o credenciales llegan al artefacto.
   try{
    // Aclarar el contrato de salida sin proporcionar un veredicto ni
    // modificar los datos del candidato. El analizador estricto permanece.
    const nano=physical(descriptor.id)==="nemotron-3-nano-omni-30b-a3b-reasoning";
    const context=nano?{...ctx,systemPrompt:ctx.systemPrompt+" The final text must begin with an opening JSON object brace and end with its closing brace. No Markdown fences, preamble or trailing commentary. Keep the final answer concise; any reasoning must be separate from the final JSON."}:ctx;
    const stream=native.streamSimple(descriptor,context as never,{...options,maxRetries:0,reasoning:undefined} as never);
    for await(const event of stream){
     if(event.type==="error"){
      const message=event.error?.errorMessage??"";
      diagnostic.result=event.reason==="aborted"?"aborted":
       /\b(?:401|403)\b|unauthorized|authentication|invalid api key/i.test(message)?"authentication":
       /\b429\b|rate.limit|quota/i.test(message)?"rate-limit":
       /\b404\b|model.not.found/i.test(message)?"model-unavailable":
       /\b400\b|\b422\b|bad.request|unsupported/i.test(message)?"request-rejected":
       /\b5\d\d\b|service.unavailable/i.test(message)?"provider-unavailable":
       /timeout|timed.out|network|fetch|connection/i.test(message)?"network":
       "provider-error";
     }else if(event.type==="done"){
      const forms=judgeIdentityForms(descriptor);
      const acceptedResponse=[...forms,...forms.map(identity=>"private/"+identity)];
      const providerMatches=event.message.provider===descriptor.provider,
       modelMatches=matchesJudgeIdentity(descriptor,event.message.provider,event.message.model),
       responseMatches=typeof event.message.responseModel==="string"&&acceptedResponse.includes(event.message.responseModel);
      if(!providerMatches||!modelMatches||!responseMatches){
       const observed=event.message.responseModel;
       Object.assign(diagnostic,{providerMatches,modelMatches,responseMatches,...(typeof observed==="string"&&/^[A-Za-z0-9._/-]{1,256}$/u.test(observed)?{responseModel:observed}:{})});
       diagnostic.result=event.message.responseModel===undefined?"model-identity-unknown":"model-identity-mismatch";throw Error("Identidad física del juez no acreditada");
      }
      Object.assign(diagnostic,{contentKinds:[...new Set(event.message.content.map(part=>["text","thinking","toolCall"].includes(part.type)?part.type:"unknown"))]});
      diagnostic.result=event.reason==="stop"?"stop":event.reason==="length"?"length":event.reason==="toolUse"?"tool-use":"deferred";
     }
     yield event as unknown as import("../src/review/pi-model-reviewer.js").PiReviewEvent;
    }
   }catch(error){if(diagnostic.result==="started")diagnostic.result="transport-exception";throw error;}
  }};
 }else{
  judgeA={provider:"prueba",id:"juez-a"};judgeB={provider:"prueba",id:"juez-b"};
  registry={getAvailable:()=>[judgeA,judgeB],hasConfiguredAuth:()=>true,async *streamSimple(){
   const call=++report.judgeCalls;
   const failed=call<=2;
   yield {type:"done",reason:"stop",message:{content:[{type:"text",text:JSON.stringify({verdict:failed?"fail":"pass",summary:"Simulación de contrato",findings:failed?[{id:"byte",severity:"high",path:"a.txt",description:wrong+" debe ser "+correct}]:[]})}]}};
  }};
 }
 report.judgeModels=[key(judgeA),key(judgeB)];
 const review=async()=>{
  const ws=openWorkspaceReview({repositoryRoot:project,intendedUntracked:[],sessionId:owner!.sessionId,reviewerId:"pi-model:"+key(judgeA),viewParent:temp,risk:{riskId:"e3-fix",reason:"Comprobar defecto exacto",severity:"high",lenses:["risk","resilience","reliability"]}});
  try{
   const evidence=readWorkspaceReviewEvidence(ws);
   const judgment=await runJudgmentDay({registry,author:{provider:"nvidia",id:model.slice(7)},judgeA,judgeB,evidence,requirements,signal:AbortSignal.timeout(160000),validateBeforeJudge:()=>{assert.equal(readWorkspaceReviewEvidence(ws).candidate.treeIdentity,evidence.candidate.treeIdentity);}});
   return {evidence,judgment};
  }finally{closeWorkspaceReview(ws);}
 };
 report.stage="judgment-before-fix";
 const first=await review();
 report.firstVerdicts=first.judgment.judges.map(j=>j.verdict);
 assert.equal(first.judgment.status,"findings-require-review");
 assert.deepEqual(report.firstVerdicts,["fail","fail"]);
 for(const judge of first.judgment.judges)assert.ok(first.judgment.findings.some(f=>f.judge===judge.judge&&f.finding.path==="a.txt"&&f.finding.description.includes(wrong)&&f.finding.description.includes(correct)));
 const handoff=proposeJudgmentFixHandoff({report:first.judgment,evidence:first.evidence,fixProfile:{model}});
 assert.equal(handoff.status,"fix-planning-required");assert.deepEqual(handoff.paths,["a.txt"]);
 const proposal=await journal.record(handoff);
 // Preparar una base limpia con el árbol revisado EXACTO, únicamente en la
 // copia sintética desechable. El Writer normal sigue exigiendo HEAD limpio.
 git(project,"add","--","a.txt");git(project,"commit","-qm","Candidato sintético con defecto");
 const fixtureMain=git(project,"rev-parse","HEAD");
 assert.equal(git(project,"rev-parse","HEAD^"),original);
 // El padre de reproducción representa el main de la fixture, no GitHub.
 git(project,"branch","main",fixtureMain);
 git(project,"add","--",testPath);git(project,"commit","-qm","Prueba determinista de reproducción");
 const defectiveCommit=git(project,"rev-parse","HEAD");
 assert.equal(git(project,"rev-parse","HEAD^{tree}"),first.evidence.candidate.treeIdentity);
 assert.equal(git(project,"rev-parse","HEAD^"),fixtureMain);assert.equal(git(project,"status","--porcelain"),"");
 report.stage="fix-plan";
 const ctx={cwd:project,mode:"tui",hasUI:true,sessionManager:session,isIdle:()=>true,ui:{
  notify(){},confirm:async()=>true,editor:async(_title:string,seed:string)=>{
   const draft=JSON.parse(seed);assert.deepEqual(draft.scope.expectedPaths,["a.txt"]);
   return JSON.stringify({...draft,instruction:'Ejecuta una única llamada write con argumentos exactos {"path":"a.txt","content":"ASEN-NATIVE-CORRECT-A"}. No añadas caracteres ni salto final a content. No uses otras herramientas. Termina inmediatamente tras el resultado.',writes:[{path:"a.txt",changeKind:"documentation"}]});
  }
 }};
 await commands.get("asen-review").handler("fix-plan "+proposal.id+" save",ctx);
 const rows=await todos.list(owner),fix=rows.find(t=>t.plan?.role==="worker");
 assert.ok(fix?.plan?.fixSource);assert.equal(fix.plan.fixSource.treeIdentity,first.evidence.candidate.treeIdentity);
 assert.equal(fix.plan.candidate?.revision,defectiveCommit);assert.deepEqual(fix.plan.writeSurfaces,["a.txt"]);assert.equal(fix.current.state,"planned");
 assert.equal((await agents.list(owner)).length,0);report.fixPlanSaved=true;
 report.stage="defect-intake";
 const candidate=fix.plan.candidate!;
 // Reutilizar D1/D2/D3/D4. La inspección de issue y main pertenece SOLO a la
 // fixture sintética; las dos ejecuciones del test son reales y deterministas.
 const repositoryUrl="https://github.example/asen/fixture",issueUrl=repositoryUrl+"/issues/1";
 const bytes=new TextEncoder().encode('{"schemaVersion":1,"reviewMode":"enabled","issueApproval":{"requiredLabels":["kind:defect","status:approved"]}}');
 const policyId=createHash("sha256").update("asen.rdd-policy.v1\0").update(bytes).digest("hex");
 const policy=parseRddPolicyBytes(bytes,policyId);
 const binding:RepositoryOperationBinding={host:"github.example",owner:"asen",repository:"fixture",sessionId:owner.sessionId,actor:"test-maintainer",action:"remote_read"};
 const claim=prepareRddRepositoryInspection({binding,repositoryUrl,branch:"main",observedMainCommitIdentity:fixtureMain,expectedMainCommitIdentity:fixtureMain,issueUrl,policyLocator:".asen/rdd-policy.json"},policy);
 const inspection=await executeRddRepositoryInspection(claim,authorizeRepositoryOperation(binding),binding,{read(){return {repositoryUrl,branch:"main",observedMainCommitIdentity:fixtureMain,issueUrl,issueNumber:1,issueState:"open",issueLabels:["kind:defect","status:approved"],policyLocator:".asen/rdd-policy.json",policyBytes:[...bytes],policyContentIdentity:policyId,pullRequestAudit:{complete:true,truncated:false,saturated:false,totalCount:0,rows:[]}};}});
 const red1=await executeNodeTestObservation(candidate,[testPath]),red2=await executeNodeTestObservation(candidate,[testPath]);
 const reproduction=recordRddReproduction(inspection,{repositoryUrl,issueUrl,mainCommitIdentity:fixtureMain,candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},reproductionCaseIds:["defect case"],negativeControlCaseIds:["negative control"]},red1,red2);
 const intake=bindRddDefectEvidence(reproduction,{invariantIds:["approved-issue","current-main","deterministic-reproduction"],operatorFlows:[{id:"inspect-reproduce",from:"approved fixture issue",to:"reproduced defect",failureTo:"blocked"}],runtimeJourney:{command:[process.execPath,"--test","--test-reporter=tap",testPath],commandFingerprint:red1.commandFingerprint,result:"reproduced",candidateId:candidate.id,candidateRevision:candidate.revision,limitations:["synthetic issue and branch fixture, no production authority"]},rollback:{boundary:"candidate",targetRevision:fixtureMain,procedure:["discard disposable fixture"]},forecast:{changedLines:1,verificationEffort:"two deterministic tests and two independent judges",remainingUncertainty:["real provider verdict and write pending"],deferredVerification:["full integration CI"]}});
 assert.throws(()=>agents!.recordDefectIntake(candidate,structuredClone(intake)),/genuine/u);
 agents.recordDefectIntake(candidate,intake);
 assert.throws(()=>agents!.recordDefectIntake(candidate,intake),/consumed/u);
 report.defectReproduced=true;
 report.stage="fix-dispatch";
 const dispatched=await dispatchNextPlanTask({todos,agents,links,identity:owner,runtimeProfiles:{global:profiles},expectedTodoId:fix.taskId,
  validateIdentity:async()=>{assert.equal(session.getSessionId(),owner!.sessionId);assert.equal(git(project,"rev-parse","HEAD"),defectiveCommit);},
  confirm:async task=>{assert.equal(task.role,"worker");assert.deepEqual(task.writeSurfaces,["a.txt"]);assert.equal(task.candidateRevision,defectiveCommit);assert.equal(report.fixApproved,false);report.fixApproved=true;return true;}});
 if(dispatched.status!=="dispatched")throw Error("Fix no despachado: "+dispatched.status);
 assert.equal(dispatched.todoId,fix.taskId);assert.equal(dispatched.role,"worker");
 report.stage="fix-terminal";
 const deadline=Date.now()+3*fixPhaseBudgetMs+15000;
 while(Date.now()<deadline){const a=(await agents.list(owner)).find(a=>a.id===dispatched.agentId);if(a&&["completed","failed","interrupted","cancelled"].includes(a.state))break;await new Promise(resolve=>setTimeout(resolve,150));}
 const terminal=(await agents.list(owner)).find(a=>a.id===dispatched.agentId);
 assert.equal(terminal?.state,"completed",real?"Fix no completado":terminal?.summary??"Sin diagnóstico");
 assert.equal(launches,1);assert.equal(report.fixStarted,true);
 if(real){assert.equal(report.nativeFixModel,model);assert.equal(report.nativeWriteStarts,1);assert.equal(report.nativeWriteEnds,1);assert.equal(report.nativeErrors,0);}
 await new TaskAgentTodoReconciler(todos,agents,links).reconcile(owner);
 assert.equal((await todos.list(owner)).find(t=>t.taskId===fix.taskId)?.current.state,"succeeded");
 report.stage="verification";
 assert.equal(readFileSync(join(project,"a.txt"),"utf8"),correct);assert.equal(readFileSync(join(project,"b.txt"),"utf8"),"original");assert.equal(readFileSync(join(project,"c.txt"),"utf8"),"original");
 assert.deepEqual(git(project,"diff","--name-only","HEAD","--").split("\n"),["a.txt"]);assert.equal(raw(project,"ls-files","--others","-z"),"");
 report.stage="judgment-after-fix";
 const second=await review();report.secondVerdicts=second.judgment.judges.map(j=>j.verdict);
 assert.equal(second.judgment.status,"analysis-complete");assert.deepEqual(report.secondVerdicts,["pass","pass"]);assert.equal(report.judgeCalls,4);
 const tree=second.evidence.candidate.treeIdentity;assert.notEqual(tree,first.evidence.candidate.treeIdentity);
 assert.deepEqual(git(project,"diff-tree","-r","--name-only","--no-commit-id","--no-renames",first.evidence.candidate.treeIdentity,tree).split("\n"),["a.txt"]);
 assert.equal(git(project,"ls-tree",tree,"--","a.txt").split(" ")[0],git(project,"ls-tree",first.evidence.candidate.treeIdentity,"--","a.txt").split(" ")[0]);
 report.exactTreeScope=true;report.finalTree=tree;
 // El host de ensayo confirma el resultado en su repo desechable, no el
 // agente. Ejecutar la misma prueba RED en la revisión exacta corregida.
 git(project,"add","--","a.txt");git(project,"commit","-qm","Candidato sintético corregido");
 const commit=git(project,"rev-parse","HEAD");assert.equal(git(project,"rev-parse","HEAD^{tree}"),tree);
 assert.equal(git(project,"rev-parse","HEAD^"),defectiveCommit);
 const green=await executeNodePassingObservation({...candidate,id:candidate.id+"-fixed",revision:commit},[testPath]);
 assert.deepEqual(green.executedCaseIds,["defect case","negative control"]);assert.equal(green.failingCaseIds.length,0);
 assert.equal(raw(project,"show",commit+":a.txt"),correct);assert.equal(raw(project,"show",commit+":b.txt"),"original");assert.equal(raw(project,"show",commit+":c.txt"),"original");
 const receipts=join(privateDir,"receipts");
 await writeReviewReceipt(receipts,createReviewReceiptSigned({commitSha:commit,treeSha:tree,oddTask:"odd/tasks/continuacion-local-flujo-de-agentes.md",testSuite:{total:green.executedCaseIds.length,passed:green.executedCaseIds.length,failed:0,durationMs:0,runner:"node:test reproducción exacta"},verdict:"PASSED"},await loadReceiptSigningKey(receipts)));
 const receipt=await new ReceiptVerifierService(receipts).readReceiptState(commit);
 assert.equal(receipt.status,"valid");if(receipt.status!=="valid")throw Error("Recibo no válido");
 mkdirSync(dirname(output),{recursive:true,mode:0o700});
 writeFileSync(join(dirname(output),real?"signed-real.json":"signed-offline.json"),JSON.stringify(receipt.receipt,null,2)+"\n",{flag:"wx",mode:0o600});
 report.signedTests=true;assert.equal(git(project,"rev-parse","HEAD"),commit);assert.equal(git(project,"rev-parse","refs/heads/main"),fixtureMain);
 report.stage="complete";report.status=real?"PASS_REAL_FOCUSED_NVIDIA_FIX_TEST_ONLY":"PASS_OFFLINE_FOCUSED_FIX";
}catch(error){
 // El mensaje del proveedor podría contener secretos. En offline sí se
 // conserva el diagnóstico local para resolver errores antes de inferir.
 if(!real)process.stderr.write(String(error)+"\n");
 // No registrar mensajes arbitrarios ni contenido de respuesta.
 const message=error instanceof Error?error.message:"";
 report.failureCategory=error instanceof SyntaxError?"invalid-json":
  message==="Independent reviewer call failed"?"provider-error":
  message==="Independent reviewer attempted non-text output"?"non-text-output":
  message==="Independent reviewer did not complete a bounded answer"?"incomplete-answer":
  message==="Independent reviewer returned no complete answer"?"missing-answer":
  message==="Identidad física del juez no coincide"?"model-identity-mismatch":
  message.startsWith("Independent review")||message.startsWith("Independent reviewer")||/^finding \d+ is invalid$/u.test(message)?"review-contract":
  error instanceof assert.AssertionError?"assertion-failed":"other";
 report.status="BLOCKED";
}finally{
 if(owner)await agents?.cancelSession(owner).catch(()=>{});
 try{rmSync(temp,{recursive:true,force:true});}catch{report.status="BLOCKED";}
 mkdirSync(dirname(output),{recursive:true,mode:0o700});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
}
process.stdout.write(JSON.stringify(report)+"\n");
if(report.status!==(real?"PASS_REAL_FOCUSED_NVIDIA_FIX_TEST_ONLY":"PASS_OFFLINE_FOCUSED_FIX"))process.exitCode=1;
