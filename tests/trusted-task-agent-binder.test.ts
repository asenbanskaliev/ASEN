import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {CONFIRMED_FAILED_READ_ONLY_RETRY_REASON,TrustedTaskAgentBinder} from "../src/runtime/trusted-task-agent-binder.js";
import {selectSkills} from "../src/skills/registry.js";
test("ECO-07 binder rejects unowned agents and foreign Todos without writing links",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-binder-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const own={sessionId:"session-a",projectId:"/project"},foreign={sessionId:"session-b",projectId:"/project"};
 const todos=await SessionTodoStore.open(join(dir,"todos.json")),task=await todos.add("Owned",own),other=await todos.add("Foreign",foreign);
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const agent={record:{id:"agent-a",sessionId:own.sessionId,projectId:own.projectId,state:"queued"}};
 const runtime={query:async(id:string,identity:typeof own)=>id==="agent-a"&&identity.sessionId===own.sessionId?agent:null};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);
 let dispatched=false;
 await assert.rejects(()=>binder.launch(other.taskId,"agent-a",own,()=>{dispatched=true;}),/unavailable to this session or project/);
 await assert.rejects(()=>binder.launch(task.taskId,"missing",own,()=>{dispatched=true;}),/active durable ownership/);
 assert.deepEqual(await links.list(own),[]);
 await binder.launch(task.taskId,"agent-a",own,()=>{dispatched=true;});
 assert.equal(dispatched,true);
 assert.equal((await links.list(own)).length,1);
 assert.equal((await todos.list(own))[0]?.current.state,"running");
});
test("ECO-06 plan dependency gates remain enforced inside the ECO-07 launch lock",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-plan-binder-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const own={sessionId:"session-a",projectId:"/project"},todos=await SessionTodoStore.open(join(dir,"todos.json")),pre=await todos.add("Prerequisite",own),task=await todos.add("Dependent",own,undefined,undefined,"asen-plan:child",[pre.taskId],"Do dependent work");
 const links=new TaskAgentLinkStore(join(dir,"links.json")),agent={record:{id:"agent-child",sessionId:own.sessionId,projectId:own.projectId,state:"queued"}},runtime={query:async()=>agent},binder=new TrustedTaskAgentBinder(todos,runtime as never,links);
 let dispatches=0;await assert.rejects(()=>binder.launch(task.taskId,"agent-child",own,()=>{dispatches++;}),/dependencies must be verified done/);
 assert.equal(dispatches,0);assert.deepEqual(await links.list(own),[]);assert.equal((await todos.list(own)).find(item=>item.taskId===task.taskId)?.current.state,"planned");
});
test("ECO-06 exact worker admission rejects Todo drift before durable enqueue or dispatch",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-worker-snapshot-race-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const own={sessionId:"session-a",projectId:"/project"},todos=await SessionTodoStore.open(join(dir,"todos.json")),task=await todos.add("Authorized plan snapshot",own,undefined,undefined,"asen-plan:writer",[],"Change only the approved file"),snapshot=(await todos.list(own))[0]!;
 const links=new TaskAgentLinkStore(join(dir,"links.json")),runtime={query:async()=>({record:{id:"agent-writer",sessionId:own.sessionId,projectId:own.projectId,state:"queued"}})},binder=new TrustedTaskAgentBinder(todos,runtime as never,links);
 await todos.update(task.taskId,own,snapshot.current.revision,"running","Competing Todo transition before the launch lock");
 let enqueues=0,dispatches=0;
 await assert.rejects(()=>binder.launchExact(snapshot,"agent-writer",own,async()=>{enqueues++;},()=>{dispatches++;}),/confirmed Todo snapshot changed/u);
 assert.equal(enqueues,0,"stale write authorization must be rejected before persisting an agent");
 assert.equal(dispatches,0,"stale write authorization must never reach the runner");
 assert.deepEqual(await links.list(own),[]);
 assert.equal((await todos.list(own))[0]?.current.state,"running","the competing state remains available for review");
});
test("ECO-07 rejects a second launch while a Todo already has an active linked agent",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-binder-duplicate-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const own={sessionId:"session-a",projectId:"/project"},todos=await SessionTodoStore.open(join(dir,"todos.json")),task=await todos.add("Single active launch",own),links=new TaskAgentLinkStore(join(dir,"links.json"));
 const records=new Map([["agent-one",{record:{id:"agent-one",sessionId:own.sessionId,projectId:own.projectId,state:"queued"}}],["agent-two",{record:{id:"agent-two",sessionId:own.sessionId,projectId:own.projectId,state:"queued"}}]]),runtime={query:async(id:string)=>records.get(id)??null},binder=new TrustedTaskAgentBinder(todos,runtime as never,links);
 await binder.launch(task.taskId,"agent-one",own,()=>{});let secondDispatches=0;
 await assert.rejects(()=>binder.launch(task.taskId,"agent-two",own,()=>{secondDispatches++;}),/duplicate launch rejected/);
 assert.equal(secondDispatches,0);assert.deepEqual((await links.list(own)).map(link=>link.agentId),["agent-one"]);
 records.set("agent-one",{record:{id:"agent-one",sessionId:own.sessionId,projectId:own.projectId,state:"interrupted"}});
 await binder.launch(task.taskId,"agent-two",own,()=>{secondDispatches++;});assert.equal(secondDispatches,1,"an interrupted attempt is terminal and an explicit fresh launch may recover the pre-dispatch crash window");
});
test("ECO-07 revalidates Pi identity after persistence and before invoking the runner",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-binder-identity-race-"));t.after(()=>rm(dir,{recursive:true,force:true}));const own={sessionId:"session-a",projectId:"/project"},todos=await SessionTodoStore.open(join(dir,"todos.json")),task=await todos.add("Identity-bound launch",own),links=new TaskAgentLinkStore(join(dir,"links.json")),agent={record:{id:"agent-race",sessionId:own.sessionId,projectId:own.projectId,state:"queued"}},runtime={query:async()=>agent},binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let validations=0,dispatches=0;
 await assert.rejects(()=>binder.launch(task.taskId,"agent-race",own,()=>{dispatches++;},()=>{if(++validations===6)throw new Error("Pi session or project changed");}),/session or project changed/);
 assert.equal(validations,6);assert.equal(dispatches,0);assert.equal((await links.list(own)).length,1,"the durable attempted binding remains auditable");assert.equal((await todos.list(own))[0]?.current.state,"blocked","a claimed launch that fails final identity validation requires review");
});

