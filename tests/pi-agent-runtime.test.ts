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
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {selectSkills} from "../src/skills/registry.js";

function host(){
 const events=new Map<string,Function[]>(),commands=new Map<string,any>(),tools=new Map<string,any>(),messages:string[]=[],widgets=new Map<string,string[]|undefined>();
 const pi={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name:string,command:any){commands.set(name,command);},registerTool(tool:any){tools.set(tool.name,tool);},getCommands(){return[];},getAllTools(){return[];}};
 const waiters=new Set<()=>void>();
 const waitForMessage=(matches:(message:string)=>boolean)=>new Promise<void>((resolve,reject)=>{
  const check=()=>{if(messages.some(matches)){clearTimeout(timer);waiters.delete(check);resolve();}};
  const timer=setTimeout(()=>{waiters.delete(check);reject(new Error("Agent terminal notification was not delivered"));},30_000);
  waiters.add(check);check();
 });
 const context=(session="session-a",cwd=process.cwd())=>({mode:"rpc",hasUI:true,cwd,sessionManager:{getSessionId:()=>session},ui:{notify:(message:string)=>{messages.push(message);for(const check of waiters)check();},confirm:async()=>true,setWidget:(key:string,content:string[]|undefined)=>{widgets.set(key,content);}}});
 return {pi,events,commands,tools,messages,widgets,context,waitForMessage};
}

test("Pi shows and clears a bounded ASEN progress widget as tasks change",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-widget-"));t.after(()=>rm(home,{recursive:true,force:true}));const todos=await SessionTodoStore.open(join(home,"todos.json")),projectId=await realpath(process.cwd()),identity={sessionId:"widget-session",projectId};
 const selection={phase:"explore" as const,risk:"low" as const,codeChange:false,behaviorChange:false,filesTouched:0},skillPaths=selectSkills(selection).map(skill=>skill.path),[task]=await todos.addPlan([{title:"Inspect the requested change",requestId:"asen-plan:widget-plan:explorer",dependsOn:[],description:"Inspect this project",plan:{role:"explorer",skillPaths,skillSelection:selection,priority:1}}],identity);assert.ok(task);
 const state=host();createPiExtension({homeDir:()=>home,enableAgentRuntime:false,todoStoreFactory:async()=>todos})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(identity.sessionId));
 const lines=state.widgets.get("asen-todo-progress");assert.ok(lines);assert.match(lines[0]!,/ASEN · 1 paso activo/u);assert.match(lines[1]!,/Pendiente · Exploración: Inspect the requested change/u);assert.doesNotMatch(lines.join("\n"),/widget-session|widget-plan|todo-/u);
 await state.tools.get("asen_todo_update").execute("cancel-widget-task",{id:task!.taskId,revision:1,state:"cancelled"},new AbortController().signal,()=>{},state.context(identity.sessionId));assert.equal(state.widgets.get("asen-todo-progress"),undefined);
 await state.events.get("session_shutdown")![0]!({},state.context(identity.sessionId));
});

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
  await first.waitForMessage(message=>message.includes("terminó")&&message.includes("comprobará el resultado"));
  let rows:any[]=[],deadline=Date.now()+30_000;while(Date.now()<deadline){rows=(await first.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},first.context())).details;if(rows.some(row=>row.id===id&&["completed","failed","cancelled","interrupted"].includes(row.state)))break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.ok(rows.some(row=>row.id===id&&row.state==="completed"),`agent runner did not persist completion; observed ${JSON.stringify(rows)}`);
  assert.ok(first.messages.some(message=>message.includes("terminó")&&message.includes("comprobará el resultado")),"completion must be delivered without a status query");
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
  await second.commands.get("asen-todos")!.handler("history",second.context());assert.match(second.messages.at(-1)!,/Completada.*Verify the delivery/);
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
 createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile,autoAdvancePlans:false})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(session.sessionId));
 const result=await state.tools.get("asen_agent_start").execute("plan-start",{prompt:instruction,todoId:todo.taskId},new AbortController().signal,()=>{},state.context(session.sessionId));
 const deadline=Date.now()+3000;while(Date.now()<deadline&&(!dispatched||(await todos.list(session))[0]?.current.state!=="done"))await new Promise(resolve=>setTimeout(resolve,5));
 await state.waitForMessage(message=>message.includes("ASEN completó 1 tarea; no quedan pasos pendientes."));
 assert.equal(result.details.role,"explorer");assert.equal(dispatched?.prompt,instruction);assert.deepEqual(dispatched?.skillPaths,skillPaths);assert.equal(dispatched?.skillContext?.phase,"explore");assert.equal(dispatched?.candidate,undefined);assert.equal(dispatched?.writeSurfaces,undefined);
 const persisted=JSON.parse(await readFile(agentFile,"utf8"));assert.equal(persisted.entries[0].request.prompt,instruction);assert.equal(Object.hasOwn(persisted.entries[0].request,"skillContext"),false);assert.equal(Object.hasOwn(persisted.entries[0].request,"skillPaths"),false);
 assert.equal((await todos.list(session))[0]?.current.state,"done");assert.equal(state.messages.filter(message=>message.includes("ASEN completó 1 tarea; no quedan pasos pendientes.")).length,1);assert.equal(state.messages.some(message=>message.includes("comprobará el resultado antes de cerrar el plan")),false,"linked plan work should produce one accurate progress notice");await state.events.get("session_shutdown")![0]!({},state.context(session.sessionId));
});

