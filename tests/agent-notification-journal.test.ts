import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {withExclusiveFileLock} from "../src/io/exclusive-file-lock.js";
import {tmpdir} from "node:os";
import {AgentNotificationJournal,agentNoticeEventId} from "../src/runtime/agents/agent-notification-journal.js";
import {isFreshAgentInspection,registerAgentTools} from "../src/agents/pi-agent-tools.js";
const subject={id:"agent-1",sessionId:"session-a",projectId:"/project-a",state:"completed"};
async function fixture(t:import("node:test").TestContext){
 const dir=await mkdtemp(join(tmpdir(),"asen-agent-notice-"));
 t.after(()=>rm(dir,{force:true,recursive:true}));
 const file=join(dir,"journal.json");
 return {file,journal:new AgentNotificationJournal(file)};
}
test("EF-604 verified terminal outcome is pending before transport and survives reopening",async t=>{
 const {file,journal}=await fixture(t);
 const first=await journal.record(subject);
 assert.equal(first.delivery,"pending");
 const next=new AgentNotificationJournal(file);
 assert.deepEqual(await next.list(subject),[first]);
 assert.equal((await next.record(subject)).eventId,first.eventId);
 assert.equal((await next.list(subject)).length,1);
});
test("EF-604 two concurrent processes can claim a terminal notice only once",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 const other=new AgentNotificationJournal(file);
 const claimed=await Promise.all([journal.claim(row.eventId,subject),other.claim(row.eventId,subject)]);
 assert.deepEqual(claimed.sort(),[false,true]);
 assert.equal((await other.list(subject))[0]?.delivery,"attempted");
 assert.equal(await journal.claim(row.eventId,subject),false);
});
test("EF-604 attempted notice remains uncertain after restart, never auto-replayed",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 assert.equal(await journal.claim(row.eventId,subject),true);
 const reopened=new AgentNotificationJournal(file);
 const entries=await reopened.list(subject);
 assert.equal(entries.filter(x=>x.delivery==="pending").length,0);
 assert.equal(entries.filter(x=>x.delivery==="attempted").length,1);
 assert.equal(await reopened.claim(row.eventId,subject),false);
});
test("EF-604 enqueue confirmation is distinct from user consumption and cannot be forged before claim",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 await assert.rejects(()=>journal.markEnqueued(row.eventId,subject),/claimed/);
 await journal.claim(row.eventId,subject);
 assert.equal(await journal.markEnqueued(row.eventId,subject),true);
 assert.equal(await journal.markEnqueued(row.eventId,subject),false);
 const reloaded=(await new AgentNotificationJournal(file).list(subject))[0];
 assert.equal(reloaded?.delivery,"enqueued");
 assert.equal("consumed" in (reloaded??{}),false);
});
test("EF-604 session and project boundaries prevent notice claims and reads",async t=>{
 const {journal}=await fixture(t);
 const row=await journal.record(subject);
 await assert.rejects(()=>journal.claim(row.eventId,{sessionId:"foreign",projectId:subject.projectId}),/unavailable/);
 await assert.rejects(()=>journal.markEnqueued(row.eventId,{sessionId:subject.sessionId,projectId:"/other"}),/unavailable/);
 assert.deepEqual(await journal.list({sessionId:"foreign",projectId:subject.projectId}),[]);
 assert.notEqual(agentNoticeEventId({...subject,sessionId:"foreign"}),row.eventId);
 assert.equal((await journal.list(subject))[0]?.delivery,"pending");
});
test("EF-604 invalid or corrupted journal fails closed and preserves source bytes",async t=>{
 const {file,journal}=await fixture(t);
 const raw=JSON.stringify({schema:"asen.agent-notices/v1",revision:0,entries:[{eventId:"forged",agentId:"bad"}]});
 await writeFile(file,raw);
 await assert.rejects(()=>journal.record(subject),/Invalid ASEN agent notice journal/);
 assert.equal(await readFile(file,"utf8"),raw);
 await assert.rejects(()=>journal.list(subject),/Invalid ASEN agent notice journal/);
});
test("EF-604 control identities cannot poison a persisted event or alias another scope",async t=>{
 const {journal}=await fixture(t);
 await assert.rejects(()=>journal.record({...subject,id:"agent\u001fother"}),/Invalid terminal/);
 await assert.rejects(()=>journal.record({...subject,sessionId:"s\u202e"}),/Invalid terminal/);
 assert.deepEqual(await journal.list(subject),[]);
});

