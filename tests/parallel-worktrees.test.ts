import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {chmodSync,existsSync,mkdtempSync,rmSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {acquireWorkspaceWriter} from "../src/runtime/lifecycle/workspace-writer-lease.js";
import {prepareParallelWorkerWorktrees,assertPreparedParallelWorktree,dispatchApprovedParallelWorkers,type ParallelWorktreeAllocation} from "../src/runtime/agents/parallel-worktrees.js";
import {Dispatcher,type AgentRequest} from "../src/agents/dispatcher.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueControlledPlanPhaseGrant,issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";

// Un hook Git puede exportar GIT_DIR y redirigir -C a otro repositorio.
const localGitNames=new Set(execFileSync("git",["rev-parse","--local-env-vars"],{
 encoding:"utf8",stdio:["ignore","pipe","ignore"]
}).trim().split(/\r?\n/u).filter(Boolean).map(name=>name.toUpperCase()));
const gitFixtureEnvironment=(env:NodeJS.ProcessEnv)=>
 Object.fromEntries(Object.entries(env).filter(([key])=>!localGitNames.has(key.toUpperCase())));
const gitFixtureEnv=gitFixtureEnvironment(process.env);

function fixture(t:TestContext,fixtureGitEnv:NodeJS.ProcessEnv=gitFixtureEnv){
 const source=resolve(mkdtempSync(join(tmpdir(),"asen-t06-source-"))),
  parent=resolve(mkdtempSync(join(tmpdir(),"asen-t06-worktrees-")));
 const git=(root:string,...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:fixtureGitEnv}).trim();
 git(source,"init","-q");git(source,"config","user.name","ASEN T06");
 git(source,"config","user.email","asen-t06@example.invalid");
 git(source,"config","core.autocrlf","false"); // Git-for-Windows must preserve the expected fixture bytes.
 writeFileSync(join(source,"left.txt"),"original-left\n");writeFileSync(join(source,"right.txt"),"original-right\n");
 git(source,"add","left.txt","right.txt");git(source,"commit","-qm","base");
 const head=git(source,"rev-parse","HEAD"),created:string[]=[],confirmCalls:unknown[]=[];
 const units=[{taskId:"left",writeSurfaces:["left.txt"]},{taskId:"right",writeSurfaces:["right.txt"]}];
 const prepare=(overrides:Record<string,unknown>={})=>prepareParallelWorkerWorktrees({
  sourceRoot:source,parentDir:parent,expectedHead:head,units,
  confirm:async summary=>{confirmCalls.push(summary);return true;},...overrides
 } as Parameters<typeof prepareParallelWorkerWorktrees>[0]);
 t.after(()=>{
  for(const dir of created)if(existsSync(dir))try{git(source,"worktree","remove","--force",dir);}catch{}
  rmSync(source,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});
 });
 const registered=(allocations:readonly ParallelWorktreeAllocation[])=>created.push(...allocations.map(a=>a.root));
 return {source,parent,git,head,units,prepare,registered,confirmCalls};
}

test("T06 creates pinned, detached, clean and authority-free worktrees",async t=>{
 const f=fixture(t),result=await f.prepare();
 assert.equal(result.status,"prepared");if(result.status!=="prepared")return;
 f.registered(result.allocations);
 assert.equal(result.allocations.length,2);
 assert.equal(result.autoMerge,false);assert.equal(result.grantsAuthority,false);
 assert.equal(result.cleanup,"manual-after-review");
 assert.notEqual(result.allocations[0]!.root,result.allocations[1]!.root);
 for(const a of result.allocations){
  assert.equal(a.grantsAuthority,false);
  assert.equal(f.git(a.root,"rev-parse","HEAD"),f.head);
  assert.equal(f.git(a.root,"branch","--show-current"),"");
  assertPreparedParallelWorktree(a);
 }
 assert.equal(f.confirmCalls.length,1);
 assert.equal(f.git(f.source,"status","--porcelain"),"");
});

