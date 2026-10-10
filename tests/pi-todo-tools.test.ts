import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
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
