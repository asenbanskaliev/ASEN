import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {registerTodoTools} from "../src/runtime/pi-todo-tools.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";

test("resuming a restart-blocked Todo requires explicit active Pi UI approval",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-todo-confirm-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await realpath(root),session={sessionId:"session-confirm",projectId:project},store=await SessionTodoStore.open(path.join(root,"todos.json")),todo=await store.add("Continue implementation",session);
 await store.update(todo.taskId,session,1,"running");await store.recover(session);
 const tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 const execute=tools.get("asen_todo_update")!.execute as (...args:any[])=>Promise<unknown>,params={id:todo.taskId,revision:3,state:"running"},host={cwd:project,sessionManager:{getSessionId:()=>session.sessionId}};
 await assert.rejects(()=>execute("call-1",params,undefined,undefined,host),/Explicit Pi UI confirmation/);
 assert.equal((await store.list(session))[0]?.current.state,"blocked");
 let stalePrompts=0;await assert.rejects(()=>execute("call-stale",{...params,revision:2},undefined,undefined,{...host,hasUI:true,ui:{confirm:async()=>{stalePrompts++;return true;}}}),/revision conflict/);assert.equal(stalePrompts,0);
 let malformedPrompts=0;await assert.rejects(()=>execute("call-malformed",params,undefined,undefined,{...host,hasUI:true,ui:{confirm:async()=>{malformedPrompts++;return "yes" as any;}}}),/Explicit Pi UI confirmation/);assert.equal(malformedPrompts,1);assert.equal((await store.list(session))[0]?.current.state,"blocked");
 const questions:string[]=[];
 await assert.rejects(()=>execute("call-2",params,undefined,undefined,{...host,hasUI:true,ui:{confirm:async(title:string,message:string)=>{questions.push(`${title}\n${message}`);return false;}}}),/Explicit Pi UI confirmation/);
 assert.equal((await store.list(session))[0]?.current.state,"blocked");
 const result=await execute("call-3",params,undefined,undefined,{...host,hasUI:true,ui:{confirm:async(title:string,message:string)=>{questions.push(`${title}\n${message}`);return true;}}});
 assert.equal((await store.list(session))[0]?.current.state,"running");assert.equal((await store.history(todo.taskId,session)).at(-1)?.reason,"User confirmed blocked-task resume in Pi UI");assert.equal(questions.length,2);assert.match(questions[1]!,/Continue implementation[\s\S]*ASEN restarted.*explicit review/);assert.ok(result);
});

test("cancelling a pending blocked-task confirmation prevents a late approval from changing Todo state",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-todo-abort-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const project=await realpath(root),session={sessionId:"session-abort",projectId:project},store=await SessionTodoStore.open(path.join(root,"todos.json")),todo=await store.add("Continue safely",session);
 await store.update(todo.taskId,session,1,"running");await store.recover(session);
 const tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 const execute=tools.get("asen_todo_update")!.execute as (...args:any[])=>Promise<unknown>,controller=new AbortController(),host={cwd:project,sessionManager:{getSessionId:()=>session.sessionId},hasUI:true};
 let resolveConfirmation!:(confirmed:boolean)=>void,confirmStarted!:()=>void,dialogSignal:AbortSignal|undefined;
 const started=new Promise<void>(resolve=>{confirmStarted=resolve;}),confirmation=new Promise<boolean>(resolve=>{resolveConfirmation=resolve;});
 const pending=execute("call-abort",{id:todo.taskId,revision:3,state:"running"},controller.signal,undefined,{...host,ui:{confirm:(_title:string,_message:string,options?:{signal?:AbortSignal})=>{dialogSignal=options?.signal;confirmStarted();return confirmation;}}});
 await started;assert.equal(dialogSignal,controller.signal,"Pi should receive the tool signal so it can dismiss the active dialog");controller.abort();await assert.rejects(pending,/Todo update cancelled/);
 resolveConfirmation(true);await Promise.resolve();
 assert.equal((await store.list(session))[0]?.current.state,"blocked");
 assert.deepEqual((await store.history(todo.taskId,session)).map(event=>event.state),["planned","running","blocked"]);
});

test("cancelled Todo creation does not create a durable task",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-create-abort-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=await SessionTodoStore.open(path.join(root,"todos.json")),tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 const controller=new AbortController();controller.abort();const session={sessionId:"create-session",projectId:root};
 await assert.rejects(tools.get("asen_todo_add").execute("add",{title:"Must not exist"},controller.signal,undefined,{cwd:root,sessionManager:{getSessionId:()=>session.sessionId}}),/Todo update cancelled/);
 assert.deepEqual(await store.list(session),[]);
});

