import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Deliberately JavaScript-only, provider-free acceptance helper.
import {buildT12AcceptanceLedger} from "../scripts/t12-acceptance-ledger.mjs";

const sha="a".repeat(40);
const real=()=>({
 passed:true,status:"PASS_BOUNDED_READ_ONLY",candidateSha:sha,
 provider:"ollama-cloud",model:"beam",inferenceCalls:5,
 explorer:"PASS",planner:"PASS",reviewer:"PASS_TWO_JUDGMENTS",verifier:"PASS_NEGATIVE_REJECTION",
 toolsAllowed:false,writer:"BLOCKED_INTERACTIVE",authorization:"NOT_GRANTED",
 liveProviderRecovery:"NOT_VERIFIED",independentAudit:"NOT_PERFORMED",
});

test("F7 exact-SHA offline results cannot be promoted to a global FULL",()=>{
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true});
 assert.equal(report.globalStatus,"PARTIAL");
 assert.equal(report.globalFull,false);
 assert.equal(report.classification,"SELF_ASSESSED_PROVIDER_FREE");
 assert.equal(report.externalCi,"NOT_ASSERTED_BY_THIS_REPORT");
 assert.equal(report.units.F2,"PASS_PROVIDER_FREE_ONLY");
 assert.equal(report.units.F5,"PARTIAL_REAL_VERIFIER_MISSING");
 assert.equal(report.units.F4,"BLOCKED_INTERACTIVE");
 assert.equal(report.units.F6,"PARTIAL_REAL_PROVIDER_RECOVERY_MISSING");
 assert.equal(report.units.F7,"SELF_AUDIT_ONLY");
 assert.equal(report.liveProviderEvidence,"NOT_RUN");
});
test("F7 bounded, fully validated read-only evidence never grants Writer or live recovery",()=>{
 const result=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:real()});
 assert.equal(result.evidenceType,"REAL_READ_ONLY_PLUS_PROVIDER_FREE");
 assert.equal(result.units.F5,"PASS_BOUNDED_NEGATIVE_REJECTION");
 assert.equal(result.units.F2,"PASS_REAL_READ_ONLY");
 assert.equal(result.globalFull,false);
 assert.equal(result.units.F4,"BLOCKED_INTERACTIVE");
 assert.equal(result.units.F6,"PARTIAL_REAL_PROVIDER_RECOVERY_MISSING");
 assert.equal(result.independentAudit,"NOT_PERFORMED");
});
test("F7 rejects failed, stale, incomplete or forged provider reports",()=>{
 const valid=real(),input={sha,offlineConfirmed:true};
 assert.throws(()=>buildT12AcceptanceLedger({...input,offlineConfirmed:false}),
  /provider-free tests must have completed/);
 assert.throws(()=>buildT12AcceptanceLedger({...input,sha:"bad"}),/exact SHA/);
 const mutations=[
  {...valid,candidateSha:"b".repeat(40)},
  {...valid,passed:false},
  {...valid,status:"VERIFIER_EVIDENCE_INCOMPLETE"},
  {...valid,writer:"AUTHORIZED"},
  {...valid,authorization:"GRANTED"},
  {...valid,independentAudit:"PASS"},
  {...valid,liveProviderRecovery:"VERIFIED"},
  {...valid,inferenceCalls:4},
  {...valid,reviewer:"NOT_RUN"},
  {...valid,verifier:"NOT_RUN"},
  {...valid,toolsAllowed:true},
  {...valid,model:"paid-inference"},
 ];
 for(const forged of mutations)
  assert.throws(()=>buildT12AcceptanceLedger({...input,liveEvidence:forged}),
   /SHA|failed|unrecognized|Writer|independence|recovery|five model|Reviewers|Verifier|tools|model/);
});
test("F7 limited 3-call connectivity evidence stays partial without Reviewer or Verifier",()=>{
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:{
  ...real(),status:"PARTIAL_CALL_BUDGET",inferenceCalls:3,
  reviewer:"NOT_RUN",verifier:"NOT_RUN",
 }});
 assert.equal(report.liveProviderEvidence,"PARTIAL_CALL_BUDGET");
 assert.equal(report.units.F5,"PARTIAL_REAL_VERIFIER_MISSING");
 assert.equal(report.globalFull,false);
});
test("F7 summary whitelists output fields and never copies unrelated provider payloads",()=>{
 const secret="SYNTHETIC_SECRET_NEVER_EMIT";
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:{
  ...real(),secret,rawProviderText:secret,reviewerOutput:{apiKey:secret},
 }});
 assert.equal(JSON.stringify(report).includes(secret),false);
 assert.deepEqual(Object.keys(report.units),["F0","F1","F2","F3","F4","F5","F6","F7"]);
});