test("session startup automatically dispatches one ready read-only plan task",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-auto-startup-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),identity={sessionId:"plan-auto-startup",projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile),selection={phase:"explore" as const},skillPaths=selectSkills(selection).map(skill=>skill.path),instruction="Inspect the saved plan and report bounded findings";
 const [task]=await todos.addPlan([{title:"Inspect",requestId:"asen-plan:auto-startup:explorer",dependsOn:[],description:instruction,plan:{role:"explorer",skillPaths,skillSelection:selection,priority:1}}],identity);let seen:import("../src/agents/dispatcher.js").AgentRequest|undefined;
 const state=host();createPiExtension({homeDir:()=>home,agentRunner:{run:async request=>{seen=request;return{id:request.id,ok:true,output:"Read-only findings"};}},agentStoreFile:agentFile,todoStoreFile:todoFile})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(identity.sessionId));
 const deadline=Date.now()+5000;let row:any;while(Date.now()<deadline){row=(await todos.list(identity)).find(item=>item.taskId===task!.taskId);if(row?.current.state==="done")break;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(row?.current.state,"done");assert.equal(seen?.role,"explorer");assert.equal(seen?.prompt,instruction);assert.deepEqual(seen?.skillPaths,skillPaths);assert.equal(state.messages.some(message=>message.includes("ha iniciado la exploración")),true);await state.events.get("session_shutdown")![0]!({},state.context(identity.sessionId));
});

test("a passing independent review automatically dispatches its newly ready verifier",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-auto-after-review-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),identity={sessionId:"plan-auto-after-review",projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),linkFile=join(home,".asen","task-agent-links.json"),todos=await SessionTodoStore.open(todoFile),links=new TaskAgentLinkStore(linkFile),reviewSelection={phase:"adversarial-review" as const},verifySelection={phase:"verify" as const},seen:import("../src/agents/dispatcher.js").AgentRequest[]=[],state=host();
 const [review,verify]=await todos.addPlan([
  {title:"Review the change",requestId:"asen-plan:auto-after-review:reviewer",dependsOn:[],description:"Review the exact change and report findings",plan:{role:"reviewer",skillPaths:selectSkills(reviewSelection).map(skill=>skill.path),skillSelection:reviewSelection,priority:3}},
  {title:"Verify the change",requestId:"asen-plan:auto-after-review:verifier",dependsOn:["asen-plan:auto-after-review:reviewer"],description:"Verify the accepted change independently",plan:{role:"verifier",skillPaths:selectSkills(verifySelection).map(skill=>skill.path),skillSelection:verifySelection,priority:4}},
 ],identity);assert.ok(review&&verify);
 const context={...state.context(identity.sessionId),ui:{...state.context(identity.sessionId).ui,confirm:async()=>true}};
 createPiExtension({homeDir:()=>home,agentRunner:{run:async request=>{seen.push(request);return{id:request.id,ok:true,output:JSON.stringify({verdict:"pass",evidence:[request.role==="verifier"?"The accepted change and criteria match":"The change meets the review criteria"]})};}},agentStoreFile:agentFile,todoStoreFile:todoFile,autoAdvancePlans:true})(state.pi as any);
 await state.events.get("session_start")![0]!({},context);
 const firstDeadline=Date.now()+5000;let reviewerRow:any,reviewerAgent:string|undefined;
 while(Date.now()<firstDeadline){reviewerRow=(await todos.list(identity)).find(item=>item.taskId===review!.taskId);reviewerAgent=(await links.list(identity)).find(link=>link.taskId===review!.taskId)?.agentId;if(reviewerRow?.current.state==="done"&&reviewerAgent)break;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(reviewerRow?.current.state,"done");assert.equal(seen[0]?.role,"reviewer");assert.equal((await todos.list(identity)).find(item=>item.taskId===verify!.taskId)?.current.state,"planned");
 const nextDeadline=Date.now()+5000;let verifyRow:any;
 while(Date.now()<nextDeadline){verifyRow=(await todos.list(identity)).find(item=>item.taskId===verify!.taskId);if(verifyRow?.current.state==="done")break;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(verifyRow?.current.state,"done");assert.equal(seen[1]?.role,"verifier");assert.equal(seen.length,2,"only the newly dependency-ready verifier should start after acceptance");
 await state.events.get("session_shutdown")![0]!({},context);
});

