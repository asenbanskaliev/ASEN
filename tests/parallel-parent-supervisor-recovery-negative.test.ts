import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {ParentSupervisorClaimJournal} from "../src/runtime/agents/parallel-parent-supervisor-claims.js";

function preparar(t:TestContext){
 const dir=mkdtempSync(join(tmpdir(),"asen-t06-reinicio-negativo-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,"intentos.json");
 const source={sessionId:"pi-origen",projectId:resolve(dir,"origen")};
 const children=[
  {sourceTodoId:"origen-a",childTodoId:"hijo-a",childSessionId:"pi-hijo-a",childProjectId:resolve(dir,"worktree-a")},
  {sourceTodoId:"origen-b",childTodoId:"hijo-b",childSessionId:"pi-hijo-b",childProjectId:resolve(dir,"worktree-b")}
 ];
 return {file,source,children};
}

test("T06 E2B: tras reiniciar, un intento incierto no se repite con otro lote o alcance",async t=>{
 const {file,source,children}=preparar(t);
 const primero=new ParentSupervisorClaimJournal(file);
 const recibo=await primero.claim({source,batchId:"lote-1",children});
 assert.equal(recibo.status,"claimed-not-verified");
 assert.equal(recibo.autoRetry,false);
 assert.equal(recibo.grantsAuthority,false);
 const bytes=readFileSync(file,"utf8");

 // Simula la pérdida del proceso después de guardar la intención,
 // sin afirmar que el Worker llegó a ejecutarse.
 const reiniciado=new ParentSupervisorClaimJournal(file);
 await assert.rejects(()=>reiniciado.claim({
  source,batchId:"lote-1",children:children.map((c,i)=>({
   ...c,childTodoId:"nuevo-hijo-"+i,childSessionId:"nueva-sesion-"+i,
   childProjectId:resolve(file,"otro-"+i)
  }))
 }),/previously claimed/u);
 await assert.rejects(()=>reiniciado.claim({
  source,batchId:"lote-2",children:children.map((c,i)=>({
   ...c,sourceTodoId:"otra-tarea-"+i,childTodoId:"otra-hija-"+i,
   childProjectId:resolve(tmpdir(),"otra-raiz-reinicio-"+i)
  }))
 }),/previously claimed/u);
 assert.equal(readFileSync(file,"utf8"),bytes);
 assert.deepEqual(await reiniciado.listSource(source),[recibo]);
});

test("T06 E2B: dos supervisores independientes compiten sin duplicar sesiones",async t=>{
 const {file,source,children}=preparar(t);
 const a=new ParentSupervisorClaimJournal(file);
 const b=new ParentSupervisorClaimJournal(file);
 const outcomes=await Promise.allSettled([
  a.claim({source,batchId:"lote-a",children}),
  b.claim({source,batchId:"lote-b",children:children.map((c,i)=>({
   ...c,sourceTodoId:"alternativa-"+i,childTodoId:"alternativa-hija-"+i,
   childProjectId:resolve(tmpdir(),"alternativa-worktree-"+i)
  }))})
 ]);
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(outcomes.filter(x=>x.status==="rejected").length,1);
 const rechazo=outcomes.find((x):x is PromiseRejectedResult=>x.status==="rejected");
 assert.ok(rechazo,"Debe existir un intento rechazado");
 assert.match(String(rechazo.reason),/previously claimed/u,
  "Solo un rechazo por duplicado acredita la protección frente a reintentos");
 const persisted=await new ParentSupervisorClaimJournal(file).listSource(source);
 assert.equal(persisted.length,1);
 assert.equal(persisted[0]?.status,"claimed-not-verified");
 assert.equal(persisted[0]?.autoRetry,false);
 assert.equal(persisted[0]?.autoMerge,false);
});
