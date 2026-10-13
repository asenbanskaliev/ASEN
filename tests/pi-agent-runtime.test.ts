import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {mkdtemp,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import type {AgentRunner} from "../src/agents/dispatcher.js";
import {ASEN_AGENT_TOOL_NAMES} from "../src/agents/pi-agent-tools.js";
import {ASEN_TODO_TOOL_NAMES} from "../src/runtime/pi-todo-tools.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {selectSkills} from "../src/skills/registry.js";

function host(){
 const events=new Map<string,Function[]>(),commands=new Map<string,any>(),tools=new Map<string,any>(),messages:string[]=[];
 const pi={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name:string,command:any){commands.set(name,command);},registerTool(tool:any){tools.set(tool.name,tool);},getCommands(){return[];},getAllTools(){return[];}};
 const waiters=new Set<()=>void>();
 const waitForMessage=(matches:(message:string)=>boolean)=>new Promise<void>((resolve,reject)=>{
  const check=()=>{if(messages.some(matches)){clearTimeout(timer);waiters.delete(check);resolve();}};
  const timer=setTimeout(()=>{waiters.delete(check);reject(new Error("Agent terminal notification was not delivered"));},30_000);
  waiters.add(check);check();
 });
 const context=(session="session-a",cwd=process.cwd())=>({mode:"rpc",hasUI:true,cwd,sessionManager:{getSessionId:()=>session},ui:{notify:(message:string)=>{messages.push(message);for(const check of waiters)check();},confirm:async()=>true}});
 return {pi,events,commands,tools,messages,context,waitForMessage};
}

test("production Pi extension runs and restores session-scoped agent status using durable storage",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-pi-"));t.after(()=>rm(home,{recursive:true,force:true}));const file=join(home,".asen","agents.json"),prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"read-only result"})},first=host();let second:ReturnType<typeof host>|undefined;
 try{
  createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:file})(first.pi as any);await first.events.get("session_start")![0]!({},first.context());
  for(const name of [...ASEN_AGENT_TOOL_NAMES,...ASEN_TODO_TOOL_NAMES])assert.ok(first.tools.has(name));
  await writeFile(`${file}.lock`,JSON.stringify({pid:process.pid,token:"live-agent-owner",createdAt:Date.now()}));
  const startController=new AbortController(),startPending=first.tools.get("asen_agent_start").execute("cancel-before-enqueue",{prompt:"do not enqueue"},startController.signal,()=>{},first.context());
  await new Promise(resolve=>setTimeout(resolve,30));startController.abort();await assert.rejects(startPending,/Agent task cancelled/);
  assert.deepEqual((await first.tools.get("asen_agent_status").execute("status-after-abort",{},new AbortController().signal,()=>{},first.context())).details,[]);await rm(`${file}.lock`,{force:true});
  const started=await first.tools.get("asen_agent_start").execute("call-1",{prompt:"inspect this project"},new AbortController().signal,()=>{},first.context());const id=started.details.id;
  await first.waitForMessage(message=>message.includes(id)&&message.includes("completed")&&message.includes("read-only result"));
  let rows:any[]=[],deadline=Date.now()+30_000;while(Date.now()<deadline){rows=(await first.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},first.context())).details;if(rows.some(row=>row.id===id&&["completed","failed","cancelled","interrupted"].includes(row.state)))break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.ok(rows.some(row=>row.id===id&&row.state==="completed"),`agent runner did not persist completion; observed ${JSON.stringify(rows)}`);
  assert.ok(first.messages.some(message=>message.includes(id)&&message.includes("completed")&&message.includes("read-only result")),"completion must be delivered without a status query");
  await first.commands.get("asen-agents")!.handler("",first.context());assert.ok(first.messages.some(message=>message.includes("completed")&&message.includes("read-only result")));
  const queried=await first.tools.get("asen_agent_status").execute("query",{id},new AbortController().signal,()=>{},first.context());
  assert.equal(queried.details.task?.record.id,id);assert.equal(queried.details.task?.record.state,"completed");assert.equal(queried.details.task?.history.at(-1)?.state,"completed");assert.equal(queried.details.task?.request,undefined);
  const hidden=await first.tools.get("asen_agent_status").execute("foreign-query",{id},new AbortController().signal,()=>{},first.context("other-session"));assert.equal(hidden.details.task,null);
  const foreign=await first.tools.get("asen_agent_status").execute("call-2",{},new AbortController().signal,()=>{},first.context("other-session"));assert.deepEqual(foreign.details,[]);
  const todo=await first.tools.get("asen_todo_add").execute("todo",{title:"Verify the delivery"},new AbortController().signal,()=>{},first.context());
  await first.tools.get("asen_todo_update").execute("todo-update",{id:todo.details.taskId,revision:1,state:"running"},new AbortController().signal,()=>{},first.context());
  const done=await first.tools.get("asen_todo_update").execute("todo-done",{id:todo.details.taskId,revision:2,state:"done"},new AbortController().signal,()=>{},first.context());assert.equal(done.details.events.at(-1).state,"done");
  assert.deepEqual((await first.tools.get("asen_todo_list").execute("todo-list",{},new AbortController().signal,()=>{},first.context("other-session"))).details,[]);
  second=host();createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:file})(second.pi as any);await second.events.get("session_start")![0]!({},second.context());
  assert.equal(second.messages.some(message=>message.includes("read-only result")),false,"restart must not redeliver an old completion");
  const restored=await second.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},second.context());assert.ok(restored.details.some((row:any)=>row.id===id&&row.state==="completed"&&row.summary==="read-only result"));
  const restoredTodo=await second.tools.get("asen_todo_list").execute("todo-list",{},new AbortController().signal,()=>{},second.context());assert.equal(restoredTodo.details[0]?.current.state,"done");
 }finally{try{await first.events.get("session_shutdown")![0]!({},first.context());}finally{try{if(second)await second.events.get("session_shutdown")![0]!({},second.context());}finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;}}}
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

