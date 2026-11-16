import test from "node:test";
import assert from "node:assert/strict";
import {compareAgentFlowAB,type AgentFlowBenchmarkObservation} from "../src/review/agent-flow-ab-comparison.js";

const d="a".repeat(64),e="b".repeat(64),sha="a".repeat(40);
function observation(system:"asen"|"reference"):AgentFlowBenchmarkObservation{
 return {
  system,runId:system+"-test-1",commit:sha,
  inputDigest:d,toolsDigest:d,permissionsDigest:d,evidenceDigest:e,
  platform:"linux",modelActual:"nvidia/nemotron-3.5-lightning-30b-a3b",
  thinkingActual:"minimal",workerCount:2,
  durationMs:system==="asen"?2000:2500,
  totalTokens:system==="asen"?80:100,
  costUsd:null,requirementPassed:true,
  escapedCriticalDefects:0,providerReceiptObserved:true
 };
}
test("T09 comparación provisional calcula tiempo/tokens, no coste desconocido ni FULL",()=>{
 const result=compareAgentFlowAB({
  asen:observation("asen"),reference:observation("reference")
 });
 assert.equal(result.status,"ready-for-independent-review");
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.measurements?.durationDifferenceMs,-500);
 assert.equal(result.measurements?.durationDifferencePercent,-20);
 assert.equal(result.measurements?.tokensDifference,-20);
 assert.equal(result.measurements?.costDifferenceUsd,null);
 assert.equal(result.evidenceClaimOnly,true);
 assert.equal(result.globalFull,false);
 assert.equal(result.acceptance,"not-accepted");
});
test("T09 rechaza contextos no equivalentes, sin aparentar comparación",()=>{
 const a=observation("asen"),reference=observation("reference");
 for(const field of ["inputDigest","toolsDigest","permissionsDigest","platform",
  "modelActual","thinkingActual","workerCount"] as const){
  const different=field==="platform"?"darwin":field==="workerCount"?4:field.endsWith("Digest")?e:"otro";
  const result=compareAgentFlowAB({
   asen:{...a,[field]:different} as AgentFlowBenchmarkObservation,
   reference
  });
  assert.equal(result.status,"blocked",field);
  assert.equal(result.measurements,null);
  assert.ok(result.blockers.some(message=>message.includes(field)));
 }
});
test("T09 bloquea falsos recibos, consumos desconocidos y defectos críticos",()=>{
 const a=observation("asen"),b=observation("reference");
 const cases=[
  {...a,providerReceiptObserved:false},
  {...a,totalTokens:null},
  {...a,escapedCriticalDefects:1},
  {...a,requirementPassed:false},
  {...a,runId:b.runId}
 ];
 for(const observation of cases){
  const result=compareAgentFlowAB({asen:observation,reference:b});
  assert.equal(result.status,"blocked");
  assert.equal(result.globalFull,false);
  assert.equal(result.measurements,null);
 }
});
test("T09 entradas malformadas no producen mediciones ni aprobación",()=>{
 const a=observation("asen"),b=observation("reference");
 for(const malformed of [
  {...a,durationMs:-1},{...a,totalTokens:-1},
  {...a,costUsd:-0.1},{...a,inputDigest:"sin huella"},
  {...a,modelActual:"unknown"},{...a,commit:"falso"},
  {...a,system:"inventado"}
 ]){
  assert.throws(()=>compareAgentFlowAB({
   asen:malformed as AgentFlowBenchmarkObservation,reference:b
  }),/Invalid A\/B/u);
 }
});
