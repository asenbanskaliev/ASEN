import assert from "node:assert/strict";
import test from "node:test";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
import {createMemoryContext} from "../src/memory/context.js";

test("bounded search supports all/any terms and remains project scoped",()=>{
 const db=new SqliteMemoryStore(":memory:");try{
  const a=createMemoryContext(db,{explicit:"A"},"sa"),b=createMemoryContext(db,{explicit:"B"},"sb");
  a.remember({id:"a1",kind:"decision",content:"alpha beta gamma",createdAt:"1"});a.remember({id:"a2",kind:"decision",content:"alpha delta",createdAt:"2"});b.remember({id:"b1",kind:"decision",content:"alpha beta",createdAt:"3"});
  assert.deepEqual(a.searchWithOptions("alpha beta",{matchMode:"all"}).map(x=>x.id),["a1"]);
  assert.deepEqual(new Set(a.searchWithOptions("beta delta",{matchMode:"any"}).map(x=>x.id)),new Set(["a1","a2"]));
  assert.equal(a.searchWithOptions("alpha",{limit:1}).length,1);assert.deepEqual(a.searchWithOptions("   "),[]);
 }finally{db.close();}
});

test("search previews are unicode safe and capped at 300 characters",()=>{
 const db=new SqliteMemoryStore(":memory:");try{const c=createMemoryContext(db,{explicit:"P"},"s");c.remember({id:"p",kind:"summary",content:"needle "+ "😀".repeat(310),createdAt:"1"});const [r]=c.searchPreviews("needle");assert.ok(r);assert.equal(Array.from(r.preview).length,300);assert.equal(r.truncated,true);}finally{db.close();}
});
