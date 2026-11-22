import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentNotificationJournal} from "../src/runtime/agents/agent-notification-journal.js";
import {withExclusiveFileLock} from "../src/io/exclusive-file-lock.js";

/**
 * E2B: dos Workers comparten un padre, pero no un resultado ni un permiso.
 * Son pruebas negativas del diario real; NO simulan ejecución Pi ni concesiones Writer.
 */
async function diario(t:import("node:test").TestContext){
 const dir=await mkdtemp(join(tmpdir(),"asen-e2b-dos-workers-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,"avisos.json");
 return {file,primero:new AgentNotificationJournal(file),segundo:new AgentNotificationJournal(file)};
}
const scope={sessionId:"padre-1",projectId:"/proyecto-1"};
const a={...scope,id:"worker-a",state:"completed"};
const b={...scope,id:"worker-b",state:"failed"};

test("E2B dos Workers independientes: una entrega por resultado y reconocimiento propio",async t=>{
 const {file,primero,segundo}=await diario(t);
 const [ra,rb]=await Promise.all([primero.record(a),segundo.record(b)]);
 assert.notEqual(ra.eventId,rb.eventId);
 assert.equal((await primero.list(scope)).length,2);
 const [ca,cb]=await Promise.all([
  primero.claim(ra.eventId,scope),segundo.claim(rb.eventId,scope)
 ]);
 assert.deepEqual([ca,cb],[true,true]);
 assert.equal(await segundo.claim(ra.eventId,scope),false);
 assert.equal(await primero.claim(rb.eventId,scope),false);
 assert.equal(await primero.markEnqueued(ra.eventId,scope),true);
 await assert.rejects(
  ()=>segundo.acknowledge(rb.eventId,scope,b.id,"failed"),/enqueued/
 );
 assert.equal(await segundo.markEnqueued(rb.eventId,scope),true);
 await assert.rejects(
  ()=>primero.acknowledge(ra.eventId,scope,b.id,"completed"),/owned terminal/
 );
 assert.equal(await segundo.acknowledge(rb.eventId,scope,b.id,"failed"),true);
 assert.equal(await primero.acknowledge(ra.eventId,scope,a.id,"completed"),true);
 const restarted=new AgentNotificationJournal(file);
 const rows=await restarted.list(scope);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>row.delivery),["acknowledged","acknowledged"]);
 assert.equal(await restarted.claim(ra.eventId,scope),false);
 assert.equal(await restarted.claim(rb.eventId,scope),false);
 assert.equal(await restarted.record(a).then(row=>row.eventId),ra.eventId);
 assert.equal(await restarted.record(b).then(row=>row.eventId),rb.eventId);
 assert.equal((await restarted.list(scope)).length,2);
});

test("E2B dos instancias compiten por el mismo aviso: solo una puede reclamarlo",async t=>{
 const {file,primero,segundo}=await diario(t);
 const ra=await primero.record(a);
 const resultados=await Promise.all([
  primero.claim(ra.eventId,scope),segundo.claim(ra.eventId,scope)
 ]);
 assert.deepEqual([...resultados].sort(),[false,true],
  "Un mismo aviso no puede reclamarse dos veces aunque compitan dos instancias");
 const restarted=new AgentNotificationJournal(file);
 const rows=await restarted.list(scope);
 assert.equal(rows.length,1);
 assert.equal(rows[0]?.delivery,"attempted");
 assert.equal(await restarted.claim(ra.eventId,scope),false);
 assert.equal((await restarted.recoveryReview(scope))[0]?.disposition,
  "TRANSPORT_UNCERTAIN_DO_NOT_REPLAY");
});

test("E2B caída después de reclamar A: reinicio no repite A y permite completar B",async t=>{
 const {file,primero,segundo}=await diario(t);
 const [ra,rb]=await Promise.all([primero.record(a),segundo.record(b)]);
 assert.equal(await primero.claim(ra.eventId,scope),true);
 // Caída antes de saber si el padre recibió el mensaje de A.
 const before=await readFile(file,"utf8");
 const restarted=new AgentNotificationJournal(file);
 const view=await restarted.recoveryReview(scope);
 assert.equal(view.find(row=>row.agentId===a.id)?.disposition,
  "TRANSPORT_UNCERTAIN_DO_NOT_REPLAY");
 assert.equal(view.find(row=>row.agentId===b.id)?.disposition,
  "UNCLAIMED_RECHECK_BEFORE_ENQUEUE");
 assert.equal(await readFile(file,"utf8"),before,
  "Inspeccionar la recuperación no debe alterar el diario");
 assert.equal(await restarted.claim(ra.eventId,scope),false);
 assert.equal(await restarted.claim(rb.eventId,scope),true);
 assert.equal(await restarted.markEnqueued(rb.eventId,scope),true);
 assert.equal(await restarted.acknowledge(rb.eventId,scope,b.id,"failed"),true);
 assert.equal((await restarted.list(scope)).find(row=>row.agentId===a.id)?.delivery,"attempted");
 assert.equal((await restarted.list(scope)).find(row=>row.agentId===b.id)?.delivery,"acknowledged");
 assert.ok((await restarted.recoveryReview(scope)).every(row=>
  row.writerAuthorized===false&&row.modelConsumedProven===false));
});