test("T06 permits two simultaneous writer leases on different real worktrees without touching source",async t=>{
 const f=fixture(t),result=await f.prepare();if(result.status!=="prepared")return;
 f.registered(result.allocations);
 const [one,two]=result.allocations;
 const a=acquireWorkspaceWriter({root:one!.root,expectedHead:f.head,authorizationId:"first",allowedPaths:one!.writeSurfaces});
 const b=acquireWorkspaceWriter({root:two!.root,expectedHead:f.head,authorizationId:"second",allowedPaths:two!.writeSurfaces});
 try{
  writeFileSync(join(one!.root,"left.txt"),"changed-left\n");
  writeFileSync(join(two!.root,"right.txt"),"changed-right\n");
  a.verify();b.verify();
  assert.equal(readFileSync(join(f.source,"left.txt"),"utf8"),"original-left\n");
  assert.equal(readFileSync(join(f.source,"right.txt"),"utf8"),"original-right\n");
  assert.equal(readFileSync(join(two!.root,"left.txt"),"utf8"),"original-left\n");
  assert.equal(readFileSync(join(one!.root,"right.txt"),"utf8"),"original-right\n");
 }finally{a.release();b.release();}
 assert.equal(existsSync(one!.root),true);
 assert.equal(existsSync(two!.root),true);
});

test("T06 no consent or source drift must not stage any worktrees",async t=>{
 const f=fixture(t),before=f.git(f.source,"worktree","list","--porcelain");
 assert.deepEqual(await f.prepare({confirm:async()=>false}),{status:"declined",grantsAuthority:false});
 assert.equal(f.git(f.source,"worktree","list","--porcelain"),before);
 await assert.rejects(()=>f.prepare({confirm:async()=>{writeFileSync(join(f.source,"left.txt"),"changed\n");return true;}}),/clean exact pinned/u);
 assert.equal(f.git(f.source,"worktree","list","--porcelain"),before);
});

test("T06 rejects overlapping, ambiguous, globbed, metadata, case-colliding or duplicate scopes",async t=>{
 const f=fixture(t);
 const bad=[
  [{taskId:"a",writeSurfaces:["src"]},{taskId:"b",writeSurfaces:["src/a.ts"]}],
  [{taskId:"a",writeSurfaces:["Left.txt"]},{taskId:"b",writeSurfaces:["left.txt"]}],
  [{taskId:"a",writeSurfaces:["left.txt"]},{taskId:"A",writeSurfaces:["right.txt"]}],
  [{taskId:"a",writeSurfaces:["../secret"]},{taskId:"b",writeSurfaces:["right.txt"]}],
  [{taskId:"a",writeSurfaces:[".git/config"]},{taskId:"b",writeSurfaces:["right.txt"]}],
  [{taskId:"a",writeSurfaces:[".GIT/config"]},{taskId:"b",writeSurfaces:["right.txt"]}],
  [{taskId:"a",writeSurfaces:["left.txt"]},{taskId:"b",writeSurfaces:["right*.txt"]}]
 ];
 for(const units of bad)await assert.rejects(()=>f.prepare({units}),/Invalid|Overlapping/u);
 assert.equal(f.confirmCalls.length,0);
});

test("T06 forbids overlapping parent and forged allocation identity",async t=>{
 const f=fixture(t);
 await assert.rejects(()=>f.prepare({parentDir:f.source}),/overlaps/u);
 assert.throws(()=>assertPreparedParallelWorktree({root:f.source} as ParallelWorktreeAllocation),/Forged/u);
 const r=await f.prepare();if(r.status!=="prepared")return;f.registered(r.allocations);
 assert.throws(()=>assertPreparedParallelWorktree({...r.allocations[0]!}),/Forged/u);
});


