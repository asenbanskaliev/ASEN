import assert from "node:assert/strict";import test from "node:test";import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
test("ended session persists exactly one durable summary",()=>{
 const s=new SqliteMemoryStore(":memory:");s.registerSession("p","s");assert.throws(()=>s.saveSessionSummary("p","s","done"),/ended/);s.endSession("p","s");
 const a=s.saveSessionSummary("p","s","done");const b=s.saveSessionSummary("p","s","done");assert.equal(a.createdAt,b.createdAt);assert.equal(s.getSessionSummary("p","s")?.content,"done");
 assert.throws(()=>s.saveSessionSummary("p","s","different"),/already persisted/);assert.throws(()=>s.saveSessionSummary("q","s","done"),/identity/);s.close();
});
test("close event atomically persists one summary and is idempotent",()=>{
 const s=new SqliteMemoryStore(":memory:");s.registerSession("p","close");
 s.endSession("p","close","final summary");
 assert.equal(s.getSessionSummary("p","close")?.content,"final summary");
 assert.doesNotThrow(()=>s.endSession("p","close","final summary"));
 assert.throws(()=>s.endSession("p","close","different"),/already persisted/);
 assert.equal(s.getSessionSummary("p","close")?.content,"final summary");s.close();
});
test("invalid close summary leaves session live",()=>{
 const s=new SqliteMemoryStore(":memory:");s.registerSession("p","rollback");
 assert.throws(()=>s.endSession("p","rollback","   "),/summary/);
 s.save({id:"still-live",projectId:"p",sessionId:"rollback",kind:"decision",content:"write after refused close",createdAt:"2026-01-01T00:00:00Z"});
 assert.equal(s.get("still-live")?.content,"write after refused close");s.close();
});
