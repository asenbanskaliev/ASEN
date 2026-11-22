import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {ParentSupervisorClaimJournal} from "../src/runtime/agents/parallel-parent-supervisor-claims.js";
import {AgentNotificationJournal} from "../src/runtime/agents/agent-notification-journal.js";

/** Integra diarios reales; NO ejecuta procesos Pi ni autoriza Writers. */
async function escenario(t:TestContext){
 const dir=await mkdtemp(join(tmpdir(),"asen-t2-lote-avisos-"));
 t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 const source={sessionId:"pi-padre",projectId:join(dir,"proyecto")};
 const children=[
  {sourceTodoId:"plan-a",childTodoId:"todo-a",childSessionId:"pi-hijo-a",childProjectId:join(dir,"worktree-a")},
  {sourceTodoId:"plan-b",childTodoId:"todo-b",childSessionId:"pi-hijo-b",childProjectId:join(dir,"worktree-b")}
 ];
 return {dir,source,children,intents:join(dir,"intentos.json"),notices:join(dir,"avisos.json")};
}

test("T2 E2B: lote reclamado, aviso A incierto y aviso B independiente sobreviven al reinicio",async t=>{
 const f=await escenario(t);
 const supervisor=new ParentSupervisorClaimJournal(f.intents);
 const intent=await supervisor.claim({source:f.source,batchId:"lote-e2b",children:f.children});
 assert.equal(intent.status,"claimed-not-verified");
 assert.equal(intent.grantsAuthority,false);
 assert.equal(intent.autoRetry,false);
 assert.equal(intent.autoMerge,false);

 const journal=new AgentNotificationJournal(f.notices);
 const a=await journal.record({...f.source,id:"agente-a",state:"completed"});
 const b=await journal.record({...f.source,id:"agente-b",state:"failed"});
 assert.notEqual(a.eventId,b.eventId);
 assert.equal(await journal.claim(a.eventId,f.source),true);
 const before=await readFile(f.notices,"utf8");

 // Reinicio después de reclamar A: se desconoce si llegó al padre.
 const reloadedSupervisor=new ParentSupervisorClaimJournal(f.intents);
 const reloadedJournal=new AgentNotificationJournal(f.notices);
 const review=await reloadedJournal.recoveryReview(f.source);
 assert.equal(review.find(row=>row.agentId==="agente-a")?.disposition,
  "TRANSPORT_UNCERTAIN_DO_NOT_REPLAY");
 assert.equal(review.find(row=>row.agentId==="agente-b")?.disposition,
  "UNCLAIMED_RECHECK_BEFORE_ENQUEUE");
 assert.equal(await readFile(f.notices,"utf8"),before,
  "La inspección de recuperación nunca debe alterar el diario");
 assert.ok(review.every(row=>row.writerAuthorized===false&&row.modelConsumedProven===false));

 assert.equal(await reloadedJournal.claim(a.eventId,f.source),false,
  "Una entrega incierta nunca se repite");
 assert.equal(await reloadedJournal.claim(b.eventId,f.source),true);
 assert.equal(await reloadedJournal.markEnqueued(b.eventId,f.source),true);
 assert.equal(await reloadedJournal.acknowledge(b.eventId,f.source,"agente-b","failed"),true);
 const recovered=await reloadedJournal.list(f.source);
 assert.equal(recovered.find(row=>row.agentId==="agente-a")?.delivery,"attempted");
 assert.equal(recovered.find(row=>row.agentId==="agente-b")?.delivery,"acknowledged");

 await assert.rejects(()=>reloadedSupervisor.claim({
  source:f.source,batchId:"lote-e2b",children:f.children
 }),/previously claimed/u);
 const saved=await reloadedSupervisor.listSource(f.source);
 assert.equal(saved.length,1);
 assert.equal(saved[0]?.grantsAuthority,false);
 assert.equal(saved[0]?.autoRetry,false);
});

test("T2 E2B: otra sesión o proyecto no hereda el lote ni los avisos",async t=>{
 const f=await escenario(t);
 await new ParentSupervisorClaimJournal(f.intents).claim({
  source:f.source,batchId:"lote-e2b",children:f.children
 });
 const journal=new AgentNotificationJournal(f.notices);
 await journal.record({...f.source,id:"agente-a",state:"completed"});

 const other={sessionId:"pi-otro",projectId:join(f.dir,"otro-proyecto")};
 assert.deepEqual(await new ParentSupervisorClaimJournal(f.intents).listSource(other),[]);
 assert.deepEqual(await new AgentNotificationJournal(f.notices).list(other),[]);
 await assert.rejects(()=>new ParentSupervisorClaimJournal(f.intents).claim({
  source:other,batchId:"lote-distinto",children:f.children
 }),/previously claimed/u);
});
