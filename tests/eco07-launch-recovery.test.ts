import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TrustedTaskAgentBinder} from "../src/runtime/trusted-task-agent-binder.js";
import {TaskAgentCoordinator} from "../src/runtime/task-agent-coordinator.js";

test("ECO-07 failed link persistence prevents dispatch and never grants recovery",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-eco07-fail-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"session",projectId:dir};
 let runs=0;
 const runner={run:async()=>{runs++;return {status:"completed",summary:"unexpected"};}};
 const runtime=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:runner as never});
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const task=await todos.add("Owned work",identity);
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const binder=new TrustedTaskAgentBinder(todos,runtime,links);
 await assert.rejects(()=>runtime.startExplorer({prompt:"Read only",session:identity,onQueued:async id=>{
  await binder.bind(task.taskId,id,identity);
  throw new Error("Simulated interruption after binding");
 }}),/Simulated interruption/);
 assert.equal(runs,0);
 const records=await runtime.list(identity);
 assert.equal(records.length,1);
 assert.equal(records[0]?.state,"cancelled");
 const coordinator=new TaskAgentCoordinator(todos,runtime,links);
 const snapshot=await coordinator.snapshot(identity);
 assert.equal(snapshot.tasks[0]?.agents.length,1);
 assert.equal(snapshot.tasks[0]?.agents[0]?.state,"cancelled");
 const restarted=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:runner as never});
 assert.equal((await restarted.list(identity))[0]?.state,"cancelled");
 assert.equal(runs,0);
});

test("ECO-07 successful durable link is visible after restart without redispatch",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-eco07-restart-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const identity={sessionId:"session",projectId:dir};
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const task=await todos.add("Owned work",identity);
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const runner={run:async()=>({status:"completed",summary:"done"})};
 const runtime=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:runner as never});
 const binder=new TrustedTaskAgentBinder(todos,runtime,links);
 const id=await runtime.startExplorer({prompt:"Read only",session:identity,onQueued:agentId=>binder.bind(task.taskId,agentId,identity).then(()=>{})});
 assert.ok(id.startsWith("agent-"));
 const restarted=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:runner as never});
 const view=await new TaskAgentCoordinator(todos,restarted,links).snapshot(identity);
 assert.deepEqual(view.tasks[0]?.agents.map(agent=>agent.id),[id]);
 assert.equal(view.tasks[0]?.state,"planned");
});
