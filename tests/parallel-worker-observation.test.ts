import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {ParallelWorkerObservationJournal} from "../src/runtime/agents/parallel-worker-observation-journal.js";
import type {ParallelChildSessionLink} from "../src/runtime/agents/parallel-todo-session-links.js";
import type {AttributedParallelWorker} from "../src/runtime/agents/parallel-worker-attribution.js";
import type {ParallelWorktreeChangeInspection} from "../src/runtime/agents/parallel-worktree-change-inspection.js";

const root=resolve(tmpdir(),"asen-source-proj"),child=resolve(tmpdir(),"asen-child-proj");
const link:ParallelChildSessionLink={
 batchId:"batch-a",sourceSessionId:"source",sourceProjectId:root,
 sourceTodoId:"source-todo-a",sourceRequestId:"asen-plan:source-a:worker",sourceTodoRevision:2,
 childSessionId:"child",childProjectId:child,sourceHead:"a".repeat(40),
 attachedAt:"2026-11-15T18:00:00.000Z",authority:"none",autoDispatch:false,autoMerge:false
};
const worker:AttributedParallelWorker={
 sourceTodoId:"source-todo-a",childTodoId:"child-task",agentId:"asen-plan:child-task:worker",
 agentState:"completed",agentUpdatedAt:"2026-11-15T19:00:00.000Z",childTodoState:"succeeded",
 modelActual:"unknown",modelConsumedProven:false,acceptance:"not-accepted",autoMerge:false
};
const changes:ParallelWorktreeChangeInspection={
 status:"scoped-changes",changedPaths:["src/a.ts"],outOfScopePaths:[],
 sourceVerified:true,headMatchesBase:true,acceptance:"not-accepted",autoMerge:false
};
function fixture(t:TestContext){
 const dir=mkdtempSync(join(tmpdir(),"asen-t06-worker-observation-")),file=join(dir,"observed.json");
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return {journal:new ParallelWorkerObservationJournal(file),file};
}

test("T06 terminal native Worker receipt persists only IDs, status and read-only diff facts",async t=>{
 const {journal,file}=fixture(t);
 const saved=await journal.record({link,worker,sourceTodoRevision:2,changes});
 assert.equal(saved.agentState,"completed");assert.equal(saved.modelActual,"unknown");
 assert.equal(saved.modelConsumedProven,false);assert.equal(saved.acceptance,"not-accepted");
 assert.equal(saved.autoRetry,false);assert.equal(saved.autoMerge,false);
 const rows=await journal.listSource({sessionId:"source",projectId:root},[link]);
 assert.equal(rows.length,1);assert.deepEqual(rows[0],saved);
 assert.doesNotMatch(readFileSync(file,"utf8"),/prompt|password|assistantOutput|runnerOutput/u);
 assert.deepEqual(await journal.listSource({sessionId:"foreign",projectId:root},[link]),[]);
 assert.deepEqual(await journal.listSource({sessionId:"source",projectId:root},[]),[]);
});
test("T06 duplicate terminal result is never replayed or silently replaced",async t=>{
 const {journal}=fixture(t);
 await journal.record({link,worker,sourceTodoRevision:2,changes});
 await assert.rejects(()=>journal.record({link,worker,sourceTodoRevision:2,changes}),/already recorded/u);
 assert.equal((await journal.listSource({sessionId:"source",projectId:root},[link])).length,1);
});
test("T06 active, forged, cross-task or stale source revision cannot produce an observation",async t=>{
 const {journal}=fixture(t);
 const invalid=[
  {link,worker:{...worker,agentState:"running"},sourceTodoRevision:2,changes},
  {link,worker:{...worker,sourceTodoId:"other"},sourceTodoRevision:2,changes},
  {link,worker,sourceTodoRevision:5,changes},
  {link,worker:{...worker,acceptance:"accepted"},sourceTodoRevision:2,changes},
  {link,worker,sourceTodoRevision:2,changes:{...changes,autoMerge:true}}
 ];
 for(const input of invalid){
  await assert.rejects(()=>journal.record(input as Parameters<typeof journal.record>[0]));
 }
 assert.equal((await journal.listSource({sessionId:"source",projectId:root},[link])).length,0);
});
test("T06 a failed or interrupted Worker is recorded as evidence, never PASS",async t=>{
 const {journal}=fixture(t);
 const failed=await journal.record({
  link,worker:{...worker,agentState:"failed"},sourceTodoRevision:2,
  changes:{...changes,status:"out-of-scope",outOfScopePaths:["other.ts"],changedPaths:["other.ts"]}
 });
 assert.equal(failed.agentState,"failed");
 assert.equal(failed.worktreeChangeState,"out-of-scope");
 assert.equal(failed.acceptance,"not-accepted");assert.equal(failed.modelActual,"unknown");
});