function authorizedWorker(allocation:ParallelWorktreeAllocation,index:number,store:EvidenceStore):AgentRequest{
 const taskId="t06-task-"+index,requestId=taskId+":worker",scope=allocation.writeSurfaces[0]!;
 const candidate={id:"t06-candidate-"+index,repository:allocation.root,revision:allocation.baseRevision,createdAt:"now"};
 const decision=issueOddDecision({taskId,repository:allocation.root,paths:[scope],writes:[{path:scope,changeKind:"behavior"}]});
 buildOrchestrationPlan({taskId,repository:allocation.root,prompt:"write",candidate},decision);
 const applicability=decideLifecycleApplicability(decision,{
  taskIdentity:taskId,repositoryIdentity:allocation.root,
  candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},
  explicitMode:"organic",affectedSubsystems:["t06"],expectedPaths:[scope],requiredArtifacts:[]
 });
 if(applicability.outcome!=="organic")throw Error("Expected organic ODD admission");
 const writerAdmission=issueOrganicWriterAdmission(applicability,[scope]);
 const phaseGrant=issueControlledPlanPhaseGrant({requestId,sessionId:"session-t06",candidate,surfaces:[scope],writerAdmission});
 const skillContext=issueSkillContext(requestId,allocation.root,candidate,{phase:"apply",codeChange:true});
 for(const [id,kind] of [["work-unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const){
  store.add(candidate,{id:id+"-"+index,kind,status:"pass",summary:"bounded T06 test",createdAt:"now"});
 }
 return {id:requestId,role:"worker",prompt:"write only the authorized scope",
  repository:allocation.root,isolationKey:"session-t06",writeSurfaces:[scope],
  candidate,writerAdmission,phaseGrant,expectedPhase:"apply",
  skillContext,skillPaths:selectSkills(skillContext).map(skill=>skill.path)};
}

test("T06 refuses cross-root, unauthorized and forged-context requests before any runner",async t=>{
 const f=fixture(t),created=await f.prepare();if(created.status!=="prepared")return;
 f.registered(created.allocations);
 let called=0;
 const dispatcher=new Dispatcher({run:async req=>{called++;return {id:req.id,ok:true,output:"unauthorized"};}},new EvidenceStore(),2);
 const requests=created.allocations.map((a,i)=>({
  id:"worker-"+i,role:"worker" as const,prompt:"fake",repository:a.root,isolationKey:"session-t06",
  candidate:{id:"fake",repository:a.root,revision:f.head,createdAt:"now"},
  writeSurfaces:[...a.writeSurfaces],writerAdmission:{},
  skillContext:{} as NonNullable<AgentRequest["skillContext"]>}));
 await assert.rejects(()=>dispatchApprovedParallelWorkers({
  dispatcher,allocations:created.allocations,requests:[{...requests[0]!,repository:f.source},requests[1]!] 
 }),/separate freshly authorized/u);
 await assert.rejects(()=>dispatchApprovedParallelWorkers({
  dispatcher,allocations:created.allocations,requests
 }),/separate freshly authorized/u);
 assert.equal(called,0);
});

test("T06 runs two genuinely authorized Dispatcher workers concurrently on separate worktree roots",async t=>{
 const f=fixture(t),created=await f.prepare();if(created.status!=="prepared")return;
 f.registered(created.allocations);
 const evidence=new EvidenceStore();
 const requests=created.allocations.map((a,i)=>authorizedWorker(a,i,evidence));
 const neverCalled=new Dispatcher({run:async req=>({id:req.id,ok:true,output:"not reached"})},evidence,2);
 await assert.rejects(()=>dispatchApprovedParallelWorkers({dispatcher:neverCalled,allocations:created.allocations,requests:[requests[0]!,{...requests[1]!,id:requests[0]!.id}]}),/separate freshly authorized/u);
 let concurrent=0,highest=0;
 const dispatcher=new Dispatcher({run:async request=>{
  concurrent++;highest=Math.max(highest,concurrent);
  try{
   writeFileSync(join(request.repository,request.writeSurfaces![0]!),"scoped change for "+request.id+"\n");
   await new Promise(resolve=>setTimeout(resolve,35));
   return {id:request.id,ok:true,output:"model-free authorized worker test"};
  }finally{concurrent--;}
 }},evidence,2);
 const result=await dispatchApprovedParallelWorkers({dispatcher,allocations:created.allocations,requests});
 assert.equal(highest,2,"two authorized workers must overlap execution in separate worktrees");
 assert.equal(result.status,"finished-needs-review");
 assert.equal(result.autoMerge,false);
 assert.equal(result.results.length,2);
 assert.equal(result.results.every(r=>r.ok),true);
 assert.equal(f.git(f.source,"status","--porcelain"),"");
 assert.equal(readFileSync(join(f.source,"left.txt"),"utf8"),"original-left\n");
 assert.equal(readFileSync(join(f.source,"right.txt"),"utf8"),"original-right\n");
 await assert.rejects(()=>dispatchApprovedParallelWorkers({
  dispatcher,allocations:created.allocations,requests
 }),/separate freshly authorized/u);
});

test("T06 Git worktree staging cannot execute project post-checkout hooks",{
 skip:process.platform==="win32"
},async t=>{
 const f=fixture(t),marker=join(f.source,"unsafe-post-checkout-marker");
 const hook=join(f.source,".git","hooks","post-checkout");
 writeFileSync(hook,'#!/bin/sh\nprintf hook-executed > "'+marker+'"\n');
 chmodSync(hook,0o755);
 const staged=await f.prepare();
 assert.equal(staged.status,"prepared");if(staged.status!=="prepared")return;
 f.registered(staged.allocations);
 assert.equal(existsSync(marker),false,"staging is not permission to execute Git post-checkout hooks");
});


test("T06 real AgentRuntime overlaps two authorized scoped Workers in independent Git worktrees (no model API)",async t=>{
 const f=fixture(t),prepared=await f.prepare();if(prepared.status!=="prepared")return;
 f.registered(prepared.allocations);
 let concurrent=0,peak=0,startedCount=0;
 let release!:()=>void,notifyBoth!:()=>void,notifyTerminated!:()=>void;
 const runningGate=new Promise<void>(r=>{release=r;});
 const bothStarted=new Promise<void>(r=>{notifyBoth=r;});
 const bothTerminal=new Promise<void>(r=>{notifyTerminated=r;});
 let terminated=0;
 const runner={run:async(request:AgentRequest)=>{
  concurrent++;peak=Math.max(peak,concurrent);startedCount++;
  if(startedCount===2)notifyBoth();
  try{
   await runningGate;
   return {id:request.id,ok:true,output:"instrumented native AgentRuntime concurrency: no model consumed"};
  }finally{concurrent--;}
 }};
 const runtime=await AgentRuntime.open({
  storeFile:join(f.parent,"t06-native-agent-runtime.json"),runner,maxConcurrency:2
 });
 runtime.subscribeTerminal(()=>{terminated++;if(terminated===2)notifyTerminated();});
 const launch=async(a:ParallelWorktreeAllocation,i:number)=>{
  const taskIdentity="t06-native-worker-"+i,scope=a.writeSurfaces[0]!,
   candidate={id:"native-"+i,repository:a.root,revision:a.baseRevision,
    createdAt:new Date().toISOString()};
  const decision=issueOddDecision({
   taskId:taskIdentity,repository:a.root,paths:[scope],
   writes:[{path:scope,changeKind:"behavior"}]
  });
  const plan=buildOrchestrationPlan({
   taskId:taskIdentity,repository:a.root,prompt:"Apply only "+scope,
   candidate,writeSurfaces:[scope]
  },decision);
  if(!plan.routeEvidence)throw new Error("Native Worker plan has no candidate-bound ODD evidence");
  const applicability=decideLifecycleApplicability(decision,{
   taskIdentity,repositoryIdentity:a.root,
   candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},
   explicitMode:"organic",affectedSubsystems:["t06"],expectedPaths:[scope],
   requiredArtifacts:[]
  });
  if(applicability.outcome!=="organic")throw new Error("Expected organic scoped admission");
  const admission=issueOrganicWriterAdmission(applicability,[scope]);
  return runtime.startControlledWorker({
   taskIdentity,prompt:"Apply only "+scope,
   session:{sessionId:"t06-child-pi-"+i,projectId:a.root},
   candidate,writeSurfaces:[scope],
   skillSelection:{phase:"apply",codeChange:true},writerAdmission:admission,
   routeEvidence:plan.routeEvidence,
   onPrepared:async(_id,enqueue,dispatch)=>{await enqueue();dispatch();}
  });
 };
 const wait=async(signal:Promise<void>,label:string)=>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
   await Promise.race([signal,new Promise<void>((_,reject)=>{
    timeout=setTimeout(()=>reject(new Error(label+" did not complete within 15 seconds")),15000);
   })]);
  }finally{if(timeout)clearTimeout(timeout);}
 };
 try{
  const ids=await Promise.all(prepared.allocations.map((a,i)=>launch(a,i)));
  assert.equal(ids.length,2);
  await wait(bothStarted,"Two native Workers");
  assert.equal(peak,2,"two real AgentRuntime/Dispatcher calls must overlap");
  for(let i=0;i<2;i++){
   const rows=await runtime.list({sessionId:"t06-child-pi-"+i,
    projectId:prepared.allocations[i]!.root});
   assert.equal(rows.length,1);
   assert.equal(rows[0]!.role,"worker");
   assert.equal(rows[0]!.id,ids[i]);
  }
 }finally{release();}
 await wait(bothTerminal,"Native Worker terminal persistence");
 for(let i=0;i<2;i++){
  const rows=await runtime.list({sessionId:"t06-child-pi-"+i,
   projectId:prepared.allocations[i]!.root});
  assert.equal(rows.length,1);
  assert.equal(rows[0]!.state,"completed");
 }
 assert.equal(f.git(f.source,"status","--porcelain"),"");
 assert.equal(readFileSync(join(f.source,"left.txt"),"utf8"),"original-left\n");
 assert.equal(readFileSync(join(f.source,"right.txt"),"utf8"),"original-right\n");
});


