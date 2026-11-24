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
import {SessionManager} from "@earendil-works/pi-coding-agent";
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

const root=resolve(process.env.GITHUB_WORKSPACE??process.cwd()),expected=process.env.ASEN_EXPECTED_SHA;
const reportFile=process.env.ASEN_NATIVE_PARTITION_REPORT,model="nvidia/nemotron-3.5-lightning-30b-a3b";
if(!process.env.NVIDIA_API_KEY||!reportFile||!expected||!(/^[a-f0-9]{40}$/u.test(expected))||
 realpathSync(execFileSync("git",["rev-parse","--show-toplevel"],{cwd:root,encoding:"utf8",env:isolatedGitEnvironment()}).trim())!==realpathSync(root)||
 execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",env:isolatedGitEnvironment()}).trim()!==expected)
 throw Error("E2A integral: SHA, proveedor o recibo no autorizado");
const base=realpathSync(mkdtempSync(join(tmpdir(),"asen-native-partition-")));
const project=join(base,"repo"),home=join(base,"home"),privateDir=join(home,".asen");
const git=(cwd:string,...args:string[])=>execFileSync("git",["-C",cwd,...args],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"],env:isolatedGitEnvironment(),timeout:10000}).trim();
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const values:Record<string,string>={"a.txt":"ASEN-NATIVE-LOT-A","b.txt":"ASEN-NATIVE-LOT-B"};
const obs=new Map<string,{pid:number;start:number;end:number;model:string;writeStarts:number;writeEnds:number;errors:number}>();
const dialogs:string[]=[];
const report={schema:"asen.e2a.native-partition/v1",sha:expected,model,
 authorization:"TEST_HOST_CONSENT_ONLY",globalFull:false,autoRetry:false,autoMerge:false,costVerified:false,
 status:"BLOCKED",stage:"fixture",nativeSessions:0,started:0,writeBatchConfirmations:0,parallel:false,sourceClean:false,
 dependentBlocked:false,receipts:0,integrationCandidate:false,workers:[] as Record<string,unknown>[]};
let runtime:AgentRuntime|undefined;
let childOwners:Array<{sessionId:string;projectId:string;sourceTodoId:string;childTodoId:string;sessionFile:string}>=[];
const terminalWork:Promise<unknown>[]=[];
const terminalErrors:unknown[]=[];
try{
 mkdirSync(project,{recursive:true});mkdirSync(privateDir,{recursive:true,mode:0o700});
 git(project,"init","-q");git(project,"config","user.name","ASEN ensayo");git(project,"config","user.email","test@example.invalid");git(project,"config","core.autocrlf","false");
 const hooks=join(base,"empty-hooks");mkdirSync(hooks);git(project,"config","core.hooksPath",hooks);
 for(const path of ["a.txt","b.txt","c.txt"])writeFileSync(join(project,path),"original");
 const skillPaths=selectSkills({selectionProfile:"organic",phase:"apply",risk:"low",defect:false,codeChange:false,behaviorChange:false,filesTouched:1}).map(s=>s.path);
 for(const path of skillPaths){const target=join(project,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(root,path),target);}
 git(project,"add",".");git(project,"commit","-qm","base sintetica");const head=git(project,"rev-parse","HEAD");
 writeFileSync(join(privateDir,"profiles.json"),JSON.stringify({schema:"asen.runtime-profiles/v1",active:"nvidia",profiles:[{name:"nvidia",mode:"full-delegation",routes:{worker:{model,thinking:"minimal"}}}]}),{mode:0o600});
 const todos=await SessionTodoStore.openProjectScoped(join(privateDir,"todos"),join(privateDir,"todos.json"));
 const links=new TaskAgentLinkStore(join(privateDir,"task-agent-links.json"));
 const sourceJournal=new ParallelTodoWorktreeJournal(join(privateDir,"parallel-todo-worktrees.json"));
 const sessionJournal=new ParallelChildSessionJournal(join(privateDir,"parallel-worktree-sessions.json"),sourceJournal);
 const claims=new ParallelChildPlanClaimJournal(join(privateDir,"parallel-child-plan-claims.json"));
 const observations=new ParallelWorkerObservationJournal(join(privateDir,"parallel-worker-observations.json"));
 const runner:AgentRunner={run:async(request,signal)=>{
  const path=request.writeSurfaces?.[0],value=path?values[path]:undefined;
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
 const tools=new Map<string,any>();
 createAsenExtension({homeDir:()=>home,packageRoot:root,agentRuntimeFactory:async()=>agents,todoStoreFactory:async()=>todos,
  enableWorkspaceRuntime:false,enableMemoryRuntime:false,enableTodoRuntime:false,deferSessionStart:true})({
  registerCommand(){},registerTool(tool){tools.set(tool.name,tool);},on(){}
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
 for(const path of candidate.paths)assert.equal(git(project,"show",candidate.commit+":"+path),values[path]);
 assert.equal(git(project,"rev-parse","HEAD"),head);
 const evidence=readFrozenIntegrationReviewEvidence(candidate,identity.sessionId,"pi-model:ensayo/lector",base);
 assert.equal(evidence.candidate.treeIdentity,candidate.tree);
 report.integrationCandidate=true;
 report.status="PASS_REAL_NVIDIA_SCOPED_PARTITION_TEST_ONLY";
}catch{
 // No volcar errores de proveedor, prompts ni datos privados.
 report.status="BLOCKED";
}finally{
 for(const child of childOwners)await runtime?.cancelSession(child).catch(()=>{});
 await Promise.allSettled(terminalWork);
 try{rmSync(base,{recursive:true,force:true});}catch{report.status="BLOCKED";}
 mkdirSync(dirname(resolve(reportFile)),{recursive:true,mode:0o700});
 writeFileSync(resolve(reportFile),JSON.stringify(report,null,2)+"\n",{encoding:"utf8",flag:"wx",mode:0o600});
}
process.stdout.write(JSON.stringify({status:report.status,stage:report.stage,nativeSessions:report.nativeSessions,started:report.started,parallel:report.parallel,receipts:report.receipts})+"\n");
if(report.status!=="PASS_REAL_NVIDIA_SCOPED_PARTITION_TEST_ONLY")process.exitCode=1;
