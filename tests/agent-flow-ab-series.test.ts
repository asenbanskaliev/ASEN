import test from "node:test";
import assert from "node:assert/strict";
import {compareAgentFlowABSeries} from "../src/review/agent-flow-ab-series.js";
import type {AgentFlowBenchmarkObservation} from "../src/review/agent-flow-ab-comparison.js";

const d="a".repeat(64),sha="a".repeat(40);
function examples():AgentFlowBenchmarkObservation[]{
 const systems=["asen","reference"] as const,counts=[1,2,4] as const;
 return systems.flatMap((system,i)=>counts.map((workerCount,j)=>({
  system,workerCount,runId:system+"-"+workerCount,commit:i===0?sha:"b".repeat(40),
  inputDigest:d,toolsDigest:d,permissionsDigest:d,
  evidenceDigest:"abcdef"[i*3+j]!.repeat(64),platform:"linux" as const,
  modelActual:"nvidia/nemotron-3.5-lightning-30b-a3b",thinkingActual:"minimal",
  durationMs:(i===0?[6000,4000,3000]:[7000,5000,4000])[j]!,
  totalTokens:100+10*j,costUsd:null,requirementPassed:true,
  escapedCriticalDefects:0,providerReceiptObserved:true
 })));
}
test("T09 serie completa compara los 3 niveles y no inventa costes ni FULL",()=>{
 const report=compareAgentFlowABSeries(examples());
 assert.equal(report.status,"ready-for-independent-review");
 assert.deepEqual(report.blockers,[]);
 assert.equal(report.pairs.length,3);
 assert.equal(report.scaling?.[0]?.asenSpeedup,1.5);
 assert.equal(report.scaling?.[1]?.asenSpeedup,2);
 assert.equal(report.scaling?.[1]?.referenceSpeedup,1.75);
 assert.equal(report.costConclusion,"unknown-without-billing-verification");
 assert.equal(report.acceptance,"not-accepted");
 assert.equal(report.globalFull,false);
});
test("T09 una medida incompatible bloquea toda la serie",()=>{
 for(const patch of [
  {inputDigest:"b".repeat(64)},{toolsDigest:"b".repeat(64)},
  {commit:"f".repeat(40)},{modelActual:"otro/modelo"},
  {providerReceiptObserved:false},{requirementPassed:false},
  {totalTokens:null},{escapedCriticalDefects:1}
 ]){
  const rows=examples();
  rows[1]={...rows[1]!,...patch};
  const report=compareAgentFlowABSeries(rows);
  assert.equal(report.status,"blocked");
  assert.equal(report.scaling,null);
  assert.equal(report.globalFull,false);
 }
});
test("T09 rechaza reuse de recibos y sesiones, aunque los tiempos sean buenos",()=>{
 for(const field of ["runId","evidenceDigest"] as const){
  const rows=examples();
  rows[5]={...rows[5]!,[field]:rows[0]![field]};
  assert.equal(compareAgentFlowABSeries(rows).status,"blocked");
 }
});
test("T09 entradas incompletas o duplicadas no generan mediciones",()=>{
 const rows=examples();
 assert.throws(()=>compareAgentFlowABSeries(rows.slice(1)),/exactly six/u);
 rows[4]={...rows[4]!,system:"asen",workerCount:1};
 assert.throws(()=>compareAgentFlowABSeries(rows),/Duplicate T09/u);
});
