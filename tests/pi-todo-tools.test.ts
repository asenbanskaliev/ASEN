import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {registerTodoTools} from "../src/runtime/pi-todo-tools.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";

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

test("a blocked Todo with a persisted agent link cannot bypass agent recovery",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-linked-todo-resume-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const session={sessionId:"linked-resume-session",projectId:root},store=await SessionTodoStore.open(path.join(root,"todos.json")),links=new TaskAgentLinkStore(path.join(root,"links.json")),todo=await store.add("Resume the interrupted review",session);
 await store.update(todo.taskId,session,1,"running");await store.recover(session);await links.bind({taskId:todo.taskId,agentId:"interrupted-review",sessionId:session.sessionId,projectId:root,createdAt:new Date().toISOString()});
 const tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store,undefined,{links:async()=>links,agents:async()=>({} as any)});
 let confirmations=0;const host={cwd:root,sessionManager:{getSessionId:()=>session.sessionId},hasUI:true,ui:{confirm:async()=>{confirmations++;return true;}}};
 await assert.rejects(()=>tools.get("asen_todo_update").execute("bypass-agent-recovery",{id:todo.taskId,revision:3,state:"running"},undefined,undefined,host),/recovered through its persisted agent.*asen_agent_continue.*asen_agent_retry/u);
 assert.equal(confirmations,0,"generic Todo resume must not approve a state change that skips agent continuation or retry");assert.equal((await store.list(session))[0]?.current.state,"blocked");
});

test("a planned DAG node cannot become done without a verification summary and explicit Pi confirmation",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-plan-verify-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const instruction=`Check test evidence and acceptance criteria ${"x".repeat(1400)}`,evidence=`Typecheck and targeted tests passed; inspected the changed behavior. ${"y".repeat(1400)}`;
 const session={sessionId:"plan-verify-session",projectId:root},store=await SessionTodoStore.open(path.join(root,"todos.json")),task=await store.add("Verify implementation",session,undefined,undefined,"asen-plan:plan:verify",[],instruction);
 await store.update(task.taskId,session,1,"running");const tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store);
 const execute=tools.get("asen_todo_update")!.execute,params={id:task.taskId,revision:2,state:"done",reason:evidence},host={cwd:root,sessionManager:{getSessionId:()=>session.sessionId}};
 await assert.rejects(()=>execute("no-ui",params,undefined,undefined,host),/Explicit Pi verification confirmation/);
 await assert.rejects(()=>execute("no-summary",{...params,reason:" "},undefined,undefined,{...host,hasUI:true,ui:{confirm:async()=>true}}),/verification summary/);
 let question="";await assert.rejects(()=>execute("rejected",params,undefined,undefined,{...host,hasUI:true,ui:{confirm:async(title:string,message:string)=>{question=`${title}\n${message}`;return false;}}}),/Explicit Pi verification confirmation/);
 assert.match(question,/acceptance criteria pass/);assert.ok(question.includes(instruction));assert.ok(question.includes(evidence));assert.equal((await store.list(session))[0]?.current.state,"running");
 await execute("accepted",params,undefined,undefined,{...host,hasUI:true,ui:{confirm:async()=>true}});
 const current=(await store.list(session))[0]!.current;assert.equal(current.state,"done");assert.match(current.reason!,/Pi user independently verified/);
 const hidden=await store.add("Reject hidden review text",session,undefined,undefined,"asen-plan:plan:hidden",[],"x".repeat(4097));await store.update(hidden.taskId,session,1,"running");let confirms=0;
 await assert.rejects(()=>execute("hidden-criteria",{id:hidden.taskId,revision:2,state:"done",reason:"reviewed"},undefined,undefined,{...host,hasUI:true,ui:{confirm:async()=>{confirms++;return true;}}}),/complete Pi UI review size/);
 assert.equal(confirms,0);assert.equal((await store.list(session)).find(row=>row.taskId===hidden.taskId)?.current.state,"running");
});

