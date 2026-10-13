import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentCoordinator} from "../src/runtime/task-agent-coordinator.js";

test("ECO-07 coordinator is read-only and session isolated",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordination-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const own={sessionId:"s1",projectId:"/project"},other={sessionId:"s2",projectId:"/project"};
 const item=await todos.add("Review plan",own);
 await todos.add("Foreign plan",other);
 const agents={list:async(identity:{sessionId:string;projectId:string})=>identity.sessionId==="s1"?[
  {id:item.taskId+":explore",role:"explorer",state:"completed",sessionId:"s1",projectId:"/project"},
  {id:"unrelated:explore",role:"explorer",state:"running",sessionId:"s1",projectId:"/project"},
 ]:[],query:async()=>null};
 const coordinator=new TaskAgentCoordinator(todos,agents as never);
 const snapshot=await coordinator.snapshot(own);
 assert.equal(snapshot.tasks.length,1);
 assert.equal(snapshot.tasks[0]?.state,"planned");
 assert.deepEqual(snapshot.tasks[0]?.agents.map(a=>a.id),[item.taskId+":explore"]);
 assert.equal((await coordinator.snapshot(other)).tasks.length,1);
 assert.equal(await coordinator.task(item.taskId,other),null);
 assert.equal((await todos.history(item.taskId,own)).length,1);
});