test("EF-601/604 coordinator acknowledgement is atomic and never implied by enqueue",async t=>{
 const {file,journal}=await fixture(t),row=await journal.record(subject);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,subject.id,"completed"),/enqueued/);
 await journal.claim(row.eventId,subject);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,subject.id,"completed"),/enqueued/);
 await journal.markEnqueued(row.eventId,subject);
 const other=new AgentNotificationJournal(file);
 const outcomes=await Promise.all([journal.acknowledge(row.eventId,subject,subject.id,"completed"),
  other.acknowledge(row.eventId,subject,subject.id,"completed")]);
 assert.deepEqual(outcomes.sort(),[false,true]);
 assert.equal((await new AgentNotificationJournal(file).list(subject))[0]?.delivery,"acknowledged");
 assert.equal(await journal.claim(row.eventId,subject),false);
 assert.equal(await journal.markEnqueued(row.eventId,subject),false);
});
test("EF-601/604 foreign scope and forged terminal identity cannot acknowledge",async t=>{
 const {journal}=await fixture(t),row=await journal.record(subject);
 await journal.claim(row.eventId,subject);await journal.markEnqueued(row.eventId,subject);
 await assert.rejects(()=>journal.acknowledge(row.eventId,{...subject,sessionId:"foreign"},subject.id,"completed"),/owned terminal/);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,"other-agent","completed"),/owned terminal/);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,subject.id,"failed"),/owned terminal/);
 assert.equal((await journal.list(subject))[0]?.delivery,"enqueued");
});

test("EF-601 duplicate terminal notification cannot be resent via canonical Windows project aliases",async t=>{
 const {file,journal}=await fixture(t);
 const first={...subject,projectId:"C:\\Work\\ASEN"};
 const alternate={...subject,projectId:"c:\\work\\asen"};
 const original=await journal.record(first);
 await journal.claim(original.eventId,first);
 await journal.markEnqueued(original.eventId,first);
 const again=await new AgentNotificationJournal(file).record(alternate);
 const entries=JSON.parse(await readFile(file,"utf8")).entries;
 if(process.platform==="win32"){
  assert.equal(again.eventId,original.eventId);
  assert.equal(again.delivery,"enqueued");
  assert.equal(entries.length,1);
  assert.equal(await journal.claim(original.eventId,alternate),false);
 }else{
  assert.notEqual(again.eventId,original.eventId);
  assert.equal(entries.length,2,"case-distinct POSIX paths must remain isolated");
  assert.equal((await journal.list(first)).length,1);
  assert.equal((await journal.list(alternate)).length,1);
 }
});
test("EF-601 repeated terminal record from two instances is idempotent even after acknowledgement",async t=>{
 const {file,journal}=await fixture(t),other=new AgentNotificationJournal(file);
 const records=await Promise.all([journal.record(subject),other.record(subject)]);
 assert.equal(records[0]?.eventId,records[1]?.eventId);
 assert.equal((await journal.list(subject)).length,1);
 const eventId=records[0]!.eventId;
 await journal.claim(eventId,subject);await journal.markEnqueued(eventId,subject);
 await journal.acknowledge(eventId,subject,subject.id,"completed");
 assert.equal((await other.record(subject)).delivery,"acknowledged");
 assert.equal((await journal.list(subject)).length,1);
});

