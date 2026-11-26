import test from "node:test";
import assert from "node:assert/strict";
import {projectParallelAgentFlow,type AgentFlowSourceBatch} from "../src/runtime/ui/agent-flow-overview.js";
import type {ParallelWorktreeChangeInspection} from "../src/runtime/agents/parallel-worktree-change-inspection.js";

function inspection(status:ParallelWorktreeChangeInspection["status"]="clean"):ParallelWorktreeChangeInspection{
 return {status,changedPaths:status==="clean"?[]:["changed.ts"],
  outOfScopePaths:status==="out-of-scope"?["changed.ts"]:[],
  headMatchesBase:status!=="head-diverged"&&status!=="unavailable",
  sourceVerified:status!=="unavailable",acceptance:"not-accepted",autoMerge:false};
}
const task=(id:string,more:Record<string,unknown>={})=>({
 sourceTodoId:id,sourceTodoUnchanged:true,worktreePresent:true,
 handoffClaimed:false,changes:inspection(),...more
});
const batch=(more:Record<string,unknown>={}):AgentFlowSourceBatch=>({
 batchId:"batch-1",state:"prepared",tasks:[task("worker-a"),task("worker-b")],...more
}) as AgentFlowSourceBatch;

test("T07 flow summary shows child session as required, not an automatically launched Worker",()=>{
 const p=projectParallelAgentFlow([batch()]);
 assert.equal(p.kind,"read-only-flow-overview");
 assert.equal(p.totalBatches,1);assert.equal(p.totalTasks,2);
 assert.equal(p.stages["attach-required"],2);
 assert.deepEqual(p.tasks.map(t=>t.nextAction),["attach-child-session","attach-child-session"]);
 assert.equal(p.tasks[0]!.modelRequested,"unknown");
 assert.equal(p.tasks[0]!.modelResolved,"unknown");
 assert.equal(p.tasks[0]!.modelActual,"unknown");
 assert.equal(p.tasks[0]!.modelConsumedProven,false);
 assert.equal(p.acceptance,"not-accepted");assert.equal(p.autoLaunch,false);
 assert.equal(p.grantsAuthority,false);assert.equal(p.autoRetry,false);assert.equal(p.autoMerge,false);
});

test("T06/T07 distingue lote consumido sin Worker de uno no iniciado; no autoriza un relanzamiento",()=>{
 const p=projectParallelAgentFlow([batch({supervisorClaimed:true,tasks:[
  task("worker-a",{handoffClaimed:true,childSession:{id:"child-a",agents:[]}}),
  task("worker-b",{handoffClaimed:true,childSession:{id:"child-b",agents:[{
   id:"agente-b",role:"worker",state:"queued"
  }]}})
 ]})]);
 assert.equal(p.stages["launch-unverified"],1);
 assert.equal(p.stages["queued-observed"],1);
 assert.equal(p.stages["running-observed"],0);
 assert.equal(p.tasks[0]?.nextAction,"inspect-launch");
 assert.equal(p.tasks[0]?.workerObserved,"not-observed");
 assert.equal(p.tasks[1]?.workerObserved,"queued");
 assert.equal(p.autoLaunch,false);assert.equal(p.autoRetry,false);
 assert.equal(p.autoMerge,false);assert.equal(p.acceptance,"not-accepted");
 const notClaimed=projectParallelAgentFlow([batch({supervisorClaimed:false,tasks:[
  task("worker-a",{handoffClaimed:true,childSession:{id:"child-a",agents:[]}}),
  task("worker-b",{handoffClaimed:true,childSession:{id:"child-b",agents:[]}})
 ]})]);
 assert.equal(notClaimed.stages["handoff-unverified"],2);
});

test("T07 attached Pi session, claimed handoff, and active model-free Worker have different honest states",()=>{
 const p=projectParallelAgentFlow([batch({tasks:[
  task("worker-a",{childSession:{id:"child-a",agents:[]}}),
  task("worker-b",{handoffClaimed:true,childSession:{id:"child-b",
   agents:[{id:"a-1",role:"worker",state:"running"}]}})
 ]})]);
 assert.equal(p.tasks[0]!.stage,"child-plan-required");
 assert.equal(p.tasks[1]!.stage,"running-observed");
 assert.equal(p.tasks[1]!.workerObserved,"active");
 assert.equal(p.tasks[1]!.modelActual,"unknown");
 assert.equal(p.tasks[1]!.acceptance,"not-accepted");
});

