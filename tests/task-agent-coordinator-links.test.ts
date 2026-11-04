import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
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
  {id:"agent-opaque",role:"explorer",state:"completed",summary:"Verified test evidence is available",...identity},
  {id:task.taskId+":worker",role:"worker",state:"running",...other},
 ]};
 const coordinator=new TaskAgentCoordinator(await SessionTodoStore.open(join(dir,"todos.json")),agents as never,new TaskAgentLinkStore(linkFile));
 const view=await coordinator.task(task.taskId,identity);
 assert.deepEqual(view?.agents.map(a=>a.id),["agent-opaque"]);
 assert.equal(view?.agents[0]?.summary,"Verified test evidence is available");
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
 await writeFile(links.file,"{invalid-json");
 const coordinator=new TaskAgentCoordinator(todos,{list:async()=>[]} as never,links);
 await assert.rejects(()=>coordinator.snapshot(identity),SyntaxError);
});
test("ECO-06 coordination projection reports dependency blockers and readiness by session",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordinator-dag-"));t.after(()=>rm(dir,{recursive:true,force:true}));const identity={sessionId:"session-a",projectId:"/project"},todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const prerequisite=await todos.add("Inspect",identity),dependent=await todos.add("Verify",identity,undefined,undefined,"asen-plan:verify",[prerequisite.taskId],"Check independently"),coordinator=new TaskAgentCoordinator(todos,{list:async()=>[]} as never);
 let view=await coordinator.task(dependent.taskId,identity);assert.deepEqual(view?.blockedBy,[{id:prerequisite.taskId,state:"planned"}]);assert.equal(view?.ready,false);
 await todos.update(prerequisite.taskId,identity,1,"running");await todos.update(prerequisite.taskId,identity,2,"done","human verification");view=await coordinator.task(dependent.taskId,identity);
 assert.deepEqual(view?.blockedBy,[]);assert.equal(view?.ready,true);
});

test("EF-601/604 a planned Todo with a persisted link is not ready for a second launch",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordinator-uncertain-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"uncertain-session",projectId:dir};
 const todos=await SessionTodoStore.open(join(dir,"todos.json")),task=await todos.add("Uncertain dispatch",identity);
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 await links.bind({taskId:task.taskId,agentId:"agent-unknown",...identity,createdAt:new Date().toISOString()});
 const agents={list:async()=>[{id:"agent-unknown",role:"explorer",state:"interrupted",...identity}]};
 const coordinator=new TaskAgentCoordinator(todos,agents as never,links);
 const view=await coordinator.task(task.taskId,identity);
 assert.equal(view?.state,"planned");assert.equal(view?.linkedAttempts,1);
 assert.equal(view?.launchRequiresReconciliation,true);assert.equal(view?.ready,false);
 assert.deepEqual(view?.agents.map(a=>a.id),["agent-unknown"]);
 assert.equal((await todos.list(identity))[0]?.current.state,"planned","Projection cannot mutate the Todo");
});
test("EF-601/604 explicit link journal disables unverified taskId:role fallback correlation",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordinator-opaque-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"explicit-scope",projectId:dir},todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const task=await todos.add("No symbolic agent inference",identity);
 const agents={list:async()=>[{id:task.taskId+":explorer",role:"explorer",state:"completed",...identity}]};
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const strict=new TaskAgentCoordinator(todos,agents as never,links);
 const view=await strict.task(task.taskId,identity);
 assert.deepEqual(view?.agents,[]);assert.equal(view?.linkedAttempts,0);
 assert.equal(view?.launchRequiresReconciliation,false);assert.equal(view?.ready,true);
 const legacy=new TaskAgentCoordinator(todos,agents as never);
 assert.deepEqual((await legacy.task(task.taskId,identity))?.agents.map(a=>a.id),[task.taskId+":explorer"]);
});


test("EF-601 latest linked agent is displayed as an attempt, never an authorization or completion",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-coordinator-chain-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"attempt-view",projectId:dir};
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const task=await todos.add("Show durable attempt identities",identity);
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 for(const id of ["agent-interrupted","agent-replacement"])
  await links.bind({taskId:task.taskId,agentId:id,...identity,createdAt:new Date().toISOString()});
 const records=[{id:"agent-interrupted",role:"explorer",state:"interrupted",...identity},
  {id:"agent-replacement",role:"explorer",state:"running",...identity}];
 const coordinator=new TaskAgentCoordinator(todos,{list:async()=>records} as never,links);
 const view=await coordinator.task(task.taskId,identity);
 assert.equal(view?.linkedAttempts,2);
 assert.equal(view?.latestLinkedAgentId,"agent-replacement");
 assert.equal(view?.launchRequiresReconciliation,true);
 assert.equal(view?.ready,false);
 assert.equal(view?.state,"planned","A read-only projection never infers a transition from links");
});