test("T06 la cancelación de un agente Pi en un worktree no interrumpe el otro (ejecutor sin modelo)",async t=>{
 const f=fixture(t),prepared=await f.prepare();if(prepared.status!=="prepared")return;
 f.registered(prepared.allocations);
 let entered=0,finished=0;
 let bothEntered!:()=>void,releaseSecond!:()=>void,allTerminal!:()=>void;
 const both=new Promise<void>(resolve=>{bothEntered=resolve;});
 const secondGate=new Promise<void>(resolve=>{releaseSecond=resolve;});
 const terminal=new Promise<void>(resolve=>{allTerminal=resolve;});
 const runner={run:async(request:AgentRequest,signal?:AbortSignal)=>{
  entered++;
  if(entered===2)bothEntered();
  if(request.isolationKey==="t06-cancel-a"){
   await new Promise<void>(resolve=>{
    if(signal?.aborted){resolve();return;}
    signal?.addEventListener("abort",()=>resolve(),{once:true});
   });
  }else await secondGate;
  return {id:request.id,ok:!signal?.aborted,
   output:signal?.aborted?"Cancelación comprobada":"Trabajo independiente finalizado"};
 }};
 const runtime=await AgentRuntime.open({
  storeFile:join(f.parent,"t06-cancel-agents.json"),runner,maxConcurrency:2
 });
 runtime.subscribeTerminal(()=>{finished++;if(finished===2)allTerminal();});
 const ids=await Promise.all(prepared.allocations.map((a,i)=>
  runtime.startReadOnly({role:"explorer",prompt:"Inspección sin escritura "+i,
   session:{sessionId:i?"t06-cancel-b":"t06-cancel-a",projectId:a.root}})
 ));
 const wait=async(promise:Promise<void>,label:string)=>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
   await Promise.race([promise,new Promise<void>((_,reject)=>{
    timeout=setTimeout(()=>reject(new Error("Timeout: "+label)),20000);
   })]);
  }finally{if(timeout)clearTimeout(timeout);}
 };
 try{
  await wait(both,"ambos agentes deben comenzar");
  const stopped=await runtime.cancel(ids[0]!,{
   sessionId:"t06-cancel-a",projectId:prepared.allocations[0]!.root
  });
  assert.equal(stopped,true);
 }finally{releaseSecond();}
 await wait(terminal,"ambos estados terminales deben persistirse");
 const a=await runtime.list({sessionId:"t06-cancel-a",projectId:prepared.allocations[0]!.root});
 const b=await runtime.list({sessionId:"t06-cancel-b",projectId:prepared.allocations[1]!.root});
 assert.equal(a.length,1);assert.equal(b.length,1);
 assert.equal(a[0]!.state,"cancelled");
 assert.equal(b[0]!.state,"completed");
 assert.equal(f.git(f.source,"status","--porcelain"),"");
});