test("EF-603 same agent ID may never be dispatched twice, even after interruption",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-ef603-no-replay-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"ef603-replay",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const item=await todos.add("Single Pi identity",identity),links=new TaskAgentLinkStore(join(dir,"links.json"));
 const records=new Map<string,string>([["agent-once","queued"],["agent-fresh","queued"]]);
 const runtime={query:async(id:string)=>records.has(id)?{record:{id,sessionId:identity.sessionId,projectId:identity.projectId,state:records.get(id)}}:null};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let dispatches=0;
 await binder.launch(item.taskId,"agent-once",identity,()=>{dispatches++;});
 await assert.rejects(()=>binder.launch(item.taskId,"agent-once",identity,()=>{dispatches++;}),/duplicate launch rejected/);
 records.set("agent-once","interrupted");
 await assert.rejects(()=>binder.launch(item.taskId,"agent-once",identity,()=>{dispatches++;}),/duplicate launch rejected/);
 assert.equal(dispatches,1);assert.equal((await links.list(identity)).length,1);
 await binder.launch(item.taskId,"agent-fresh",identity,()=>{dispatches++;});
 assert.equal(dispatches,2,"An interrupted attempt needs a distinct durable agent ID");
 assert.deepEqual((await links.list(identity)).map(x=>x.agentId),["agent-once","agent-fresh"]);
});
test("EF-604 orphan running Todo cannot invent a prior interrupted Pi agent",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-ef604-orphan-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"ef604-orphan",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const item=await todos.add("Orphan running item",identity);await todos.update(item.taskId,identity,1,"running");
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const runtime={query:async(id:string)=>({record:{id,...identity,state:"queued"}})};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let dispatches=0;
 await assert.rejects(()=>binder.launch(item.taskId,"agent-fresh",identity,()=>{dispatches++;}),/interrupted linked agent/);
 assert.equal(dispatches,0);assert.deepEqual(await links.list(identity),[]);
 assert.equal((await todos.list(identity))[0]?.current.state,"running");
});
test("EF-603 concurrent recovery creates just one new binding after a genuine interruption",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-ef603-race-recover-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"ef603-recover",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const item=await todos.add("Exactly one replacement",identity),links=new TaskAgentLinkStore(join(dir,"links.json"));
 const states=new Map<string,string>([["agent-old","queued"],["agent-new-a","queued"],["agent-new-b","queued"]]);
 const runtime={query:async(id:string)=>states.has(id)?{record:{id,...identity,state:states.get(id)}}:null};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let dispatches=0;
 await binder.launch(item.taskId,"agent-old",identity,()=>{dispatches++;});
 states.set("agent-old","interrupted");
 const results=await Promise.allSettled(["agent-new-a","agent-new-b"].map(id=>
  binder.launch(item.taskId,id,identity,()=>{dispatches++;})));
 assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(results.filter(x=>x.status==="rejected").length,1);
 assert.equal(dispatches,2,"The old execution and exactly one fresh recovery may dispatch");
 const history=await links.list(identity);assert.equal(history.length,2);
 const selected=history.find(x=>x.agentId!=="agent-old");assert.ok(selected);
 assert.equal((await todos.list(identity))[0]?.current.state,"running");
});
test("EF-604 terminal completed link is not interrupted authority for a new launch",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-ef604-completed-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"ef604-completed",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const item=await todos.add("Do not replay a finished Pi job",identity),links=new TaskAgentLinkStore(join(dir,"links.json"));
 const states=new Map<string,string>([["agent-completed","queued"],["agent-new","queued"]]);
 const runtime={query:async(id:string)=>({record:{id,...identity,state:states.get(id)}})};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let dispatches=0;
 await binder.launch(item.taskId,"agent-completed",identity,()=>{dispatches++;});
 states.set("agent-completed","completed");
 await assert.rejects(()=>binder.launch(item.taskId,"agent-new",identity,()=>{dispatches++;}),/interrupted linked agent/);
 assert.equal(dispatches,1);assert.equal((await links.list(identity)).length,1);
});