test("Pi project changes while the Todo launch lock is held prevent agent dispatch",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-lock-project-change-"));t.after(()=>rm(home,{recursive:true,force:true}));const session={sessionId:"launch-lock-session",projectId:await realpath(process.cwd())},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),linkFile=join(home,".asen","task-agent-links.json"),todos=await SessionTodoStore.open(todoFile),links=new TaskAgentLinkStore(linkFile),instruction="Inspect the exact persisted task",selection={phase:"explore" as const},task=await todos.add("Identity-bound Pi task",session,undefined,undefined,"asen-plan:lock-project:explorer",[],instruction,{role:"explorer",skillPaths:selectSkills(selection).map(skill=>skill.path),skillSelection:selection});let runnerCalls=0;
 const state=host(),context=state.context(session.sessionId),runner:AgentRunner={run:async request=>{runnerCalls++;return{id:request.id,ok:true,output:"must not execute after identity change"};}};createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile,autoAdvancePlans:false})(state.pi as any);await state.events.get("session_start")![0]!({},context);
 await writeFile(`${todoFile}.lock`,JSON.stringify({pid:process.pid,token:"held-by-test",createdAt:Date.now()}));const pending=state.tools.get("asen_agent_start").execute("wait-for-todo-lock",{prompt:instruction,todoId:task.taskId},new AbortController().signal,()=>{},context);
 await new Promise(resolve=>setTimeout(resolve,35));context.cwd=home;await rm(`${todoFile}.lock`);await assert.rejects(pending,/session or project changed before Todo agent dispatch/u);
 assert.equal(runnerCalls,0);assert.equal((await todos.list(session))[0]?.current.state,"planned");assert.deepEqual(await links.list(session),[]);assert.equal(JSON.parse(await readFile(agentFile,"utf8")).entries[0]?.record.state,"cancelled");await state.events.get("session_shutdown")![0]!({},context);
});

test("persisted plan reviewer and verifier roles dispatch only their exact read-only skill phases",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-review-verify-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),session={sessionId:"plan-review-verify",projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile),seen:import("../src/agents/dispatcher.js").AgentRequest[]=[],runner:AgentRunner={run:async request=>{seen.push(request);return{id:request.id,ok:true,output:"read-only phase evidence"};}},state=host();
 createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile,autoAdvancePlans:false})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(session.sessionId));
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

test("next-plan dispatch confirms one ready read-only task and refuses the writer phase",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-dispatch-next-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),session={sessionId:"dispatch-next-session",projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile),selection={phase:"explore" as const,risk:"low" as const,codeChange:false,behaviorChange:false,filesTouched:0},paths=selectSkills(selection).map(skill=>skill.path),workerSelection={phase:"apply" as const,risk:"medium" as const,codeChange:true,behaviorChange:false,filesTouched:1},workerPaths=selectSkills(workerSelection).map(skill=>skill.path),longInstruction=`Inspect the bounded project and report evidence ${"i".repeat(1800)} END-OF-INSTRUCTION-MARKER`,seen:import("../src/agents/dispatcher.js").AgentRequest[]=[],runner:AgentRunner={run:async request=>{seen.push(request);return{id:request.id,ok:true,output:"inspection evidence"};}};
 const persisted=await todos.addPlan([
  {title:"Explore task",requestId:"asen-plan:dispatch-next:explorer",dependsOn:[],description:longInstruction,plan:{role:"explorer",skillPaths:paths,priority:1,skillSelection:selection}},
  {title:"Worker task",requestId:"asen-plan:dispatch-next:worker",dependsOn:["asen-plan:dispatch-next:explorer"],description:"Apply the accepted change",plan:{role:"worker",skillPaths:workerPaths,priority:2,skillSelection:workerSelection}}
 ],session),state=host();let confirmations=0;
 createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile,autoAdvancePlans:false})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(session.sessionId));
 let confirmationMessage="";const context={...state.context(session.sessionId),ui:{...state.context(session.sessionId).ui,confirm:async(_title:string,message:string)=>{confirmations++;confirmationMessage=message;return true;}}};
 const dispatched=await state.tools.get("asen_plan_dispatch_next").execute("dispatch-next",{},new AbortController().signal,()=>{},context);
 assert.equal(dispatched.details.status,"dispatched");assert.equal(dispatched.details.role,"explorer");assert.equal(confirmations,1);
 assert.ok(confirmationMessage.includes(longInstruction),"Pi must show the complete persisted instruction before dispatch");
 const deadline=Date.now()+3000;while(Date.now()<deadline&&(await todos.list(session)).find(row=>row.taskId===persisted[0]!.taskId)?.current.state!=="done")await new Promise(resolve=>setTimeout(resolve,5));
 let rows=await todos.list(session),explorer=rows.find(row=>row.taskId===persisted[0]!.taskId)!;assert.equal(explorer.current.state,"done");assert.equal(seen.length,1);assert.equal(seen[0]?.role,"explorer");assert.equal(seen[0]?.prompt,longInstruction);assert.equal(seen[0]?.candidate,undefined);assert.equal(seen[0]?.writeSurfaces,undefined);
 const refused=await state.tools.get("asen_plan_dispatch_next").execute("dispatch-worker",{},new AbortController().signal,()=>{},context);
 assert.equal(refused.details.status,"blocked");assert.match(refused.details.reason,/persisted candidate, exact file scope/);assert.equal(confirmations,1,"an incomplete writer plan must be rejected before asking for authorization");assert.equal(seen.length,1);
 rows=await todos.list(session);assert.equal(rows.find(row=>row.taskId===persisted[1]!.taskId)?.current.state,"planned");await state.events.get("session_shutdown")![0]!({},context);
});

