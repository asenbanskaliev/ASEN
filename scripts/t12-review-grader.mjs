import assert from "node:assert/strict";

const reviewRequirements=[
 {path:"src/pricing.js",codeEvidence:"return unitPrice * quantity + discount;",criterion:"discounts reduce totals",reason:/discount|total/iu},
 {path:"src/access.js",codeEvidence:'return user.id === document.ownerId || user.role === "viewer";',criterion:"viewers cannot edit documents they do not own",reason:/viewer|owner|edit/iu},
 {path:"src/parse.js",codeEvidence:"const parsed = Number.parseInt(value, 10);",criterion:"integer parsing rejects trailing non-digits",reason:/parse|prefix|trailing|digit/iu},
];
const exactKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===keys.slice().sort().join(",");
const text=value=>typeof value==="string"&&value.trim().length>=20;

export function gradeRealReview(review,{candidateSha}={}){
 assert.ok(exactKeys(review,["candidateSha","verdict","findings"]),"Reviewer response fields do not match the required schema");
 assert.equal(review.candidateSha,candidateSha,"Reviewer cited a different candidate SHA");
 assert.equal(review.verdict,"fail","Reviewer must reject the deliberate defects");
 assert.ok(Array.isArray(review.findings)&&review.findings.length===reviewRequirements.length,"Reviewer must report all three deliberate defects");
 const findings=reviewRequirements.map(requirement=>{
  const finding=review.findings.find(item=>item?.path===requirement.path);
  assert.ok(exactKeys(finding,["path","reason","codeEvidence","acceptanceCriterion"]),"Grounded finding is required for "+requirement.path);
  assert.ok(text(finding.reason),"Reviewer reason is too short for "+requirement.path);
  assert.match(finding.reason,requirement.reason,"Reviewer reason does not explain the defect in "+requirement.path);
  assert.equal(finding.codeEvidence,requirement.codeEvidence,"Reviewer must cite the exact vulnerable expression for "+requirement.path);
  assert.equal(finding.acceptanceCriterion,requirement.criterion,"Reviewer must identify the violated criterion for "+requirement.path);
  return Object.freeze({...finding});
 });
 assert.deepEqual(review.findings.map(item=>item?.path).sort(),reviewRequirements.map(item=>item.path).sort(),"Reviewer findings must be unique and limited to the required files");
 return Object.freeze({passed:true,verdict:"fail",candidateSha,findings:Object.freeze(findings),authorization:"NOT_GRANTED"});
}

export function normalizeVerifierTestEvidence(evidence){
 assert.ok(evidence&&Array.isArray(evidence.checks)&&evidence.checks.length>0,"Verifier requires at least one failed check");
 const checks=evidence.checks.map(check=>{
  assert.ok(check&&typeof check.id==="string"&&check.id.length>0,"Verifier check requires an id");
  assert.equal(check.exitCode,1,"Verifier check must be a failed test");
  assert.ok(text(check.failedCriterion),"Verifier check requires a failed criterion");
  assert.ok(typeof check.observation==="string"&&check.observation.length>0,"Verifier check requires a failure observation");
  return Object.freeze({
   id:check.id,exitCode:check.exitCode,criterion:check.failedCriterion,observation:check.observation,
  });
 });
 assert.equal(new Set(checks.map(check=>check.id)).size,checks.length,"Verifier check ids must be unique");
 return Object.freeze({checks:Object.freeze(checks)});
}

export function gradeRealVerification(verification,{candidateSha,fixtureSha256,changedPaths,testEvidence,review}={}){
 assert.ok(exactKeys(verification,["verdict","evidence"]),"Verifier response fields do not match the required schema");
 assert.equal(verification.verdict,"fail","Verifier must reject failed deterministic evidence");
 assert.ok(Array.isArray(verification.evidence)&&verification.evidence.length===3,"Verifier must provide exactly tests, scope and review evidence");
 assert.deepEqual(verification.evidence.map(item=>item?.kind).sort(),["review","scope","tests"],"Verifier evidence kinds must be unique and complete");
 const tests=verification.evidence.find(item=>item?.kind==="tests");
 assert.ok(exactKeys(tests,["kind","checks"]),"Verifier must reconcile all deterministic test results");
 assert.ok(Array.isArray(tests.checks)&&tests.checks.length===testEvidence?.checks?.length,"Verifier omitted deterministic test evidence");
 for(const expected of testEvidence.checks){
  const actual=tests.checks.find(item=>item?.id===expected.id);
  assert.ok(exactKeys(actual,["id","exitCode","criterion","observation"]),"Verifier test finding is malformed for "+expected.id);
  assert.equal(actual.exitCode,expected.exitCode,"Verifier reported a different test result for "+expected.id);
  assert.equal(actual.criterion,expected.criterion,"Verifier changed the failed criterion for "+expected.id);
  assert.ok(text(actual.observation)&&/fail|assert/iu.test(actual.observation),"Verifier must explain the observed failure for "+expected.id);
 }
 assert.deepEqual(tests.checks.map(item=>item?.id).sort(),testEvidence.checks.map(item=>item.id).sort(),"Verifier test evidence must be unique and complete");
 const scope=verification.evidence.find(item=>item?.kind==="scope");
 assert.ok(exactKeys(scope,["kind","candidateSha","fixtureSha256","paths","observation"]),"Verifier must provide candidate- and fixture-bound scope evidence");
 assert.equal(scope.candidateSha,candidateSha,"Verifier cited a different candidate SHA");
 assert.equal(scope.fixtureSha256,fixtureSha256,"Verifier cited a different fixture snapshot");
 assert.deepEqual(scope.paths,[...changedPaths].sort(),"Verifier must compare the exact changed path set");
 assert.ok(text(scope.observation),"Verifier scope evidence is incomplete");
 const reviewed=verification.evidence.find(item=>item?.kind==="review");
 assert.ok(exactKeys(reviewed,["kind","findings"]),"Verifier must reconcile the grounded reviewer findings");
 assert.ok(Array.isArray(reviewed.findings),"Verifier review evidence is incomplete");
 assert.deepEqual(reviewed.findings.map(item=>item?.path).sort(),review.findings.map(item=>item.path).sort(),"Verifier did not reconcile every reviewer finding");
 for(const finding of review.findings){
  const actual=reviewed.findings.find(item=>item?.path===finding.path);
  assert.ok(exactKeys(actual,["path","codeEvidence","acceptanceCriterion","reason"]),"Verifier review reconciliation is malformed");
  assert.equal(actual.codeEvidence,finding.codeEvidence,"Verifier changed the reviewed code evidence");
  assert.equal(actual.acceptanceCriterion,finding.acceptanceCriterion,"Verifier changed the reviewed criterion");
  assert.ok(text(actual.reason)&&/fail|defect|bypass|reject|accept/iu.test(actual.reason),"Verifier must explain the reviewed defect");
 }
 return Object.freeze({passed:true,verdict:"fail",authorization:"NOT_GRANTED",checkCount:tests.checks.length,findingCount:review.findings.length});
}