test("Pi launch persists Todo-agent ownership before dispatch and blocks for independent verification",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-pi-todo-agent-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const state=host();let runs=0;
 const runner:AgentRunner={run:async request=>{runs++;return{id:request.id,ok:true,output:"agent result"};}};
 createPiExtension({homeDir:()=>home,agentRunner:runner})(state.pi as any);await state.events.get("session_start")![0]!({},state.context());
 const todo=await state.tools.get("asen_todo_add").execute("todo-add",{title:"Verify the implementation",description:"Inspect the exact change and report test evidence"},new AbortController().signal,()=>{},state.context());
 await assert.rejects(()=>state.tools.get("asen_agent_start").execute("wrong-instruction",{prompt:"Inspect another task",todoId:todo.details.taskId},new AbortController().signal,()=>{},state.context()),/exact persisted task instruction/);assert.equal(runs,0);
 const start=await state.tools.get("asen_agent_start").execute("agent-start",{prompt:"Inspect the exact change and report test evidence",todoId:todo.details.taskId},new AbortController().signal,()=>{},state.context());
 const id=start.details.id;
 let row:any,deadline=Date.now()+3000;while(Date.now()<deadline){row=(await state.tools.get("asen_todo_list").execute("todo-list",{},new AbortController().signal,()=>{},state.context())).details[0];if(row?.current.state==="blocked")break;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(runs,1);assert.equal(row?.current.state,"blocked");assert.match(row?.current.reason??"",/independent verification/u);
 await state.commands.get("asen-task-agents")!.handler("",state.context());
 const view=JSON.parse(state.messages.at(-1)!);
 assert.equal(view[0]?.state,"blocked");assert.deepEqual(view[0]?.agents.map((agent:any)=>[agent.id,agent.state]),[[id,"completed"]]);
 await state.events.get("session_shutdown")![0]!({},state.context());
});

test("a persisted plan explorer dispatches the exact selected read-only skills through Pi",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-explorer-skills-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),session={sessionId:"plan-skill-session",projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile);
 const selection={phase:"explore" as const,risk:"medium" as const,codeChange:true,behaviorChange:false,filesTouched:4},skillPaths=selectSkills(selection).map(skill=>skill.path),instruction="Inspect only the bounded plan request and return evidence";
 const todo=await todos.add("Explorer task",session,undefined,undefined,"asen-plan:task:explorer",[],instruction,{role:"explorer",skillPaths,skillSelection:selection});
 let dispatched:import("../src/agents/dispatcher.js").AgentRequest|undefined;const runner:AgentRunner={run:async request=>{dispatched=request;return{id:request.id,ok:true,output:"read-only evidence"};}},state=host();
 createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(session.sessionId));
 const result=await state.tools.get("asen_agent_start").execute("plan-start",{prompt:instruction,todoId:todo.taskId},new AbortController().signal,()=>{},state.context(session.sessionId));
 const deadline=Date.now()+3000;while(Date.now()<deadline&&(!dispatched||(await todos.list(session))[0]?.current.state!=="blocked"))await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(result.details.role,"explorer");assert.equal(dispatched?.prompt,instruction);assert.deepEqual(dispatched?.skillPaths,skillPaths);assert.equal(dispatched?.skillContext?.phase,"explore");assert.equal(dispatched?.candidate,undefined);assert.equal(dispatched?.writeSurfaces,undefined);
 const persisted=JSON.parse(await readFile(agentFile,"utf8"));assert.equal(persisted.entries[0].request.prompt,instruction);assert.equal(Object.hasOwn(persisted.entries[0].request,"skillContext"),false);assert.equal(Object.hasOwn(persisted.entries[0].request,"skillPaths"),false);
 assert.equal((await todos.list(session))[0]?.current.state,"blocked");await state.events.get("session_shutdown")![0]!({},state.context(session.sessionId));
});

