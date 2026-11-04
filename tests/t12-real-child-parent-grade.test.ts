import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Standalone ESM real-child acceptance grader has no TypeScript declarations.
import {gradeRealChildParentConsumption} from "../scripts/t12-real-child-parent-grade.mjs";
const eventId="asen:agent:"+"a".repeat(64)+":terminal",sha="b".repeat(40);
const model="beam";
const fixture=()=>({
 candidateSha:sha,model,
 events:[
  {kind:"child_pi_requested",agentId:"agent-one",role:"explorer"},
  {kind:"child_pi_started",pidObserved:true},
  {kind:"child_pi_selected",agentId:"agent-one",provider:"ollama-cloud",model},
  {kind:"child_pi_finished",agentId:"agent-one",ok:true,hadAgentEnd:true,
   hadAssistantMessage:true,selectionObserved:true,outputSha256:"f".repeat(64)},
  {kind:"result_enqueued",eventId,agentId:"agent-one",options:{triggerTurn:false}},
  {kind:"idle_wake",options:{triggerTurn:true,deliverAs:"steer"}},
  {kind:"parent_turn_start"},
  {kind:"status_inspected",agentId:"agent-one",returnedAgentId:"agent-one",
   returnedState:"completed",taskFound:true},
  {kind:"acknowledged",eventId,returnedEventId:eventId,returnedAgentId:"agent-one",
   returnedState:"completed",confirmed:true},
  {kind:"parent_turn_end"},
 ],
 notice:{eventId,agentId:"agent-one",state:"completed",delivery:"acknowledged"},
});
test("EF-601 real Pi child+parent must both have observed model and durable acknowledgement",()=>{
 const result=gradeRealChildParentConsumption(fixture());
 assert.equal(result.status,"PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED");
 assert.equal(result.childUsesModel,true);
 assert.equal(result.childProvider,"ollama-cloud");
 assert.equal(result.childModel,"beam");
 assert.equal(result.childPiProcessObserved,true);
 assert.equal(result.childAssistantResponseObserved,true);
 assert.equal(result.verifiedParentToolActions,2);
 assert.equal(result.writerAuthorized,false);
 assert.equal(result.humanReadConfirmed,false);
 assert.equal(result.globalFull,false);
});
test("EF-601 fail closed for a simulated child or insufficient real Pi RPC proof",()=>{
 const original=fixture();
 for(const omit of ["child_pi_started","child_pi_selected","child_pi_finished"]){
  const mutated=structuredClone(original);
  mutated.events=mutated.events.filter((e:{kind:string})=>e.kind!==omit);
  assert.throws(()=>gradeRealChildParentConsumption(mutated),/exactly one/u,omit);
 }
 const cases:Array<(x:any)=>void>=[
  x=>x.events[1].pidObserved=false,
  x=>x.events[2].provider="openrouter",
  x=>x.events[2].model="unrelated",
  x=>x.events[2].agentId="foreign-agent",
  x=>x.events[3].ok=false,
  x=>x.events[3].hadAgentEnd=false,
  x=>x.events[3].hadAssistantMessage=false,
  x=>x.events[3].selectionObserved=false,
  x=>x.events[3].outputSha256="fake",
  x=>x.events[3].agentId="foreign-agent",
  x=>x.events[0].role="worker",
  x=>x.events[0].agentId="foreign-agent",
  x=>x.events.push({kind:"child_pi_tool_attempted"}),
  x=>x.events.push({kind:"model_turn_budget_exceeded"}),
  x=>x.notice.delivery="enqueued",
  x=>x.events[8].confirmed=false,
  x=>x.model="paid-model",
 ];
 for(const [i,change] of cases.entries()){
  const value=structuredClone(original);
  change(value);
  assert.throws(()=>gradeRealChildParentConsumption(value),Error,"negative #"+i);
 }
});
test("EF-601 child cannot be considered consumed if the parent starts early or acknowledges before reading",()=>{
 for(const [a,b] of [[3,4],[7,8]] as const){
  const v=fixture();
  const first=v.events[a]!,second=v.events[b]!;
  v.events[a]=second;v.events[b]=first;
  assert.throws(()=>gradeRealChildParentConsumption(v),/Child Pi RPC inference|AFTER idle wake/u);
 }
});
