import assert from "node:assert/strict";
import test from "node:test";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";
import { MemoryContext } from "../src/memory/context.js";

test("memory search is project scoped", () => {
  const store=new SqliteMemoryStore(":memory:");
  const a=new MemoryContext(store,"A","s1"), b=new MemoryContext(store,"B","s2");
  a.remember({id:"1",kind:"decision",content:"Use SQLite for local memory",createdAt:"now"});
  b.remember({id:"2",kind:"decision",content:"Use SQLite elsewhere",createdAt:"now"});
  assert.deepEqual(a.search("SQLite").map(x=>x.id),["1"]);
  store.close();
});
