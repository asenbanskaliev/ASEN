import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import fsPromises from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {parseTodoFile} from "../src/runtime/todo-store.js";

async function fixture(t:import("node:test").TestContext){const dir=await mkdtemp(join(tmpdir(),"asen-todo-"));t.after(()=>rm(dir,{recursive:true,force:true}));return join(dir,"todos.json");}
const one={sessionId:"session-one",projectId:"/project"},other={sessionId:"session-two",projectId:"/project"};

test("Todo task state, history and session isolation survive a process reopen",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Review changes",one);let rows=await store.list(one);assert.equal(rows[0]?.current.state,"planned");
 await store.update(todo.taskId,one,1,"running");await store.update(todo.taskId,one,2,"done","verified");
 const reopened=await SessionTodoStore.open(file);rows=await reopened.list(one);assert.equal(rows[0]?.current.state,"done");assert.equal(rows[0]?.current.revision,3);assert.deepEqual((await reopened.history(todo.taskId,one)).map(event=>event.state),["planned","running","done"]);assert.deepEqual(await reopened.list(other),[]);assert.deepEqual(await reopened.history(todo.taskId,other),[]);
});

test("running Todo work becomes blocked after restart and is never resumed automatically",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Validate deployment",one);await store.update(todo.taskId,one,1,"running");
 const reopened=await SessionTodoStore.open(file);await reopened.recover(one);const current=(await reopened.list(one))[0]!.current;assert.equal(current.state,"blocked");assert.match(current.reason!,/restarted.*explicit review/i);assert.equal(current.revision,3);assert.equal((await reopened.history(todo.taskId,one)).at(-1)?.state,"blocked");
});

test("session startup recovery changes only the matching session and project",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),first=await store.add("First session",one),second=await store.add("Other session",other),third=await store.add("Other project",{sessionId:one.sessionId,projectId:"/other-project"});
 await store.update(first.taskId,one,1,"running");await store.update(second.taskId,other,1,"running");await store.update(third.taskId,{sessionId:one.sessionId,projectId:"/other-project"},1,"running");
 const reopened=await SessionTodoStore.open(file);await reopened.recover(one);
 assert.equal((await reopened.list(one))[0]?.current.state,"blocked");assert.equal((await reopened.list(other))[0]?.current.state,"running");assert.equal((await reopened.list({sessionId:one.sessionId,projectId:"/other-project"}))[0]?.current.state,"running");
 await reopened.recover(other);assert.equal((await reopened.list(other))[0]?.current.state,"blocked");assert.equal((await reopened.list({sessionId:one.sessionId,projectId:"/other-project"}))[0]?.current.state,"running");
});

test("an abrupt process exit blocks only its own running Todo tasks and preserves completed work",async t=>{
 const file=await fixture(t),crash=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/todo-crash-process.ts"),file,process.cwd(),"/other-project"],{encoding:"utf8",timeout:30000});
 assert.equal(crash.status,23,`${crash.error?.message??""}\n${crash.stderr}`);
 const reopened=await SessionTodoStore.open(file),active={sessionId:"todo-session-a",projectId:process.cwd()},foreignSession={sessionId:"todo-session-b",projectId:process.cwd()},foreignProject={sessionId:"todo-session-a",projectId:"/other-project"};
 assert.equal((await reopened.list(active)).find(item=>item.title==="active running task")?.current.state,"running");
 assert.equal((await reopened.list(active)).find(item=>item.title==="finished task")?.current.state,"done");
 await reopened.recover(active);
 assert.equal((await reopened.list(active)).find(item=>item.title==="active running task")?.current.state,"blocked");
 assert.match((await reopened.list(active)).find(item=>item.title==="active running task")?.current.reason??"",/restarted.*explicit review/i);
 assert.equal((await reopened.list(active)).find(item=>item.title==="finished task")?.current.state,"done");
 assert.equal((await reopened.list(foreignSession))[0]?.current.state,"running");
 assert.equal((await reopened.list(foreignProject))[0]?.current.state,"running");
});

test("Todo rejects stale revisions and impossible transitions under concurrent updates",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Fix issue",one);
 const results=await Promise.allSettled([store.update(todo.taskId,one,1,"running"),store.update(todo.taskId,one,1,"cancelled")]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
 const current=(await store.list(one))[0]!.current;await assert.rejects(()=>store.update(todo.taskId,one,1,"planned"),/revision conflict/);await assert.rejects(()=>store.update(todo.taskId,one,current.revision,"planned"),/Invalid task transition/);
});

test("cancelling an update waiting for the Todo store lock leaves durable state unchanged",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Keep the existing state",one);
 await writeFile(`${file}.lock`,JSON.stringify({pid:process.pid,token:"live-owner",createdAt:Date.now()}));
 const controller=new AbortController(),pending=store.update(todo.taskId,one,1,"running",undefined,controller.signal);
 await new Promise(resolve=>setTimeout(resolve,30));controller.abort();await assert.rejects(pending,error=>(error as Error).name==="AbortError"&&/Todo update cancelled/.test((error as Error).message));
 assert.equal((await store.list(one))[0]?.current.state,"planned");assert.equal((await store.history(todo.taskId,one)).length,1);
});

test("cancellation after atomic Todo persistence starts lets the whole transaction commit",{concurrency:false},async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Atomic commit boundary",one),originalOpen=fsPromises.open.bind(fsPromises);
 let notifyWrite!:()=>void,releaseWrite!:()=>void;const writeStarted=new Promise<void>(resolve=>{notifyWrite=resolve;}),allowWrite=new Promise<void>(resolve=>{releaseWrite=resolve;});
 t.mock.method(fsPromises,"open",async(...args:Parameters<typeof originalOpen>)=>{
  const handle=await originalOpen(...args);if(String(args[0]).endsWith(".tmp")){const originalWrite=handle.writeFile.bind(handle);t.mock.method(handle,"writeFile",async(...writeArgs:Parameters<typeof handle.writeFile>)=>{notifyWrite();await allowWrite;return originalWrite(...writeArgs);});}return handle;
 });syncBuiltinESMExports();
 const controller=new AbortController();let update:Promise<unknown>|undefined;
 try{
  update=store.update(todo.taskId,one,1,"running",undefined,controller.signal);await writeStarted;controller.abort();releaseWrite();
  await update;assert.equal((await store.list(one))[0]?.current.state,"running");assert.deepEqual((await store.history(todo.taskId,one)).map(event=>event.state),["planned","running"]);
 }finally{releaseWrite();await update?.catch(()=>{});t.mock.restoreAll();syncBuiltinESMExports();}
});

test("corrupt Todo storage is preserved in quarantine and malformed replays fail closed",async t=>{
 const file=await fixture(t);await writeFile(file,"not-json",{mode:0o600});const store=await SessionTodoStore.open(file);assert.ok(store.diagnostics()?.quarantined);assert.equal(await readFile(store.diagnostics()!.quarantined!,"utf8"),"not-json");
 const todo=await store.add("Safe",one),raw=JSON.parse(await readFile(file,"utf8"));raw.items[0].events.push({...raw.items[0].events[0],revision:3,state:"done"});assert.throws(()=>parseTodoFile(JSON.stringify(raw)),/Invalid ASEN Todo store/);assert.equal(todo.events[0]?.state,"planned");
});

test("Todo project identity is bound even when the Pi session id matches",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Build",one);assert.deepEqual(await store.list({sessionId:one.sessionId,projectId:"/other"}),[]);await assert.rejects(()=>store.update(todo.taskId,{sessionId:one.sessionId,projectId:"/other"},1,"running"),/unavailable to this session or project/);
});
