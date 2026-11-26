import assert from "node:assert/strict";
import test from "node:test";
import {compareAgentFlowSeries,type AgentFlowScenario,type AgentFlowSeriesPair} from "../src/review/agent-flow-series-comparison.js";
import type {AgentFlowBenchmarkObservation} from "../src/review/agent-flow-ab-comparison.js";

const scenarios=["directo","investigacion","varias-unidades"] as const;
const digest=(n:number)=>n.toString(16).padStart(64,"0");
const sha="a".repeat(40),baseSha="b".repeat(40);
function records():AgentFlowSeriesPair[]{
 const out:AgentFlowSeriesPair[]=[];
 for(let i=0;i<3;i++)for(const repetition of [1,2,3] as const){
  const generate=(system:"asen"|"reference",index:number):AgentFlowBenchmarkObservation=>({
   system,runId:system+"-"+i+"-"+repetition,commit:system==="asen"?sha:baseSha,
   inputDigest:digest(i+1),toolsDigest:digest(10),permissionsDigest:digest(11),
   evidenceDigest:digest(100+index),platform:"linux",modelActual:"local/modelo",
   thinkingActual:"medium",workerCount:i===0?1:2,
   durationMs:system==="asen"?1000+repetition*100:1500+repetition*100,
   totalTokens:system==="asen"?120:160,costUsd:null,
   requirementPassed:true,escapedCriticalDefects:0,providerReceiptObserved:true,
  });
  const pos=i*3+repetition;
  out.push({scenario:scenarios[i]!,repetition,asen:generate("asen",pos*2),
   reference:generate("reference",pos*2+1)});
 }
 return out;
}

test("E4: tres escenarios, tres repeticiones, 18 recibos; coste desconocido sigue sin inventarse",()=>{
 const result=compareAgentFlowSeries(records());
 assert.equal(result.status,"ready-for-independent-review");
 assert.equal(result.runsObserved,18);
 assert.equal(result.measurements.length,3);
 assert.deepEqual(result.blockers,[]);
 for(const item of result.measurements){
  assert.equal(item.repetitions,3);
  assert.ok(item.asenMeanDurationMs<item.referenceMeanDurationMs);
  assert.equal(item.asenTotalTokens,360);
  assert.equal(item.referenceTotalTokens,480);
  assert.equal(item.asenTotalCostUsd,null);
  assert.equal(item.referenceTotalCostUsd,null);
 }
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.globalFull,false);
 assert.equal(result.evidenceClaimOnly,true);
});

test("E4: falta de repeticiones, duplicados, cambio de modelo o de SHA bloquean resultados",()=>{
 const valid=records();
 for(const modified of [
  valid.slice(0,8),
  [...valid.slice(0,8),valid[0]!],
  valid.map((row,i)=>i===5?{...row,asen:{...row.asen,modelActual:"local/otro"}}:row),
  valid.map((row,i)=>i===6?{...row,reference:{...row.reference,commit:"c".repeat(40)}}:row),
  valid.map((row,i)=>i>=3&&i<=5?{...row,asen:{...row.asen,commit:"c".repeat(40)}}:row),
  valid.map((row,i)=>i===4?{...row,asen:{...row.asen,evidenceDigest:valid[0]!.asen.evidenceDigest}}:row),
  valid.map((row,i)=>i===2?{...row,asen:{...row.asen,totalTokens:null}}:row),
  valid.map((row,i)=>i===3?{...row,reference:{...row.reference,providerReceiptObserved:false}}:row),
  valid.map((row,i)=>i===5?{...row,asen:{...row.asen,escapedCriticalDefects:1}}:row),
 ]){
  const result=compareAgentFlowSeries(modified as AgentFlowSeriesPair[]);
  assert.equal(result.status,"blocked");
  assert.ok(result.blockers.length>0);
  assert.equal(result.globalFull,false);
 }
});

test("E4: escenarios distintos requieren entradas distintas y tareas comparables",()=>{
 const valid=records();
 const allSame=valid.map(row=>({...row,asen:{...row.asen,inputDigest:digest(1)},
  reference:{...row.reference,inputDigest:digest(1)}}));
 assert.equal(compareAgentFlowSeries(allSame).status,"blocked");
 const changed=valid.map((row,i)=>i===1?{...row,asen:{...row.asen,inputDigest:digest(24)}}:row);
 assert.equal(compareAgentFlowSeries(changed).status,"blocked");
 const wrong=valid.map((row,i)=>i===3?{...row,scenario:"otro" as AgentFlowScenario}:row);
 assert.throws(()=>compareAgentFlowSeries(wrong),/Unknown scenario/u);
});