test("ECO-06 worker dispatch binds one Pi write to the persisted ODD scope and requires review before completion",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-eco06-controlled-write-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),sessionId="eco06-controlled-write",identity={sessionId,projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile),requests:import("../src/agents/dispatcher.js").AgentRequest[]=[],state=host();let confirmation="",confirmations=0,approveWrite=false;
 const context={...state.context(sessionId),ui:{...state.context(sessionId).ui,confirm:async(_title:string,message:string)=>{confirmations++;confirmation=message;return !message.includes("Authorize this single worker run")||approveWrite;}}};
 createPiExtension({homeDir:()=>home,agentRunner:{run:async request=>{requests.push(request);return{id:request.id,ok:true,output:request.role==="worker"?"Updated only README.md and docs/guide.md; no other files changed.":"Inspected the exact authorized documentation scope."};}},agentStoreFile:agentFile,todoStoreFile:todoFile,autoAdvancePlans:false})(state.pi as any);await state.events.get("session_start")![0]!({},context);
 const facts={taskIdentity:"eco06-controlled-write",instruction:"Update only the two approved documentation files",intent:"implementation",scope:{kind:"known",expectedPaths:["README.md","docs/guide.md"]},writes:[{path:"README.md",changeKind:"documentation"},{path:"docs/guide.md",changeKind:"documentation"}],riskOperations:[],session:{estimatedMinutes:20,continuation:false},testing:{kind:"required"},review:{kind:"ordinary",estimatedMinutes:10},unresolvedDecisions:[]};
 await state.commands.get("asen-plan")!.handler(JSON.stringify(facts),context);const planned=JSON.parse(state.messages.at(-1)!),explorer=planned.persistedTasks.find((item:any)=>item.planTaskId.endsWith(":explorer"))!,worker=planned.persistedTasks.find((item:any)=>item.planTaskId.endsWith(":worker"))!;
 assert.equal(planned.route,"orchestrate");assert.ok(worker.todoId);let rows=await todos.list(identity);const workerRow=rows.find(row=>row.taskId===worker.todoId)!;assert.deepEqual(workerRow.plan?.writeSurfaces,["README.md","docs/guide.md"]);assert.equal(workerRow.plan?.candidate?.repository,projectId);assert.ok(workerRow.plan?.writerAuthorizationBasis);
 const explorerLaunch=await state.tools.get("asen_plan_dispatch_next").execute("write-plan-explore",{},new AbortController().signal,()=>{},context);assert.equal(explorerLaunch.details.role,"explorer");
 let explorerRow:any,deadline=Date.now()+3000;while(Date.now()<deadline){explorerRow=(await todos.list(identity)).find(row=>row.taskId===explorer.todoId);if(explorerRow?.current.state==="done")break;await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(explorerRow?.current.state,"done");
 const declined=await state.tools.get("asen_plan_dispatch_next").execute("decline-write-plan-worker",{},new AbortController().signal,()=>{},context);assert.equal(declined.details.status,"blocked");assert.match(declined.details.reason,/declined/u);assert.equal((await todos.list(identity)).find(row=>row.taskId===worker.todoId)?.current.state,"planned");assert.equal(requests.filter(value=>value.role==="worker").length,0);
 approveWrite=true;const writeLaunch=await state.tools.get("asen_plan_dispatch_next").execute("authorize-write-plan-worker",{},new AbortController().signal,()=>{},context);assert.equal(writeLaunch.details.status,"dispatched",writeLaunch.details.reason);assert.equal(writeLaunch.details.role,"worker");assert.ok(confirmation.includes("Candidate:"));assert.ok(confirmation.includes("README.md, docs/guide.md"));assert.ok(confirmation.includes("without commit or merge"));
 deadline=Date.now()+3000;let request:import("../src/agents/dispatcher.js").AgentRequest|undefined;while(Date.now()<deadline){request=requests.find(value=>value.id===writeLaunch.details.agentId);if(request)break;await new Promise(resolve=>setTimeout(resolve,5));}assert.ok(request,"authorized worker reached the runner");assert.equal(request.role,"worker");assert.deepEqual(request.writeSurfaces,["README.md","docs/guide.md"]);assert.equal(request.candidate?.repository,projectId);assert.equal(request.expectedPhase,undefined);assert.equal("writerAdmission" in request,false);assert.ok(request.runnerWriteReceiver,"runner receives only the one-use bound receiver");const storedAgents=JSON.parse(await readFile(agentFile,"utf8")),storedWorker=storedAgents.entries.find((entry:any)=>entry.record.id===writeLaunch.details.agentId)?.request;assert.equal(storedWorker?.role,"worker");for(const key of ["candidate","writeSurfaces","writerAdmission","phaseGrant"])assert.equal(Object.hasOwn(storedWorker??{},key),false,`${key} must not survive restart`);assert.equal((await todos.list(identity)).find(row=>row.taskId===worker.todoId)?.current.state,"running");
 deadline=Date.now()+3000;let workerRowAfter:any;while(Date.now()<deadline){workerRowAfter=(await todos.list(identity)).find(row=>row.taskId===worker.todoId);if(workerRowAfter?.current.state==="succeeded")break;await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(workerRowAfter?.current.state,"succeeded");assert.equal(requests.filter(value=>value.role==="worker").length,1);const nextPhase=await state.tools.get("asen_plan_dispatch_next").execute("advance-after-worker",{},new AbortController().signal,()=>{},context);assert.equal(nextPhase.details.status,"dispatched");assert.notEqual(nextPhase.details.role,"worker");assert.equal(requests.filter(value=>value.role==="worker").length,1);
 let reviewPrompt="";context.ui.confirm=async(_title:string,message:string)=>{confirmations++;reviewPrompt=message;return true;};
 const accepted=await state.tools.get("asen_todo_accept_result").execute("accept-write-plan-worker",{id:worker.todoId,agentId:writeLaunch.details.agentId,revision:workerRowAfter.current.revision,evidence:"I inspected the actual diff, confirmed only the two approved files changed, and verified the acceptance criteria."},new AbortController().signal,()=>{},context);
 assert.equal(accepted.details.events.at(-1).state,"done");assert.ok(reviewPrompt.includes("actual changes in those files"));assert.ok(reviewPrompt.includes("README.md, docs/guide.md"));assert.equal(confirmations,5);await state.events.get("session_shutdown")![0]!({},context);
});