test("persisted plan reviewer and verifier roles dispatch only their exact read-only skill phases",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-review-verify-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),session={sessionId:"plan-review-verify",projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile),seen:import("../src/agents/dispatcher.js").AgentRequest[]=[],runner:AgentRunner={run:async request=>{seen.push(request);return{id:request.id,ok:true,output:"read-only phase evidence"};}},state=host();
 createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(session.sessionId));
 const workerSelection={phase:"apply" as const,risk:"medium" as const,codeChange:true,behaviorChange:false,filesTouched:4},workerPaths=selectSkills(workerSelection).map(skill=>skill.path),worker=await todos.add("Worker must remain gated",session,undefined,undefined,"asen-plan:plan:worker",[],"Apply only with a fresh write admission",{role:"worker",skillPaths:workerPaths,skillSelection:workerSelection});
 await assert.rejects(()=>state.tools.get("asen_agent_start").execute("worker-start",{prompt:worker.description,todoId:worker.taskId},new AbortController().signal,()=>{},state.context(session.sessionId)),/controlled worker dispatcher/);assert.equal(seen.length,0);assert.equal((await todos.list(session)).find(item=>item.taskId===worker.taskId)?.current.state,"planned");
 const staleSelection={phase:"explore" as const,risk:"low" as const,codeChange:false,behaviorChange:false,filesTouched:0},stale=await todos.add("Historical skill selection",session,undefined,undefined,"asen-plan:historical:explorer",[],"Do not execute a stale registry plan",{role:"explorer",skillPaths:["skills/asen-retired/SKILL.md"],skillSelection:staleSelection});
 await assert.rejects(()=>state.tools.get("asen_agent_start").execute("stale-start",{prompt:stale.description,todoId:stale.taskId},new AbortController().signal,()=>{},state.context(session.sessionId)),/registry selection changed/);assert.equal(seen.length,0);
 for(const [role,phase] of [["reviewer","adversarial-review"],["verifier","verify"]] as const){
  const skillSelection={phase,risk:"medium" as const,codeChange:true,behaviorChange:false,filesTouched:4},skillPaths=selectSkills(skillSelection).map(skill=>skill.path),instruction=`Perform ${role} checks for the persisted plan`;
  const todo=await todos.add(`${role} task`,session,undefined,undefined,`asen-plan:plan:${role}`,[],instruction,{role,skillPaths,skillSelection});
  const result=await state.tools.get("asen_agent_start").execute(`${role}-start`,{prompt:instruction,todoId:todo.taskId},new AbortController().signal,()=>{},state.context(session.sessionId));
  const deadline=Date.now()+3000;while(Date.now()<deadline&&(!seen.some(request=>request.id===result.details.id)||(await todos.list(session)).find(item=>item.taskId===todo.taskId)?.current.state!=="blocked"))await new Promise(resolve=>setTimeout(resolve,5));
  const dispatched=seen.find(request=>request.id===result.details.id);assert.equal(result.details.role,role);assert.equal(dispatched?.role,role);assert.deepEqual(dispatched?.skillPaths,skillPaths);assert.equal(dispatched?.skillContext?.phase,phase);assert.equal(dispatched?.candidate,undefined);assert.equal(dispatched?.writeSurfaces,undefined);assert.equal((await todos.list(session)).find(item=>item.taskId===todo.taskId)?.current.state,"blocked");
 }
 const persisted=JSON.parse(await readFile(agentFile,"utf8"));assert.ok(persisted.entries.every((entry:any)=>!Object.hasOwn(entry.request,"skillContext")&&!Object.hasOwn(entry.request,"skillPaths")));await state.events.get("session_shutdown")![0]!({},state.context(session.sessionId));
});

