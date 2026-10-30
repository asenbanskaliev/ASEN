import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test,{type TestContext} from "node:test";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";

type RelationHook=()=>void;
class PublicRelationBarrierStore extends SqliteMemoryStore{
 #nextHook:RelationHook|undefined;
 afterObservationsOnce(hook:RelationHook):void{assert.equal(this.#nextHook,undefined);this.#nextHook=hook;}
 override listRelations(projectId:string,observationId?:string){
  const hook=this.#nextHook;this.#nextHook=undefined;hook?.();
  return super.listRelations(projectId,observationId);
 }
}

function save(store:SqliteMemoryStore,id:string,projectId:string,sessionId:string,content=id):void{
 store.save({id,projectId,sessionId,kind:"decision",content,createdAt:"2026-01-01T00:00:00Z"});
}

async function ownedStores(t:TestContext,prefix:string):Promise<{reader:PublicRelationBarrierStore;writer:SqliteMemoryStore}>{
 const directory=await mkdtemp(join(tmpdir(),prefix)),database=join(directory,"memory.sqlite");
 const reader=new PublicRelationBarrierStore(database),writer=new SqliteMemoryStore(database);
 t.after(async()=>{writer.close();reader.close();await rm(directory,{recursive:true,force:true});});
 return {reader,writer};
}

test("exportProject keeps one WAL snapshot while a public writer commits every exported table",async t=>{
 const {reader,writer}=await ownedStores(t,"asen-memory-export-snapshot-");
 reader.registerSession("p","root");reader.registerSession("p","old");
 save(reader,"a","p","old","alpha");save(reader,"c","p","root","soft candidate");save(reader,"d","p","root","hard candidate");
 reader.registerSession("q","q-root");save(reader,"q-only","q","q-root","other project");
 const prewrite=reader.exportProject("p"),otherProject=reader.exportProject("q");
 assert.deepEqual(prewrite.sessions?.map(x=>[x.sessionId,x.status]),[["old","live"],["root","live"]]);
 assert.deepEqual(prewrite.observations.map(x=>x.id),["a","c","d"]);assert.deepEqual(prewrite.relations,[]);assert.deepEqual(prewrite.summaries,[]);assert.deepEqual(prewrite.deletions,[]);
 let barrierCalls=0,stimulusCalls=0,completedWriterStimuli=0;
 reader.afterObservationsOnce(()=>{
  barrierCalls++;
  writer.registerSession("p","new");stimulusCalls++;
  save(writer,"b","p","new","beta");stimulusCalls++;
  writer.addRelation({id:"a-b",sourceId:"a",targetId:"b",relation:"related",expectedProject:"p"});stimulusCalls++;
  writer.endSession("p","old","old session complete");stimulusCalls++;
  writer.deleteObservation("c","p");stimulusCalls++;
  writer.deleteObservation("d","p",true);stimulusCalls++;
  completedWriterStimuli++;
 });
 const concurrent=reader.exportProject("p");
 assert.equal(barrierCalls,1);assert.equal(stimulusCalls,6);assert.equal(completedWriterStimuli,1);
 assert.deepEqual(concurrent,prewrite,"export mixed observations with later relation/session/summary/deletion tables");
 const committed=writer.exportProject("p");
 assert.deepEqual(committed.observations.map(x=>x.id),["a","b"]);
 assert.deepEqual(committed.relations.map(x=>[x.id,x.sourceId,x.targetId,x.relation]),[["a-b","a","b","related"]]);
 assert.deepEqual(committed.summaries.map(x=>[x.sessionId,x.content]),[["old","old session complete"]]);
 assert.deepEqual(committed.sessions?.map(x=>[x.sessionId,x.status]),[["new","live"],["old","ended"],["root","live"]]);
 assert.deepEqual(committed.deletions?.map(x=>[x.id,x.mode,x.item?.content]),[["c","soft","soft candidate"],["d","hard",undefined]]);
 assert.deepEqual(reader.exportProject("p"),committed);assert.deepEqual(reader.exportProject("q"),otherProject);
 const imported=new SqliteMemoryStore(":memory:");t.after(()=>imported.close());
 imported.importProject(concurrent);assert.deepEqual(imported.exportProject("p"),prewrite);
 assert.deepEqual(writer.exportProject("p"),committed,"no mutation beyond the six public writer stimuli");
});

test("exportProject propagates a relation failure, releases its read transaction, and leaves both connections writable",async t=>{
 const {reader,writer}=await ownedStores(t,"asen-memory-export-rollback-");
 reader.registerSession("p","root");save(reader,"a","p","root","initial");
 const before=reader.exportProject("p"),sentinel=new Error("owned relation sentinel");let hookCalls=0,caught:unknown;
 reader.afterObservationsOnce(()=>{hookCalls++;throw sentinel;});
 try{reader.exportProject("p");}catch(error){caught=error;}
 assert.equal(caught,sentinel);assert.equal(hookCalls,1);
 assert.deepEqual(reader.exportProject("p"),before);assert.deepEqual(writer.exportProject("p"),before);
 writer.registerSession("p","writer-session");save(writer,"writer-item","p","writer-session","writer succeeded");
 reader.registerSession("p","reader-session");save(reader,"reader-item","p","reader-session","reader succeeded");reader.endSession("p","reader-session","reader ended");
 const importSource=new SqliteMemoryStore(":memory:");t.after(()=>importSource.close());
 importSource.registerSession("p","import-session");save(importSource,"imported-item","p","import-session","import succeeded");reader.importProject(importSource.exportProject("p"));
 const finalFromReader=reader.exportProject("p"),finalFromWriter=writer.exportProject("p");assert.deepEqual(finalFromReader,finalFromWriter);
 assert.deepEqual(finalFromReader.observations.map(x=>x.id),["a","imported-item","reader-item","writer-item"]);
 assert.deepEqual(finalFromReader.sessions?.map(x=>[x.sessionId,x.status]),[["import-session","live"],["reader-session","ended"],["root","live"],["writer-session","live"]]);
 assert.deepEqual(finalFromReader.summaries.map(x=>[x.sessionId,x.content]),[["reader-session","reader ended"]]);
 assert.deepEqual(finalFromReader.relations,[]);assert.deepEqual(finalFromReader.deletions,[]);
});