test("Pi refuses plan instructions too large to display completely before launching an agent",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-plan-dispatch-size-limit-"));t.after(()=>rm(home,{recursive:true,force:true}));const projectId=await realpath(process.cwd()),session={sessionId:"dispatch-size-limit-session",projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile),selection={phase:"explore" as const,risk:"low" as const,codeChange:false,behaviorChange:false,filesTouched:0},paths=selectSkills(selection).map(skill=>skill.path),instruction=`Inspect this plan ${"i".repeat(4096)}`,persisted=await todos.addPlan([{title:"Oversized instruction",requestId:"asen-plan:size-limit:explorer",dependsOn:[],description:instruction,plan:{role:"explorer",skillPaths:paths,priority:1,skillSelection:selection}}],session),state=host();let confirmations=0,runs=0;
 createPiExtension({homeDir:()=>home,agentRunner:{run:async request=>{runs++;return{id:request.id,ok:true,output:"unexpected"};}},agentStoreFile:agentFile,todoStoreFile:todoFile})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(session.sessionId));const context={...state.context(session.sessionId),ui:{...state.context(session.sessionId).ui,confirm:async()=>{confirmations++;return true;}}};
 const result=await state.tools.get("asen_plan_dispatch_next").execute("dispatch-oversized",{},new AbortController().signal,()=>{},context);assert.equal(result.details.status,"blocked");assert.match(result.details.reason,/complete plan instruction exceeds/u);assert.equal(confirmations,0);assert.equal(runs,0);assert.equal((await todos.list(session)).find(row=>row.taskId===persisted[0]!.taskId)?.current.state,"planned");await state.events.get("session_shutdown")![0]!({},context);
});