test("EF-601/604 rejects a second contradictory terminal result without changing the durable journal",async t=>{
 const {file,journal}=await fixture(t);
 const completed=await journal.record(subject);
 const before=await readFile(file,"utf8");
 await assert.rejects(()=>journal.record({...subject,state:"failed"}),/Conflicting terminal outcome/);
 await assert.rejects(()=>new AgentNotificationJournal(file).record({...subject,state:"cancelled"}),/Conflicting terminal outcome/);
 assert.equal(await readFile(file,"utf8"),before,"No secondary event or revision may be written");
 assert.deepEqual(await journal.list(subject),[completed]);
 assert.equal((await journal.record(subject)).eventId,completed.eventId,"Same outcome stays idempotent");
 const differentSession=await journal.record({...subject,sessionId:"other-session",state:"failed"});
 assert.notEqual(differentSession.eventId,completed.eventId,"A separate owned session is independent");
});
test("EF-601/604 concurrent contradictory terminal writers commit exactly one state",async t=>{
 const {file,journal}=await fixture(t),other=new AgentNotificationJournal(file);
 const outcomes=await Promise.allSettled([
  journal.record({...subject,state:"completed"}),
  other.record({...subject,state:"failed"}),
 ]);
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
 const failure=outcomes.find(x=>x.status==="rejected");
 assert.ok(failure&&failure.status==="rejected");
 assert.match(String(failure.reason),/Conflicting terminal outcome/);
 const persisted=await new AgentNotificationJournal(file).list(subject);
 assert.equal(persisted.length,1);
 const saved=JSON.parse(await readFile(file,"utf8"));
 assert.equal(saved.revision,1);
 assert.equal(saved.entries.length,1);
});
test("EF-604 corrupt legacy journal with contradictory terminal identities fails closed",async t=>{
 const {file,journal}=await fixture(t);
 const original=await journal.record(subject);
 const newer={...original,eventId:agentNoticeEventId({...subject,state:"failed"}),state:"failed"};
 const corrupt=JSON.stringify({schema:"asen.agent-notices/v1",revision:2,entries:[original,newer]})+"\n";
 await writeFile(file,corrupt);
 await assert.rejects(()=>journal.list(subject),/conflicting terminal outcomes/);
 await assert.rejects(()=>journal.record(subject),/conflicting terminal outcomes/);
 assert.equal(await readFile(file,"utf8"),corrupt);
});

test("EF-601/604 restart recovery view preserves all delivery states without a model turn or journal mutation",async t=>{
 const {file,journal}=await fixture(t);
 const cases=[{id:"pending",state:"completed"},{id:"attempted",state:"failed"},{id:"enqueued",state:"cancelled"},{id:"acknowledged",state:"completed"}] as const;
 const notices:Awaited<ReturnType<typeof journal.record>>[]=[];
 for(const value of cases)notices.push(await journal.record({...subject,...value}));
 await journal.claim(notices[1]!.eventId,subject);
 await journal.claim(notices[2]!.eventId,subject);await journal.markEnqueued(notices[2]!.eventId,subject);
 await journal.claim(notices[3]!.eventId,subject);await journal.markEnqueued(notices[3]!.eventId,subject);
 await journal.acknowledge(notices[3]!.eventId,subject,"acknowledged","completed");
 const before=await readFile(file,"utf8"),reopened=new AgentNotificationJournal(file);
 const review=await reopened.recoveryReview(subject);
 const byEventId=new Map(review.map(item=>[item.eventId,item] as const));
 assert.equal(byEventId.size,notices.length,"All terminal notices must survive restart");
 assert.deepEqual(notices.map(note=>byEventId.get(note.eventId)?.delivery),
  ["pending","attempted","enqueued","acknowledged"]);
 assert.deepEqual(notices.map(note=>byEventId.get(note.eventId)?.disposition),[
  "UNCLAIMED_RECHECK_BEFORE_ENQUEUE","TRANSPORT_UNCERTAIN_DO_NOT_REPLAY",
  "ENQUEUED_REQUIRES_COORDINATOR_INSPECTION","COORDINATOR_ACK_ONLY_NOT_CONSUMPTION",
 ]);
 assert.ok(review.every(item=>item.writerAuthorized===false&&item.modelConsumedProven===false));
 assert.ok(review.every(item=>!Object.hasOwn(item,"summary")));
 assert.deepEqual(await reopened.recoveryReview({...subject,sessionId:"foreign"}),[]);
 assert.equal(await readFile(file,"utf8"),before,"Read-only recovery must not claim or replay notices");
 assert.equal(await reopened.claim(notices[1]!.eventId,subject),false,"Uncertain transport cannot be automatically replayed");
});