test("linked agent results above the complete UI review bound cannot be accepted",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-agent-result-bound-")));t.after(()=>rm(root,{recursive:true,force:true}));const session={sessionId:"bounded-result-session",projectId:root},store=await SessionTodoStore.open(path.join(root,"todos.json")),links=new TaskAgentLinkStore(path.join(root,"links.json"));
 const [task]=await store.addPlan([{title:"Review saved verifier result",requestId:"asen-plan:bounded-result:verifier",dependsOn:[],description:"Check the exact result against acceptance criteria",plan:{role:"verifier",skillPaths:[],skillSelection:{phase:"verify"}}}],session);assert.ok(task);
 await store.update(task.taskId,session,1,"running");await store.update(task.taskId,session,2,"blocked","Agent result requires review");await links.bind({taskId:task.taskId,agentId:"agent-large-result",sessionId:session.sessionId,projectId:root,createdAt:new Date().toISOString()});
 const fakeRuntime={query:async()=>({record:{id:"agent-large-result",role:"verifier",sessionId:session.sessionId,projectId:root,state:"completed",summary:"x".repeat(4097)}})},tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store,undefined,{links:async()=>links,agents:async()=>fakeRuntime as any});let confirms=0;
 await assert.rejects(()=>tools.get("asen_todo_accept_result")!.execute("accept-large",{id:task.taskId,agentId:"agent-large-result",revision:3,evidence:"I reviewed the whole result"},undefined,undefined,{cwd:root,sessionManager:{getSessionId:()=>session.sessionId},hasUI:true,ui:{confirm:async()=>{confirms++;return true;}}}),/bounded UI review size/u);
 assert.equal(confirms,0);assert.equal((await store.list(session))[0]?.current.state,"blocked");
});

test("accepting an independently verified plan result advances the next step after persistence",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-plan-auto-advance-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const session={sessionId:"plan-auto-advance-session",projectId:root},store=await SessionTodoStore.open(path.join(root,"todos.json")),links=new TaskAgentLinkStore(path.join(root,"links.json"));
 const [task]=await store.addPlan([{title:"Verify the finished change",requestId:"asen-plan:auto-advance:verifier",dependsOn:[],description:"Independently verify the requested behavior",plan:{role:"verifier",skillPaths:[],skillSelection:{phase:"verify"}}}],session);assert.ok(task);
 await store.update(task.taskId,session,1,"running");await store.update(task.taskId,session,2,"blocked","Agent result requires independent review");
 await links.bind({taskId:task.taskId,agentId:"agent-verified",sessionId:session.sessionId,projectId:root,createdAt:new Date().toISOString()});
 const runtime={query:async()=>({record:{id:"agent-verified",role:"verifier",sessionId:session.sessionId,projectId:root,state:"completed",summary:"The requested behavior and focused checks pass."}})};
 const host={cwd:root,sessionManager:{getSessionId:()=>session.sessionId},hasUI:true,ui:{confirm:async()=>true}},tools=new Map<string,any>();let advanced=false;
 registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>store,undefined,{links:async()=>links,agents:async()=>runtime as any},async received=>{assert.equal(received,host);assert.equal((await store.list(session))[0]?.current.state,"done","advance only after independent acceptance is persisted");advanced=true;});
 const result=await tools.get("asen_todo_accept_result")!.execute("accept",{id:task.taskId,agentId:"agent-verified",revision:3,evidence:"I inspected the exact result and confirmed the acceptance criteria pass."},undefined,undefined,host);
 assert.equal(result.details.events.at(-1).state,"done");assert.equal(advanced,true);
});

test("ECO-07 restart recovery preserves one ordered task transition chain through completion",async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),"asen-todo-full-recovery-")));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,"todos.json"),session={sessionId:"recovery-session",projectId:root},initial=await SessionTodoStore.open(file),todo=await initial.add("Finish the approved remaining step",session,undefined,undefined,"recovery-request");
 await initial.update(todo.taskId,session,1,"running");await initial.recover(session,"shutdown");
 const reopened=await SessionTodoStore.open(file),tools=new Map<string,any>();registerTodoTools({registerTool:tool=>tools.set(tool.name,tool)},async()=>reopened);
 const confirmCalls:string[]=[];const host={cwd:root,sessionManager:{getSessionId:()=>session.sessionId},hasUI:true,ui:{confirm:async(title:string)=>{confirmCalls.push(title);return true;}}};
 await tools.get("asen_todo_update").execute("resume-call",{id:todo.taskId,revision:3,state:"running"},undefined,undefined,host);
 await tools.get("asen_todo_update").execute("done-call",{id:todo.taskId,revision:4,state:"done"},undefined,undefined,host);
 await assert.rejects(tools.get("asen_todo_update").execute("duplicate-done",{id:todo.taskId,revision:4,state:"done"},undefined,undefined,host),/revision conflict/);
 assert.deepEqual(confirmCalls,["Resume blocked ASEN task?"]);
 assert.deepEqual((await reopened.history(todo.taskId,session)).map(event=>[event.revision,event.state]),[[1,"planned"],[2,"running"],[3,"blocked"],[4,"running"],[5,"done"]]);
 assert.equal((await reopened.list(session))[0]?.current.state,"done");
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
