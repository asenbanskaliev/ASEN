import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

test("memory survives store restart", async()=>{
  const dir=await mkdtemp(join(tmpdir(),"asen-memory-"));
  const db=join(dir,"memory.db");
  let store=new SqliteMemoryStore(db);
  store.registerSession("p","s");
  store.save({id:"persist",projectId:"p",sessionId:"s",kind:"decision",content:"candidate evidence is immutable",createdAt:"now"});
  store.close();
  store=new SqliteMemoryStore(db);
  store.registerSession("p","s");
  assert.equal(store.get("persist")?.content,"candidate evidence is immutable");
  assert.equal(store.search("p","immutable")[0]?.id,"persist");
  store.close();
});
