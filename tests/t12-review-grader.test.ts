import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error JavaScript-only review contract helper.
import {gradeRealReview,gradeRealVerification} from "../scripts/t12-review-grader.mjs";

const sha="a".repeat(40);
const criterion="viewer cannot edit a document owned by another user";
const reviewer=()=>({verdict:"fail",findings:[{
 path:"src/access.js",
 reason:"The viewer role can edit a document owned by another user.",
 codeEvidence:'user.role === "viewer"',
 acceptanceCriterion:criterion,
}]});
const verifier=(changedPaths=["src/access.js","src/parse.js","src/pricing.js"])=>({verdict:"fail",evidence:[
 {kind:"test",exitCode:1,criterion,observation:"AssertionError: expected viewer edit permission to be false."},
 {kind:"scope",candidateSha:sha,paths:changedPaths,observation:"Compared all proposed paths with the exact candidate scope."},
 {kind:"review",path:"src/access.js",reason:"The reviewer identified the viewer edit bypass."},
]});
const testEvidence={exitCode:1,failedCriterion:criterion};

test("T12 Reviewer grade requires the exact vulnerable expression and violated criterion",()=>{
 assert.equal(gradeRealReview(reviewer()).passed,true);
 const irrelevant=reviewer();irrelevant.findings[0]!.codeEvidence="unrelated code";
 assert.throws(()=>gradeRealReview(irrelevant),/exact vulnerable code/);
 const vague=reviewer();vague.findings[0]!.reason="There may be a problem here.";
 assert.throws(()=>gradeRealReview(vague),/viewer edit bypass/);
 const passing=reviewer();passing.verdict="pass";
 assert.throws(()=>gradeRealReview(passing),/reject the deliberate defect/);
});

test("T12 Verifier grade requires matching failed test, exact SHA/scope and review evidence",()=>{
 const review=reviewer();
 assert.equal(gradeRealVerification(verifier(),{candidateSha:sha,changedPaths:["src/access.js","src/parse.js","src/pricing.js"],testEvidence,review}).passed,true);
 const irrelevant=verifier();irrelevant.evidence[0]!.criterion="some unrelated failure";
 assert.throws(()=>gradeRealVerification(irrelevant,{candidateSha:sha,changedPaths:["src/access.js","src/parse.js","src/pricing.js"],testEvidence,review}),/failing acceptance criterion/);
 const stale=verifier();stale.evidence[1]!.candidateSha="b".repeat(40);
 assert.throws(()=>gradeRealVerification(stale,{candidateSha:sha,changedPaths:["src/access.js","src/parse.js","src/pricing.js"],testEvidence,review}),/different candidate SHA/);
 const incomplete=verifier();incomplete.evidence.pop();
 assert.throws(()=>gradeRealVerification(incomplete,{candidateSha:sha,changedPaths:["src/access.js","src/parse.js","src/pricing.js"],testEvidence,review}),/test, scope and review/);
 const duplicated=verifier();duplicated.evidence[2]!.kind="scope";
 assert.throws(()=>gradeRealVerification(duplicated,{candidateSha:sha,changedPaths:["src/access.js","src/parse.js","src/pricing.js"],testEvidence,review}),/unique and complete/);
});
