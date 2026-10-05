import assert from "node:assert/strict";import test from "node:test";import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";import {assertMemoryImportSafe,previewMemoryImport} from "../src/lifecycle/doctor.js";
test("export contains admitted observations relations and summaries and preview does not mutate",()=>{
 const s=new SqliteMemoryStore(":memory:");s.registerSession("p","s1");s.save({id:"a",projectId:"p",sessionId:"s1",kind:"decision",content:"alpha",createdAt:"2026-01-01T00:00:00Z"});s.registerSession("p","s2");s.save({id:"b",projectId:"p",sessionId:"s2",kind:"decision",content:"beta",createdAt:"2026-01-01T00:00:01Z"});s.addRelation({id:"r",sourceId:"a",targetId:"b",relation:"related",expectedProject:"p"});s.endSession("p","s1");s.saveSessionSummary("p","s1","summary");
 const data=s.exportProject("p");assert.deepEqual([data.observations.length,data.relations.length,data.summaries.length],[2,1,1]);const preview=previewMemoryImport(s,data);assert.deepEqual(preview.conflicts,[]);assert.doesNotThrow(()=>assertMemoryImportSafe(preview));assert.equal(s.exportProject("p").observations.length,2);s.close();
});
test("validated export imports losslessly and repeated import is idempotent",()=>{
 const source=new SqliteMemoryStore(":memory:");source.registerSession("p","s1");source.registerSession("p","s2");
 source.save({id:"a",projectId:"p",sessionId:"s1",kind:"decision",content:"alpha",createdAt:"2026-01-01T00:00:00Z"});
 source.save({id:"b",projectId:"p",sessionId:"s2",kind:"decision",content:"beta",createdAt:"2026-01-01T00:00:01Z"});
 source.addRelation({id:"r",sourceId:"a",targetId:"b",relation:"related",expectedProject:"p"});source.markRelationReviewed("r","p");
 source.endSession("p","s1","summary");const exported=source.exportProject("p");
 const target=new SqliteMemoryStore(":memory:");target.importProject(exported);assert.deepEqual(target.exportProject("p"),exported);assert.doesNotThrow(()=>target.importProject(exported));assert.deepEqual(target.exportProject("p"),exported);
 source.close();target.close();
});
test("invalid import refuses atomically without side effects",()=>{
 const target=new SqliteMemoryStore(":memory:");target.registerSession("p","existing");
 const before=target.exportProject("p");
 const invalid={version:1 as const,projectId:"p",sessions:[{projectId:"p",sessionId:"s",rootSessionId:"s",status:"live" as const}],observations:[{id:"a",projectId:"other",sessionId:"s",kind:"decision" as const,content:"bad",createdAt:"2026-01-01T00:00:00Z"}],relations:[],summaries:[]};
 assert.throws(()=>target.importProject(invalid),/Invalid memory import observation/);assert.deepEqual(target.exportProject("p"),before);target.close();
});

test("import restores continuation ancestry even when child sorts before parent",()=>{
 const source=new SqliteMemoryStore(":memory:");source.registerSession("p","z-parent");source.endSession("p","z-parent","parent summary");assert.equal(source.continueSession("p","z-parent","a-child"),"a-child");source.save({id:"child-item",projectId:"p",sessionId:"a-child",kind:"decision",content:"continued",createdAt:"2026-01-01T00:00:00Z"});const exported=source.exportProject("p");
 const target=new SqliteMemoryStore(":memory:");target.importProject(exported);assert.deepEqual(target.exportProject("p"),exported);source.close();target.close();
});

test("exportación e importación conservan borrados sin reactivar memoria",()=>{
 const source=new SqliteMemoryStore(":memory:");source.registerSession("p","s");
 source.save({id:"soft",projectId:"p",sessionId:"s",kind:"decision",content:"borrado suave",createdAt:"2026-01-01T00:00:00Z"});
 source.save({id:"hard",projectId:"p",sessionId:"s",kind:"decision",content:"borrado duro",createdAt:"2026-01-01T00:00:01Z"});
 source.deleteObservation("soft","p");source.deleteObservation("hard","p",true);
 const exported=source.exportProject("p");assert.deepEqual(exported.deletions?.map(x=>x.id),["hard","soft"]);assert.equal(exported.observations.length,0);
 const target=new SqliteMemoryStore(":memory:");target.importProject(exported);
 assert.equal(target.get("soft"),undefined);assert.equal(target.get("hard"),undefined);assert.deepEqual(target.exportProject("p"),exported);
 source.close();target.close();
});
