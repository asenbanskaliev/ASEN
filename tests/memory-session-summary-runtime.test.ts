import assert from "node:assert/strict";import test from "node:test";import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
test("ended session persists exactly one durable summary",()=>{
 const s=new SqliteMemoryStore(":memory:");s.registerSession("p","s");assert.throws(()=>s.saveSessionSummary("p","s","done"),/ended/);s.endSession("p","s");
 const a=s.saveSessionSummary("p","s","done");const b=s.saveSessionSummary("p","s","done");assert.equal(a.createdAt,b.createdAt);assert.equal(s.getSessionSummary("p","s")?.content,"done");
 assert.throws(()=>s.saveSessionSummary("p","s","different"),/already persisted/);assert.throws(()=>s.saveSessionSummary("q","s","done"),/identity/);s.close();
});