test("E2B cancelar el reconocimiento de A no bloquea B ni concede reenvío",async t=>{
 const {file,primero,segundo}=await diario(t);
 const [ra,rb]=await Promise.all([primero.record(a),segundo.record(b)]);
 await primero.claim(ra.eventId,scope);
 await primero.markEnqueued(ra.eventId,scope);
 await segundo.claim(rb.eventId,scope);
 await segundo.markEnqueued(rb.eventId,scope);
 const controller=new AbortController();
 controller.abort();
 await assert.rejects(
  ()=>primero.acknowledge(ra.eventId,scope,a.id,"completed",controller.signal),
  {name:"AbortError"}
 );
 const restarted=new AgentNotificationJournal(file);
 assert.equal((await restarted.list(scope)).find(row=>row.agentId===a.id)?.delivery,"enqueued");
 assert.equal(await restarted.claim(ra.eventId,scope),false);
 assert.equal(await restarted.acknowledge(rb.eventId,scope,b.id,"failed"),true);
 assert.equal((await restarted.list(scope)).find(row=>row.agentId===a.id)?.delivery,"enqueued");
 assert.equal((await restarted.list(scope)).find(row=>row.agentId===b.id)?.delivery,"acknowledged");
 await assert.rejects(
  ()=>restarted.record({...a,state:"cancelled"}),/Conflicting terminal outcome/
 );
 assert.equal((await restarted.list(scope)).length,2);
});


test("E2B cancelar A mientras espera el bloqueo real no afecta al reconocimiento de B",{timeout:10000},async t=>{
 const {file,primero,segundo}=await diario(t);
 const [ra,rb]=await Promise.all([primero.record(a),segundo.record(b)]);
 await primero.claim(ra.eventId,scope);
 await primero.markEnqueued(ra.eventId,scope);
 await segundo.claim(rb.eventId,scope);
 await segundo.markEnqueued(rb.eventId,scope);
 const before=await readFile(file,"utf8");
 let locked!:()=>void,unlock!:()=>void;
 const acquired=new Promise<void>(resolve=>{locked=resolve;});
 const released=new Promise<void>(resolve=>{unlock=resolve;});
 const owner=withExclusiveFileLock(file,async()=>{locked();await released;});
 const controller=new AbortController();
 let abortedChecks=0,retryObserved!:()=>void;
 const contention=new Promise<void>(resolve=>{retryObserved=resolve;});
 // #change comprueba la señal antes de preparar el archivo; el bloqueo
 // vuelve a comprobarla al intentar entrar y en su espera tras EEXIST.
 // La tercera lectura prueba que se ha alcanzado la espera, no solo que
 // ha transcurrido un plazo mientras seguía preparando el archivo.
 const signal=new Proxy(controller.signal,{
  get(target,key){
   if(key==="aborted"){
    if(++abortedChecks===3)retryObserved();
    return target.aborted;
   }
   const value=Reflect.get(target,key,target);
   return typeof value==="function"?value.bind(target):value;
  },
 });
 try{
  await acquired;
  const pending=primero.acknowledge(ra.eventId,scope,a.id,"completed",signal);
  void pending.catch(()=>{});
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  const fallback=new Promise<boolean>(resolve=>{watchdog=setTimeout(()=>resolve(false),4000);});
  const reached=await Promise.race([contention.then(()=>true),fallback]);
  if(watchdog)clearTimeout(watchdog);
  assert.equal(reached,true,"El reconocimiento de A debe haber llegado a la espera del bloqueo");
  controller.abort();
  await assert.rejects(pending,(error:unknown)=>error instanceof Error&&error.name==="AbortError");
 }finally{controller.abort();unlock();await owner;}
 assert.equal(await readFile(file,"utf8"),before,"La cancelación no puede modificar el diario");
 const restarted=new AgentNotificationJournal(file);
 assert.equal((await restarted.list(scope)).find(row=>row.agentId===a.id)?.delivery,"enqueued");
 assert.equal(await restarted.claim(ra.eventId,scope),false,"Nunca reenviar A por haber cancelado el acuse");
 assert.equal(await restarted.acknowledge(rb.eventId,scope,b.id,"failed"),true);
 assert.equal((await restarted.list(scope)).find(row=>row.agentId===b.id)?.delivery,"acknowledged");
});