test("ECO-06 verification plan dispatches through Pi and requires independent Todo acceptance",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-eco06-verify-flow-"));t.after(()=>rm(home,{recursive:true,force:true}));const sessionId="eco06-verify-flow",projectId=await realpath(process.cwd()),identity={sessionId,projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),todos=await SessionTodoStore.open(todoFile);let request:import("../src/agents/dispatcher.js").AgentRequest|undefined,confirmations=0;
 const acceptanceInstruction=`Independently verify the requested acceptance criteria ${"i".repeat(1400)}`,acceptanceEvidence=`I inspected the saved verifier result against the recorded acceptance criteria and confirmed the requested checks pass. ${"e".repeat(1400)}`;
 const state=host();let context={...state.context(sessionId),ui:{...state.context(sessionId).ui,confirm:async()=>{confirmations++;return true;}}};
 createPiExtension({homeDir:()=>home,agentRunner:{run:async value=>{request=value;return{id:value.id,ok:true,output:"Verified the requested acceptance criteria against the current project state."};}},agentStoreFile:agentFile,todoStoreFile:todoFile,autoAdvancePlans:false})(state.pi as any);await state.events.get("session_start")![0]!({},context);
 await state.commands.get("asen-plan").handler(JSON.stringify({taskIdentity:"eco06-verify-flow",instruction:acceptanceInstruction,intent:"verification",scope:{kind:"known",expectedPaths:[]},writes:[],riskOperations:[],session:{estimatedMinutes:15,continuation:false},testing:{kind:"required"},review:{kind:"none",estimatedMinutes:10},unresolvedDecisions:[]}),context);
 const plan=JSON.parse(state.messages.at(-1)!);
 assert.equal(plan.route,"verify");assert.equal(plan.persistedTasks.length,1);const todoId=plan.persistedTasks[0].todoId;
 const originalProject=context.cwd;context.ui.confirm=async()=>{confirmations++;if(confirmations===1)context.cwd=home;return true;};
 await assert.rejects(()=>state.tools.get("asen_plan_dispatch_next").execute("verify-project-change",{},new AbortController().signal,()=>{},context),/session or project changed/u);assert.equal(request,undefined);
 context.cwd=originalProject;
 const dispatched=await state.tools.get("asen_plan_dispatch_next").execute("verify-next",{},new AbortController().signal,()=>{},context);assert.equal(dispatched.details.status,"dispatched");assert.equal(dispatched.details.role,"verifier");
 let row:any,deadline=Date.now()+5000;while(Date.now()<deadline){row=(await todos.list(identity)).find(item=>item.taskId===todoId);if(row?.current.state==="blocked")break;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(row?.current.state,"blocked");assert.equal((request as import("../src/agents/dispatcher.js").AgentRequest|undefined)?.role,"verifier");assert.equal((request as import("../src/agents/dispatcher.js").AgentRequest|undefined)?.prompt,row?.description);assert.equal(confirmations,2);
 const agent=await state.tools.get("asen_agent_status").execute("verify-result",{id:dispatched.details.agentId},new AbortController().signal,()=>{},context);assert.equal(agent.details.task.record.state,"completed");assert.match(agent.details.task.record.summary,/acceptance criteria/u);
 await assert.rejects(()=>state.tools.get("asen_todo_update").execute("verify-bypass",{id:todoId,revision:row.current.revision,state:"done",reason:"I read the result"},new AbortController().signal,()=>{},context),/asen_todo_accept_result/u);
 assert.equal((await todos.list(identity)).find(item=>item.taskId===todoId)?.current.state,"blocked","agent completion alone must never close a linked plan task");
 await state.events.get("session_shutdown")![0]!({},context);
 const restarted=host();createPiExtension({homeDir:()=>home,agentRunner:{run:async value=>({id:value.id,ok:false,output:"Unexpected post-restart dispatch"})},agentStoreFile:agentFile,todoStoreFile:todoFile})(restarted.pi as any);await restarted.events.get("session_start")![0]!({},restarted.context(sessionId));context={...restarted.context(sessionId),ui:{...restarted.context(sessionId).ui,confirm:async()=>{confirmations++;return true;}}};
 const recoveredAgent=await restarted.tools.get("asen_agent_status").execute("verify-persisted-result",{id:dispatched.details.agentId},new AbortController().signal,()=>{},context);assert.equal(recoveredAgent.details.task.record.state,"completed");assert.match(recoveredAgent.details.task.record.summary,/acceptance criteria/u);
 await assert.rejects(()=>restarted.tools.get("asen_todo_accept_result").execute("verify-wrong-agent",{id:todoId,agentId:"foreign-agent",revision:row.current.revision,evidence:"I checked it"},new AbortController().signal,()=>{},context),/not persistently linked/u);
 context.ui.confirm=async()=>{confirmations++;return false;};await assert.rejects(()=>restarted.tools.get("asen_todo_accept_result").execute("verify-declined",{id:todoId,agentId:dispatched.details.agentId,revision:row.current.revision,evidence:"I checked it"},new AbortController().signal,()=>{},context),/Explicit Pi result verification confirmation/u);assert.equal((await todos.list(identity)).find(item=>item.taskId===todoId)?.current.state,"blocked");context.ui.confirm=async()=>{confirmations++;return true;};
 let acceptancePrompt="";context.ui.confirm=async(...args:any[])=>{confirmations++;acceptancePrompt=String(args[1]??args[0]??"");return true;};
 const completed=await restarted.tools.get("asen_todo_accept_result").execute("verify-accept",{id:todoId,agentId:dispatched.details.agentId,revision:row.current.revision,evidence:acceptanceEvidence},new AbortController().signal,()=>{},context);
 assert.ok(acceptancePrompt.includes(row.description));assert.ok(acceptancePrompt.includes(acceptanceEvidence));
 assert.equal(completed.details.events.at(-1).state,"done");assert.match(completed.details.events.at(-1).reason,/independently verified linked verifier result/u);assert.equal(confirmations,4);
 await restarted.events.get("session_shutdown")![0]!({},context);
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

test("Pi continue tool uses the user's natural follow-up without another dialog and remains session-scoped",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-agent-continue-"));t.after(()=>rm(home,{recursive:true,force:true}));const file=join(home,"agents.json"),prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"done"})},state=host();
 try{
  const crashed=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"running","-","session-a",process.cwd(),"interrupted"],{encoding:"utf8",timeout:30000});assert.equal(crashed.status,0,`${crashed.error?.message??""}\n${crashed.stderr}`);
  createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:file})(state.pi as any);await state.events.get("session_start")![0]!({},state.context());
  let confirmations=0;const context={...state.context(),hasUI:false,ui:{...state.context().ui,confirm:async()=>{confirmations++;return true;}}};
  const lockController=new AbortController();await writeFile(`${file}.lock`,JSON.stringify({pid:process.pid,token:"live-continuation-owner",createdAt:Date.now()}));
  const waitingContinuation=state.tools.get("asen_agent_continue").execute("continue-lock-cancel",{id:"interrupted"},lockController.signal,()=>{},context);
  await new Promise(resolve=>setTimeout(resolve,30));lockController.abort();await assert.rejects(waitingContinuation,/Agent task cancelled/);
  const persisted=JSON.parse(await readFile(file,"utf8"));assert.equal(persisted.entries.length,1);assert.equal(persisted.entries[0]?.record.state,"interrupted");await rm(`${file}.lock`,{force:true});
  const continuation=await state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},context);assert.equal(continuation.details.continuedFrom,"interrupted");assert.equal(continuation.details.role,"explorer");assert.equal(confirmations,0);
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context()),/already has a continuation/);
  await assert.rejects(()=>state.tools.get("asen_agent_continue").execute("continue",{id:"interrupted"},new AbortController().signal,()=>{},state.context("other-session")),/unavailable to this session or project/);
 }finally{try{await state.events.get("session_shutdown")![0]!({},state.context());}finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;}}
});

