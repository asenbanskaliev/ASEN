import assert from "node:assert/strict";
import {mkdtemp,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test,{type TestContext} from "node:test";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {registerAgentTools} from "../src/agents/pi-agent-tools.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {materializeExecutablePlan,type PlannedTask} from "../src/orchestration/executable-plan.js";
import {SessionTodoStore,type TodoPlanDraft} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {issueOddDecision} from "./helpers/odd-routing.js";

const at="2026-11-01T00:00:00.000Z";
const noReady={status:"blocked",reason:"No persisted plan task is dependency-ready; complete independent verification or resolve the plan clarification first."};
function draft(task:PlannedTask):TodoPlanDraft{
 return {title:task.title,requestId:`asen-plan:${task.id}`,dependsOn:task.dependsOn.map(id=>`asen-plan:${id}`),description:task.instruction,
  plan:{role:task.role,priority:task.priority,skillPaths:[...task.skillPaths],...(task.skillSelection?{skillSelection:{...task.skillSelection}}:{})}};
}
async function fixture(t:TestContext,instruction:string){
 // Retain owned fixtures; do not create Git repositories or launch Pi/providers.
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-parent-inline-")));
 t.diagnostic(`retained fixture: ${root}`);
 const identity={sessionId:"parent-inline-characterization",projectId:root};
 const todos=await SessionTodoStore.open(join(root,"todos.json"),()=>at),links=new TaskAgentLinkStore(join(root,"links.json"));
 const counters={runner:0,confirmation:0,binder:0,routing:0};
 const runtime=await AgentRuntime.open({storeFile:join(root,"agents.json"),runner:{run:async()=>{counters.runner++;throw new Error("No agent may run in this characterization");}}});
 const decision=issueOddDecision({taskId:"inline-observation",repository:root,testingRequired:false});
 assert.equal(decision.route,"direct");
 const plan=materializeExecutablePlan(buildOrchestrationPlan({taskId:decision.taskIdentity,repository:root,prompt:instruction,selectionProfile:"organic"},decision),instruction);
 assert.equal(plan.tasks.length,1);assert.equal(plan.tasks[0]!.role,"primary");
 const primaryDraft=draft(plan.tasks[0]!);
 const [task]=await todos.addPlan([primaryDraft],identity);assert.ok(task);
 const tools=new Map<string,ToolDefinition<any>>();
 const unregister=registerAgentTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>runtime,{
  todos:async()=>todos,links:async()=>links,binder:async()=>{counters.binder++;throw new Error("No task-agent binding expected");},
 },async()=>{counters.routing++;return {source:"default"};});
 t.after(unregister);
 const tool=tools.get("asen_plan_dispatch_next");assert.ok(tool);assert.equal(tool.executionMode,"sequential");
 const host={cwd:root,sessionManager:{getSessionId:()=>identity.sessionId},hasUI:true,ui:{confirm:async()=>{counters.confirmation++;return true;}}};
 const execute=()=>tool.execute("inline-characterization",{},undefined,undefined,host as never);
 const assertNoLaunch=async()=>{
  assert.deepEqual(await runtime.list(identity),[]);
  assert.deepEqual(await links.list(identity),[]);
  assert.deepEqual(counters,{runner:0,confirmation:0,binder:0,routing:0});
 };
 return {root,identity,todos,links,runtime,task,primaryDraft,execute,assertNoLaunch};
}
function envelope(value:unknown){return {content:[{type:"text",text:JSON.stringify(value)}],details:value};}

for(const [name,instruction] of [
 ["exact punctuation and Unicode","Observe the test-only result: expected failure is not RED authority; keep production undispatched — ñ, \"quoted\", C:\\scope\\file.ts."],
 ["primary instruction beyond the delegated confirmation limit","Observe without dispatch: "+"x".repeat(4100)],
] as const){
 test(`public inline claim retains ${name} exactly once`,async t=>{
  const f=await fixture(t,instruction),before=await f.todos.list(f.identity);
  await f.assertNoLaunch();
  const expected={status:"inline",todoId:f.task.taskId,revision:2,role:"primary",instruction};
  // Exact keys also exclude candidate/write grants or RED/checkpoint authority.
  assert.deepEqual(await f.execute(),envelope(expected));
  const claimed={taskId:f.task.taskId,...f.identity,revision:2,state:"running",at,reason:"Claimed for continuation in the active Pi session"};
  const history=[...f.task.events,claimed];
  assert.deepEqual(await f.todos.history(f.task.taskId,f.identity),history);
  assert.deepEqual(await f.todos.list(f.identity),[{...before[0]!,events:history,current:claimed}]);
  await f.assertNoLaunch();
  // Reopening uses public store methods, never raw persisted files.
  const reopened=await SessionTodoStore.open(join(f.root,"todos.json"),()=>at);
  assert.deepEqual(await reopened.list(f.identity),await f.todos.list(f.identity));
  const saved=await reopened.list(f.identity);
  assert.deepEqual(await f.execute(),envelope(noReady));
  assert.deepEqual(await f.todos.list(f.identity),saved);
  assert.deepEqual(await reopened.history(f.task.taskId,f.identity),history);
  await f.assertNoLaunch();
 });
}

test("separate production dependency composition is rejected publicly without creating a checkpoint",async t=>{
 const instruction="Observe the reported test result in the parent; this instruction cannot authorize production.";
 const f=await fixture(t,instruction);
 assert.deepEqual(await f.execute(),envelope({status:"inline",todoId:f.task.taskId,revision:2,role:"primary",instruction}));
 const before=await f.todos.list(f.identity),history=await f.todos.history(f.task.taskId,f.identity);
 // Genuine issuer and materializer, no forged skill/phase/candidate grants.
 const decision=issueOddDecision({taskId:"production-work",repository:f.root,reviewKind:"dual_explicit",writes:[{path:"src/feature.ts",changeKind:"behavior"}]});
 assert.equal(decision.route,"orchestrate");
 const production=materializeExecutablePlan(buildOrchestrationPlan({taskId:decision.taskIdentity,repository:f.root,prompt:"Change only the scoped production behavior",selectionProfile:"organic"},decision),"Change only the scoped production behavior");
 const worker=production.tasks.find(task=>task.role==="worker");assert.ok(worker);
 const dependent={...draft(worker),dependsOn:[f.primaryDraft.requestId]};
 // addPlan resolves sibling request IDs, not a dependency from an earlier batch.
 // Do not widen that graph or fake a guard to manufacture a RED pause.
 await assert.rejects(()=>f.todos.addPlan([dependent],f.identity),{name:"Error",message:"ASEN Todo plan dependency is missing"});
 assert.deepEqual(await f.todos.list(f.identity),before);
 assert.deepEqual(await f.todos.history(f.task.taskId,f.identity),history);
 assert.deepEqual(await f.todos.archived(f.identity),[]);
 await f.assertNoLaunch();
 assert.deepEqual(await f.execute(),envelope(noReady));
 assert.deepEqual(await f.todos.list(f.identity),before);
 assert.deepEqual(await f.todos.history(f.task.taskId,f.identity),history);
 await f.assertNoLaunch();
});