const childTwo=resolve(tmpdir(),"asen-child-proj-2");
const linkTwo:ParallelChildSessionLink={
 ...link,sourceTodoId:"source-todo-b",sourceRequestId:"asen-plan:source-b:worker",
 childSessionId:"child-2",childProjectId:childTwo
};
const workerTwo:AttributedParallelWorker={
 ...worker,sourceTodoId:"source-todo-b",childTodoId:"child-task-2",
 agentId:"asen-plan:child-task-2:worker"
};
const firstInput={link,worker,sourceTodoRevision:2,changes};
const secondInput={link:linkTwo,worker:workerTwo,sourceTodoRevision:2,changes};

test("T06 exactly two child receipts persist in one atomic batch journal revision",async t=>{
 const {journal,file}=fixture(t);
 const results=await journal.recordBatch([firstInput,secondInput]);
 assert.equal(results.length,2);assert.deepEqual(results.map(r=>r.sourceTodoId),
  ["source-todo-a","source-todo-b"]);
 assert.equal(results.every(r=>r.modelConsumedProven===false&&r.acceptance==="not-accepted"),true);
 const saved=JSON.parse(readFileSync(file,"utf8")) as {revision:number;receipts:unknown[]};
 assert.equal(saved.revision,2);assert.equal(saved.receipts.length,2);
 const query=await journal.listSource({sessionId:"source",projectId:root},[link,linkTwo]);
 assert.equal(query.length,2);
});

test("T06 malformed second child cannot leave first child recorded",async t=>{
 const {journal}=fixture(t);
 await assert.rejects(()=>journal.recordBatch([
  firstInput,{...secondInput,worker:{...workerTwo,agentState:"running"}}
 ]),/terminal exact/u);
 assert.equal((await journal.listSource({sessionId:"source",projectId:root},[link,linkTwo])).length,0);
 await assert.rejects(()=>journal.recordBatch([firstInput,{...secondInput,link:{...linkTwo,batchId:"other"}}]),/mixed owners/u);
 assert.equal((await journal.listSource({sessionId:"source",projectId:root},[link,linkTwo])).length,0);
});

test("T06 a prior receipt blocks an entire overlapping batch without partial second write",async t=>{
 const {journal}=fixture(t);
 await journal.record(firstInput);
 await assert.rejects(()=>journal.recordBatch([firstInput,secondInput]),/already recorded/u);
 const saved=await journal.listSource({sessionId:"source",projectId:root},[link,linkTwo]);
 assert.equal(saved.length,1);assert.equal(saved[0]!.sourceTodoId,"source-todo-a");
});

test("T06 concurrent competing same-batch observations cannot be duplicated or partially replayed",async t=>{
 const {journal}=fixture(t);
 const outcomes=await Promise.allSettled([
  journal.recordBatch([firstInput,secondInput]),
  journal.recordBatch([firstInput,secondInput])
 ]);
 assert.equal(outcomes.filter(result=>result.status==="fulfilled").length,1);
 assert.equal(outcomes.filter(result=>result.status==="rejected").length,1);
 assert.equal((await journal.listSource({sessionId:"source",projectId:root},[link,linkTwo])).length,2);
});

test("T06 4R reliability: contradicting Git inspection facts cannot produce durable receipts",async t=>{
 const {journal}=fixture(t);
 const cases:ParallelWorktreeChangeInspection[]=[
  {...changes,status:"clean"},
  {...changes,status:"head-diverged",headMatchesBase:true},
  {...changes,status:"unavailable",sourceVerified:true},
  {...changes,status:"out-of-scope",outOfScopePaths:[]},
  {...changes,status:"out-of-scope",outOfScopePaths:["src/not-reported.ts"]},
  {...changes,status:"scoped-changes",changedPaths:[]},
  {...changes,status:"scoped-changes",changedPaths:["../escape.ts"]},
  {...changes,status:"scoped-changes",changedPaths:[".git/config"]},
  {...changes,status:"scoped-changes",changedPaths:["src/a.ts","src/a.ts"]},
  {...changes,status:"scoped-changes",changedPaths:["src\\archivo.ts"]},
 ];
 for(const item of cases){
  await assert.rejects(()=>journal.record({
   link,worker,sourceTodoRevision:2,changes:item
  }),/terminal exact/u);
 }
 assert.equal((await journal.listSource({sessionId:"source",projectId:root},[link])).length,0);
});
test("T06 4R risk: one child Pi session cannot claim two separate Workers",async t=>{
 const {journal}=fixture(t);
 await assert.rejects(()=>journal.recordBatch([
  firstInput,{...secondInput,link:{...linkTwo,childSessionId:link.childSessionId}}
 ]),/mixed owners/u);
 assert.equal((await journal.listSource({sessionId:"source",projectId:root},[link,linkTwo])).length,0);
});
test("T06 4R resilience: a prior Pi child session cannot be reused in a later batch",async t=>{
 const {journal}=fixture(t);
 await journal.record(firstInput);
 await assert.rejects(()=>journal.record({
  ...secondInput,link:{...linkTwo,batchId:"different-batch",childSessionId:link.childSessionId}
 }),/already recorded/u);
 const saved=await journal.listSource({sessionId:"source",projectId:root},[link,linkTwo]);
 assert.equal(saved.length,1);
 assert.equal(saved[0]?.sourceTodoId,"source-todo-a");
});