test("cancelling a Todo through Pi cancels its linked active agent",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-pi-todo-cancel-agent-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const state=host();let started!:()=>void;
 const running=new Promise<void>(resolve=>{started=resolve;});
 const runner:AgentRunner={run:async(request,signal)=>{started();return new Promise(resolve=>signal!.addEventListener("abort",()=>resolve({id:request.id,ok:false,output:"cancelled"}),{once:true}));}};
 createPiExtension({homeDir:()=>home,agentRunner:runner})(state.pi as any);await state.events.get("session_start")![0]!({},state.context());
 const todo=await state.tools.get("asen_todo_add").execute("todo-add",{title:"Cancel this work"},new AbortController().signal,()=>{},state.context());
 const start=await state.tools.get("asen_agent_start").execute("agent-start",{prompt:"Inspect only",todoId:todo.details.taskId},new AbortController().signal,()=>{},state.context());await running;
 const updated=await state.tools.get("asen_todo_update").execute("todo-cancel",{id:todo.details.taskId,revision:2,state:"cancelled"},new AbortController().signal,()=>{},state.context());
 assert.equal(updated.details.events.at(-1)?.state,"cancelled");
 const status=await state.tools.get("asen_agent_status").execute("agent-status",{id:start.details.id},new AbortController().signal,()=>{},state.context());
 assert.equal(status.details.task.record.state,"cancelled");
 await state.events.get("session_shutdown")![0]!({},state.context());
});

test("Pi continue tool requires explicit UI confirmation and cannot cross project/session identity",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-continue-"));t.after(()=>rm(home,{recursive:true,force:true}));const file=join(home,"agents.json"),prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"done"})},state=host();
 try{
  const crashed=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"running","-","session-a",process.cwd(),"interrupted"],{encoding:"utf8",timeout:30000});assert.equal(crashed.status,0,`${crashed.error?.message??""}\n${crashed.stderr}`);
  createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:file})(state.pi as any);await state.events.get("session_start")![0]!({},state.context());
  const confirmController=new AbortController();let dialogSignal:AbortSignal|undefined,resolveConfirmation!:(value:boolean)=>void,confirmationStarted!:()=>void;
  const confirmation=new Promise<boolean>(resolve=>{resolveConfirmation=resolve;}),startedConfirmation=new Promise<void>(resolve=>{confirmationStarted=resolve;});
  const confirmationPending=state.tools.get("asen_agent_continue").execute("continue-cancel",{id:"interrupted"},confirmController.signal,()=>{},{...state.context(),ui:{confirm:(_title:string,_message:string,options?:{signal?:AbortSignal})=>{dialogSignal=options?.signal;confirmationStarted();return confirmation;}}});
  await startedConfirmation;assert.equal(dialogSignal,confirmController.signal);confirmController.abort();await assert.rejects(confirmationPending,/Agent task cancelled/);resolveConfirmation(true);await Promise.resolve();
  const lockController=new AbortController();await writeFile(`${file}.lock`,JSON.stringify({pid:process.pid,token:"live-continuation-owner",createdAt:Date.now()}));
  const waitingContinuation=state.tools.get("asen_agent_continue").execute("continue-lock-cancel",{id:"interrupted"},lockController.signal,()=>{},state.context());
  await new Promise(resolve=>setTimeout(resolve,30));lockController.abort();await assert.rejects(waitingContinuation,/Agent task cancelled/);
  const persisted=JSON.parse(await readFile(file,"utf8"));assert.equal(persisted.entries.length,1);assert.equal(persisted.entries[0]?.record.state,"interrupted");await rm(`${file}.lock`,{force:true});
  const continuation=await state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context());assert.equal(continuation.details.continuedFrom,"interrupted");assert.equal(continuation.details.role,"explorer");
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context()),/already has a continuation/);
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},{...state.context(),hasUI:false}),/Explicit Pi UI confirmation/);
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context("other-session")),/unavailable to this session or project/);
 }finally{try{await state.events.get("session_shutdown")![0]!({},state.context());}finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;}}
});

test("agent completion never reaches a different active Pi session",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-delivery-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const {AgentRuntime}=await import("../src/agents/agent-runtime.js");
 let finish!:(result:any)=>void,started!:()=>void;
 const running=new Promise<void>(resolve=>{started=resolve;});
 const runtime=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{run:async request=>{started();return new Promise(resolve=>{finish=result=>resolve({id:request.id,...result});});}}});
 const state=host();createPiExtension({homeDir:()=>home,agentRuntimeFactory:async()=>runtime})(state.pi as any);
 await state.events.get("session_start")![0]!({},state.context());
 const task=await state.tools.get("asen_agent_start").execute("start",{prompt:"inspect"},new AbortController().signal,()=>{},state.context());await running;
 await state.events.get("session_start")![0]!({},state.context("session-b"));
 const terminal=new Promise<void>(resolve=>runtime.subscribeTerminal(()=>resolve()));
 finish({ok:true,output:"private session-a result"});await terminal;
 assert.equal(state.messages.some(message=>message.includes("private session-a result")),false);
 assert.equal((await runtime.list({sessionId:"session-a",projectId:await realpath(process.cwd())})).find(record=>record.id===task.details.id)?.state,"completed");
 await state.events.get("session_shutdown")![0]!({},state.context("session-b"));
});

