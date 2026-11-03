import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentCoordinator} from "../src/runtime/task-agent-coordinator.js";

test("ECO-07 projection cannot complete tasks or expose another session",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordination-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const own={sessionId:"s1",projectId:"/project"},other={sessionId:"s2",projectId:"/project"};
 const item=await todos.add("Review plan",own);
 const foreign=await todos.add("Foreign plan",other);
 const agents={list:async(identity:{sessionId:string;projectId:string})=>identity.sessionId==="s1"?[
  {id:item.taskId+":explorer",role:"explorer",state:"completed",sessionId:"s1",projectId:"/project"},
  {id:item.taskId+":worker",role:"worker",state:"running",sessionId:"s2",projectId:"/project"},
  {id:item.taskId+":reviewer",role:"worker",state:"completed",sessionId:"s1",projectId:"/project"},
  {id:item.taskId+":explorer:spoof",role:"explorer",state:"completed",sessionId:"s1",projectId:"/project"},
 ]:[],query:async()=>null};
 const coordinator=new TaskAgentCoordinator(todos,agents as never);
 const snapshot=await coordinator.snapshot(own);
 assert.equal(snapshot.tasks.length,1);
 assert.equal(snapshot.tasks[0]?.state,"planned");
 assert.deepEqual(snapshot.tasks[0]?.agents.map(a=>a.id),[item.taskId+":explorer"]);
 assert.equal((await coordinator.snapshot(other)).tasks[0]?.id,foreign.taskId);
 assert.equal(await coordinator.task(item.taskId,other),null);
 assert.equal((await coordinator.task(item.taskId,own))?.history.length,1);
 assert.equal((await todos.history(item.taskId,own)).at(-1)?.state,"planned");
});
test("ECO-07 read-only projection preserves blocked tasks across restart",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordination-restart-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"todos.json"),own={sessionId:"session",projectId:"/project"};
 const first=await SessionTodoStore.open(path),item=await first.add("Resume safely",own);
 await first.update(item.taskId,own,1,"running");
 const restarted=await SessionTodoStore.open(path);await restarted.recover(own);
 const coordinator=new TaskAgentCoordinator(restarted,{list:async()=>[]} as never);
 const view=await coordinator.task(item.taskId,own);
 assert.equal(view?.state,"blocked");
 assert.deepEqual(view?.agents,[]);
 assert.equal(view?.history.at(-1)?.state,"blocked");
 assert.equal((await coordinator.snapshot(own)).tasks[0]?.state,"blocked");
});

test("EF-103 coordination projection preserves missing dependencies as blocking evidence",async()=>{
 const identity={sessionId:"session",projectId:"/project"};
 const task={taskId:"todo-dependent",title:"Verifier must not run before prerequisite",current:{state:"planned",revision:1},dependsOn:["todo-prerequisite"],requestId:"asen-plan:verification"};
 const todos={list:async()=>[task],history:async()=>[]};
 const coordinator=new TaskAgentCoordinator(todos as never,{list:async()=>[]} as never);
 const projection=await coordinator.snapshot(identity);
 assert.deepEqual(projection.tasks[0]?.dependsOn,["todo-prerequisite"]);
 assert.deepEqual(projection.tasks[0]?.blockedBy,[{id:"todo-prerequisite",state:"missing"}]);
 assert.equal(projection.tasks[0]?.ready,false);
 assert.equal(projection.tasks[0]?.state,"planned");
});
test("EF-103 a running, blocked or cancelled dependency is never projected as ready",async()=>{
 const identity={sessionId:"session",projectId:"/project"};
 for(const state of ["planned","running","blocked","cancelled","failed"]){
  const rows=[
   {taskId:"dependency",title:"Prerequisite",current:{state,revision:2}},
   {taskId:"dependent",title:"Dependent",dependsOn:["dependency"],current:{state:"planned",revision:1}},
  ];
  const coordinator=new TaskAgentCoordinator({list:async()=>rows} as never,{list:async()=>[]} as never);
  const row=(await coordinator.snapshot(identity)).tasks.find(item=>item.id==="dependent");
  assert.deepEqual(row?.blockedBy,[{id:"dependency",state}]);
  assert.equal(row?.ready,false);
 }
});
