import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";
import {agentParentRoute,agentTerminalDeliveryOptions,agentTerminalWakeOptions} from "../src/runtime/agent-terminal-delivery.js";

test("EF-601 C13 host routing plus durable journal: busy, idle, compaction and headless stay distinct",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-t12-parent-route-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const ledger=new AgentNotificationJournal(join(root,"notices.json"));
 const scope={sessionId:"s1",projectId:root};
 const base={mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>scope.sessionId}};
 const cases=[
  {name:"busy",context:{...base,isIdle:()=>false},active:true,
   route:"run",send:{triggerTurn:true,deliverAs:"steer"},wake:undefined,delivery:"enqueued"},
  {name:"idle",context:{...base,isIdle:()=>true},active:false,
   route:"idle",send:{triggerTurn:false},wake:{triggerTurn:true,deliverAs:"steer"},delivery:"enqueued"},
  {name:"inconsistent-signals",context:{...base,isIdle:()=>true},active:true,
   route:"hold",send:{triggerTurn:false},wake:undefined,delivery:"pending"},
  {name:"compaction",context:{...base,isIdle:()=>false},active:false,
   route:"hold",send:{triggerTurn:false},wake:undefined,delivery:"pending"},
  {name:"headless",context:{...base,mode:"rpc",isIdle:()=>true},active:false,
   route:"headless",send:{triggerTurn:false},wake:undefined,delivery:"pending"},
 ] as const;
 for(const current of cases){
  const subject={...scope,id:"agent-"+current.name,state:"completed"};
  const row=await ledger.record(subject);
  const route=agentParentRoute(current.context,scope,current.active);
  assert.equal(route,current.route,current.name);
  assert.deepEqual(agentTerminalDeliveryOptions(current.context,scope,current.active),current.send);
  assert.deepEqual(agentTerminalWakeOptions(current.context,scope,current.active),current.wake);
  if(route==="run"||route==="idle"){
   assert.equal(await ledger.claim(row.eventId,scope),true);
   assert.equal(await ledger.markEnqueued(row.eventId,scope),true);
  }else{
   await assert.rejects(()=>ledger.acknowledge(row.eventId,scope,subject.id,"completed"),
    /enqueued before coordinator acknowledgement/u);
  }
  const saved=(await new AgentNotificationJournal(join(root,"notices.json")).list(scope))
   .find(e=>e.eventId===row.eventId);
  assert.equal(saved?.delivery,current.delivery,current.name);
  assert.equal(saved?.eventId,row.eventId);
  assert.equal(await ledger.record(subject).then(x=>x.eventId),row.eventId);
 }
 const stored=await ledger.list(scope);
 assert.equal(stored.length,5);
 assert.equal(stored.filter(x=>x.delivery==="enqueued").length,2);
 assert.equal(stored.filter(x=>x.delivery==="pending").length,3);
 assert.ok(stored.every(x=>x.delivery!=="acknowledged"),
  "Offline host-routing decisions cannot manufacture a real Pi coordinator acknowledgement");
});

test("EF-604 C14/C15 restart after uncertain send never duplicates or silently acknowledges an event",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-t12-parent-uncertain-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const file=join(root,"notices.json"),scope={sessionId:"s1",projectId:root};
 const subject={...scope,id:"possibly-interrupted-child",state:"completed"};
 const first=new AgentNotificationJournal(file);
 const recorded=await first.record(subject);
 assert.equal(await first.claim(recorded.eventId,scope),true);
 // Crash before a transport receipt: a different process opens the durable journal.
 const afterRestart=new AgentNotificationJournal(file);
 assert.equal(await afterRestart.record(subject).then(x=>x.eventId),recorded.eventId);
 assert.equal(await afterRestart.claim(recorded.eventId,scope),false);
 await assert.rejects(()=>afterRestart.acknowledge(recorded.eventId,scope,subject.id,"completed"),
  /enqueued before coordinator acknowledgement/u);
 assert.equal((await afterRestart.list(scope))[0]?.delivery,"attempted");
 await assert.rejects(()=>afterRestart.record({...subject,state:"failed"}),
  /Conflicting terminal outcome/u);
 assert.equal((await new AgentNotificationJournal(file).list(scope))[0]?.delivery,"attempted");
 // No privileged transition to "enqueued" without the actual sender's receipt.
 assert.equal(await afterRestart.markEnqueued(recorded.eventId,scope),true);
 assert.equal((await afterRestart.list(scope))[0]?.delivery,"enqueued");
 assert.equal(await afterRestart.acknowledge(recorded.eventId,scope,subject.id,"completed"),true);
 assert.equal(await afterRestart.acknowledge(recorded.eventId,scope,subject.id,"completed"),false);
 assert.equal((await new AgentNotificationJournal(file).list(scope))[0]?.delivery,"acknowledged");
});