test("T06: una cancelación dentro del callback previo no ejecuta Git add",async t=>{
 const f=fixture(t),controller=new AbortController();
 let callbacks=0;
 await assert.rejects(()=>f.prepare({
  signal:controller.signal,
  onBeforeWorktreeAdd:()=>{callbacks++;controller.abort();}
 }),/cancelled before Git add/u);
 assert.equal(callbacks,1);
 const list=f.git(f.source,"worktree","list","--porcelain");
 assert.equal(list.split(/\r?\n/u).filter(row=>row.startsWith("worktree ")).length,1);
 assert.equal(f.git(f.source,"status","--porcelain"),"");
});

test("T06: el fixture descarta GIT_DIR externo antes de ejecutar Git",t=>{
 const isolated=gitFixtureEnvironment({...gitFixtureEnv,
  GIT_DIR:join(tmpdir(),"asen-repo-equivocado-inexistente")});
 assert.equal(isolated.GIT_DIR,undefined);
 assert.equal(Object.keys(isolated).some(key=>key.toUpperCase()==="GIT_DIR"),false);
 const mixed=gitFixtureEnvironment({...gitFixtureEnv,
  Git_Dir:join(tmpdir(),"asen-repo-externo-por-mayusculas")});
 assert.equal(Object.keys(mixed).some(key=>key.toUpperCase()==="GIT_DIR"),false);
 const f=fixture(t,isolated);
 assert.equal(f.git(f.source,"rev-parse","--is-inside-work-tree"),"true");
 assert.equal(f.git(f.source,"status","--porcelain"),"");
});