test("MEGA-B7 una inspección caducada o con el reloj retrocedido no confirma avisos",()=>{
 const origin=1_000_000;
 assert.equal(isFreshAgentInspection(origin,origin),true);
 assert.equal(isFreshAgentInspection(origin,origin+299_999),true);
 assert.equal(isFreshAgentInspection(origin,origin+300_000),true);
 assert.equal(isFreshAgentInspection(origin,origin+300_001),false,
  "El aviso no debe conservar una inspección ya caducada");
 assert.equal(isFreshAgentInspection(origin,origin-1),false,
  "Una hora atrasada no puede hacer revivir permisos de reconocimiento");
 for(const [at,now] of [
  [Number.NaN,origin],[origin,Number.NaN],[Number.POSITIVE_INFINITY,origin],
  [origin,Number.NEGATIVE_INFINITY],[-1,origin],[origin,Number.MAX_SAFE_INTEGER+1]
 ] as const)assert.equal(isFreshAgentInspection(at,now),false);
 for(const invalidWindow of [0,-1,1.5,Number.NaN,Number.POSITIVE_INFINITY]){
  assert.equal(isFreshAgentInspection(origin,origin,invalidWindow),false);
 }
});

test("MEGA-B7 caducar una inspección jamás modifica ni reenvía el diario de avisos",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 assert.equal(await journal.claim(row.eventId,subject),true);
 assert.equal(await journal.markEnqueued(row.eventId,subject),true);
 const before=await readFile(file,"utf8");
 assert.equal(isFreshAgentInspection(100,400_101),false);
 const reopened=new AgentNotificationJournal(file);
 assert.deepEqual((await reopened.recoveryReview(subject)).map(x=>x.delivery),["enqueued"]);
 assert.equal(await reopened.claim(row.eventId,subject),false);
 assert.equal(await readFile(file,"utf8"),before,
  "La comprobación del reloj no muta recibos ni concede reintentos");
});


test("MEGA-B8 el diario conserva fechas válidas si el reloj retrocede entre entrega y reconocimiento",async t=>{
 const {file}=await fixture(t);
 let now="2026-11-19T17:00:00.000Z";
 const first=new AgentNotificationJournal(file,()=>now);
 const row=await first.record(subject);
 const baseline=await readFile(file,"utf8");
 now="2026-11-19T16:00:00.000Z"; // El reloj del equipo retrocedió una hora.
 assert.equal(await first.claim(row.eventId,subject),true);
 assert.equal(await first.markEnqueued(row.eventId,subject),true);
 assert.equal(await first.acknowledge(row.eventId,subject,subject.id,"completed"),true);
 const recovered=new AgentNotificationJournal(file);
 const saved=(await recovered.list(subject))[0];
 assert.equal(saved?.delivery,"acknowledged");
 assert.equal(saved?.createdAt,"2026-11-19T17:00:00.000Z");
 assert.equal(saved?.updatedAt,saved?.createdAt,
  "El diario nunca debe escribir una fecha de transición anterior");
 assert.equal(await recovered.claim(row.eventId,subject),false);
 const parsed=JSON.parse(await readFile(file,"utf8"));
 assert.equal(parsed.revision,4,"El reloj no pierde ni repite ninguna transición");
 assert.notEqual(await readFile(file,"utf8"),baseline);
 now="2026-11-19T19:00:00.000Z";
 const second=await first.record({...subject,id:"agent-tarde"});
 assert.equal(second.createdAt,now);
 assert.equal((await recovered.list(subject)).length,2);
});

test("MEGA-B8 un reloj no válido no corrompe el diario ni concede transiciones",async t=>{
 const {file}=await fixture(t);
 let now="2026-11-19T17:00:00.000Z";
 const journal=new AgentNotificationJournal(file,()=>now);
 const row=await journal.record(subject);
 const before=await readFile(file,"utf8");
 now="hora-no-valida";
 await assert.rejects(()=>journal.claim(row.eventId,subject),/Invalid agent notice clock/u);
 assert.equal(await readFile(file,"utf8"),before);
 assert.equal((await new AgentNotificationJournal(file).list(subject))[0]?.delivery,"pending");
 assert.equal(await new AgentNotificationJournal(file).claim(row.eventId,subject),true);
});