test("failed agent reports failure and a broken delivery cannot erase its durable outcome",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-failure-delivery-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const {AgentRuntime}=await import("../src/agents/agent-runtime.js");
 let finish!:()=>void;const runtime=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{run:async request=>new Promise(resolve=>{finish=()=>resolve({id:request.id,ok:false,output:"child failed"});})}});
 const state=host(),ctx=state.context();createPiExtension({homeDir:()=>home,agentRuntimeFactory:async()=>runtime})(state.pi as any);await state.events.get("session_start")![0]!({},ctx);
 const task=await state.tools.get("asen_agent_start").execute("start",{prompt:"inspect"},new AbortController().signal,()=>{},ctx);
 const deadline=Date.now()+3000;while(!finish&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);
 const terminal=new Promise<void>(resolve=>runtime.subscribeTerminal(()=>resolve()));runtime.subscribeTerminal(()=>{throw new Error("delivery unavailable");});finish();await terminal;
 assert.ok(state.messages.some(message=>message.includes(task.details.id)&&message.includes("failed")));
 const records=await runtime.list({sessionId:"session-a",projectId:await realpath(process.cwd())});assert.equal(records.find(record=>record.id===task.details.id)?.state,"failed");
 await state.events.get("session_shutdown")![0]!({},ctx);
});

test("session shutdown suppresses late cancellation delivery after child cleanup",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-shutdown-delivery-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const {AgentRuntime}=await import("../src/agents/agent-runtime.js");
 let started!:()=>void,cleaned=false;const running=new Promise<void>(resolve=>{started=resolve;});
 const runtime=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{run:async(request,signal)=>{started();return new Promise(resolve=>signal!.addEventListener("abort",()=>{cleaned=true;resolve({id:request.id,ok:false,output:"cancelled after cleanup"});},{once:true}));}}});
 const state=host(),ctx=state.context();createPiExtension({homeDir:()=>home,agentRuntimeFactory:async()=>runtime})(state.pi as any);await state.events.get("session_start")![0]!({},ctx);
 const task=await state.tools.get("asen_agent_start").execute("start",{prompt:"inspect"},new AbortController().signal,()=>{},ctx);await running;
 const messagesBefore=state.messages.length;await state.events.get("session_shutdown")![0]!({},ctx);
 assert.equal(cleaned,true);assert.equal(state.messages.length,messagesBefore);
 assert.equal((await runtime.list({sessionId:"session-a",projectId:await realpath(process.cwd())})).find(record=>record.id===task.details.id)?.state,"cancelled");
});

test("foreign-project agents require live consent and are cancelled with the owning session",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-foreign-agent-")),foreign=await realpath(await mkdtemp(join(tmpdir(),"asen-foreign-project-")));t.after(()=>Promise.all([rm(home,{recursive:true,force:true}),rm(foreign,{recursive:true,force:true})]));
 const state=host(),ctx=state.context();let calls=0,started!:()=>void,cleaned=false;
 const running=new Promise<void>(resolve=>{started=resolve;});ctx.ui.confirm=async()=>{calls++;return true;};
 createPiExtension({homeDir:()=>home,agentRunner:{run:async(request,signal)=>{assert.equal(request.repository,foreign);started();return new Promise(resolve=>signal!.addEventListener("abort",()=>{cleaned=true;resolve({id:request.id,ok:false,output:"cancelled"});},{once:true}));}}})(state.pi as any);
 await state.events.get("session_start")![0]!({},ctx);
 const task=await state.tools.get("asen_agent_start").execute("foreign-start",{prompt:"inspect",root:foreign},new AbortController().signal,()=>{},ctx);await running;assert.equal(calls,1);
 const status=await state.tools.get("asen_agent_status").execute("foreign-query",{id:task.details.id,root:foreign},new AbortController().signal,()=>{},ctx);assert.equal(status.details.task.record.projectId,foreign);
 assert.deepEqual((await state.tools.get("asen_agent_status").execute("local-query",{},new AbortController().signal,()=>{},ctx)).details,[]);
 await state.events.get("session_shutdown")![0]!({},ctx);assert.equal(cleaned,true);
 await assert.rejects(state.tools.get("asen_agent_status").execute("expired",{id:task.details.id,root:foreign},new AbortController().signal,()=>{},ctx),/permission is unavailable/);
});
