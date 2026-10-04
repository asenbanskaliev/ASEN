import assert from "node:assert/strict";
import test from "node:test";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";

function seed(store:SqliteMemoryStore,project:string,session:string,id:string){
 store.registerSession(project,session);
 store.save({id,projectId:project,sessionId:session,kind:"decision",content:id,createdAt:new Date().toISOString()});
}
test("typed relations are durable and project scoped",()=>{
 const s=new SqliteMemoryStore(":memory:");seed(s,"p","s1","a");seed(s,"p","s2","b");seed(s,"q","s3","c");
 const rel=s.addRelation({id:"r1",sourceId:"a",targetId:"b",relation:"supersedes",expectedProject:"p"});
 assert.equal(rel.relation,"supersedes");assert.deepEqual(s.listRelations("p","a").map(r=>r.id),["r1"]);assert.deepEqual(s.listRelations("q"),[]);
 assert.throws(()=>s.addRelation({id:"r2",sourceId:"a",targetId:"c",relation:"related",expectedProject:"p"}),/ownership/);
 s.close();
});
test("relations reject missing, deleted, self and duplicate edges",()=>{
 const s=new SqliteMemoryStore(":memory:");seed(s,"p","s1","a");seed(s,"p","s2","b");
 assert.throws(()=>s.addRelation({id:"self",sourceId:"a",targetId:"a",relation:"related",expectedProject:"p"}),/differ/);
 assert.throws(()=>s.addRelation({id:"missing",sourceId:"a",targetId:"x",relation:"related",expectedProject:"p"}),/not found/);
 s.addRelation({id:"r1",sourceId:"a",targetId:"b",relation:"related",expectedProject:"p"});
 assert.throws(()=>s.addRelation({id:"r2",sourceId:"a",targetId:"b",relation:"related",expectedProject:"p"}));
 s.deleteObservation("b","p");
 assert.throws(()=>s.addRelation({id:"r3",sourceId:"a",targetId:"b",relation:"compatible",expectedProject:"p"}),/not found/);
 s.close();
});
