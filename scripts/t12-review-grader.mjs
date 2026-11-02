import assert from "node:assert/strict";

const exactKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===keys.slice().sort().join(",");
const text=value=>typeof value==="string"&&value.trim().length>=20;

export function gradeRealReview(review){
 assert.ok(exactKeys(review,["verdict","findings"]),"Reviewer response fields do not match the required schema");
 assert.equal(review.verdict,"fail","Reviewer must reject the deliberate defect");
 assert.ok(Array.isArray(review.findings)&&review.findings.length>0,"Reviewer findings are required");
 const finding=review.findings.find(item=>item?.path==="src/access.js");
 assert.ok(exactKeys(finding,["path","reason","codeEvidence","acceptanceCriterion"]),"Grounded authorization finding is required");
 assert.ok(text(finding.reason)&&/viewer/iu.test(finding.reason)&&/edit/iu.test(finding.reason)&&/own(?:er|ed|ership)?/iu.test(finding.reason),
  "Reviewer reason must explain the viewer edit bypass and ownership boundary");
 assert.equal(finding.codeEvidence,'user.role === "viewer"',"Reviewer must cite the exact vulnerable code expression");
 assert.ok(typeof finding.acceptanceCriterion==="string"&&/viewer/iu.test(finding.acceptanceCriterion)&&/edit/iu.test(finding.acceptanceCriterion),
  "Reviewer must identify the violated viewer-edit acceptance criterion");
 return Object.freeze({passed:true,verdict:"fail",finding:Object.freeze({...finding}),authorization:"NOT_GRANTED"});
}

export function gradeRealVerification(verification,{candidateSha,changedPaths,testEvidence,review}={}){
 assert.ok(exactKeys(verification,["verdict","evidence"]),"Verifier response fields do not match the required schema");
 assert.equal(verification.verdict,"fail","Verifier must reject failed deterministic evidence");
 assert.ok(Array.isArray(verification.evidence)&&verification.evidence.length===3,"Verifier must provide exactly test, scope and review evidence");
 assert.deepEqual(verification.evidence.map(item=>item?.kind).sort(),["review","scope","test"],"Verifier evidence kinds must be unique and complete");
 const test=verification.evidence.find(item=>item?.kind==="test");
 assert.ok(exactKeys(test,["kind","exitCode","criterion","observation"]),"Verifier must cite the deterministic test result");
 assert.equal(test.exitCode,testEvidence?.exitCode,"Verifier reported a different test exit code");
 assert.equal(test.criterion,testEvidence?.failedCriterion,"Verifier omitted or changed the failing acceptance criterion");
 assert.ok(text(test.observation)&&/fail|assert/iu.test(test.observation),"Verifier must explain the observed test failure");
 const scope=verification.evidence.find(item=>item?.kind==="scope");
 assert.ok(exactKeys(scope,["kind","candidateSha","paths","observation"]),"Verifier must provide candidate-bound scope evidence");
 assert.equal(scope.candidateSha,candidateSha,"Verifier cited a different candidate SHA");
 assert.deepEqual(scope.paths,[...changedPaths].sort(),"Verifier must compare the exact changed path set");
 assert.ok(text(scope.observation),"Verifier scope evidence is incomplete");
 const reviewFinding=review?.findings?.find(item=>item.path==="src/access.js");
 const reviewed=verification.evidence.find(item=>item?.kind==="review");
 assert.ok(exactKeys(reviewed,["kind","path","reason"]),"Verifier must reconcile the review finding");
 assert.equal(reviewed.path,reviewFinding?.path,"Verifier did not reconcile the grounded reviewer path");
 assert.ok(text(reviewed.reason)&&/viewer/iu.test(reviewed.reason)&&/edit/iu.test(reviewed.reason),
  "Verifier must connect the reviewer finding to the known defect");
 return Object.freeze({passed:true,verdict:"fail",authorization:"NOT_GRANTED",evidenceCount:verification.evidence.length});
}
