import assert from "node:assert/strict";
import test from "node:test";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";
import { createMemoryContext } from "../src/memory/context.js";

test("memory search is project scoped", () => {
  const store=new SqliteMemoryStore(":memory:");
  const a=createMemoryContext(store,{explicit:"A"},"s1"), b=createMemoryContext(store,{explicit:"B"},"s2");
  a.remember({id:"1",kind:"decision",content:"Use SQLite for local memory",createdAt:"now"});
  b.remember({id:"2",kind:"decision",content:"Use SQLite elsewhere",createdAt:"now"});
  assert.deepEqual(a.search("SQLite").map(x=>x.id),["1"]);
  store.close();
});