test("a retried Pi Todo add call ID returns its existing task instead of duplicating it",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-retry-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const session={sessionId:"retry-session",projectId:root},store=await SessionTodoStore.open(path.join(root,"todos.json")),tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 const host={cwd:root,sessionManager:{getSessionId:()=>session.sessionId}},add=tools.get("asen_todo_add").execute;
 const first=await add("pi-call-17",{title:"Publish verified release"},undefined,undefined,host),retried=await add("pi-call-17",{title:"Publish verified release"},undefined,undefined,host);
 assert.equal(first.details.taskId,retried.details.taskId);assert.equal((await store.list(session)).length,1);
 assert.equal((await store.history(first.details.taskId,session)).length,1);
});

test("blocked Todo approval cannot survive a session change during its dialog",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-session-change-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const session={sessionId:"original-session",projectId:root},store=await SessionTodoStore.open(path.join(root,"todos.json")),todo=await store.add("Review recovery",session);await store.update(todo.taskId,session,1,"running");await store.recover(session);
 const tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 let currentSession=session.sessionId;const host={cwd:root,sessionManager:{getSessionId:()=>currentSession},hasUI:true,ui:{confirm:async()=>{currentSession="replacement-session";return true;}}};
 await assert.rejects(tools.get("asen_todo_update").execute("resume",{id:todo.taskId,revision:3,state:"running"},undefined,undefined,host),/session changed/);
 assert.equal((await store.list(session))[0]?.current.state,"blocked");assert.equal((await store.history(todo.taskId,session)).length,3);
});

test("a concurrent task cancellation invalidates an earlier blocked-resume approval",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-stale-approval-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const session={sessionId:"race-session",projectId:root},store=await SessionTodoStore.open(path.join(root,"todos.json")),todo=await store.add("Keep latest decision",session);await store.update(todo.taskId,session,1,"running");await store.recover(session);
 const tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 const host={cwd:root,sessionManager:{getSessionId:()=>session.sessionId},hasUI:true,ui:{confirm:async()=>{await store.update(todo.taskId,session,3,"cancelled","Newer user decision");return true;}}};
 await assert.rejects(tools.get("asen_todo_update").execute("stale-resume",{id:todo.taskId,revision:3,state:"running"},undefined,undefined,host),/revision conflict/);
 assert.equal((await store.list(session))[0]?.current.state,"cancelled");assert.equal((await store.history(todo.taskId,session)).at(-1)?.reason,"Newer user decision");
});


test("session change while waiting for the Todo lock rejects the pending mutation",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-lock-session-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,"todos.json"),session={sessionId:"lock-session",projectId:root},store=await SessionTodoStore.open(file),todo=await store.add("Keep owning session",session);
 const tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 let current=session.sessionId;const host={cwd:root,sessionManager:{getSessionId:()=>current}};
 await writeFile(`${file}.lock`,JSON.stringify({pid:process.pid,token:"session-lock-owner",createdAt:Date.now()}));
 const pending=tools.get("asen_todo_update").execute("locked-update",{id:todo.taskId,revision:1,state:"running"},undefined,undefined,host);
 await new Promise(resolve=>setTimeout(resolve,30));current="replacement-session";await rm(`${file}.lock`);
 await assert.rejects(pending,/session changed/);assert.equal((await store.list(session))[0]?.current.state,"planned");assert.equal((await store.history(todo.taskId,session)).length,1);
});

test("session change during locked Todo creation leaves no task in either session",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-create-session-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,"todos.json"),store=await SessionTodoStore.open(file),tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 let sessionId="original-session";const host={cwd:root,sessionManager:{getSessionId:()=>sessionId}};
 await writeFile(`${file}.lock`,JSON.stringify({pid:process.pid,token:"create-session-lock",createdAt:Date.now()}));
 const pending=tools.get("asen_todo_add").execute("create",{title:"Must not cross sessions"},undefined,undefined,host);
 await new Promise(resolve=>setTimeout(resolve,30));sessionId="replacement-session";await rm(`${file}.lock`);
 await assert.rejects(pending,/session changed/);
 for(const id of ["original-session","replacement-session"])assert.deepEqual(await store.list({sessionId:id,projectId:root}),[]);
});

test("Todo read rejects cancelled calls and a session replacement during store access",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-read-session-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=await SessionTodoStore.open(path.join(root,"todos.json"));let sessionId="original-session";
 const host={cwd:root,sessionManager:{getSessionId:()=>sessionId}},tools=new Map<string,any>();
 registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>{sessionId="replacement-session";return store;});
 const controller=new AbortController();controller.abort();
 await assert.rejects(tools.get("asen_todo_list").execute("cancelled-read",{},controller.signal,undefined,host),/Todo update cancelled/);
 sessionId="original-session";await assert.rejects(tools.get("asen_todo_list").execute("session-read",{},undefined,undefined,host),/session changed/);
});