test("EF-606 cancelar tras entrar al bloqueo y durante la lectura conserva el aviso encolado",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 await journal.claim(row.eventId,subject);
 await journal.markEnqueued(row.eventId,subject);
 const before=await readFile(file,"utf8");
 // #change checks once before the lock and once just after entering it. The
 // next observed check therefore models cancellation at the awaited read
 // boundary, immediately before the transaction may mutate the parsed file.
 let checks=0;
 const signal={get aborted(){return ++checks>=3;}} as AbortSignal;
 await assert.rejects(
  ()=>journal.acknowledge(row.eventId,subject,subject.id,"completed",signal),
  (error:any)=>error?.name==="AbortError");
 assert.equal(await readFile(file,"utf8"),before,"La cancelación no puede cambiar un solo byte del diario");
 assert.equal((await journal.list(subject))[0]?.delivery,"enqueued");
});

test("EF-606 cancelar mientras otro proceso mantiene el bloqueo real no reconoce el aviso",{timeout:10000},async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 await journal.claim(row.eventId,subject);
 await journal.markEnqueued(row.eventId,subject);
 const before=await readFile(file,"utf8");
 let locked!:()=>void,unlock!:()=>void;
 const acquired=new Promise<void>(resolve=>{locked=resolve;});
 const released=new Promise<void>(resolve=>{unlock=resolve;});
 const owner=withExclusiveFileLock(file,async()=>{locked();await released;});
 const controller=new AbortController();
 try{
  await acquired;
  const pending=journal.acknowledge(row.eventId,subject,subject.id,"completed",controller.signal);
  let settled=false;
  void pending.then(()=>{settled=true;},()=>{settled=true;});
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(settled,false,"El aviso debe seguir esperando el bloqueo real");
  controller.abort();
  await assert.rejects(pending,(error:unknown)=>error instanceof Error&&error.name==="AbortError");
 }finally{unlock();await owner;}
 assert.equal(await readFile(file,"utf8"),before,"No debe modificarse el diario");
 const recovered=await new AgentNotificationJournal(file).recoveryReview(subject);
 assert.equal(recovered[0]?.delivery,"enqueued");
 assert.equal(recovered[0]?.disposition,"ENQUEUED_REQUIRES_COORDINATOR_INSPECTION");
 assert.equal(await journal.claim(row.eventId,subject),false,"Nunca se reenvía el aviso");
});

test("EF-605 la inspección que caduca durante un bloqueo real no reconoce el aviso",{timeout:10000},async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 await journal.claim(row.eventId,subject);
 await journal.markEnqueued(row.eventId,subject);
 const before=await readFile(file,"utf8");
 let locked!:()=>void,unlock!:()=>void;
 const acquired=new Promise<void>(resolve=>{locked=resolve;});
 const released=new Promise<void>(resolve=>{unlock=resolve;});
 const owner=withExclusiveFileLock(file,async()=>{locked();await released;});
 let now=1000,validations=0;
 try{
  await acquired;
  const pending=journal.acknowledge(row.eventId,subject,subject.id,"completed",undefined,()=>{
   validations++;
   if(!isFreshAgentInspection(1000,now))throw new Error("Inspección caducada mientras esperaba el bloqueo");
  });
  now=301_002;
  unlock();
  await assert.rejects(pending,/Inspección caducada/u);
 }finally{unlock();await owner;}
 assert.equal(validations,1,"La vigencia se comprueba dentro de la transacción protegida");
 assert.equal(await readFile(file,"utf8"),before);
 assert.equal((await journal.list(subject))[0]?.delivery,"enqueued");
});

