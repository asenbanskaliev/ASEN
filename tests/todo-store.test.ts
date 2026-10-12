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

test("Todo creation retries are idempotent across concurrent clients and restarts",async t=>{
 const file=await fixture(t),first=await SessionTodoStore.open(file),second=await SessionTodoStore.open(file),requestId="pi-call:create-task-17";
 const results=await Promise.all([first.add("Prepare release",one,undefined,undefined,requestId),second.add("Prepare release",one,undefined,undefined,requestId)]);
 assert.equal(results[0]?.taskId,results[1]?.taskId);assert.equal((await first.list(one)).length,1);
 const revision=JSON.parse(await readFile(file,"utf8")).revision,reopened=await SessionTodoStore.open(file),retried=await reopened.add("Prepare release",one,undefined,undefined,requestId);
 assert.equal(retried.taskId,results[0]?.taskId);assert.equal((await reopened.history(retried.taskId,one)).length,1);
 assert.equal(JSON.parse(await readFile(file,"utf8")).revision,revision,"an idempotent retry must not rewrite durable state");
 await assert.rejects(()=>reopened.add("Different task",one,undefined,undefined,requestId),/request id conflicts/);
 await assert.rejects(()=>reopened.add("Prepare release",other,undefined,undefined,requestId),/another session or project/);
 assert.equal((await reopened.list(other)).length,0);
});

test("running Todo work becomes blocked after restart and is never resumed automatically",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Validate deployment",one);await store.update(todo.taskId,one,1,"running");
 const reopened=await SessionTodoStore.open(file);await reopened.recover(one);const current=(await reopened.list(one))[0]!.current;assert.equal(current.state,"blocked");assert.match(current.reason!,/restarted.*explicit review/i);assert.equal(current.revision,3);assert.equal((await reopened.history(todo.taskId,one)).at(-1)?.state,"blocked");
 await assert.rejects(()=>reopened.update(todo.taskId,one,2,"done"),/revision conflict/);
 assert.equal((await reopened.list(one))[0]?.current.state,"blocked","a pre-restart plan cannot overwrite recovery review");
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

test("Todo recovery lookup accepts Windows case aliases for the same project root",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Windows path alias",{sessionId:"same-session",projectId:"C:\\Work\\ASEN"});
 const context={sessionId:"same-session",projectId:"c:/work/asen"},alias=await store.list(context);
 assert.equal(alias.some(row=>row.taskId===todo.taskId),process.platform==="win32");
 if(process.platform==="win32"){
  await store.update(todo.taskId,context,1,"running");
  assert.deepEqual((await store.history(todo.taskId,context)).map(event=>event.projectId),["C:\\Work\\ASEN","C:\\Work\\ASEN"]);
 }
});

test("cancelled creation waiting for the Todo lock cannot append a stale task",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file);await store.add("Existing task",one);
 await writeFile(`${file}.lock`,JSON.stringify({pid:process.pid,token:"live-create-owner",createdAt:Date.now()}));
 const controller=new AbortController(),pending=store.add("Cancelled before persistence",one,controller.signal);
 await new Promise(resolve=>setTimeout(resolve,30));controller.abort();await assert.rejects(pending,error=>(error as Error).name==="AbortError");
 assert.deepEqual((await store.list(one)).map(item=>item.title),["Existing task"]);
});

test("independent Todo clients cannot both apply the same saved plan revision",async t=>{
 const file=await fixture(t),first=await SessionTodoStore.open(file),todo=await first.add("One shared plan",one),second=await SessionTodoStore.open(file);
 const revision=(await second.list(one))[0]!.current.revision;
 const results=await Promise.allSettled([first.update(todo.taskId,one,revision,"running"),second.update(todo.taskId,one,revision,"cancelled")]);
 assert.equal(results.filter(result=>result.status==="fulfilled").length,1);assert.equal(results.filter(result=>result.status==="rejected").length,1);
 const reopened=await SessionTodoStore.open(file),history=await reopened.history(todo.taskId,one);
 assert.equal(history.length,2);assert.deepEqual(history.map(event=>event.revision),[1,2]);
 assert.deepEqual(await first.list(one),await second.list(one));
 await assert.rejects(second.update(todo.taskId,one,revision,"running"),/revision conflict/);
 assert.deepEqual(await reopened.history(todo.taskId,other),[]);
});

