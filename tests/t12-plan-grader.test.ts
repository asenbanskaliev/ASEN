import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error JavaScript-only fixture acceptance helper.
import {gradePlan} from "../scripts/t12-plan-grader.mjs";
const sha="a".repeat(40);
function valid(){
 return {candidateSha:sha,scope:"disposable-fixture",tasks:[
  {id:"pricing-fix",findingId:"pricing",paths:["src/pricing.js"],dependsOn:[],change:"Subtract the discount rather than adding it.",verification:"Assert a nonzero discount lowers the total.",role:"worker"},
  {id:"authorization-fix",findingId:"authorization",paths:["src/access.js"],dependsOn:[],change:"Reject viewer role permissions for editing.",verification:"Verify viewer cannot edit a foreign document.",role:"worker"},
  {id:"parsing-fix",findingId:"parsing",paths:["src/parse.js"],dependsOn:["pricing-fix"],change:"Reject numeric input with trailing junk characters.",verification:"Assert parseCount rejects 12abc as malformed.",role:"worker"}
 ]};
}
test("F3: scoped plan receives a deterministic grade but not authority",()=>{
 const result=gradePlan(valid(),{candidateSha:sha});
 assert.equal(result.passed,true);
 assert.equal(result.authorization,"NOT_GRANTED");
 assert.deepEqual(result.findings,["authorization","parsing","pricing"]);
});
test("F3: rejects stale SHA, unknown paths, duplicate IDs and unverified changes",()=>{
 let p=valid();p.candidateSha="b".repeat(40);assert.throws(()=>gradePlan(p,{candidateSha:sha}),/SHA mismatch/);
 p=valid();p.tasks[0].paths=["../outside"];assert.throws(()=>gradePlan(p,{candidateSha:sha}),/Out-of-scope/);
 p=valid();p.tasks[1].id="pricing-fix";assert.throws(()=>gradePlan(p,{candidateSha:sha}),/duplicate task/);
 p=valid();p.tasks[0].verification="none";assert.throws(()=>gradePlan(p,{candidateSha:sha}),/verification/);
});
test("F3: rejects cycles, self-dependencies and unknown findings",()=>{
 let p=valid();p.tasks[0].dependsOn=["parsing-fix"];assert.throws(()=>gradePlan(p,{candidateSha:sha}),/Cyclic/);
 p=valid();p.tasks[0].dependsOn=["pricing-fix"];assert.throws(()=>gradePlan(p,{candidateSha:sha}),/Invalid dependency/);
 p=valid();p.tasks[0].findingId="imaginary";assert.throws(()=>gradePlan(p,{candidateSha:sha}),/Unknown/);
});