test("EF-606 bloquea acuses si el coordinador cambia durante un bloqueo real",{timeout:20000},async t=>{
 for(const variant of ["sesión","carpeta","gestor","sin cambios"] as const){
  const {file,journal}=await fixture(t);
  const projectId=await realpath(dirname(file)),sessionId="sesion-origen";
  const record={id:"explorador-"+variant,sessionId,projectId,role:"explorer",state:"completed",summary:"Resultado observado"};
  const row=await journal.record(record);
  await journal.claim(row.eventId,record);await journal.markEnqueued(row.eventId,record);
  const before=await readFile(file,"utf8");
  const tools=new Map<string,any>();
  const fakeRuntime={query:async()=>({record}),list:async()=>[record]};
  registerAgentTools({registerTool(tool:any){tools.set(tool.name,tool);}},
   async()=>fakeRuntime as never,undefined,undefined,journal);
  const context:any={cwd:projectId,mode:"tui",hasUI:true,
   sessionManager:{getSessionId:()=>sessionId},ui:{confirm:async()=>true}};
  await tools.get("asen_agent_status").execute("consulta",{id:record.id},new AbortController().signal,()=>{},context);
  let lockReady!:()=>void,releaseLock!:()=>void,ackCalled!:()=>void;
  const acquired=new Promise<void>(resolve=>{lockReady=resolve;});
  const released=new Promise<void>(resolve=>{releaseLock=resolve;});
  const entered=new Promise<void>(resolve=>{ackCalled=resolve;});
  const lockOwner=withExclusiveFileLock(file,async()=>{lockReady();await released;});
  const originalAck=journal.acknowledge.bind(journal);
  (journal as any).acknowledge=(...args:any[])=>{ackCalled();return originalAck(...args);};
  try{
   await acquired;
   const pending=tools.get("asen_agent_ack").execute("acuse",{eventId:row.eventId},new AbortController().signal,()=>{},context);
   await entered;
   if(variant==="sesión")context.sessionManager.getSessionId=()=>"sesion-ajena";
   if(variant==="carpeta")context.cwd=dirname(projectId);
   if(variant==="gestor")context.sessionManager={getSessionId:()=>sessionId};
   releaseLock();
   if(variant==="sin cambios"){
    const result=await pending;
    assert.equal(result.details.acknowledged,true);
    assert.equal((await journal.list(record))[0]?.delivery,"acknowledged");
   }else{
    await assert.rejects(pending,/Pi coordinator session or project changed/u,variant);
    assert.equal(await readFile(file,"utf8"),before,"Un aviso ajeno no puede cambiar");
    assert.equal((await journal.list(record))[0]?.delivery,"enqueued");
   }
  }finally{releaseLock();await lockOwner;}
 }
});

test("MEGA-B7 la cancelación durante la comprobación final impide reconocer el aviso",async t=>{
 const {file,journal}=await fixture(t);
 const projectId=await realpath(dirname(file)),sessionId="session-pi-cancel";
 const record={id:"agente-prueba",sessionId,projectId,role:"explorer",state:"completed",
  summary:"Inspección real guardada"};
 const row=await journal.record(record);
 await journal.claim(row.eventId,record);
 await journal.markEnqueued(row.eventId,record);
 const tools=new Map<string,any>();
 const fakeRuntime={query:async()=>({record}),list:async()=>[record]};
 registerAgentTools({registerTool(tool:any){tools.set(tool.name,tool);}},
  async()=>fakeRuntime as never,undefined,undefined,journal);
 let calls=0;
 const controller=new AbortController();
 const context:any={cwd:projectId,mode:"tui",hasUI:true,
  sessionManager:{getSessionId:()=>{calls++;return sessionId;}},
  ui:{confirm:async()=>true}};
 const inspect=tools.get("asen_agent_status");
 const acknowledge=tools.get("asen_agent_ack");
 assert.ok(inspect&&acknowledge);
 await inspect.execute("status",{id:record.id},new AbortController().signal,()=>{},context);
 calls=0;
 context.sessionManager.getSessionId=()=>{
  calls++;
  if(calls===2)controller.abort();
  return sessionId;
 };
 await assert.rejects(
  ()=>acknowledge.execute("ack-cancel",{eventId:row.eventId},
   controller.signal,()=>{},context),
  /Agent task cancelled/u);
 assert.ok(calls>=2,"La sesión se volvió a comprobar antes del reconocimiento");
 assert.equal((await journal.list(record))[0]?.delivery,"enqueued",
  "Una cancelación no puede escribir acknowledged");
 context.sessionManager.getSessionId=()=>sessionId;
 const accepted=await acknowledge.execute("ack-valid",{eventId:row.eventId},
  new AbortController().signal,()=>{},context);
 assert.equal(accepted.details.acknowledged,true,
  "Una comprobación nueva y válida sí permite reconocer el mismo aviso");
 assert.equal((await journal.list(record))[0]?.delivery,"acknowledged");
});
