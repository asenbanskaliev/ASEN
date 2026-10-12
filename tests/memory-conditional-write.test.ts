import test from "node:test";
import assert from "node:assert/strict";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
import {createMemoryContext} from "../src/memory/context.js";

test("conditional memory writes reject stale records and preserve the newer content",t=>{
 const store=new SqliteMemoryStore(":memory:");t.after(()=>store.close());const context=createMemoryContext(store,{explicit:"project"},"session");
 context.remember({id:"task",kind:"decision",topic:"task",content:"initial",createdAt:"now"});const initial=store.get("task")!;
 context.rememberIfUnchanged(initial,{id:"task",kind:"decision",topic:"task",content:"first update",createdAt:"now"});
 assert.throws(()=>context.rememberIfUnchanged(initial,{id:"task",kind:"decision",content:"stale overwrite",createdAt:"now"}),/revision conflict/);
 assert.equal(store.get("task")?.content,"first update");
 const beforePin=store.get("task")!;store.setPinned("task",true);
 assert.throws(()=>store.saveIfUnchanged({...beforePin,content:"overwrite metadata"},beforePin),/revision conflict/);
 assert.equal(store.get("task")?.pinned,true);
});
test("conditional writes bind record identity and require a live owning session",t=>{
 const store=new SqliteMemoryStore(":memory:");t.after(()=>store.close());const context=createMemoryContext(store,{explicit:"project"},"session"),foreign=createMemoryContext(store,{explicit:"other"},"foreign");
 context.remember({id:"task",kind:"decision",content:"initial",createdAt:"now"});const initial=store.get("task")!;
 assert.throws(()=>foreign.rememberIfUnchanged(initial,{id:"task",kind:"decision",content:"foreign",createdAt:"now"}),/identity mismatch/);
 assert.throws(()=>store.saveIfUnchanged({...initial,id:"other-task"},initial),/identity mismatch/);
 store.endSession("project","session");assert.throws(()=>store.saveIfUnchanged({...initial,content:"ended session"},initial),/session is ended/);
 assert.equal(store.get("task")?.content,"initial");
});
test("a backend without conditional persistence cannot silently fall back to overwrite",t=>{
 const store=new SqliteMemoryStore(":memory:");t.after(()=>store.close());const context=createMemoryContext(store,{explicit:"project"},"session");
 context.remember({id:"task",kind:"decision",content:"initial",createdAt:"now"});const initial=store.get("task")!;
 Object.defineProperty(store,"saveIfUnchanged",{value:undefined});
 assert.throws(()=>context.rememberIfUnchanged(initial,{id:"task",kind:"decision",content:"unprotected",createdAt:"now"}),/lacks atomic conditional writes/);
 assert.equal(store.get("task")?.content,"initial");
});

test("atomic task creation never replaces an existing or deleted record",t=>{
 const store=new SqliteMemoryStore(":memory:");t.after(()=>store.close());const context=createMemoryContext(store,{explicit:"project"},"session");
 const item={id:"task",kind:"decision" as const,content:"saved plan",createdAt:"now"};context.rememberNew(item);
 assert.throws(()=>context.rememberNew({...item,content:"replacement"}),/already exists/);assert.equal(store.get("task")?.content,"saved plan");
 store.deleteObservation("task","project",true);assert.throws(()=>context.rememberNew(item),/deleted/);assert.equal(store.get("task"),undefined);
 context.rememberNew({...item,id:"fresh-task"});assert.equal(store.get("fresh-task")?.content,"saved plan");
});