test("EF-603/604 only a fresh queued agent with the exact planned role may be launched",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-bound-role-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const identity={sessionId:"role-session",projectId:home};
 const todos=await SessionTodoStore.open(join(home,"todos.json"));
 const selection={phase:"explore" as const};
 const task=await todos.add("Role-bound Explorer",identity,undefined,undefined,"asen-plan:role:explorer",[],
  "Inspect the scoped project", {role:"explorer",skillPaths:selectSkills(selection).map(s=>s.path),skillSelection:selection});
 const agents=new Map<string,{state:string;role:string}>([
  ["already-completed",{state:"completed",role:"explorer"}],
  ["already-running",{state:"running",role:"explorer"}],
  ["already-interrupted",{state:"interrupted",role:"explorer"}],
  ["wrong-role",{state:"queued",role:"verifier"}],
  ["fresh-explorer",{state:"queued",role:"explorer"}],
 ]);
 const runtime={query:async(id:string)=>{const row=agents.get(id);return row?{record:{id,...identity,...row}}:null;}};
 const links=new TaskAgentLinkStore(join(home,"links.json"));
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);
 let dispatches=0;
 for(const id of ["already-completed","already-running","already-interrupted","wrong-role"]){
  await assert.rejects(()=>binder.launch(task.taskId,id,identity,()=>{dispatches++;}),
   /fresh queued agent|role does not match/u,id);
 }
 assert.equal(dispatches,0);assert.deepEqual(await links.list(identity),[]);
 assert.equal((await todos.list(identity))[0]?.current.state,"planned");
 await binder.launch(task.taskId,"fresh-explorer",identity,()=>{dispatches++;});
 assert.equal(dispatches,1);assert.deepEqual((await links.list(identity)).map(x=>x.agentId),["fresh-explorer"]);
});
test("EF-604 planned Todo with pre-existing terminal link cannot be launched again without reconciliation",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-planned-link-stale-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const identity={sessionId:"partial-crash",projectId:home},todos=await SessionTodoStore.open(join(home,"todos.json"));
 const task=await todos.add("Undecided pre-dispatch window",identity),links=new TaskAgentLinkStore(join(home,"links.json"));
 await links.bind({taskId:task.taskId,agentId:"previous-unknown",...identity,createdAt:new Date().toISOString()});
 const runtime={query:async(id:string)=>({record:{id,...identity,role:"explorer",state:id==="previous-unknown"?"completed":"queued"}})};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let dispatches=0;
 await assert.rejects(()=>binder.launch(task.taskId,"fresh-id",identity,()=>{dispatches++;}),
  /requires explicit reconciliation/u);
 assert.equal(dispatches,0);assert.deepEqual((await links.list(identity)).map(x=>x.agentId),["previous-unknown"]);
 assert.equal((await todos.list(identity))[0]?.current.state,"planned");
});
test("EF-604 missing previous process state never becomes permission for a running-task relaunch",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-missing-prior-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const identity={sessionId:"lost-owner",projectId:home},todos=await SessionTodoStore.open(join(home,"todos.json"));
 const task=await todos.add("Uncertain previous agent",identity),links=new TaskAgentLinkStore(join(home,"links.json"));
 await links.bind({taskId:task.taskId,agentId:"gone",...identity,createdAt:new Date().toISOString()});
 await todos.update(task.taskId,identity,1,"running");
 const runtime={query:async(id:string)=>id==="gone"?null:{record:{id,...identity,role:"explorer",state:"queued"}}};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let dispatches=0;
 await assert.rejects(()=>binder.launch(task.taskId,"fresh",identity,()=>{dispatches++;}),
  /requires an interrupted linked agent/u);
 assert.equal(dispatches,0);assert.equal((await links.list(identity)).length,1);
});


