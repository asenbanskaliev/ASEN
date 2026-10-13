import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TaskAgentCoordinator} from "../src/runtime/task-agent-coordinator.js";
test("ECO-07 explicit persisted links survive restart without altering Todo state",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordinator-links-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"session-a",projectId:"/project"},other={sessionId:"session-b",projectId:"/project"};
 const todos=await SessionTodoStore.open(join(dir,"todos.json")),task=await todos.add("Review",identity);
 const linkFile=join(dir,"links.json"),links=new TaskAgentLinkStore(linkFile);
 await links.bind({taskId:task.taskId,agentId:"agent-opaque",...identity,createdAt:"2026-10-13T00:00:00.000Z"});
 const agents={list:async()=>[
  {id:"agent-opaque",role:"explorer",state:"completed",...identity},
  {id:task.taskId+":worker",role:"worker",state:"running",...other},
 ]};
 const coordinator=new TaskAgentCoordinator(await SessionTodoStore.open(join(dir,"todos.json")),agents as never,new TaskAgentLinkStore(linkFile));
 const view=await coordinator.task(task.taskId,identity);
 assert.deepEqual(view?.agents.map(a=>a.id),["agent-opaque"]);
 assert.equal(view?.state,"planned");
 assert.equal(await coordinator.task(task.taskId,other),null);
 assert.equal((await todos.history(task.taskId,identity)).length,1);
});
test("ECO-07 corrupted links block projection rather than silently omitting them",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordinator-corrupt-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"s",projectId:"/project"};
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));await todos.add("Review",identity);
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 await links.bind({taskId:"todo-a",agentId:"agent-a",...identity,createdAt:"2026-10-13T00:00:00.000Z"});
 const coordinator=new TaskAgentCoordinator(todos,{list:async()=>[]} as never,links);
 assert.equal((await coordinator.snapshot(identity)).tasks.length,1);
});