test("T07 completed agents remain unverified and are sent to manual review",()=>{
 const p=projectParallelAgentFlow([batch({tasks:[
  task("worker-a",{childSession:{id:"child-a",agents:[{id:"a",role:"worker",state:"completed"}]}}),
  task("worker-b",{handoffClaimed:true,childSession:{id:"child-b",agents:[]}})
 ]})]);
 assert.equal(p.tasks[0]!.stage,"manual-review-required");
 assert.equal(p.tasks[0]!.workerObserved,"terminal-unverified");
 assert.equal(p.tasks[0]!.modelConsumedProven,false);
 assert.equal(p.tasks[1]!.stage,"handoff-unverified");
});

test("T07 source drift, failed Worker, out-of-scope Git change and missing worktree block the flow",()=>{
 const p=projectParallelAgentFlow([batch({state:"prepared",tasks:[
  task("worker-a",{sourceTodoUnchanged:false}),
  task("worker-b",{changes:inspection("out-of-scope"),
   childSession:{id:"child-b",agents:[{id:"a",role:"worker",state:"failed"}]}})
 ]})]);
 assert.deepEqual(p.tasks.map(x=>x.stage),["blocked","blocked"]);
 const q=projectParallelAgentFlow([batch({tasks:[task("worker-a",{worktreePresent:false}),
  task("worker-b",{changes:inspection("head-diverged")})]})]);
 assert.equal(q.stages.blocked,2);
});

test("T07 reserved-but-not-reconciled worktrees are distinct from available worktrees",()=>{
 const p=projectParallelAgentFlow([batch({state:"reserved",tasks:[
  task("worker-a",{changes:inspection("unavailable"),worktreePresent:false}),
  task("worker-b",{changes:inspection("unavailable"),worktreePresent:false})
 ]})]);
 assert.equal(p.stages["reserved-needs-inspection"],2);
 assert.equal(p.tasks[0]!.nextAction,"inspect-reservation");
});

test("T07 summary rejects malformed, duplicated or misleading persisted projections",()=>{
 const good=task("worker-a"),next=task("worker-b");
 for(const testCase of [
  batch({tasks:[good,good]}),
  batch({tasks:[good,{...next,changes:{...inspection(),acceptance:"accepted"}}]}),
  batch({tasks:[good,{...next,childSession:{id:"c",agents:[{id:"x",role:"worker",state:"made-up"}]}}]})
 ]){
  assert.throws(()=>projectParallelAgentFlow([testCase]));
 }
 assert.throws(()=>projectParallelAgentFlow([batch({tasks:[good]})]));
 assert.throws(()=>projectParallelAgentFlow([batch(),batch({batchId:"batch-2"})]),/duplicate/u);
});

test("T02/T05/T07 muestra modelo solicitado únicamente con vínculo y Worker observable",()=>{
 const p=projectParallelAgentFlow([batch({supervisorClaimed:true,tasks:[
  task("worker-a",{handoffClaimed:true,receiptRecorded:true,childSession:{
   id:"child-a",modelRequested:"nvidia/nemotron-3.5-lightning-30b-a3b",
   agents:[{id:"a",role:"worker",state:"completed"}]}}),
  task("worker-b",{handoffClaimed:false,receiptRecorded:false})
 ]})]);
 assert.equal(p.tasks[0]?.modelRequested,"nvidia/nemotron-3.5-lightning-30b-a3b");
 assert.equal(p.tasks[0]?.modelActual,"unknown");
 assert.equal(p.tasks[0]?.modelConsumedProven,false);
 assert.equal(p.tasks[0]?.supervisorClaimed,true);
 assert.equal(p.tasks[0]?.receiptRecorded,true);
 assert.equal(p.tasks[0]?.stage,"manual-review-required");
 assert.equal(p.tasks[0]?.acceptance,"not-accepted");
 assert.equal(p.tasks[1]?.modelRequested,"unknown");
 assert.equal(p.tasks[1]?.receiptRecorded,false);
 assert.equal(p.autoMerge,false);
});
test("T06/T07 no acepta modelo solicitado sin Worker realmente vinculado",()=>{
 for(const input of [
  batch({supervisorClaimed:"sí"}),
  batch({tasks:[task("worker-a",{receiptRecorded:"true"}),task("worker-b")]}),
  batch({tasks:[task("worker-a",{childSession:{
   id:"child-a",modelRequested:"nvidia/otro",agents:[]}}),task("worker-b")]}),
  batch({tasks:[task("worker-a",{childSession:{
   id:"child-a",modelRequested:"nvidia/otro",
   agents:[{id:"a",role:"worker",state:"running"}]}}),task("worker-b")]}),
  batch({tasks:[task("worker-a",{handoffClaimed:true,childSession:{
   id:"child-a",modelRequested:"unknown",
   agents:[{id:"a",role:"worker",state:"running"}]}}),task("worker-b")]})
 ])assert.throws(()=>projectParallelAgentFlow([input]));
});
