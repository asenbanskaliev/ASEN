/** E2A/E2B: petición ODD -> worktrees -> sesiones SDK Pi -> permiso de lote
 * -> Dispatcher -> dos procesos NVIDIA -> recibos. Host de diálogo instrumentado,
 * no un consentimiento humano de producción. Repositorio sintético desechable.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {SessionManager,ModelRuntime,ModelRegistry} from "@earendil-works/pi-coding-agent";
import {reviewNativeIntegratedCandidate} from "../src/runtime/lifecycle/native-integration-review.js";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {runJudgmentDay} from "../src/review/judgment-day.js";
import {JudgmentFixProposalJournal} from "../src/review/judgment-fix-proposal-journal.js";
import {TaskAgentTodoReconciler} from "../src/runtime/agents/task-agent-reconciler.js";
import type {PiReviewRegistry} from "../src/review/pi-model-reviewer.js";
import {createReviewReceiptSigned,loadReceiptSigningKey,writeReviewReceipt} from "../src/evidence/review-receipt.js";
import {ReceiptVerifierService} from "../src/evidence/receipt-verifier.js";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRunner} from "../src/agents/dispatcher.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {ParallelTodoWorktreeJournal} from "../src/runtime/agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../src/runtime/agents/parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "../src/runtime/agents/parallel-child-plan-claims.js";
import {ParallelWorkerObservationJournal} from "../src/runtime/agents/parallel-worker-observation-journal.js";
import {buildNativeIntegrationCandidate} from "../src/runtime/agents/parallel-native-integration.js";
import {readFrozenIntegrationReviewEvidence} from "../src/review/workspace-review-session.js";
import {reconcileNativeChildTerminal} from "../src/runtime/agents/parallel-native-child-terminal.js";
import {normalizeT06PiChildSelection} from "../src/runtime/agents/t06-pi-receipt-validator.js";
import {selectSkills} from "../src/skills/registry.js";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";

// El ensayo nunca debe heredar la selección de otro repositorio o índice.
for(const name of Object.keys(process.env))if(name.startsWith("GIT_"))delete process.env[name];
const root=resolve(process.env.GITHUB_WORKSPACE??process.cwd()),expected=process.env.ASEN_EXPECTED_SHA;
const reportFile=process.env.ASEN_NATIVE_JUDGMENT_REPORT,model="nvidia/nemotron-3.5-lightning-30b-a3b";
if(!process.env.NVIDIA_API_KEY||!reportFile||!expected||!(/^[a-f0-9]{40}$/u.test(expected))||
 realpathSync(execFileSync("git",["rev-parse","--show-toplevel"],{cwd:root,encoding:"utf8",env:isolatedGitEnvironment()}).trim())!==realpathSync(root)||
 execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",env:isolatedGitEnvironment()}).trim()!==expected||
 execFileSync("git",["-c","core.fsmonitor=false","status","--porcelain=v1","--untracked-files=all"],{cwd:root,encoding:"utf8",env:isolatedGitEnvironment()}).length!==0)
 throw Error("E2A integral: SHA, proveedor o recibo no autorizado");
const base=realpathSync(mkdtempSync(join(tmpdir(),"asen-native-partition-")));
const project=join(base,"repo"),home=join(base,"home"),privateDir=join(home,".asen");
const rawGit=(cwd:string,...args:string[])=>execFileSync("git",["-C",cwd,...args],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"],env:isolatedGitEnvironment(),timeout:10000});
const git=(cwd:string,...args:string[])=>rawGit(cwd,...args).trim();
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
// Defecto deliberado en la especificación de A, no un resultado inventado del modelo.
const values:Record<string,string>={"a.txt":"ASEN-NATIVE-LOT-A","b.txt":"ASEN-NATIVE-LOT-B"};
const corrected="ASEN-NATIVE-CORRECT-A";
const requirements="Exact acceptance requirements: a.txt must contain only ASEN-NATIVE-CORRECT-A (no newline); b.txt must contain only ASEN-NATIVE-LOT-B; c.txt must stay original. If a.txt differs, report fail with an exact a.txt finding whose description quotes both actual and expected tokens verbatim. No other changes are required. Assess the real candidate bytes, not the author claims.";
let fixOwner:{sessionId:string;projectId:string}|undefined;

const obs=new Map<string,{pid:number;start:number;end:number;model:string;writeStarts:number;writeEnds:number;errors:number}>();
const dialogs:string[]=[];
const report={schema:"asen.e3.native-judgment-fix/v1",sha:expected,model,
 authorization:"TEST_HOST_CONSENT_ONLY",globalFull:false,autoRetry:false,autoMerge:false,costVerified:false,
 status:"BLOCKED",stage:"fixture",nativeSessions:0,started:0,writeBatchConfirmations:0,parallel:false,sourceClean:false,
 dependentBlocked:false,receipts:0,integrationCandidate:false,judgeModels:[] as string[],firstVerdicts:[] as string[],
 secondVerdicts:[] as string[],judgeCalls:0,fixPlanSaved:false,fixStarted:false,fixModelObserved:"unknown",fixExact:false,
 signedTests:false,finalTree:"unknown",catalogNvidia:[] as string[],workers:[] as Record<string,unknown>[]};
let runtime:AgentRuntime|undefined;
let childOwners:Array<{sessionId:string;projectId:string;sourceTodoId:string;childTodoId:string;sessionFile:string}>=[];
const terminalWork:Promise<unknown>[]=[];
const terminalErrors:unknown[]=[];
try{
 mkdirSync(project,{recursive:true});mkdirSync(privateDir,{recursive:true,mode:0o700});
 git(project,"init","-q");git(project,"config","user.name","ASEN ensayo");git(project,"config","user.email","test@example.invalid");git(project,"config","core.autocrlf","false");
 const hooks=join(base,"empty-hooks");mkdirSync(hooks);git(project,"config","core.hooksPath",hooks);
 for(const path of ["a.txt","b.txt","c.txt"])writeFileSync(join(project,path),"original");
 const skillPaths=[...new Set([
  ...selectSkills({selectionProfile:"organic",phase:"apply",risk:"low",defect:false,codeChange:false,behaviorChange:false,filesTouched:1}).map(s=>s.path),
  ...(["low","medium"] as const).flatMap(risk=>selectSkills({selectionProfile:"organic",phase:"apply",risk,defect:true,codeChange:false,behaviorChange:false,filesTouched:1}).map(s=>s.path))
 ])];
 for(const path of skillPaths){const target=join(project,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(root,path),target);}
 git(project,"add",".");git(project,"commit","-qm","base sintetica");const head=git(project,"rev-parse","HEAD");
 writeFileSync(join(privateDir,"profiles.json"),JSON.stringify({schema:"asen.runtime-profiles/v1",active:"nvidia",profiles:[{name:"nvidia",mode:"full-delegation",routes:{worker:{model,thinking:"minimal"}}}]}),{mode:0o600});
 // Pi SDK real, sin cargar extensiones ni iniciar inferencia para buscar modelos.
 // Pi 1.2 necesita actualizar el catálogo de modelos dinámicos NVIDIA.
 // Es una consulta de catálogo, no una inferencia ni una alternativa de pago.
 const nativeRegistry=new ModelRegistry(await ModelRuntime.create({authPath:join(privateDir,"auth.json"),
  modelsPath:join(privateDir,"models.json"),allowModelNetwork:true,modelRefreshTimeoutMs:30000}));

 const key=(m:{provider:string;id:string})=>m.provider+"/"+m.id;
 // IDs observados en el catálogo autenticado del intento anterior (sin inferencia).
 // Preferir modelos de texto sencillos y distintos para una comprobación acotada.
 const allowed=["google/gemma-3-12b-it","meta/llama-3.2-11b-vision-instruct","mistralai/mistral-7b-instruct-v0.3","google/gemma-3-4b-it","nvidia/llama-3.1-nemotron-70b-instruct"];
 const authorId=model.slice("nvidia/".length);
 const possible=nativeRegistry.getAvailable().filter(m=>m.provider==="nvidia"&&
  m.id!==authorId&&m.id!=="nvidia/"+authorId&&nativeRegistry.hasConfiguredAuth(m)&&
  typeof m.api==="string"&&String(m.api)!=="virtual");
 const selected=allowed.flatMap(id=>possible.filter(m=>m.id===id||m.id==="nvidia/"+id))
  .filter((m,i,all)=>all.findIndex(x=>x.id.replace(/^nvidia\//u,"")===m.id.replace(/^nvidia\//u,""))===i).slice(0,2);
 report.catalogNvidia=possible.map(m=>m.id).slice(0,100);
 report.stage="judge-catalog";
 assert.equal(selected.length,2,"No hay dos jueces NVIDIA distintos permitidos");
 const [judgeA,judgeB]=selected;
 report.judgeModels=selected.map(key);
 const registry:PiReviewRegistry={
  getAvailable:()=>selected,
  hasConfiguredAuth:m=>selected.some(x=>key(x)===key(m)),
  streamSimple:(m,ctx,options)=>{
   const exact=selected.find(x=>key(x)===key(m));
   if(!exact||++report.judgeCalls>4)throw Error("Límite de cuatro revisiones");
   return nativeRegistry.streamSimple(exact,ctx as never,options as never) as unknown as ReturnType<PiReviewRegistry["streamSimple"]>;
  }
 };
 const todos=await SessionTodoStore.openProjectScoped(join(privateDir,"todos"),join(privateDir,"todos.json"));
 const links=new TaskAgentLinkStore(join(privateDir,"task-agent-links.json"));
 const sourceJournal=new ParallelTodoWorktreeJournal(join(privateDir,"parallel-todo-worktrees.json"));
 const sessionJournal=new ParallelChildSessionJournal(join(privateDir,"parallel-worktree-sessions.json"),sourceJournal);
 const claims=new ParallelChildPlanClaimJournal(join(privateDir,"parallel-child-plan-claims.json"));
 const observations=new ParallelWorkerObservationJournal(join(privateDir,"parallel-worker-observations.json"));
 const runner:AgentRunner={run:async(request,signal)=>{
  const path=request.writeSurfaces?.[0],isFix=request.id.startsWith("fix-");
  const value=isFix?path==="a.txt"?corrected:undefined:path?values[path]:undefined;
  if(isFix&&(!fixOwner||request.repository!==fixOwner.projectId||request.isolationKey!==fixOwner.sessionId))return {id:request.id,ok:false,output:"Fix owner mismatch"};
  if(request.role!=="worker"||request.writeSurfaces?.length!==1||!path||!value||request.model!==model)
   return {id:request.id,ok:false,output:"Test denied unexpected candidate or model"};
  const o={pid:0,start:0,end:0,model:"unknown",writeStarts:0,writeEnds:0,errors:0};
  if(obs.has(request.id))throw Error("Duplicate Writer");
  obs.set(request.id,o);
  const pi=new PiProcessRunner({command:"pi",policyRoot:root,providerCredential:"NVIDIA_API_KEY",
   requireChildModelBeforePrompt:true,oneShotWritePath:path,exactWriteReceipt:{path,fileSha256:hash(value)},
   attributionFile:join(privateDir,request.id+".json").replace(/:worker\.json$/u,"-worker.json"),
   timeoutMs:110000,maxOutputBytes:60000,maxStreamBytes:240000,
   onProcessStart:pid=>{o.pid=pid;o.start=performance.now();},
   onProcessClose:()=>{o.end=performance.now();},
   onToolExecution:event=>{
    if(event.type==="tool_execution_end"&&event.isError)o.errors++;
    if(event.toolName==="write"){if(event.type==="tool_execution_start")o.writeStarts++;else o.writeEnds++;}
   }});
  const unsubscribe=pi.subscribeChildSelection(event=>{
   if(event.taskId===request.id&&event.sessionId===request.isolationKey&&event.projectId===request.repository)
    o.model=normalizeT06PiChildSelection(event.model,model)??"unknown";
  });
  try{return await pi.run(request,signal);}finally{unsubscribe();}
 }};
 runtime=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner,maxConcurrency:2});
 const agents=runtime;
 runtime.subscribeTerminal(record=>{
  terminalWork.push(reconcileNativeChildTerminal({record,todos,agents,links,sourceJournal,sessionJournal,claims,observations}).catch(error=>{terminalErrors.push(error);}));
 });
 const parent=SessionManager.create(project,join(base,"parent-sessions"));
 parent.appendMessage({role:"user",content:"Ensayo integral de tres unidades sintéticas",timestamp:Date.now()});
 const identity={sessionId:parent.getSessionId(),projectId:project};
 const tools=new Map<string,any>(),commands=new Map<string,any>();
 createAsenExtension({homeDir:()=>home,packageRoot:root,agentRuntimeFactory:async()=>agents,todoStoreFactory:async()=>todos,
  enableWorkspaceRuntime:false,enableMemoryRuntime:false,enableTodoRuntime:false,deferSessionStart:true})({
  registerCommand(name,command){commands.set(name,command);},registerTool(tool){tools.set(tool.name,tool);},on(){}
 });
 const context={cwd:project,mode:"tui",hasUI:true,sessionManager:parent,isIdle:()=>true,ui:{
  notify(){},confirm:async(title:string,_message:string)=>{dialogs.push(title);
   return ["Preparar dos carpetas Git aisladas?","Preparar sesiones hijas Pi sin iniciar modelos?","Autorizar las dos escrituras ODD exactas de este lote?"].includes(title);}
 }};
 report.stage="natural-plan";
 const params={instruction:"Cada Writer debe usar una sola llamada nativa write para sustituir únicamente su archivo asignado por el contenido exacto de su objetivo, sin salto final. No uses edit, shell ni commits. Detente tras escribir.",
  intent:"implementation",scope:{kind:"known",expectedPaths:["a.txt","b.txt","c.txt"]},
  writes:["a.txt","b.txt","c.txt"].map(path=>({path,changeKind:"documentation"})),
  riskOperations:[],session:{estimatedMinutes:120,continuation:false},testing:{kind:"required"},
  review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[],taskUnits:[
   {id:"a",objective:"Escribir a.txt con los bytes exactos ASEN-NATIVE-LOT-A",estimatedMinutes:40,dependsOn:[],writePaths:["a.txt"]},
   {id:"b",objective:"Escribir b.txt con los bytes exactos ASEN-NATIVE-LOT-B",estimatedMinutes:40,dependsOn:[],writePaths:["b.txt"]},
   {id:"c",objective:"Integrar y verificar A y B antes de modificar c.txt",estimatedMinutes:40,dependsOn:["a","b"],writePaths:["c.txt"]}
  ]};
 const result=await tools.get("asen_plan_request").execute("call",params,undefined,undefined,context);
 const details=result.details;
 report.stage="native-setup";
 assert.equal(details.persistence.status,"saved");
 assert.equal(details.worktreePreparation.status,"prepared");
 assert.equal(details.childPreparation.status,"prepared");
 childOwners=details.childPreparation.children;
 report.nativeSessions=childOwners.length;
 assert.equal(report.nativeSessions,2);
 assert.equal(new Set(childOwners.map(c=>c.sessionId)).size,2);
 for(const child of childOwners){
  assert.ok(existsSync(child.sessionFile));
  assert.equal(SessionManager.open(child.sessionFile).getSessionId(),child.sessionId);
 }
 report.stage="supervisor";
 report.started=details.supervisedLaunch?.started?.length??0;
 report.writeBatchConfirmations=dialogs.filter(t=>t==="Autorizar las dos escrituras ODD exactas de este lote?").length;
 assert.equal(report.started,2);
 assert.equal(report.writeBatchConfirmations,1);
 assert.equal(dialogs.length,3);
 assert.equal(details.supervisedLaunch.status,"started");
 const deadline=Date.now()+200000;
 report.stage="settlement";
 while(Date.now()<deadline){
  const records=(await Promise.all(childOwners.map(owner=>agents.list(owner)))).flat();
  if(terminalWork.length===2&&records.length===2&&records.every(record=>["completed","failed","interrupted","cancelled"].includes(record.state))){
   await Promise.all(terminalWork);
   assert.equal(terminalErrors.length,0);
   break;
  }
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 for(const child of childOwners){
  const records=await agents.list(child),record=records[0],o=record?obs.get(record.id):undefined;
  const row=(await todos.list(child))[0],path=row?.plan?.writeSurfaces?.[0],value=path?values[path]:undefined;
  const exact=!!path&&!!value&&readFileSync(join(child.projectId,path),"utf8")===value;
  const changes=execFileSync("git",["-C",child.projectId,"status","--porcelain=v1","--untracked-files=all"],{encoding:"utf8",env:isolatedGitEnvironment()}).split(/\r?\n/u).filter(Boolean).map(line=>line.slice(3));
  const scoped=changes.length===1&&changes[0]===path;
  const verified=record?.state==="completed"&&row?.current.state==="succeeded"&&exact&&scoped&&o?.model===model&&o.pid>0&&o.end>o.start&&o.writeStarts===1&&o.writeEnds===1&&o.errors===0;
  report.workers.push({verified:!!verified,agentState:record?.state??"missing",todoState:row?.current.state??"missing",
   nativeModel:o?.model??"unknown",changedPaths:changes,exactBytes:exact,exactScope:scoped,oneWrite:o?.writeStarts===1&&o?.writeEnds===1});
 }
 const intervals=[...obs.values()];
 report.parallel=intervals.length===2&&new Set(intervals.map(o=>o.pid)).size===2&&intervals.every(o=>o.pid>0&&o.end>o.start)&&Math.max(...intervals.map(o=>o.start))<Math.min(...intervals.map(o=>o.end));
 report.sourceClean=git(project,"rev-parse","HEAD")===head&&git(project,"status","--porcelain=v1","--untracked-files=all")==="";
 const rows=await todos.list(identity),dependent=rows.find(row=>row.dependsOn?.length===2);
 report.dependentBlocked=dependent?.current.state==="planned"&&(await agents.list(identity)).length===0;
 report.receipts=(await observations.listSource(identity,await sessionJournal.listSource(identity))).length;
 report.stage="acceptance";
 assert.equal(report.parallel,true);assert.equal(report.sourceClean,true);assert.equal(report.dependentBlocked,true);
 assert.equal(report.receipts,2);assert.ok(report.workers.length===2&&report.workers.every(w=>w.verified===true));
 const batch=(await sourceJournal.list(identity)).at(-1)!;
 const candidate=await buildNativeIntegrationCandidate({identity,batchId:batch.id,sourceJournal,sessionJournal,observations});
 assert.deepEqual(candidate.paths,["a.txt","b.txt"]);
 for(const path of candidate.paths)assert.equal(rawGit(project,"show",candidate.commit+":"+path),values[path]);
 assert.equal(git(project,"rev-parse","HEAD"),head);
 const evidence=readFrozenIntegrationReviewEvidence(candidate,identity.sessionId,"pi-model:ensayo/lector",base);
 assert.equal(evidence.candidate.treeIdentity,candidate.tree);
 report.integrationCandidate=true;
 // El candidato se revisa en la misma raíz desechable. La sesión Fix es
 // nueva para no lanzar accidentalmente las raíces del plan original.
 report.stage="judgment-before-fix";
 assert.deepEqual(candidate.authorModelsObserved,[model]);
 const correctionSession=SessionManager.create(project,join(base,"fix-sessions"));
 correctionSession.appendMessage({role:"user",content:"Ensayo autorizado: corregir solo a.txt",timestamp:Date.now()});
 fixOwner={sessionId:correctionSession.getSessionId(),projectId:project};
 const journal=new JudgmentFixProposalJournal(join(privateDir,"judgment-fix-proposals.json"));
 const initial=await reviewNativeIntegratedCandidate({candidate,sessionId:fixOwner.sessionId,registry,
  judgeA:{model:key(judgeA!)},judgeB:{model:key(judgeB!)},fixProfile:{model},fixJournal:journal,requirements,
  validate:async()=>{assert.equal(git(project,"rev-parse","HEAD"),head);},
  confirm:async()=>true,signal:AbortSignal.timeout(160000)});
 assert.ok("report" in initial&&initial.report);
 report.firstVerdicts=initial.report.judges.map(j=>j.verdict);
 assert.equal(initial.status,"findings-require-review");
 assert.deepEqual(report.firstVerdicts,["fail","fail"]);
 for(const judge of initial.report.judges){
  assert.ok(initial.report.findings.some(row=>row.judge===judge.judge&&row.finding.path==="a.txt"&&
   row.finding.description.includes("ASEN-NATIVE-LOT-A")&&row.finding.description.includes(corrected)),
   "Cada juez debe identificar los bytes actuales y los requeridos");
 }
 assert.ok("fixProposalId" in initial&&initial.fixProposalId);
 assert.deepEqual(initial.fix.paths,["a.txt"]);
 // Solo en el repositorio sintético de esta prueba se materializa el árbol
 // revisado. En producción la integración del padre sigue protegida.
 git(project,"read-tree","--reset","-u",candidate.tree);
 assert.equal(git(project,"write-tree"),candidate.tree);
 assert.equal(git(project,"rev-parse","HEAD"),head);
 report.stage="fix-plan";
 const fixCtx={...context,sessionManager:correctionSession,modelRegistry:nativeRegistry,model:nativeRegistry.find("nvidia",model.slice(7)),
  ui:{...context.ui,editor:async(_title:string,seed:string)=>{
   const draft=JSON.parse(seed);
   assert.deepEqual(draft.scope.expectedPaths,["a.txt"]);
   return JSON.stringify({...draft,instruction:"Write a.txt exactly as ASEN-NATIVE-CORRECT-A with one native write, no newline. Do not edit any other file, run commands or commit.",writes:[{path:"a.txt",changeKind:"documentation"}]});
  },confirm:async(title:string)=>{dialogs.push(title);return true;}}};
 await commands.get("asen-review").handler("fix-plan "+initial.fixProposalId+" save",fixCtx);
 const planned=await todos.list(fixOwner);
 const fixTodo=planned.find(t=>t.plan?.role==="worker");
 assert.ok(fixTodo?.plan?.fixSource);assert.equal(fixTodo.plan.fixSource.treeIdentity,candidate.tree);
 assert.equal(fixTodo.current.state,"planned");
 assert.deepEqual(fixTodo.plan.writeSurfaces,["a.txt"]);assert.equal(fixTodo.plan.model,model);
 assert.equal((await agents.list(fixOwner)).length,0);report.fixPlanSaved=true;
 report.stage="fix-dispatch";
 const dispatch=(await tools.get("asen_plan_dispatch_next").execute("fix",{},undefined,undefined,fixCtx)).details;
 assert.equal(dispatch.status,"dispatched");assert.equal(dispatch.todoId,fixTodo.taskId);
 report.fixStarted=true;
 const until=Date.now()+160000;
 while(Date.now()<until){
  const agent=(await agents.list(fixOwner)).find(row=>row.id===dispatch.agentId);
  if(agent&&["completed","failed","cancelled","interrupted"].includes(agent.state))break;
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 const fixed=(await agents.list(fixOwner)).find(row=>row.id===dispatch.agentId),witness=obs.get(dispatch.agentId);
 assert.equal(fixed?.state,"completed");assert.equal(witness?.model,model);
 assert.equal(witness?.writeStarts,1);assert.equal(witness?.writeEnds,1);assert.equal(witness?.errors,0);
 report.fixModelObserved=witness!.model;
 await new TaskAgentTodoReconciler(todos,agents,links).reconcile(fixOwner);
 assert.equal((await todos.list(fixOwner)).find(t=>t.taskId===fixTodo.taskId)?.current.state,"succeeded");
 report.stage="verification";
 // Tres comprobaciones sobre el contenido real, no sobre el texto del modelo.
 assert.equal(readFileSync(join(project,"a.txt"),"utf8"),corrected);
 assert.equal(readFileSync(join(project,"b.txt"),"utf8"),values["b.txt"]);
 assert.equal(readFileSync(join(project,"c.txt"),"utf8"),"original");
 assert.deepEqual(git(project,"diff","--name-only","HEAD","--").split("\n").sort(),["a.txt","b.txt"]);
 report.fixExact=true;
 const workspace=openWorkspaceReview({repositoryRoot:project,intendedUntracked:[],sessionId:fixOwner.sessionId,
  reviewerId:"pi-model:"+key(judgeA!),viewParent:base,risk:{riskId:"e3-fixture",reason:"Revisión posterior al Fix",severity:"high",lenses:["risk","resilience","reliability"]}});
 try{
  const after=readWorkspaceReviewEvidence(workspace);
  assert.notEqual(after.candidate.treeIdentity,candidate.tree);
  assert.deepEqual(after.repositoryState.unexpectedUntracked,[]);
  assert.deepEqual(after.repositoryState.intendedUntracked,[]);
  assert.deepEqual(git(project,"diff-tree","-r","--no-commit-id","--name-only","--no-renames",candidate.tree,after.candidate.treeIdentity).split("\n"),["a.txt"]);
  const mode=(tree:string)=>git(project,"ls-tree",tree,"--","a.txt").split(" ")[0];
  assert.equal(mode(after.candidate.treeIdentity),mode(candidate.tree));
  report.finalTree=after.candidate.treeIdentity;
  report.stage="judgment-after-fix";
  const second=await runJudgmentDay({registry,author:{provider:"nvidia",id:model.slice(7)},judgeA:judgeA!,judgeB:judgeB!,evidence:after,requirements,
   signal:AbortSignal.timeout(160000),validateBeforeJudge:()=>{assert.equal(readWorkspaceReviewEvidence(workspace).candidate.treeIdentity,after.candidate.treeIdentity);}});
  report.secondVerdicts=second.judges.map(j=>j.verdict);
  assert.equal(second.status,"analysis-complete");assert.deepEqual(report.secondVerdicts,["pass","pass"]);assert.equal(report.judgeCalls,4);
  const fixedCommit=execFileSync("git",["-C",project,"-c","commit.gpgSign=false","commit-tree",after.candidate.treeIdentity,"-p",head,"-m","Candidato sintético corregido"],{encoding:"utf8",env:isolatedGitEnvironment()}).trim();
  assert.equal(rawGit(project,"show",fixedCommit+":a.txt"),corrected);
  assert.equal(rawGit(project,"show",fixedCommit+":b.txt"),values["b.txt"]);
  assert.equal(rawGit(project,"show",fixedCommit+":c.txt"),"original");
  const receiptDir=join(privateDir,"receipts");
  await writeReviewReceipt(receiptDir,createReviewReceiptSigned({commitSha:fixedCommit,treeSha:after.candidate.treeIdentity,
   oddTask:"odd/tasks/continuacion-local-flujo-de-agentes.md",testSuite:{total:3,passed:3,failed:0,durationMs:0,runner:"Git exact fixture assertions"},verdict:"PASSED"},await loadReceiptSigningKey(receiptDir)));
  const receipt=await new ReceiptVerifierService(receiptDir).readReceiptState(fixedCommit);
  assert.equal(receipt.status,"valid");
  if(receipt.status!=="valid")throw Error("Recibo no válido");
  mkdirSync(dirname(resolve(reportFile)),{recursive:true,mode:0o700});
  writeFileSync(join(dirname(resolve(reportFile)),"signed-test-receipt.json"),JSON.stringify(receipt.receipt,null,2)+"\n",{flag:"wx",mode:0o600});
  report.signedTests=true;
  assert.equal(git(project,"rev-parse","HEAD"),head);
 }finally{closeWorkspaceReview(workspace);}
 report.stage="accepted-test-only";
 report.status="PASS_REAL_NVIDIA_JUDGMENT_FIX_TEST_ONLY";
}catch{
 // No volcar errores de proveedor, prompts ni datos privados.
 report.status="BLOCKED";
}finally{
 if(fixOwner)await runtime?.cancelSession(fixOwner).catch(()=>{});
 for(const child of childOwners)await runtime?.cancelSession(child).catch(()=>{});
 await Promise.allSettled(terminalWork);
 try{rmSync(base,{recursive:true,force:true});}catch{report.status="BLOCKED";}
 mkdirSync(dirname(resolve(reportFile)),{recursive:true,mode:0o700});
 writeFileSync(resolve(reportFile),JSON.stringify(report,null,2)+"\n",{encoding:"utf8",flag:"wx",mode:0o600});
}
process.stdout.write(JSON.stringify({status:report.status,stage:report.stage,nativeSessions:report.nativeSessions,started:report.started,parallel:report.parallel,receipts:report.receipts,catalogNvidia:report.catalogNvidia,judgeModels:report.judgeModels,judgeCalls:report.judgeCalls,firstVerdicts:report.firstVerdicts,fixStarted:report.fixStarted,fixExact:report.fixExact,secondVerdicts:report.secondVerdicts,signedTests:report.signedTests})+"\n");
if(report.status!=="PASS_REAL_NVIDIA_JUDGMENT_FIX_TEST_ONLY")process.exitCode=1;