test("EF-604 a prior interrupted agent with a changed role or identity cannot authorize a new dispatch",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-ef604-prior-identity-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const identity={sessionId:"recovery-role",projectId:root},todos=await SessionTodoStore.open(join(root,"todos.json"));
 const plan={role:"explorer" as const,skillPaths:selectSkills({phase:"explore"}).map(s=>s.path),
  skillSelection:{phase:"explore" as const}};
 const task=await todos.add("Read-only role bound",identity,undefined,undefined,"asen-plan:prior-role",[],
  "Inspect source only",plan);
 const links=new TaskAgentLinkStore(join(root,"links.json"));
 const old={id:"old-agent",...identity,role:"explorer",state:"queued"};
 const fresh={id:"fresh-agent",...identity,role:"explorer",state:"queued"};
 const agents=new Map([["old-agent",old],["fresh-agent",fresh]]);
 const runtime={query:async(id:string)=>{const agent=agents.get(id);return agent?{record:{...agent}}:null;}};
 const binder=new TrustedTaskAgentBinder(todos,runtime as never,links);let launches=0;
 await binder.launch(task.taskId,"old-agent",identity,()=>{launches++;});old.state="interrupted";
 old.role="reviewer";
 await assert.rejects(()=>binder.launch(task.taskId,"fresh-agent",identity,()=>{launches++;}),
  /prior agent identity or role mismatch/u);
 old.role="explorer";old.projectId=root+"/foreign";
 await assert.rejects(()=>binder.launch(task.taskId,"fresh-agent",identity,()=>{launches++;}),
  /prior agent identity or role mismatch/u);
 old.projectId=root;old.id="spoofed-agent";
 await assert.rejects(()=>binder.launch(task.taskId,"fresh-agent",identity,()=>{launches++;}),
  /prior agent identity or role mismatch/u);
 assert.equal(launches,1);assert.deepEqual((await links.list(identity)).map(x=>x.agentId),["old-agent"]);
 old.id="old-agent";
 await binder.launch(task.taskId,"fresh-agent",identity,()=>{launches++;});
 assert.equal(launches,2);assert.deepEqual((await links.list(identity)).map(x=>x.agentId),["old-agent","fresh-agent"]);
});


