import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error JavaScript-only fixture acceptance helper.
import {gradePlan} from "../scripts/t12-plan-grader.mjs";
const sha="a".repeat(40);
function valid(){
 return {candidateId:"t12-disposable-fixture",candidateSha:sha,scope:"disposable-fixture",tasks:[
  {id:"pricing-fix",findingId:"pricing",paths:["src/pricing.js"],dependsOn:[],change:"Subtract the discount rather than adding it.",verification:"Assert a nonzero discount lowers the total.",risks:"Avoid changing zero-discount and negative-total handling.",role:"worker"},
  {id:"authorization-fix",findingId:"authorization",paths:["src/access.js"],dependsOn:[],change:"Reject viewer role permissions for editing.",verification:"Verify viewer cannot edit a foreign document.",risks:"Preserve edit access for owners and authorized editors.",role:"worker"},
  {id:"parsing-fix",findingId:"parsing",paths:["src/parse.js"],dependsOn:["pricing-fix"],change:"Reject numeric input with trailing junk characters.",verification:"Assert parseCount rejects 12abc as malformed.",risks:"Retain valid signed integers and existing boundary behavior.",role:"worker"}
 ]};
}
test("F3: scoped plan receives a deterministic grade but not authority",()=>{
 const result=gradePlan(valid(),{candidateId:"t12-disposable-fixture",candidateSha:sha});
 assert.equal(result.passed,true);
 assert.equal(result.authorization,"NOT_GRANTED");
 assert.equal(result.candidateId,"t12-disposable-fixture");
 assert.deepEqual(result.findings,["authorization","parsing","pricing"]);
 assert.deepEqual(result.tasks[2]?.dependsOn,["pricing-fix"]);
});
test("F3: rejects stale SHA, unknown paths, duplicate IDs and unverified changes",()=>{
 const candidate={candidateId:"t12-disposable-fixture",candidateSha:sha};
 let p=valid();p.candidateSha="b".repeat(40);assert.throws(()=>gradePlan(p,candidate),/SHA mismatch/);
 p=valid();p.candidateId="other";assert.throws(()=>gradePlan(p,candidate),/candidate ID mismatch/);
 p=valid();p.tasks[0]=Object.fromEntries(Object.entries(p.tasks[0]!).filter(([key])=>key!=="paths")) as typeof p.tasks[number];assert.throws(()=>gradePlan(p,candidate),/required schema/);
 p=valid();p.tasks[0]!.paths=["../outside"];assert.throws(()=>gradePlan(p,candidate),/Out-of-scope/);
 p=valid();p.tasks[1]!.id="pricing-fix";assert.throws(()=>gradePlan(p,candidate),/duplicate task/);
 p=valid();p.tasks[0]!.verification="none";assert.throws(()=>gradePlan(p,candidate),/verification/);
 p=valid();p.tasks[0]!.risks="";assert.throws(()=>gradePlan(p,candidate),/risk assessment/);
 p=valid();(p as unknown as Record<string,unknown>).extra="unsupported";assert.throws(()=>gradePlan(p,candidate),/required schema/);
});
test("F3: rejects cycles, self-dependencies and unknown findings",()=>{
 const candidate={candidateId:"t12-disposable-fixture",candidateSha:sha};
 let p=valid();p.tasks[0]!.dependsOn=["parsing-fix"];assert.throws(()=>gradePlan(p,candidate),/Cyclic/);
 p=valid();p.tasks[0]!.dependsOn=["pricing-fix"];assert.throws(()=>gradePlan(p,candidate),/Invalid dependency/);
 p=valid();p.tasks[0]!.dependsOn=["authorization-fix"];assert.throws(()=>gradePlan(p,candidate),/earlier task/);
 p=valid();p.tasks[0]!.findingId="imaginary";assert.throws(()=>gradePlan(p,candidate),/Unknown/);
});
