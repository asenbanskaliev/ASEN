import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Native Pi acceptance grader is a standalone ESM module.
import {gradeParentConsumption} from "../scripts/t12-parent-consumption-grade.mjs";

const sha="a".repeat(40),eventId="asen:agent:"+"b".repeat(64)+":terminal";
const sample=()=>({
 candidateSha:sha,model:"beam",
 events:[
  {kind:"result_enqueued",eventId,agentId:"read-only-child",options:{triggerTurn:false}},
  {kind:"idle_wake",options:{triggerTurn:true,deliverAs:"steer"}},
  {kind:"parent_turn_start"},
  {kind:"status_inspected",agentId:"read-only-child",returnedAgentId:"read-only-child",returnedState:"completed",taskFound:true},
  {kind:"acknowledged",eventId,returnedEventId:eventId,returnedAgentId:"read-only-child",returnedState:"completed",confirmed:true},
  {kind:"parent_turn_end"},
 ],
 notice:{eventId,agentId:"read-only-child",state:"completed",delivery:"acknowledged"},
});
test("EF-601 real Pi parent receipt requires a genuine ordered wake, inspection and durable acknowledgement",()=>{
 const result=gradeParentConsumption(sample());
 assert.equal(result.status,"PASS_REAL_PI_PARENT_BOUNDED");
 assert.equal(result.source,"Native Pi TUI with a controlled read-only fixture child");
 assert.equal(result.verifiedParentToolActions,2);
 assert.equal(result.childUsesModel,false);
 assert.equal(result.writerAuthorized,false);
 assert.equal(result.humanReadConfirmed,false);
 assert.equal(result.globalFull,false);
});
test("EF-601 model can never claim parent consumption from enqueue alone",()=>{
 const first=sample();
 for(const missing of ["idle_wake","parent_turn_start","status_inspected","acknowledged","parent_turn_end"]){
  const input=structuredClone(first);
  input.events=input.events.filter((x:{kind:string})=>x.kind!==missing);
  assert.throws(()=>gradeParentConsumption(input),/observed exactly once/u,missing);
 }
});
test("EF-601 stale identity, wrong scope or replay never gains a native Pi acknowledgement",()=>{
 const bad=(change:(x:any)=>void)=>{
  const v=structuredClone(sample());change(v);
  assert.throws(()=>gradeParentConsumption(v));
 };
 bad(v=>v.notice.delivery="enqueued");
 bad(v=>v.events[3].agentId="unrelated-task");
 bad(v=>v.events[3].agentId=undefined);
 bad(v=>v.events[3].taskFound=false);
 bad(v=>v.events[3].taskFound=undefined);
 bad(v=>v.events[3].returnedAgentId="other-agent");
 bad(v=>v.events[3].returnedAgentId=undefined);
 bad(v=>v.events[3].returnedState="failed");
 bad(v=>v.events[3].returnedState=undefined);
 bad(v=>v.events[4].returnedEventId="asen:agent:"+"c".repeat(64)+":terminal");
 bad(v=>v.events[4].returnedEventId=undefined);
 bad(v=>v.events[4].returnedAgentId="other-agent");
 bad(v=>v.events[4].returnedAgentId=undefined);
 bad(v=>v.events[4].returnedState="failed");
 bad(v=>v.events[4].returnedState=undefined);
 bad(v=>v.notice.agentId="other-agent");
 bad(v=>v.notice.state="failed");
 bad(v=>v.events[4].eventId="asen:agent:"+"c".repeat(64)+":terminal");
 bad(v=>v.events.push({...v.events[4]}));
 bad(v=>v.events[1].options.triggerTurn=false);
 bad(v=>v.events[1].options.deliverAs="nextTurn");
 bad(v=>v.events[0].options.triggerTurn=true);
 bad(v=>v.events.push({kind:"writer_authorized"}));
 bad(v=>v.candidateSha="badsha");
 bad(v=>v.model="unapproved-provider");
});
test("EF-601 Pi cannot acknowledge before it actually inspects the exact durable result",()=>{
 const v=sample();
 const inspected=v.events[3]!,ack=v.events[4]!;
 v.events[3]=ack;v.events[4]=inspected;
 assert.throws(()=>gradeParentConsumption(v),/AFTER idle wake/u);
});
