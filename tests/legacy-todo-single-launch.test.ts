import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {registerAgentTools} from "../src/agents/pi-agent-tools.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TrustedTaskAgentBinder} from "../src/runtime/trusted-task-agent-binder.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
test("EF-603 a terminal legacy Todo cannot be launched again before reconciliation",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-legacy-once-"));
 const identity={sessionId:"legacy-session",projectId:await realpath(process.cwd())};
 let release!:()=>void;
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 const todos=await SessionTodoStore.open(join(home,"todos.json")),links=new TaskAgentLinkStore(join(home,"links.json"));
 let runs=0;
 const agents=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{run:async(request:{id:string})=>{
  runs++;await barrier;return{id:request.id,ok:true,output:"Read-only result"};
 }} as never});
 const tools=new Map<string,any>();
 registerAgentTools({registerTool:(tool:any)=>tools.set(tool.name,tool)} as never,async()=>agents,
  {todos:async()=>todos,links:async()=>links,binder:async()=>new TrustedTaskAgentBinder(todos,agents,links)});
 const ctx={mode:"tui",hasUI:true,cwd:identity.projectId,
  sessionManager:{getSessionId:()=>identity.sessionId},ui:{notify:()=>{},confirm:async()=>true}};
 const todo=await todos.add("Legacy Todo",identity,undefined,undefined,undefined,[],"Read-only legacy scope");
 const run=()=>tools.get("asen_agent_start").execute("start",{todoId:todo.taskId,prompt:"Read-only legacy scope"},
  new AbortController().signal,()=>{},ctx);
 const done=new Promise<void>(resolve=>{const unsubscribe=agents.subscribeTerminal(r=>{
  if(r.sessionId===identity.sessionId){unsubscribe();resolve();}
 });});
 t.after(async()=>{release();await rm(home,{recursive:true,force:true,maxRetries:6,retryDelay:100});});
 const first=await run();
 assert.equal(first.details.todoId,todo.taskId);
 assert.equal((await todos.list(identity))[0]?.current.state,"running");
 await assert.rejects(()=>run(),/unclaimed planned-state/u);
 release();await done;
 assert.equal(runs,1);
 assert.equal((await todos.list(identity))[0]?.current.state,"running");
 await assert.rejects(()=>run(),/unclaimed planned-state/u);
 assert.equal((await agents.list(identity)).length,1);
});