test("continuing a Todo-linked interrupted Pi agent binds the child before execution and Todo cancellation reaches it",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-linked-agent-continuation-"));t.after(()=>rm(home,{recursive:true,force:true}));const sessionId="session-a",projectId=await realpath(process.cwd()),identity={sessionId,projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),linkFile=join(home,".asen","task-agent-links.json"),todos=await SessionTodoStore.open(todoFile),links=new TaskAgentLinkStore(linkFile);
 const todo=await todos.add("Resume linked review",identity);await todos.update(todo.taskId,identity,1,"running");
 const crashed=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),agentFile,"running","-",sessionId,projectId,"interrupted-linked-agent"],{encoding:"utf8",timeout:30000});assert.equal(crashed.status,0,`${crashed.error?.message??""}\n${crashed.stderr}`);
 await links.bind({taskId:todo.taskId,agentId:"interrupted-linked-agent",sessionId,projectId,createdAt:new Date().toISOString()});
 let childId="",begin!:()=>void;const begun=new Promise<void>(resolve=>{begin=resolve;});
 const runner:AgentRunner={run:async(request,signal)=>{childId=request.id;const linked=(await links.list(identity)).some(link=>link.agentId===request.id&&link.taskId===todo.taskId),current=(await todos.list(identity)).find(item=>item.taskId===todo.taskId);assert.equal(linked,true,"child correlation must persist before the AgentRunner starts");assert.equal(current?.current.state,"running","Todo resume must persist before child dispatch");begin();return new Promise(resolve=>signal!.addEventListener("abort",()=>resolve({id:request.id,ok:false,output:"cancelled"}),{once:true}));}};
 const state=host();createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile})(state.pi as any);await state.events.get("session_start")![0]!({},state.context(sessionId));
 assert.ok(state.messages.some(message=>/di «continúa»/.test(message)),"restart recovery should be available through ordinary language");assert.ok(state.messages.every(message=>!/\/asen-(?:agents|todos)/u.test(message)));
 const recovered=(await todos.list(identity)).find(item=>item.taskId===todo.taskId)!;assert.equal(recovered.current.state,"blocked");
 const continuation=await state.tools.get("asen_agent_continue").execute("continue-linked",{id:"interrupted-linked-agent"},new AbortController().signal,()=>{},{...state.context(sessionId),hasUI:false});assert.equal(continuation.details.todoId,todo.taskId);await begun;
 const persistedLinks=await links.list(identity);assert.ok(persistedLinks.some(link=>link.agentId===childId&&link.taskId===todo.taskId));
 const cancelled=await state.tools.get("asen_todo_update").execute("cancel-linked",{id:todo.taskId,revision:4,state:"cancelled"},new AbortController().signal,()=>{},state.context(sessionId));assert.equal(cancelled.details.events.at(-1).state,"cancelled");
 const status=await state.tools.get("asen_agent_status").execute("child-status",{id:childId},new AbortController().signal,()=>{},state.context(sessionId));assert.equal(status.details.task.record.state,"cancelled");
 await state.events.get("session_shutdown")![0]!({},state.context(sessionId));
});

