import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error JavaScript-only review contract helper.
import {gradeRealReview,gradeRealVerification} from "../scripts/t12-review-grader.mjs";

const sha="a".repeat(40);
const fixtureSha="b".repeat(64);
const checks=[
 {id:"pricing",exitCode:1,criterion:"discounts reduce totals",observation:"AssertionError: expected discounted total."},
 {id:"authorization",exitCode:1,criterion:"viewers cannot edit documents they do not own",observation:"AssertionError: expected viewer edit to be false."},
 {id:"parsing",exitCode:1,criterion:"integer parsing rejects trailing non-digits",observation:"AssertionError: expected trailing characters to be rejected."},
];
const testEvidence={checks};
type VerificationResponse={
 verdict:string;
 evidence:[
  {kind:"tests";checks:Array<{id:string;exitCode:number;criterion:string;observation:string}>},
  {kind:"scope";candidateSha:string;fixtureSha256:string;paths:string[];observation:string},
  {kind:"review";findings:Array<{path:string;codeEvidence:string;acceptanceCriterion:string;reason:string}>},
 ];
};
const reviewer=()=>({candidateSha:sha,verdict:"fail",findings:[
 {path:"src/pricing.js",reason:"The discount is added to the total instead of reducing it.",codeEvidence:"return unitPrice * quantity + discount;",acceptanceCriterion:"discounts reduce totals"},
 {path:"src/access.js",reason:"The viewer role can edit a document owned by another user.",codeEvidence:'return user.id === document.ownerId || user.role === "viewer";',acceptanceCriterion:"viewers cannot edit documents they do not own"},
 {path:"src/parse.js",reason:"parseInt accepts a valid prefix and silently ignores trailing non-digits.",codeEvidence:"const parsed = Number.parseInt(value, 10);",acceptanceCriterion:"integer parsing rejects trailing non-digits"},
]});
const verification=(paths=["src/access.js","src/parse.js","src/pricing.js"]):VerificationResponse=>({verdict:"fail",evidence:[
 {kind:"tests",checks:checks.map(item=>({...item}))},
 {kind:"scope",candidateSha:sha,fixtureSha256:fixtureSha,paths,observation:"Compared all proposed paths with the exact candidate and fixture digest."},
 {kind:"review",findings:reviewer().findings.map(item=>({...item,reason:"The reviewer-identified defect is confirmed by the deterministic failure."}))},
]});
const changedPaths=["src/access.js","src/parse.js","src/pricing.js"];

test("T12 two blind Reviewer judgments require exact candidate and all grounded defects",()=>{
 assert.equal(gradeRealReview(reviewer(),{candidateSha:sha}).passed,true);
 const stale=reviewer();stale.candidateSha="c".repeat(40);
 assert.throws(()=>gradeRealReview(stale,{candidateSha:sha}),/different candidate SHA/);
 const irrelevant=reviewer();irrelevant.findings[0]!.codeEvidence="unrelated code";
 assert.throws(()=>gradeRealReview(irrelevant,{candidateSha:sha}),/exact vulnerable expression/);
 const missing=reviewer();missing.findings.pop();
 assert.throws(()=>gradeRealReview(missing,{candidateSha:sha}),/all three deliberate defects/);
 const passing=reviewer();passing.verdict="pass";
 assert.throws(()=>gradeRealReview(passing,{candidateSha:sha}),/reject the deliberate defects/);
});

test("T12 Verifier grade requires all failed tests, exact SHA/scope and review evidence",()=>{
 const review=gradeRealReview(reviewer(),{candidateSha:sha});
 assert.equal(gradeRealVerification(verification(),{candidateSha:sha,fixtureSha256:fixtureSha,changedPaths,testEvidence,review}).passed,true);
 const wrongCriterion=verification();wrongCriterion.evidence[0].checks[0]!.criterion="some unrelated failure";
 assert.throws(()=>gradeRealVerification(wrongCriterion,{candidateSha:sha,fixtureSha256:fixtureSha,changedPaths,testEvidence,review}),/different test result|changed the failed criterion/);
 const stale=verification();stale.evidence[1].candidateSha="c".repeat(40);
 assert.throws(()=>gradeRealVerification(stale,{candidateSha:sha,fixtureSha256:fixtureSha,changedPaths,testEvidence,review}),/different candidate SHA/);
 const staleFixture=verification();staleFixture.evidence[1].fixtureSha256="c".repeat(64);
 assert.throws(()=>gradeRealVerification(staleFixture,{candidateSha:sha,fixtureSha256:fixtureSha,changedPaths,testEvidence,review}),/different fixture snapshot/);
 const incomplete=verification();incomplete.evidence[0].checks.pop();
 assert.throws(()=>gradeRealVerification(incomplete,{candidateSha:sha,fixtureSha256:fixtureSha,changedPaths,testEvidence,review}),/omitted deterministic test evidence/);
 const duplicated=verification();assert.equal(Reflect.set(duplicated.evidence[2],"kind","scope"),true);
 assert.throws(()=>gradeRealVerification(duplicated,{candidateSha:sha,fixtureSha256:fixtureSha,changedPaths,testEvidence,review}),/unique and complete/);
});