test("EF-603 a confirmed failed read-only attempt retries once, never through normal interrupted recovery",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-ef603-failed-confirmed-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"failed-ui-confirmed",projectId:dir};
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const selection={phase:"explore" as const};
 const task=await todos.add("Retry one failed Explorer",identity,undefined,undefined,
  "asen-plan:failed-ui",[],"Inspect the bounded project",{
   role:"explorer",skillSelection:selection,skillPaths:selectSkills(selection).map(x=>x.path),
  });
 const states=new Map<string,string>([["original","queued"],["replacement","queued"],["duplicate","queued"]]);
 const host={query:async(id:string)=>states.has(id)?{record:{id,...identity,role:"explorer",state:states.get(id)}}:null};
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const binder=new TrustedTaskAgentBinder(todos,host as never,links);
 let dispatches=0;
 await binder.launch(task.taskId,"original",identity,()=>{dispatches++;});
 states.set("original","failed");
 await todos.update(task.taskId,identity,2,"blocked","Original read-only attempt failed");
 const confirmed=await todos.update(task.taskId,identity,3,"running",CONFIRMED_FAILED_READ_ONLY_RETRY_REASON);
 const revision=confirmed.events.at(-1)!.revision;
 await assert.rejects(()=>binder.launch(task.taskId,"replacement",identity,()=>{dispatches++;}),
  /interrupted linked agent/u,"Normal recovery cannot treat failed as interrupted");
 await assert.rejects(()=>binder.launchConfirmedFailedRetry(task.taskId,"replacement",identity,
  "original",revision-1,()=>{dispatches++;}),/snapshot or linked scope changed/u);
 assert.deepEqual((await links.list(identity)).map(x=>x.agentId),["original"]);
 await binder.launchConfirmedFailedRetry(task.taskId,"replacement",identity,"original",revision,()=>{dispatches++;});
 assert.equal(dispatches,2);
 assert.deepEqual((await links.list(identity)).map(x=>x.agentId),["original","replacement"]);
 await assert.rejects(()=>binder.launchConfirmedFailedRetry(task.taskId,"duplicate",identity,
  "original",revision,()=>{dispatches++;}),/snapshot or linked scope changed/u);
 assert.equal(dispatches,2,"A second retry may not consume another runner slot");
});
test("EF-603 explicit failed-retry route rejects interrupted, live or completed predecessors",async t=>{
 for(const previousState of ["interrupted","running","completed"]){
  const dir=await mkdtemp(join(tmpdir(),"asen-ef603-failed-negative-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const identity={sessionId:"negative-"+previousState,projectId:dir};
  const todos=await SessionTodoStore.open(join(dir,"todos.json"));
  const task=await todos.add("Never reinterpret an earlier outcome",identity);
  const links=new TaskAgentLinkStore(join(dir,"links.json"));
  const state={old:previousState,role:"explorer"};
  const host={query:async(id:string)=>({record:{id,...identity,role:id==="old"?state.role:"explorer",state:id==="old"?state.old:"queued"}})};
  const binder=new TrustedTaskAgentBinder(todos,host as never,links);
  await links.bind({taskId:task.taskId,agentId:"old",...identity,createdAt:new Date().toISOString()});
  await todos.update(task.taskId,identity,1,"running");
  await todos.update(task.taskId,identity,2,"blocked","Explicit review required");
  const claimed=await todos.update(task.taskId,identity,3,"running",CONFIRMED_FAILED_READ_ONLY_RETRY_REASON);
  let count=0;
  await assert.rejects(()=>binder.launchConfirmedFailedRetry(task.taskId,"new",identity,
   "old",claimed.events.at(-1)!.revision,()=>{count++;}),/exact failed read-only predecessor|duplicate launch rejected/u);
  assert.equal(count,0);
  assert.equal((await links.list(identity)).length,1);
 }
});
