import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentNotificationJournal} from "../src/runtime/agents/agent-notification-journal.js";
import {agentParentRoute,agentTerminalWakeOptions} from "../src/runtime/agents/agent-terminal-delivery.js";

const scopeOf=(root:string)=>({sessionId:"sesion-e2b",projectId:join(root,"proyecto")});

test("E2B: despertar sin transporte mantiene la deuda y nunca simula entrega",()=>{
 const source=readFileSync("extensions/asen.ts","utf8");
 const start=source.indexOf("const requestAgentWake=");
 const end=source.indexOf("scheduleAgentWakeAtBoundary=",start);
 assert.ok(start>0&&end>start,"Debe existir el control de despertador Pi");
 const code=source.slice(start,end);
 const debt=code.indexOf("agentWakeOwed={...scope};");
 const initialGuard=code.indexOf('if(typeof pi.sendMessage!=="function")return;');
 const timer=code.indexOf("if(agentWakeTimer)return;");
 const finalGuard=code.indexOf('if(typeof pi.sendMessage!=="function")return;',initialGuard+1);
 const send=code.indexOf('pi.sendMessage({customType:"asen.agent.wake"');
 const clear=code.lastIndexOf("agentWakeOwed=undefined;");
 assert.ok(debt>=0&&initialGuard>debt&&timer>initialGuard,
  "Si el transporte falta antes del temporizador, la deuda queda guardada");
 assert.ok(finalGuard>timer&&send>finalGuard&&clear>send,
  "Si el transporte desaparece antes del envío, no se borra la deuda");
 assert.doesNotMatch(code,/pi\.sendMessage\?\.\(/u);
});

test("E2B: con padre ocupado no lanza otra conversación ni pierde el aviso",()=>{
 const scope={sessionId:"sesion-e2b",projectId:"/proyecto"};
 const state={mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>scope.sessionId},isIdle:()=>false};
 assert.equal(agentParentRoute(state,scope,true),"run");
 assert.equal(agentTerminalWakeOptions(state,scope,true),undefined);
 assert.equal(agentParentRoute(state,scope,false),"hold");
 assert.equal(agentTerminalWakeOptions(state,scope,false),undefined);
 assert.equal(agentParentRoute({...state,isIdle:()=>true},scope,true),"hold");
 assert.deepEqual(agentTerminalWakeOptions({...state,isIdle:()=>true},scope,false),
  {triggerTurn:true,deliverAs:"steer"});
 assert.equal(agentParentRoute({...state,sessionManager:{getSessionId:()=> "otra"}},scope,false),"headless");
});

test("E2B: tras reinicio, una entrega incierta no se repite aunque compitan dos llamadas",async t=>{
 const base=mkdtempSync(join(tmpdir(),"asen-e2b-aviso-"));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const scope=scopeOf(base),journal=new AgentNotificationJournal(join(base,"avisos.json"));
 const row=await journal.record({...scope,id:"agente-a",state:"completed"});
 const claims=await Promise.all([journal.claim(row.eventId,scope),journal.claim(row.eventId,scope)]);
 assert.deepEqual(claims.sort(),[false,true]);
 const restarted=new AgentNotificationJournal(join(base,"avisos.json"));
 const recovery=await restarted.recoveryReview(scope);
 assert.equal(recovery.length,1);
 assert.equal(recovery[0]?.delivery,"attempted");
 assert.equal(recovery[0]?.disposition,"TRANSPORT_UNCERTAIN_DO_NOT_REPLAY");
 assert.equal(recovery[0]?.writerAuthorized,false);
 assert.equal(recovery[0]?.modelConsumedProven,false);
 assert.equal(await restarted.claim(row.eventId,scope),false);
 assert.equal((await restarted.list(scope)).length,1);
});

test("E2B: confirmación de aviso único sin convertirla en permiso de escribir",async t=>{
 const base=mkdtempSync(join(tmpdir(),"asen-e2b-confirmacion-"));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const scope=scopeOf(base),journal=new AgentNotificationJournal(join(base,"avisos.json"));
 const row=await journal.record({...scope,id:"agente-b",state:"failed"});
 assert.equal(await journal.claim(row.eventId,scope),true);
 assert.equal(await journal.markEnqueued(row.eventId,scope),true);
 assert.equal(await journal.markEnqueued(row.eventId,scope),false);
 assert.equal(await journal.acknowledge(row.eventId,scope,"agente-b","failed"),true);
 assert.equal(await journal.acknowledge(row.eventId,scope,"agente-b","failed"),false);
 const review=await new AgentNotificationJournal(join(base,"avisos.json")).recoveryReview(scope);
 assert.equal(review[0]?.disposition,"COORDINATOR_ACK_ONLY_NOT_CONSUMPTION");
 assert.equal(review[0]?.writerAuthorized,false);
 assert.equal(review[0]?.modelConsumedProven,false);
});
