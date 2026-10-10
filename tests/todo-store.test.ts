import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
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
 const reopened=await SessionTodoStore.open(file),current=(await reopened.list(one))[0]!.current;assert.equal(current.state,"blocked");assert.match(current.reason!,/restarted.*explicit review/i);assert.equal(current.revision,3);assert.equal((await reopened.history(todo.taskId,one)).at(-1)?.state,"blocked");
});

test("Todo rejects stale revisions and impossible transitions under concurrent updates",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Fix issue",one);
 const results=await Promise.allSettled([store.update(todo.taskId,one,1,"running"),store.update(todo.taskId,one,1,"cancelled")]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
 const current=(await store.list(one))[0]!.current;await assert.rejects(()=>store.update(todo.taskId,one,1,"planned"),/revision conflict/);await assert.rejects(()=>store.update(todo.taskId,one,current.revision,"planned"),/Invalid task transition/);
});

test("corrupt Todo storage is preserved in quarantine and malformed replays fail closed",async t=>{
 const file=await fixture(t);await writeFile(file,"not-json",{mode:0o600});const store=await SessionTodoStore.open(file);assert.ok(store.diagnostics()?.quarantined);assert.equal(await readFile(store.diagnostics()!.quarantined!,"utf8"),"not-json");
 const todo=await store.add("Safe",one),raw=JSON.parse(await readFile(file,"utf8"));raw.items[0].events.push({...raw.items[0].events[0],revision:3,state:"done"});assert.throws(()=>parseTodoFile(JSON.stringify(raw)),/Invalid ASEN Todo store/);assert.equal(todo.events[0]?.state,"planned");
});

test("Todo project identity is bound even when the Pi session id matches",async t=>{
 const file=await fixture(t),store=await SessionTodoStore.open(file),todo=await store.add("Build",one);assert.deepEqual(await store.list({sessionId:one.sessionId,projectId:"/other"}),[]);await assert.rejects(()=>store.update(todo.taskId,{sessionId:one.sessionId,projectId:"/other"},1,"running"),/unavailable to this session or project/);
});
