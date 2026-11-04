import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// @ts-expect-error Provider-free source-only readiness contract is a standalone ESM module.
import {buildAgentABCaseReadiness,validateAgentABCaseReadiness} from "../scripts/agent-ab-case-readiness.mjs";
// @ts-expect-error Provider-free comparator has no TypeScript declaration.
import {CASE_IDS} from "../scripts/agent-observable-parity.mjs";

const original=JSON.parse(readFileSync(new URL("../registry/parity/agent-ab-case-readiness-v1.json",import.meta.url),"utf8"));
const candidate="a".repeat(40);
test("EF-002 C01-C20 scenarios are prepared without falsely executing 60 A/B/ASEN slots",()=>{
 const report=buildAgentABCaseReadiness({candidateSha:candidate});
 assert.equal(report.status,"READINESS_ONLY_NOT_EXECUTED");
 assert.equal(report.casesPrepared,20);
 assert.equal(report.sourceSlotsRequired,60);
 assert.equal(report.casesBlocked,20);
 assert.equal(report.evidenceCaptured,0);
 assert.equal(report.referenceCasesExecuted,0);
 assert.equal(report.asenCasesExecuted,0);
 assert.equal(report.modelCalls,0);
 assert.equal(report.humanConsentReceived,false);
 assert.equal(report.globalFull,false);
 assert.deepEqual(report.cases.map((x:{id:string})=>x.id),CASE_IDS);
 assert.deepEqual(report.interactiveCases,["C06","C07","C08","C18","C19","C20"]);
 assert.ok(report.cases.every((x:{stage:string})=>x.stage==="NOT_EXECUTED"));
});
test("EF-701 missing, duplicate or reordered scenario invalidates the C01-C20 case contract",()=>{
 for(const mutator of [
  (m:any)=>m.cases.shift(),
  (m:any)=>{m.cases[1]=structuredClone(m.cases[0]);},
  (m:any)=>{[m.cases[0],m.cases[1]]=[m.cases[1],m.cases[0]];},
  (m:any)=>{m.cases[19].id="C21";},
  (m:any)=>{m.cases[18].stage="PASSED";},
  (m:any)=>{m.cases[18].requiresHumanConsent=false;},
  (m:any)=>{m.cases[15].mode="provider-free-pass";},
  (m:any)=>{m.cases[12].requiredObservableFields=["unknown"];},
  (m:any)=>{m.cases[12].requiredObservableFields=["route","route"];},
  (m:any)=>{m.cases[12].requiredObservableFields=[];},
  (m:any)=>{m.sources=["ASEN","A","B"];},
  (m:any)=>{m.comparisonFields=["route"];},
 ]){
  const mutated=structuredClone(original);
  mutator(mutated);
  assert.throws(()=>validateAgentABCaseReadiness(mutated));
 }
});
test("EF-701 no stale or fabricated candidate SHA can initialize source-only readiness",()=>{
 for(const value of ["not-sha","A".repeat(40),"a".repeat(39),"b".repeat(64),undefined])
  assert.throws(()=>buildAgentABCaseReadiness({candidateSha:value}));
});
