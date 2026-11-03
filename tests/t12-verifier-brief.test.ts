import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error JavaScript-only prompt compiler for the real Pi verifier.
import {createT12VerifierBrief} from "../scripts/t12-verifier-brief.mjs";

const candidateSha="a".repeat(40),fixtureSha256="b".repeat(64);
const changedPaths=["src/access.js","src/parse.js","src/pricing.js"];
const checks=[
 {id:"pricing",exitCode:1,criterion:"discounts reduce totals",
  observation:"AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n23 !== 17\n at runtime.js"},
 {id:"authorization",exitCode:1,criterion:"viewers cannot edit documents they do not own",
  observation:"AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\ntrue !== false\n at runtime.js"},
 {id:"parsing",exitCode:1,criterion:"integer parsing rejects trailing non-digits",
  observation:"AssertionError [ERR_ASSERTION]: Missing expected exception.\n at runtime.js"}
];
const reviewFindings=[
 {path:"src/pricing.js",codeEvidence:"return unitPrice * quantity + discount;",
  acceptanceCriterion:"discounts reduce totals",
  reason:"Adding a discount instead of subtracting fails the original pricing requirement."},
 {path:"src/access.js",codeEvidence:'return user.id === document.ownerId || user.role === "viewer";',
  acceptanceCriterion:"viewers cannot edit documents they do not own",
  reason:"Viewer role authorizes writes for users without the matching owner id."},
 {path:"src/parse.js",codeEvidence:"const parsed = Number.parseInt(value, 10);",
  acceptanceCriterion:"integer parsing rejects trailing non-digits",
  reason:"The parser silently accepts a numeric prefix with trailing letters."},
];
const input=()=>({candidateSha,fixtureSha256,changedPaths,checks,reviewFindings});
test("EF-402 Beam Verifier receives canonical criteria and bounded observed failure signals",()=>{
 const {input:brief,prompt}=createT12VerifierBrief(input());
 assert.equal(brief.failedTests.length,3);
 assert.deepEqual(brief.failedTests.map((x:{criterion:string})=>x.criterion),checks.map(x=>x.criterion));
 assert.deepEqual(brief.scope,{candidateSha,fixtureSha256,paths:changedPaths});
 assert.equal(brief.gradedReviewFindings.length,3);
 assert.ok(brief.failedTests.every((x:{observedAssertion:string})=>x.observedAssertion.includes("AssertionError")));
 assert.doesNotMatch(prompt,/ at runtime\.js/u,"stack traces do not need to be interpreted as task evidence");
 assert.match(prompt,/COPY the id, criterion, exitCode/u);
 assert.match(prompt,/Write your OWN specific failure observations/u);
 assert.ok(prompt.length<6500,"five-call run must preserve bounded Pi context");
});
test("EF-402 verifier prompt compiler fails closed on missing or forged prior evidence",()=>{
 const base=input();
 assert.throws(()=>createT12VerifierBrief({...base,checks:checks.slice(1)}),/three checks/u);
 assert.throws(()=>createT12VerifierBrief({...base,checks:[checks[0],checks[0],checks[2]]}),/duplicated/u);
 assert.throws(()=>createT12VerifierBrief({...base,checks:[{...checks[0],exitCode:0},...checks.slice(1)]}),/failed test/u);
 assert.throws(()=>createT12VerifierBrief({...base,checks:[{...checks[0],observation:"test looks okay"},...checks.slice(1)]}),/assertion failure/u);
 assert.throws(()=>createT12VerifierBrief({...base,changedPaths:["src/secret.js",...changedPaths.slice(1)]}),/mismatched/u);
 assert.throws(()=>createT12VerifierBrief({...base,fixtureSha256:"not-a-digest"}),/frozen candidate/u);
});
