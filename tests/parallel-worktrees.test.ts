import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdtempSync,rmSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {acquireWorkspaceWriter} from "../src/runtime/lifecycle/workspace-writer-lease.js";
import {prepareParallelWorkerWorktrees,assertPreparedParallelWorktree,dispatchApprovedParallelWorkers,type ParallelWorktreeAllocation} from "../src/runtime/agents/parallel-worktrees.js";
import {Dispatcher,type AgentRequest} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueControlledPlanPhaseGrant,issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";

function fixture(t:TestContext){
 const source=resolve(mkdtempSync(join(tmpdir(),"asen-t06-source-"))),
  parent=resolve(mkdtempSync(join(tmpdir(),"asen-t06-worktrees-")));
 const git=(root:string,...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git(source,"init","-q");git(source,"config","user.name","ASEN T06");
 git(source,"config","user.email","asen-t06@example.invalid");
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
