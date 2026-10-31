import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TrustedTaskAgentBinder} from "../src/runtime/trusted-task-agent-binder.js";
test("ECO-07 binder rejects unowned agents and foreign Todos without writing links",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-binder-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const own={sessionId:"session-a",projectId:"/project"},foreign={sessionId:"session-b",projectId:"/project"};
 const todos=await SessionTodoStore.open(join(dir,"todos.json")),task=await todos.add("Owned",own),other=await todos.add("Foreign",foreign);
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const agent={record:{id:"agent-a",sessionId:own.sessionId,projectId:own.projectId}};
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
 const links=new TaskAgentLinkStore(join(dir,"links.json")),agent={record:{id:"agent-child",sessionId:own.sessionId,projectId:own.projectId}},runtime={query:async()=>agent},binder=new TrustedTaskAgentBinder(todos,runtime as never,links);
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
 const records=new Map([["agent-one",{record:{id:"agent-one",sessionId:own.sessionId,projectId:own.projectId,state:"running"}}],["agent-two",{record:{id:"agent-two",sessionId:own.sessionId,projectId:own.projectId,state:"queued"}}]]),runtime={query:async(id:string)=>records.get(id)??null},binder=new TrustedTaskAgentBinder(todos,runtime as never,links);
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