test("failed linked read-only tasks retry only with confirmation and persist the new binding before dispatch",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-linked-agent-retry-"));t.after(()=>rm(home,{recursive:true,force:true}));const sessionId="retry-session",projectId=await realpath(process.cwd()),identity={sessionId,projectId},todoFile=join(home,".asen","todos.json"),agentFile=join(home,".asen","agents.json"),linkFile=join(home,".asen","task-agent-links.json"),todos=await SessionTodoStore.open(todoFile),links=new TaskAgentLinkStore(linkFile);
 const instruction=`Inspect the exact change and report evidence ${"i".repeat(1800)} END-OF-RETRY-INSTRUCTION-MARKER`,todo=await todos.add("Retry failed inspection",identity,undefined,undefined,undefined,[],instruction);let attempts=0,childId="",begin!:()=>void;const begun=new Promise<void>(resolve=>{begin=resolve;});
 const runner:AgentRunner={run:async(request,signal)=>{attempts++;if(attempts===1)return{id:request.id,ok:false,output:"transient read-only failure"};childId=request.id;const linked=(await links.list(identity)).some(link=>link.agentId===request.id&&link.taskId===todo.taskId),current=(await todos.list(identity)).find(item=>item.taskId===todo.taskId);assert.equal(linked,true,"retry child must be linked before it starts");assert.equal(current?.current.state,"running","Todo retry must be running before dispatch");begin();return{id:request.id,ok:false,output:"retry failed"};}};
 const state=host(),ctx=state.context(sessionId);let confirmationMessage="";ctx.ui.confirm=async(...args:any[])=>{confirmationMessage=String(args[1]??"");return true;};createPiExtension({homeDir:()=>home,agentRunner:runner,agentStoreFile:agentFile,todoStoreFile:todoFile})(state.pi as any);await state.events.get("session_start")![0]!({},ctx);
 const first=await state.tools.get("asen_agent_start").execute("retry-first",{prompt:instruction,todoId:todo.taskId},new AbortController().signal,()=>{},ctx),firstId=first.details.id;
 let current:any,deadline=Date.now()+5000;while(Date.now()<deadline){current=(await todos.list(identity)).find(item=>item.taskId===todo.taskId);if(attempts===1&&current?.current.state==="blocked")break;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(attempts,1);assert.equal(current?.current.state,"blocked");assert.equal((await state.tools.get("asen_agent_status").execute("first-status",{id:firstId},new AbortController().signal,()=>{},ctx)).details.task.record.state,"failed");
 const noConsent={...ctx,hasUI:false};await assert.rejects(()=>state.tools.get("asen_agent_retry").execute("retry-denied",{id:firstId},new AbortController().signal,()=>{},noConsent),/Explicit Pi UI confirmation/u);assert.equal(attempts,1);
 const retried=await state.tools.get("asen_agent_retry").execute("retry",{id:firstId},new AbortController().signal,()=>{},ctx);assert.equal(retried.details.retriedFrom,firstId);assert.ok(confirmationMessage.includes(instruction),"Pi retry confirmation must show the complete saved instruction");await begun;assert.equal(attempts,2);
 assert.ok((await links.list(identity)).some(link=>link.agentId===childId&&link.taskId===todo.taskId));
 deadline=Date.now()+5000;while(Date.now()<deadline){current=(await todos.list(identity)).find(item=>item.taskId===todo.taskId);if(current?.current.state==="blocked")break;await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(current?.current.state,"blocked");assert.equal((await state.tools.get("asen_agent_status").execute("retry-child-status",{id:childId},new AbortController().signal,()=>{},ctx)).details.task.record.state,"failed");
 await assert.rejects(()=>state.tools.get("asen_agent_retry").execute("retry-again",{id:childId},new AbortController().signal,()=>{},ctx),/single controlled retry/u);assert.equal(attempts,2);
 const cancelled=await state.tools.get("asen_todo_update").execute("cancel-retry",{id:todo.taskId,revision:5,state:"cancelled"},new AbortController().signal,()=>{},ctx);assert.equal(cancelled.details.events.at(-1).state,"cancelled");
 await state.events.get("session_shutdown")![0]!({},ctx);
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
 await state.waitForMessage(message=>message.includes("no pudo completar la exploración")&&message.includes("di «continúa»"));
 assert.ok(state.messages.some(message=>message.includes("no pudo completar la exploración")&&message.includes("di «continúa»")));assert.ok(state.messages.every(message=>!message.includes("/asen-")));
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
