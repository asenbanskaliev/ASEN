import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import type {AgentRunner} from "../src/agents/dispatcher.js";
import {ASEN_AGENT_TOOL_NAMES} from "../src/agents/pi-agent-tools.js";
import {PersistentAgentStore} from "../src/runtime/agent-store.js";
import {ASEN_TODO_TOOL_NAMES} from "../src/runtime/pi-todo-tools.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";

function host(){
 const events=new Map<string,Function[]>(),commands=new Map<string,any>(),tools=new Map<string,any>(),messages:string[]=[];
 const pi={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name:string,command:any){commands.set(name,command);},registerTool(tool:any){tools.set(tool.name,tool);},getCommands(){return[];},getAllTools(){return[];}};
 const context=(session="session-a",cwd=process.cwd())=>({mode:"rpc",hasUI:true,cwd,sessionManager:{getSessionId:()=>session},ui:{notify:(message:string)=>messages.push(message),confirm:async()=>true}});
 return {pi,events,commands,tools,messages,context};
}

test("production Pi extension runs and restores session-scoped agent status using durable storage",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-pi-"));t.after(()=>rm(home,{recursive:true,force:true}));const file=join(home,".asen","agents.json"),prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"read-only result"})},first=host();
 try{
  createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:file})(first.pi as any);await first.events.get("session_start")![0]!({},first.context());
  for(const name of [...ASEN_AGENT_TOOL_NAMES,...ASEN_TODO_TOOL_NAMES])assert.ok(first.tools.has(name));
  const started=await first.tools.get("asen_agent_start").execute("call-1",{prompt:"inspect this project"},new AbortController().signal,()=>{},first.context());const id=started.details.id;
  let rows:any[]=[];for(let i=0;i<100;i++){rows=(await first.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},first.context())).details;if(rows.some(row=>row.id===id&&row.state==="completed"))break;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.ok(rows.some(row=>row.id===id&&row.state==="completed"));
  await first.commands.get("asen-agents")!.handler("",first.context());assert.ok(first.messages.some(message=>message.includes("completed")&&message.includes("read-only result")));
  const foreign=await first.tools.get("asen_agent_status").execute("call-2",{},new AbortController().signal,()=>{},first.context("other-session"));assert.deepEqual(foreign.details,[]);
  const todo=await first.tools.get("asen_todo_add").execute("todo",{title:"Verify the delivery"},new AbortController().signal,()=>{},first.context());
  await first.tools.get("asen_todo_update").execute("todo-update",{id:todo.details.taskId,revision:1,state:"running"},new AbortController().signal,()=>{},first.context());
  const done=await first.tools.get("asen_todo_update").execute("todo-done",{id:todo.details.taskId,revision:2,state:"done"},new AbortController().signal,()=>{},first.context());assert.equal(done.details.events.at(-1).state,"done");
  assert.deepEqual((await first.tools.get("asen_todo_list").execute("todo-list",{},new AbortController().signal,()=>{},first.context("other-session"))).details,[]);
  const second=host();createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:file})(second.pi as any);await second.events.get("session_start")![0]!({},second.context());
  const restored=await second.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},second.context());assert.ok(restored.details.some((row:any)=>row.id===id&&row.state==="completed"&&row.summary==="read-only result"));
  const restoredTodo=await second.tools.get("asen_todo_list").execute("todo-list",{},new AbortController().signal,()=>{},second.context());assert.equal(restoredTodo.details[0]?.current.state,"done");
 }finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;}
});

test("Pi session lifecycle recovers only its own running Todo tasks",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-todo-session-recovery-"));t.after(()=>rm(home,{recursive:true,force:true}));const file=join(home,".asen","todos.json"),projectId=await realpath(process.cwd()),seed=await SessionTodoStore.open(file);
 const active=await seed.add("Active session task",{sessionId:"session-a",projectId}),foreign=await seed.add("Foreign session task",{sessionId:"session-b",projectId});
 await seed.update(active.taskId,{sessionId:"session-a",projectId},1,"running");await seed.update(foreign.taskId,{sessionId:"session-b",projectId},1,"running");
 const state=host();createPiExtension({homeDir:()=>home,enableAgentRuntime:false,enableTodoRuntime:true,todoStoreFile:file})(state.pi as any);await state.events.get("session_start")![0]!({},state.context("session-a"));
 const recovered=await SessionTodoStore.open(file);assert.equal((await recovered.list({sessionId:"session-a",projectId}))[0]?.current.state,"blocked");assert.equal((await recovered.list({sessionId:"session-b",projectId}))[0]?.current.state,"running");
 const closing=await recovered.add("Task active at shutdown",{sessionId:"session-a",projectId});await recovered.update(closing.taskId,{sessionId:"session-a",projectId},1,"running");await state.events.get("session_shutdown")![0]!({},state.context("session-a"));
 const afterShutdown=await SessionTodoStore.open(file);assert.equal((await afterShutdown.history(closing.taskId,{sessionId:"session-a",projectId})).at(-1)?.state,"blocked");assert.equal((await afterShutdown.list({sessionId:"session-b",projectId}))[0]?.current.state,"running");
});

test("Pi continue tool requires explicit UI confirmation and cannot cross project/session identity",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-continue-"));t.after(()=>rm(home,{recursive:true,force:true}));const file=join(home,"agents.json"),prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"done"})},state=host();
 try{
  const priorStore=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:00.000Z"),saved={id:"interrupted",role:"explorer" as const,prompt:"inspect safely",repository:process.cwd(),isolationKey:"session-a",owner:{kind:"user" as const,id:"pi:session-a"}};
  await priorStore.store.enqueue(saved,saved.owner);await priorStore.store.running(saved.id,"2026-10-10T10:00:01.000Z");
  createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:file})(state.pi as any);await state.events.get("session_start")![0]!({},state.context());
  const continuation=await state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context());assert.equal(continuation.details.continuedFrom,"interrupted");assert.equal(continuation.details.role,"explorer");
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context()),/already has a continuation/);
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},{...state.context(),hasUI:false}),/Explicit Pi UI confirmation/);
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context("other-session")),/unavailable to this session or project/);
 }finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;}
});
