import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {PiChildOpeningJournal,openVerifiedPiChildSessions} from "../src/runtime/agents/parallel-parent-child-launch.js";

const sha="a".repeat(40);
const intent=(root:string)=>({
 sourceSessionId:"sesion-padre",sourceProjectId:root,batchId:"lote-a",
 expectedHead:sha,roots:[join(root,"hijo-a"),join(root,"hijo-b")],state:"claimed-not-verified" as const
});
function fixture(t:TestContext){
 const root=resolve(mkdtempSync(join(tmpdir(),"asen-pi-hijos-")));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,file:join(root,"intentos.json"),journal:new PiChildOpeningJournal(join(root,"intentos.json"))};
}
test("E2A: sin capacidad nativa de Pi no se crean sesiones ni se consumen intentos",async t=>{
 const f=fixture(t);
 const outcome=await openVerifiedPiChildSessions({
  source:{sessionId:"sesion-padre",projectId:f.root},batchId:"lote-a",
  allocations:[],sessions:{} as never,attempts:f.journal,
 });
 assert.equal(outcome.status,"blocked");assert.equal(outcome.grantsAuthority,false);
 assert.equal(outcome.writerStarted,false);assert.equal(outcome.autoRetry,false);
 assert.deepEqual(await f.journal.inspect(),[]);
});
test("E2A: diario durable de apertura no admite segundo intento ni otra carpeta solapada",async t=>{
 const f=fixture(t);
 await f.journal.claim(intent(f.root));
 const original=readFileSync(f.file,"utf8");
 await assert.rejects(()=>f.journal.claim(intent(f.root)),/duplicado/iu);
 assert.equal(readFileSync(f.file,"utf8"),original);
 assert.equal((await f.journal.inspect()).length,1);
 const second={...intent(f.root),batchId:"lote-b",roots:[join(f.root,"hijo-c"),join(f.root,"hijo-a")]};
 await assert.rejects(()=>f.journal.claim(second),/duplicado/iu);
 assert.equal((await f.journal.inspect()).length,1);
});
test("E2A: dos aperturas concurrentes jamás reclaman el mismo lote",async t=>{
 const f=fixture(t),i=intent(f.root);
 const attempts=await Promise.allSettled([f.journal.claim(i),f.journal.claim(i)]);
 assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(attempts.filter(x=>x.status==="rejected").length,1);
 assert.equal((await f.journal.inspect()).length,1);
});
test("E2A: si el diario está alterado se bloquea sin limpiarlo",async t=>{
 const f=fixture(t);await f.journal.claim(intent(f.root));
 const broken='{"schema":"falsa","records":[]}\n';
 writeFileSync(f.file,broken);
 await assert.rejects(()=>f.journal.inspect(),/inválido/iu);
 await assert.rejects(()=>f.journal.claim({...intent(f.root),batchId:"lote-nuevo",roots:[join(f.root,"x"),join(f.root,"y")]}),/inválido/iu);
 assert.equal(readFileSync(f.file,"utf8"),broken);
});
test("E2A: un adaptador de host inventado no puede abrir árboles falsos",async t=>{
 const f=fixture(t);let calls=0;
 await assert.rejects(()=>openVerifiedPiChildSessions({
  source:{sessionId:"sesion-padre",projectId:f.root},batchId:"lote-a",
  allocations:[{taskId:"a",root:join(f.root,"hijo-a"),sourceRoot:f.root,baseRevision:sha,
   writeSurfaces:["a.ts"],grantsAuthority:false,autoMerge:false},
   {taskId:"b",root:join(f.root,"hijo-b"),sourceRoot:f.root,baseRevision:sha,
   writeSurfaces:["b.ts"],grantsAuthority:false,autoMerge:false}],
  sessions:{} as never,attempts:f.journal,host:{
   openChildSession:async()=>{calls++;return {sessionId:"ficticia",projectId:f.root};},
   inspectChildSession:async()=>true,confirmAttachment:async()=>true,
   validateParent:async()=>{}
  }
 }),/Forged or stale worktree allocation/iu);
 assert.equal(calls,0);assert.deepEqual(await f.journal.inspect(),[]);
});