test("a crash before Todo commit preserves the previous plan and recovers its dead lock",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Preserve committed plan",one),before=await readFile(file,"utf8");
 const crash=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/todo-crash-before-commit.ts"),file,todo.taskId,one.sessionId,one.projectId],{encoding:"utf8",timeout:30000});
 assert.equal(crash.status,23,`${crash.error?.message??""}\n${crash.stderr}`);
 const marker=JSON.parse(crash.stdout.trim());assert.equal(marker.boundary,"before-commit");
 assert.equal(await readFile(file,"utf8"),before,"uncommitted temporary bytes must never replace the durable plan");
 assert.equal(parseTodoFile(await readFile(marker.temporary,"utf8")).items[0]?.events.at(-1)?.state,"running");
 const owner=JSON.parse(await readFile(`${file}.lock`,"utf8"));assert.equal(owner.pid,crash.pid);
 const reopened=await SessionTodoStore.open(file);assert.equal((await reopened.list(one))[0]?.current.state,"planned");
 // Advance only the lock's wall-clock observation past its existing stale-owner grace period.
 const realNow=Date.now;t.mock.method(Date,"now",()=>realNow()+31_000);
 try{await reopened.update(todo.taskId,one,1,"running");}finally{t.mock.restoreAll();}
 assert.deepEqual((await reopened.history(todo.taskId,one)).map(event=>event.revision),[1,2]);
 assert.equal((await reopened.list(one))[0]?.current.state,"running");
 await assert.rejects(readFile(`${file}.lock`),error=>(error as NodeJS.ErrnoException).code==="ENOENT");
});

test("simultaneous Todo startup quarantines corrupted bytes once without losing recovery",async t=>{
 const file=await fixture(t),corrupt="{broken todo data";await writeFile(file,corrupt,{mode:0o600});
 const opened=await Promise.allSettled([SessionTodoStore.open(file),SessionTodoStore.open(file)]);
 assert.equal(opened.filter(result=>result.status==="fulfilled").length,2);
 const stores=opened.flatMap(result=>result.status==="fulfilled"?[result.value]:[]),quarantined=stores.flatMap(store=>store.diagnostics()?.quarantined?[store.diagnostics()!.quarantined!]:[]);
 assert.equal(quarantined.length,1);assert.equal(await readFile(quarantined[0]!,"utf8"),corrupt);
 await stores[0]!.add("First safe task",one);await stores[1]!.add("Second safe task",other);
 assert.equal((await stores[0]!.list(one)).length,1);assert.equal((await stores[1]!.list(other)).length,1);
});

test("a Todo commit failure preserves durable history and permits a clean retry",{concurrency:false},async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Retry safely",one),before=await readFile(file,"utf8"),originalRename=fsPromises.rename.bind(fsPromises);
 t.mock.method(fsPromises,"rename",async(...args:Parameters<typeof originalRename>)=>{
  if(String(args[1])===file&&String(args[0]).endsWith(".tmp"))throw Object.assign(new Error("Injected Todo commit failure"),{code:"EIO"});
  return originalRename(...args);
 });syncBuiltinESMExports();
 try{
  await assert.rejects(store.update(todo.taskId,one,1,"running"),error=>(error as NodeJS.ErrnoException).code==="EIO");
  assert.equal(await readFile(file,"utf8"),before);assert.deepEqual((await store.history(todo.taskId,one)).map(event=>event.state),["planned"]);
  await assert.rejects(readFile(`${file}.lock`),error=>(error as NodeJS.ErrnoException).code==="ENOENT");
  const entries=await fsPromises.readdir(join(file,".."));assert.equal(entries.some(name=>name.endsWith(".tmp")),false);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
 await store.update(todo.taskId,one,1,"running");assert.deepEqual((await store.history(todo.taskId,one)).map(event=>event.revision),[1,2]);
});
