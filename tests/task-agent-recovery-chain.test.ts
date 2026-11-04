/** EF-601/603/604: durable multi-attempt Todo recovery never invents Pi,
 * Writer permission, a provider call, or independent verification. */
import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TaskAgentTodoReconciler} from "../src/runtime/task-agent-reconciler.js";
import {CONFIRMED_FAILED_READ_ONLY_RETRY_REASON,TrustedTaskAgentBinder} from "../src/runtime/trusted-task-agent-binder.js";
import {selectSkills} from "../src/skills/registry.js";

type Role="explorer"|"worker"|"reviewer"|"verifier";
type State="queued"|"running"|"interrupted"|"completed"|"failed"|"cancelled";
type Agent={id:string;role:Role;state:State;summary?:string;sessionId:string;projectId:string};

async function fixture(t:import("node:test").TestContext,role:Role="explorer"){
 const root=await mkdtemp(join(tmpdir(),"asen-ef604-recovery-chain-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const identity={sessionId:"recovery-chain",projectId:root};
 const todoFile=join(root,"todos.json"),linkFile=join(root,"links.json");
 const todos=await SessionTodoStore.open(todoFile),links=new TaskAgentLinkStore(linkFile);
 const phase=({explorer:"explore",worker:"apply",reviewer:"adversarial-review",verifier:"verify"} as const)[role];
 const skillSelection={phase};
 const task=await todos.add("Durable multi-attempt recovery",identity,undefined,undefined,
  `asen-plan:chain:${role}`,[],"Inspect recorded execution outcome without replay",{
   role,skillSelection,skillPaths:selectSkills(skillSelection).map(skill=>skill.path),
  });
 await todos.update(task.taskId,identity,1,"running");
 const agents:Agent[]=[];
 async function append(id:string,state:State,summary?:string,agentRole:Role=role){
  agents.push({id,state,role:agentRole,sessionId:identity.sessionId,projectId:identity.projectId,
   ...(summary!==undefined?{summary}:{})});
  await links.bind({taskId:task.taskId,agentId:id,...identity,createdAt:new Date().toISOString()});
 }
 async function reconcile(){
  // Reopen both journals to exercise durable, separate-instance recovery.
  const reopened=await SessionTodoStore.open(todoFile);
  const journal=new TaskAgentLinkStore(linkFile);
  const runner={list:async()=>agents.map(agent=>structuredClone(agent))};
  return new TaskAgentTodoReconciler(reopened,runner as never,journal).reconcile(identity);
 }
 async function current(){
  return (await (await SessionTodoStore.open(todoFile)).list(identity)).find(item=>item.taskId===task.taskId);
 }
 return {root,identity,todoFile,linkFile,todos,links,task,role,agents,append,reconcile,current};
}

test("EF-604 recovered Explorer completes from the last attempt, preserving the interrupted predecessor",async t=>{
 const f=await fixture(t);
 await f.append("attempt-one","interrupted","Partial output discarded");
 await f.append("attempt-two","completed","Final bounded read-only findings");
 assert.deepEqual(await f.reconcile(),[]);
 assert.equal((await f.current())?.current.state,"done");
 assert.match((await f.current())?.current.reason??"",/saved result/u);
 assert.deepEqual(await f.reconcile(),[],"No duplicate journal transition after reopen");
 assert.equal((await f.current())?.events.length,3,"planned, running, done; no synthetic replay");
 assert.deepEqual((await new TaskAgentLinkStore(f.linkFile).list(f.identity)).map(l=>l.agentId),
  ["attempt-one","attempt-two"],"Prior attempt remains immutable for audit");
});

test("EF-604 three interrupted/continued attempts complete only from the final matching result",async t=>{
 const f=await fixture(t);
 await f.append("attempt-one","interrupted");
 await f.append("attempt-two","interrupted");
 await f.append("attempt-three","completed","Read-only final evidence");
 assert.deepEqual(await f.reconcile(),[]);
 assert.equal((await f.current())?.current.state,"done");
});

test("EF-603 a completed or failed predecessor is never converted to interrupted authority",async t=>{
 for(const state of ["completed","failed","cancelled"] as const){
  const f=await fixture(t);
  await f.append("first-"+state,state,"Previous independent outcome");
  await f.append("new-"+state,"completed","Plausible later result");
  assert.deepEqual(await f.reconcile(),[f.task.taskId]);
  assert.equal((await f.current())?.current.state,"blocked");
  assert.match((await f.current())?.current.reason??"",/recovery history is inconsistent/u);
 }
});

test("EF-604 last attempt still running is not prematurely blocked or marked done",async t=>{
 const f=await fixture(t);
 await f.append("previous","interrupted");
 await f.append("active","running");
 assert.deepEqual(await f.reconcile(),[]);
 assert.equal((await f.current())?.current.state,"running");
});

test("EF-604 missing predecessor in the observed agent snapshot blocks an apparently successful replay",async t=>{
 const f=await fixture(t);
 await f.append("missing","interrupted");
 await f.append("present","completed","Result on unverified chain");
 f.agents.splice(0,1);
 assert.deepEqual(await f.reconcile(),[f.task.taskId]);
 assert.equal((await f.current())?.current.state,"blocked");
 assert.match((await f.current())?.current.reason??"",/record is missing/u);
});

test("EF-603 predecessor role switch invalidates an otherwise complete Explorer recovery",async t=>{
 const f=await fixture(t);
 await f.append("wrong-role","interrupted",undefined,"worker");
 await f.append("correct-role","completed","Read-only final report");
 assert.deepEqual(await f.reconcile(),[f.task.taskId]);
 assert.match((await f.current())?.current.reason??"",/recovery history is inconsistent/u);
});

test("EF-302 recovered Worker remains succeeded and requires downstream independent review",async t=>{
 // This is a journal-only fixture; it does not execute or authorize any Writer.
 const f=await fixture(t,"worker");
 await f.append("old-worker","interrupted");
 await f.append("new-worker","completed","Saved restricted output receipt");
 assert.deepEqual(await f.reconcile(),[]);
 assert.equal((await f.current())?.current.state,"succeeded");
 assert.match((await f.current())?.current.reason??"",/independent review is still required/u);
 assert.notEqual((await f.current())?.current.state,"done");
});

test("EF-302 completed Worker without a saved result cannot claim successful execution",async t=>{
 const f=await fixture(t,"worker");
 await f.append("old-worker","interrupted");
 await f.append("new-worker","completed","");
 assert.deepEqual(await f.reconcile(),[f.task.taskId]);
 assert.equal((await f.current())?.current.state,"blocked");
 assert.match((await f.current())?.current.reason??"",/did not return a valid successful result/u);
});

test("EF-503 Reviewer recovery remains blocked for explicit human acceptance",async t=>{
 const f=await fixture(t,"reviewer");
 await f.append("review-one","interrupted");
 await f.append("review-two","completed","Independent review candidate");
 assert.deepEqual(await f.reconcile(),[f.task.taskId]);
 assert.equal((await f.current())?.current.state,"blocked");
 assert.match((await f.current())?.current.reason??"",/explicit user acceptance/u);
});

test("EF-603/604 binder and reconciler agree on a durable Explorer recovery after reopen",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-ef604-binder-chain-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const identity={sessionId:"integrated-recovery",projectId:home};
 const todoFile=join(home,"todos.json"),linkFile=join(home,"links.json");
 const todos=await SessionTodoStore.open(todoFile),links=new TaskAgentLinkStore(linkFile);
 const task=await todos.add("Live launch chain",identity,undefined,undefined,
  "asen-plan:chain:integrated",[],"Read-only step with authorized continuation",{
   role:"explorer",skillSelection:{phase:"explore"},
   skillPaths:selectSkills({phase:"explore"}).map(skill=>skill.path),
  });
 const states=new Map<string,Agent>([
  ["bound-one",{id:"bound-one",role:"explorer",state:"queued",...identity}],
  ["bound-two",{id:"bound-two",role:"explorer",state:"queued",...identity}],
 ]);
 const host={query:async(id:string)=>{const agent=states.get(id);return agent?{record:structuredClone(agent)}:null;},
  list:async()=>[...states.values()].map(agent=>structuredClone(agent))};
 const binder=new TrustedTaskAgentBinder(todos,host as never,links);
 let dispatched=0;
 await binder.launch(task.taskId,"bound-one",identity,()=>{dispatched++;});
 states.get("bound-one")!.state="interrupted";
 await binder.launch(task.taskId,"bound-two",identity,()=>{dispatched++;});
 states.get("bound-two")!.state="completed";
 states.get("bound-two")!.summary="Persisted second-attempt read-only result";
 const reopened=await SessionTodoStore.open(todoFile);
 const journal=new TaskAgentLinkStore(linkFile);
 assert.deepEqual(await new TaskAgentTodoReconciler(reopened,host as never,journal).reconcile(identity),[]);
 assert.equal((await reopened.list(identity)).find(row=>row.taskId===task.taskId)?.current.state,"done");
 assert.equal(dispatched,2,"One initial launch and one explicitly interrupted replacement only");
 assert.deepEqual((await journal.list(identity)).filter(row=>row.taskId===task.taskId)
  .map(row=>row.agentId),["bound-one","bound-two"]);
});

test("EF-604 a live predecessor cannot coexist with a queued replacement indefinitely",async t=>{
 const f=await fixture(t);
 await f.append("original","running");
 await f.append("replacement","queued");
 assert.deepEqual(await f.reconcile(),[f.task.taskId]);
 assert.equal((await f.current())?.current.state,"blocked");
 assert.match((await f.current())?.current.reason??"",/recovery history is inconsistent/u);
 assert.deepEqual(await f.reconcile(),[],"Blocked task is never relaunched");
});
test("EF-604 a live predecessor and completed replacement are not accepted as success",async t=>{
 const f=await fixture(t);
 await f.append("original","running");
 await f.append("replacement","completed","Forged terminal success");
 assert.deepEqual(await f.reconcile(),[f.task.taskId]);
 assert.equal((await f.current())?.current.state,"blocked");
});
test("EF-604 an interrupted predecessor with queued replacement remains running",async t=>{
 const f=await fixture(t);
 await f.append("original","interrupted");
 await f.append("replacement","queued");
 assert.deepEqual(await f.reconcile(),[]);
 assert.equal((await f.current())?.current.state,"running");
});


test("EF-603/604 a confirmed single failed read-only retry may finish after durable restart",async t=>{
 const f=await fixture(t);
 await f.append("first-failed","failed","Initial failure is retained");
 await f.todos.update(f.task.taskId,f.identity,2,"blocked","First read-only task failed");
 await f.todos.update(f.task.taskId,f.identity,3,"running",CONFIRMED_FAILED_READ_ONLY_RETRY_REASON);
 await f.append("single-retry","completed","Saved confirmed retry findings");
 assert.deepEqual(await f.reconcile(),[]);
 const row=await f.current();
 assert.equal(row?.current.state,"done");
 assert.deepEqual((await new TaskAgentLinkStore(f.linkFile).list(f.identity)).map(x=>x.agentId),
  ["first-failed","single-retry"]);
 assert.deepEqual(await f.reconcile(),[],"No second completion after rereading persistent records");
 assert.equal((await f.current())?.events.length,5);
});
test("EF-603 a failed attempt never authorizes unconfirmed or multi-attempt success",async t=>{
 for(const confirmed of [false,true]){
  const f=await fixture(t);
  await f.append("first-failed","failed");
  if(confirmed){
   await f.todos.update(f.task.taskId,f.identity,2,"blocked","First read-only task failed");
   await f.todos.update(f.task.taskId,f.identity,3,"running",CONFIRMED_FAILED_READ_ONLY_RETRY_REASON);
   await f.append("unexpected-third","failed");
  }
  await f.append("injected-success","completed","Plausible untrusted completion");
  assert.deepEqual(await f.reconcile(),[f.task.taskId]);
  assert.equal((await f.current())?.current.state,"blocked");
 }
});
