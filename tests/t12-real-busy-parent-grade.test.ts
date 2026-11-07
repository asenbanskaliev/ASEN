import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The native Pi parent witness grader is standalone ESM.
import {gradeRealChildParentConsumption} from "../scripts/t12-real-child-parent-grade.mjs";
import {readFileSync} from "node:fs";
const id="asen:agent:"+"a".repeat(64)+":terminal",sha="b".repeat(40);
const fixture=()=>({
 candidateSha:sha,model:"beam",route:"busy",
 events:[
  {kind:"parent_turn_start"},
  {kind:"busy_tool_started",parentTurnActive:true},
  {kind:"child_pi_requested",agentId:"busy-child",role:"explorer"},
  {kind:"child_pi_started",pidObserved:true},
  {kind:"child_pi_selected",agentId:"busy-child",provider:"ollama-cloud",model:"beam"},
  {kind:"child_pi_finished",agentId:"busy-child",ok:true,hadAgentEnd:true,
   hadAssistantMessage:true,selectionObserved:true,outputSha256:"f".repeat(64)},
  {kind:"result_enqueued",agentId:"busy-child",eventId:id,
   options:{triggerTurn:true,deliverAs:"steer"},
   parentHostIdle:false,parentTurnActive:true,busyToolActive:true},
  {kind:"busy_tool_finished",parentTurnActive:true},
  {kind:"status_inspected",agentId:"busy-child",returnedAgentId:"busy-child",
   returnedState:"completed",taskFound:true},
  {kind:"acknowledged",eventId:id,returnedEventId:id,returnedAgentId:"busy-child",
   returnedState:"completed",confirmed:true},
  {kind:"parent_turn_end"},
 ],
 notice:{eventId:id,agentId:"busy-child",state:"completed",delivery:"acknowledged"},
});
test("EF-601 native busy parent + real Pi RPC child require steer without idle wake",()=>{
 const proof=gradeRealChildParentConsumption(fixture());
 assert.equal(proof.status,"PASS_REAL_PI_BUSY_PARENT_AND_CHILD_BOUNDED");
 assert.equal(proof.parentRoute,"busy");
 assert.equal(proof.childUsesModel,true);
 assert.equal(proof.verifiedParentToolActions,2);
 assert.equal(proof.globalFull,false);
 assert.equal(proof.writerAuthorized,false);
});
test("EF-601 busy parent rejects idle substitution, synthetic activity and duplicate delivery",()=>{
 const mutate=[
  (v:any)=>v.events[6].options.triggerTurn=false,
  (v:any)=>v.events[6].options.deliverAs="nextTurn",
  (v:any)=>v.events[6].parentHostIdle=true,
  (v:any)=>v.events[6].parentHostIdle=undefined,
  (v:any)=>v.events[6].parentTurnActive=false,
  (v:any)=>v.events[6].busyToolActive=false,
  (v:any)=>v.events[1].parentTurnActive=false,
  (v:any)=>v.events[7].parentTurnActive=false,
  (v:any)=>v.events.splice(7,0,{kind:"idle_wake",options:{triggerTurn:true,deliverAs:"steer"}}),
  (v:any)=>v.events.push({...v.events[6]}),
  (v:any)=>v.events[8].agentId="other-task",
  (v:any)=>v.events[9].confirmed=false,
  (v:any)=>v.notice.delivery="attempted",
  (v:any)=>v.events[5].hadAgentEnd=false,
  (v:any)=>v.events[4].model="paid-model",
  (v:any)=>{const x=v.events[7];v.events[7]=v.events[6];v.events[6]=x;},
 ];
 for(const [i,change] of mutate.entries()){
  const candidate=fixture();change(candidate);
  assert.throws(()=>gradeRealChildParentConsumption(candidate),Error,"negative "+i);
 }
});
test("EF-601 busy Pi model job remains one-shot, provider-scoped, exact-SHA and read-only",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
 const section=workflow.slice(workflow.indexOf("  real-parent-consumption:"),workflow.indexOf("  real-provider-acceptance:"));
 assert.match(section,/github\.run_attempt == 1/u);
 assert.match(section,/github\.event\.head_commit\.message == 'ci: one-time Pi busy-parent Beam proof'/u);
 assert.match(section,/environment: ollama-cloud-beam/u);
 assert.match(section,/ASEN_EXPECTED_SHA: \$\{\{ github\.sha \}\}/u);
 assert.match(section,/ASEN_PARENT_WITNESS_MODE=busy timeout 250s node scripts\/t12-real-child-parent-consumption\.mjs/u);
 assert.match(section,/real-pi-parent-child-busy\.json/u);
 assert.doesNotMatch(section,/writer[_-]authorized\s*:\s*true/iu);
});
