import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Pure ESM deterministic review grader.
import {gradeRealReview,gradeRealVerification} from "../scripts/t12-review-grader.mjs";
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
 const {input:brief,prompt,outputSkeleton}=createT12VerifierBrief(input());
 assert.equal(brief.failedTests.length,3);
 assert.deepEqual(brief.failedTests.map((x:{criterion:string})=>x.criterion),checks.map(x=>x.criterion));
 assert.deepEqual(brief.scope,{candidateSha,fixtureSha256,paths:changedPaths});
 assert.equal(brief.gradedReviewFindings.length,3);
 assert.ok(brief.failedTests.every((x:{observedAssertion:string})=>x.observedAssertion.includes("AssertionError")));
 assert.doesNotMatch(prompt,/ at runtime\.js/u,"stack traces do not need to be interpreted as task evidence");
 assert.match(prompt,/COPY the id, criterion, exitCode/u);
 assert.match(prompt,/Write your OWN specific failure observations/u);
 assert.deepEqual(outputSkeleton.evidence.map((row:{kind:string})=>row.kind),["tests","scope","review"]);
 assert.equal(outputSkeleton.verdict,"fail");
 assert.deepEqual(outputSkeleton.evidence[0].checks.map((row:{criterion:string})=>row.criterion),checks.map(row=>row.criterion));
 assert.ok(outputSkeleton.evidence[0].checks.every((row:{observation:string})=>row.observation==="?"));
 assert.equal(outputSkeleton.evidence[1].observation,"?");
 assert.ok(outputSkeleton.evidence[2].findings.every((row:{reason:string})=>row.reason==="?"));
 assert.match(prompt,/MANDATORY COMPLETE JSON RESPONSE SKELETON/u);
 assert.match(prompt,/REPLACE EVERY QUESTION MARK/u);
 assert.ok(prompt.length<7800,"five-call run must preserve bounded Pi context");
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

test("EF-402 verifier skeleton is NEVER a valid completed model answer; real reasoning is required",()=>{
 const {outputSkeleton,prompt}=createT12VerifierBrief(input());
 const review=gradeRealReview({candidateSha,verdict:"fail",findings:reviewFindings},{
  candidateSha,
 });
 const context={candidateSha,fixtureSha256,changedPaths,
  testEvidence:{checks:checks.map(x=>({...x}))},review};
 assert.throws(()=>gradeRealVerification(outputSkeleton,context),/observed failure/u,
  "The skeleton is input guidance only, never fake model evidence");
 const filled=structuredClone(outputSkeleton);
 const rows=filled.evidence as Array<Record<string,any>>;
 for(const row of rows[0]!.checks){
  const original=checks.find(x=>x.id===row.id);
  assert.ok(original);
  row.observation="AssertionError: "+original.criterion+" failed in executed fixture";
 }
 rows[1]!.observation="Compared all three actual changed paths with the exact fixture and candidate digests";
 for(const finding of rows[2]!.findings){
  finding.reason="The reviewed defect fails the required criterion: "+finding.acceptanceCriterion;
 }
 assert.equal(gradeRealVerification(filled,context).passed,true,
  "A fully populated, human-authored report is accepted by the existing strict grader");
 const stale=structuredClone(filled);
 (stale.evidence as Array<Record<string,any>>)[1]!.candidateSha="c".repeat(40);
 assert.throws(()=>gradeRealVerification(stale,context),/different candidate SHA/u);
 const omission=structuredClone(filled);
 (omission.evidence as Array<Record<string,any>>)[2]!.findings.pop();
 assert.throws(()=>gradeRealVerification(omission,context),/every reviewer finding/u);
 const tampered=structuredClone(filled);
 (tampered.evidence as Array<Record<string,any>>)[0]!.checks[0]!.criterion="invented criterion";
 assert.throws(()=>gradeRealVerification(tampered,context),/changed the failed criterion/u);
 assert.match(prompt,/MANDATORY COMPLETE JSON RESPONSE SKELETON/u);
});
test("EF-402 verifier brief fails closed when test and reviewer claims disagree",()=>{
 const base=input();
 assert.throws(()=>createT12VerifierBrief({...base,checks:[
  {...checks[0],criterion:"discounts increase totals"},...checks.slice(1),
 ]}),/mismatched test criteria/u);
 assert.throws(()=>createT12VerifierBrief({...base,checks:[
  {...checks[0],id:"unrelated"},...checks.slice(1),
 ]}),/mismatched test criteria/u);
 assert.throws(()=>createT12VerifierBrief({...base,reviewFindings:[
  {...reviewFindings[0],acceptanceCriterion:"discounts increase totals"},
  ...reviewFindings.slice(1),
 ]}),/reviewer criterion inconsistent/u);
});
