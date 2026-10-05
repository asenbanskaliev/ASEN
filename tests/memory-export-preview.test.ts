import assert from "node:assert/strict";import test from "node:test";import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";import {assertMemoryImportSafe,previewMemoryImport} from "../src/lifecycle/doctor.js";
test("export contains admitted observations relations and summaries and preview does not mutate",()=>{
 const s=new SqliteMemoryStore(":memory:");s.registerSession("p","s1");s.save({id:"a",projectId:"p",sessionId:"s1",kind:"decision",content:"alpha",createdAt:"2026-01-01T00:00:00Z"});s.registerSession("p","s2");s.save({id:"b",projectId:"p",sessionId:"s2",kind:"decision",content:"beta",createdAt:"2026-01-01T00:00:01Z"});s.addRelation({id:"r",sourceId:"a",targetId:"b",relation:"related",expectedProject:"p"});s.endSession("p","s1");s.saveSessionSummary("p","s1","summary");
 const data=s.exportProject("p");assert.deepEqual([data.observations.length,data.relations.length,data.summaries.length],[2,1,1]);const preview=previewMemoryImport(s,data);assert.equal(preview.deletions,0);assert.deepEqual(preview.conflicts,[]);assert.doesNotThrow(()=>assertMemoryImportSafe(preview));assert.equal(s.exportProject("p").observations.length,2);s.close();
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

test("vista previa detecta conflicto de borrado antes de aplicar",()=>{
 const source=new SqliteMemoryStore(":memory:");source.registerSession("p","s");source.save({id:"x",projectId:"p",sessionId:"s",kind:"decision",content:"origen",createdAt:"1"});source.deleteObservation("x","p",true);const data=source.exportProject("p");
 const target=new SqliteMemoryStore(":memory:");target.registerSession("p","t");target.save({id:"x",projectId:"p",sessionId:"t",kind:"decision",content:"destino activo",createdAt:"2"});
 const before=target.exportProject("p");const preview=previewMemoryImport(target,data);assert.deepEqual(preview.conflicts,["x"]);assert.equal(preview.deletions,1);assert.throws(()=>assertMemoryImportSafe(preview),/refused/);assert.deepEqual(target.exportProject("p"),before);
 source.close();target.close();
});

test("round-trip conserva por separado borrado suave y duro",()=>{
 const source=new SqliteMemoryStore(":memory:");source.registerSession("p","s");
 source.save({id:"soft",projectId:"p",sessionId:"s",kind:"decision",content:"contenido suave",createdAt:"1"});
 source.save({id:"hard",projectId:"p",sessionId:"s",kind:"decision",content:"contenido duro",createdAt:"2"});
 source.deleteObservation("soft","p");source.deleteObservation("hard","p",true);
 const exported=source.exportProject("p");assert.deepEqual(exported.deletions?.map(x=>[x.id,x.mode]),[["hard","hard"],["soft","soft"]]);assert.equal(exported.deletions?.find(x=>x.id==="soft")?.item?.content,"contenido suave");assert.equal(exported.deletions?.find(x=>x.id==="hard")?.item,undefined);
 const target=new SqliteMemoryStore(":memory:");target.importProject(exported);assert.deepEqual(target.exportProject("p"),exported);
 source.close();target.close();
});
test("importación rechaza marcador suave manipulado sin efectos",()=>{
 const target=new SqliteMemoryStore(":memory:");target.registerSession("p","s");const before=target.exportProject("p");
 const invalid={version:1 as const,projectId:"p",sessions:[{projectId:"p",sessionId:"s",rootSessionId:"s",status:"live" as const}],observations:[],relations:[],summaries:[],deletions:[{id:"x",projectId:"p",deletedAt:"1",mode:"soft" as const,item:{id:"x",projectId:"otro",sessionId:"s",kind:"decision" as const,content:"no",createdAt:"1"}}]};
 assert.throws(()=>target.importProject(invalid),/Invalid memory import deletion/);assert.deepEqual(target.exportProject("p"),before);target.close();
});

test("exportación queda aislada por proyecto también para borrados",()=>{
 const s=new SqliteMemoryStore(":memory:");s.registerSession("p","sp");s.registerSession("q","sq");
 s.save({id:"p-soft",projectId:"p",sessionId:"sp",kind:"decision",content:"p",createdAt:"1"});s.save({id:"q-hard",projectId:"q",sessionId:"sq",kind:"decision",content:"q",createdAt:"2"});
 s.deleteObservation("p-soft","p");s.deleteObservation("q-hard","q",true);
 assert.deepEqual(s.exportProject("p").deletions?.map(x=>x.id),["p-soft"]);assert.deepEqual(s.exportProject("q").deletions?.map(x=>x.id),["q-hard"]);s.close();
});

test("exportación antigua sin sesiones infiere sesión desde borrado suave",()=>{const source=new SqliteMemoryStore(":memory:");source.registerSession("p","s");source.save({id:"soft",projectId:"p",sessionId:"s",kind:"decision",content:"suave",createdAt:"1"});source.deleteObservation("soft","p");const data=source.exportProject("p");delete data.sessions;const target=new SqliteMemoryStore(":memory:");target.importProject(data);assert.deepEqual(target.exportProject("p").deletions?.map(x=>[x.id,x.mode]),[["soft","soft"]]);source.close();target.close();});

test("repetir importación con borrado suave es idempotente",()=>{const source=new SqliteMemoryStore(":memory:");source.registerSession("p","s");source.save({id:"soft",projectId:"p",sessionId:"s",kind:"decision",content:"suave",createdAt:"1"});source.deleteObservation("soft","p");const data=source.exportProject("p");const target=new SqliteMemoryStore(":memory:");target.importProject(data);assert.doesNotThrow(()=>target.importProject(data));assert.deepEqual(target.exportProject("p"),data);source.close();target.close();});
test("importación rechaza dos marcadores de borrado para el mismo id",()=>{const target=new SqliteMemoryStore(":memory:");const invalid={version:1 as const,projectId:"p",sessions:[{projectId:"p",sessionId:"s",rootSessionId:"s",status:"live" as const}],observations:[],relations:[],summaries:[],deletions:[{id:"x",projectId:"p",deletedAt:"1",mode:"hard" as const},{id:"x",projectId:"p",deletedAt:"2",mode:"hard" as const}]};assert.throws(()=>target.importProject(invalid),/Invalid memory import deletion/);assert.deepEqual(target.exportProject("p").deletions,[]);target.close();});
test("vista previa anticipa conflicto de contenido con el mismo id",()=>{const source=new SqliteMemoryStore(":memory:");source.registerSession("p","s");source.save({id:"x",projectId:"p",sessionId:"s",kind:"decision",content:"origen",createdAt:"1"});const data=source.exportProject("p");const target=new SqliteMemoryStore(":memory:");target.registerSession("p","s");target.save({id:"x",projectId:"p",sessionId:"s",kind:"decision",content:"distinto",createdAt:"1"});const before=target.exportProject("p");const preview=previewMemoryImport(target,data);assert.deepEqual(preview.conflicts,["x"]);assert.throws(()=>assertMemoryImportSafe(preview),/refused/);assert.deepEqual(target.exportProject("p"),before);source.close();target.close();});
