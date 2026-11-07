import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {preparePairPlan,attestPairHostSessions} from "../scripts/r4-two-pi-native-hosts.mjs";
const sha="a".repeat(40),referenceSha="1f74e9e24473e7e121a96b1680444ae0196d3009";
const baseline=JSON.parse(readFileSync(new URL("../registry/parity/shell-asen-baseline-v1.json",import.meta.url),"utf8"));
const scenarios=JSON.parse(readFileSync(new URL("../registry/parity/shell-asen-case-readiness-v1.json",import.meta.url),"utf8"));
const plan=()=>preparePairPlan({candidateSha:sha,baseline,scenarios});
const host=source=>({source,candidateSha:sha,referenceSha,
 runtimeHost:"@earendil-works/pi-coding-agent",runtimeVersion:"1.2.0",
 outputDigest:"a".repeat(64),projectFingerprint:"b".repeat(64),
 sessionStartObserved:true,nativeExtensionLoaded:true,startupCommandIssued:true,
 modelRequests:0,projectModified:false,userAuthorizationGranted:false});
const paired=()=>({SHELL:host("SHELL"),ASEN:host("ASEN")});
test("R4-04 twenty genuine scenarios require exactly two independent Pi hosts, 40 source slots",()=>{
 const p=plan();
 assert.equal(p.schema,"asen-r4-native-pi-pair-plan/v1");
 assert.deepEqual(p.sources,["SHELL","ASEN"]);
 assert.equal(p.version,"4.6.0");
 assert.equal(p.referenceSha,referenceSha);
 assert.equal(p.requiredSlots,40);
 assert.equal(p.sourceCasesExecuted,0);
 assert.equal(p.cases.length,20);
 assert.ok(p.cases.every(x=>x.observations.length===2&&x.blockers.includes("MODEL_AND_FUNCTIONAL_CASE_NOT_RUN")));
 assert.deepEqual(p.cases.filter(x=>x.requiresHumanConsent).map(x=>x.id),
  ["C06","C07","C08","C18","C19","C20"]);
});
test("R4-04 two real Pi host boot receipts never promote even a single functional case",()=>{
 const a=attestPairHostSessions({plan:plan(),hosts:paired(),runId:"987",runAttempt:"1"});
 assert.equal(a.hosts.length,2);
 assert.equal(a.requiredSlots,40);
 assert.equal(a.sourceCasesExecuted,0);
 assert.equal(a.verifiedCasePairs,0);
 assert.equal(a.cases.length,20);
 assert.equal(a.independentReviewPerformed,false);
 assert.equal(a.globalFull,false);
 assert.equal(a.humanConsentReceived,false);
 assert.ok(a.cases.every(x=>x.observations.every(y=>y.hostBootVerified&&y.scenarioExecuted===false)));
});
test("R4-04 refuses third source, missing host, foreign SHA and fake model-free sessions",()=>{
 const base=paired();
 const bad=[
  {...base,B:host("B")},
  {SHELL:base.SHELL},
  {...base,SHELL:{...base.SHELL,candidateSha:"c".repeat(40)}},
  {...base,ASEN:{...base.ASEN,sessionStartObserved:false}},
  {...base,SHELL:{...base.SHELL,nativeExtensionLoaded:false}},
  {...base,SHELL:{...base.SHELL,projectModified:true}},
  {...base,ASEN:{...base.ASEN,modelRequests:1}},
  {...base,SHELL:{...base.SHELL,userAuthorizationGranted:true}},
  {...base,ASEN:{...base.ASEN,projectFingerprint:"f".repeat(64)}},
 ];
 for(const hosts of bad)assert.throws(()=>attestPairHostSessions({
  plan:plan(),hosts,runId:"987",runAttempt:"1"}));
});
test("R4-04 detects stale version, extra scenario, wrong SHA and paid-model budget",()=>{
 for(const corrupted of [
  {candidateSha:"bad",baseline,scenarios},
  {candidateSha:sha,baseline:{...baseline,slotsRequired:60},scenarios},
  {candidateSha:sha,baseline,scenarios:{...scenarios,sources:["SHELL","B","ASEN"]}},
  {candidateSha:sha,baseline,scenarios,modelBudget:4},
 ])assert.throws(()=>preparePairPlan(corrupted));
});
test("R4-04 missing run provenance cannot produce exact-SHA host receipt",()=>{
 assert.throws(()=>attestPairHostSessions({plan:plan(),hosts:paired(),runId:"0",runAttempt:"1"}));
 assert.throws(()=>attestPairHostSessions({plan:plan(),hosts:paired(),runId:"5",runAttempt:"0"}));
});
