/** T12 exact-SHA read-only acceptance gate. Does not call Pi, Ollama or Writer. */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectInferenceBudget,readInferenceBudgetReceipts} from "./t12-inference-budget.mjs";

const expectedDefects=Object.freeze({
 authorization:Object.freeze({path:"src/access.js",codeEvidence:'return user.id === document.ownerId || user.role === "viewer";',acceptanceCriterion:"viewers cannot edit documents they do not own"}),
 parsing:Object.freeze({path:"src/parse.js",codeEvidence:"const parsed = Number.parseInt(value, 10);",acceptanceCriterion:"integer parsing rejects trailing non-digits"}),
 pricing:Object.freeze({path:"src/pricing.js",codeEvidence:"return unitPrice * quantity + discount;",acceptanceCriterion:"discounts reduce totals"}),
});
const expectedIds=Object.keys(expectedDefects);
const expectedPaths=Object.values(expectedDefects).map(item=>item.path).sort();
const exactDefectSet=(items,label)=>{
 assert.deepEqual(items,expectedIds,label+" must include exactly three known defects (no duplicates, omissions or substitutions)");
};

export function gradeLiveAcceptanceEvidence({sha,model,maxCalls,budget,receipts,explorer,planner,review}){
 assert.match(sha,/^[0-9a-f]{40}$/u,"T12 exact commit SHA required");
 assert.ok(typeof model==="string"&&["beam","beam:cloud"].includes(model),"T12 unapproved model");
 assert.ok([3,5].includes(maxCalls),"T12 call budget must be three or five");
 assert.deepEqual(budget,{
  limit:maxCalls,reserved:maxCalls,remaining:0,authorization:"NOT_GRANTED",
 },"T12 call receipts must prove every bounded invocation");
 const expectedLabels=maxCalls===5?
  ["asen-dispatcher-explorer","real-plan","real-judge-a","real-judge-b","real-verifier"]:
  ["provider-connectivity","asen-dispatcher-explorer","real-plan"];
 assert.ok(Array.isArray(receipts),"T12 stage-specific inference receipts are required");
 assert.deepEqual(receipts,expectedLabels.map((label,index)=>({
  call:index+1,label,limit:maxCalls,
 })),"T12 stage receipt identities or order do not match completed agent stages");

 for(const [label,evidence,call] of [
  ["Explorer",explorer,maxCalls===3?2:1],
  ["Planner",planner,maxCalls===3?3:2],
 ]){
  assert.ok(evidence&&evidence.passed===true,label+" must have a positive grade");
  assert.equal(evidence.provider,"ollama-cloud",label+" provider mismatch");
  assert.equal(evidence.model,model,label+" model mismatch");
  assert.equal(evidence.candidateSha,sha,label+" candidate SHA mismatch");
  assert.equal(evidence.inferenceCall,call,label+" call order mismatch");
  assert.equal(evidence.inferenceLimit,maxCalls,label+" call budget mismatch");
  assert.equal(evidence.toolsAllowed,false,label+" must not have tools");
  assert.equal(evidence.writerAuthorized,false,label+" cannot grant Writer");
 }
 assert.equal(explorer.fixtureUnchanged,true,"Explorer fixture mutated");
 assert.equal(explorer.status,"PASS","Explorer status is not PASS");
 assert.equal(explorer.role,"explorer","Explorer role mismatch");
 assert.equal(explorer.phase,"explore","Explorer phase mismatch");
 assert.equal(explorer.artifactKind,"exploration","Explorer artifact kind mismatch");
 exactDefectSet(explorer.findings,"Explorer grade");
 assert.equal(explorer.candidateId,"t12-real-ollama-dispatch","Explorer candidate identity mismatch");
 assert.match(explorer.artifactSha256??"",/^[0-9a-f]{64}$/u,"Explorer artifact digest required");
 assert.equal(planner.authorization,"NOT_GRANTED","Planner authorization must be denied");
 assert.equal(planner.taskCount,3,"Planner must produce all three scoped tasks");
 assert.equal(planner.scope,"disposable-fixture","Planner escaped disposable fixture scope");
 exactDefectSet(planner.findings,"Planner findings");
 assert.equal(planner.candidateId,"t12-disposable-fixture","Planner candidate identity mismatch");
 assert.equal(planner.candidateSha,sha,"Planner exact candidate mismatch");
 assert.ok(Array.isArray(planner.tasks)&&planner.tasks.length===3,
  "Planner exact three task receipts required");
 const taskIds=planner.tasks.map(task=>task?.findingId);
 assert.deepEqual([...taskIds].sort(),expectedIds,"Planner tasks must bind each distinct defect");
 for(const task of planner.tasks){
  assert.deepEqual(task.paths,[expectedDefects[task.findingId]?.path],
   "Planner task escaped the approved file");
  assert.equal(task.role,"worker","Planner must not grant Writer or change worker role");
  assert.ok(typeof task.id==="string"&&/^[a-z0-9-]{1,48}$/.test(task.id),
   "Planner task identity is malformed");
 }
 assert.equal(new Set(planner.tasks.map(task=>task.id)).size,3,
  "Planner cannot duplicate task identifiers");
 let stage;
 if(maxCalls===5){
  assert.ok(review&&review.passed===true&&review.status==="PASS_NEGATIVE_REJECTION",
   "Verifier needs a real negative-rejection grade");
  assert.equal(review.candidateSha,sha,"Reviewer/Verifier candidate SHA mismatch");
  assert.equal(review.provider,"ollama-cloud","Reviewer/Verifier provider mismatch");
  assert.equal(review.model,model,"Reviewer/Verifier model mismatch");
  assert.equal(review.toolsAllowed,false,"Reviewer/Verifier tool use forbidden");
  assert.equal(review.writerAuthorized,false,"Reviewer/Verifier cannot grant Writer");
  assert.equal(review.authorization,"NOT_GRANTED","Reviewer/Verifier authorization mismatch");
  assert.match(review.fixtureSha256??"",/^[0-9a-f]{64}$/u,
   "Reviewer/Verifier frozen fixture digest missing");
  assert.equal(review.candidateId,"t12-review-"+review.fixtureSha256.slice(0,12),
   "Reviewer candidate is not bound to the frozen fixture digest");
  assert.deepEqual(review.changedPaths,expectedPaths,
   "Reviewer/Verifier changed paths mismatch");
  assert.ok(Array.isArray(review.deterministicTests?.checks)&&
   review.deterministicTests.checks.length===3,
   "Reviewer/Verifier deterministic failed-test evidence is incomplete");
  assert.deepEqual(review.deterministicTests.checks.map(item=>item.id).sort(),expectedIds,
   "Reviewer/Verifier deterministic test IDs mismatch");
  for(const check of review.deterministicTests.checks){
   assert.equal(check.exitCode,1,"Reviewer/Verifier must observe a failed test");
   assert.equal(check.failedCriterion,expectedDefects[check.id]?.acceptanceCriterion,
    "Reviewer/Verifier deterministic acceptance criterion mismatch");
  }
  assert.ok(Array.isArray(review.reviewer)&&review.reviewer.length===2,
   "Two real blind Reviewer judgments required");
  for(const [index,judge] of review.reviewer.entries()){
   assert.equal(judge.id,review.candidateId+":"+(index===0?"judge-a":"judge-b"),
    "Reviewer judgment identity or order mismatch");
   assert.match(judge.responseSha256??"",/^[0-9a-f]{64}$/u,"Reviewer receipt hash required");
   assert.ok(Number.isSafeInteger(judge.responseBytes)&&judge.responseBytes>0,
    "Reviewer receipt size required");
   assert.equal(judge.grade?.passed,true,"Reviewer judgment did not pass");
   assert.equal(judge.grade?.candidateSha,sha,"Reviewer judgment SHA mismatch");
   assert.equal(judge.grade?.verdict,"fail","Reviewer judgment must reject the defects");
   assert.equal(judge.grade?.findings?.length,3,"Reviewer omitted grounded defects");
   assert.deepEqual(judge.grade.findings.map(item=>item.path).sort(),expectedPaths,
    "Reviewer findings must contain exact approved paths");
   for(const finding of judge.grade.findings){
    const expected=Object.values(expectedDefects).find(item=>item.path===finding.path);
    assert.equal(finding.codeEvidence,expected?.codeEvidence,
     "Reviewer code evidence is not from frozen fixture");
    assert.equal(finding.acceptanceCriterion,expected?.acceptanceCriterion,
     "Reviewer acceptance criterion is not from frozen fixture");
   }
  }
  assert.match(review.verifier?.responseSha256??"",/^[0-9a-f]{64}$/u,
   "Real Verifier response hash required");
  assert.ok(Number.isSafeInteger(review.verifier?.responseBytes)&&review.verifier.responseBytes>0,
   "Real Verifier response size required");
  assert.equal(review.verifier?.grade?.passed,true,"Real Verifier grade is not PASS");
  assert.equal(review.verifier.grade.verdict,"fail","Verifier must reject deliberate defects");
  assert.equal(review.verifier.grade.checkCount,3,"Verifier omitted failed tests");
  assert.equal(review.verifier.grade.findingCount,3,"Verifier omitted reviewer defects");
  assert.equal(review.verifier.grade.authorization,"NOT_GRANTED",
   "Verifier grade must retain explicit no-authorization status");
  stage="PASS_BOUNDED_READ_ONLY";
 }else{
  assert.ok(review&&review.status==="BLOCKED_CALL_BUDGET"&&review.reviewer==="NOT_RUN"&&
   review.verifier==="NOT_RUN"&&review.authorization==="NOT_GRANTED",
   "Three-call run must not claim Reviewer or Verifier acceptance");
  stage="PARTIAL_CALL_BUDGET";
 }
 return Object.freeze({
  passed:true,status:stage,candidateSha:sha,provider:"ollama-cloud",model,
  inferenceCalls:maxCalls,explorer:"PASS",planner:"PASS",
  reviewer:maxCalls===5?"PASS_TWO_JUDGMENTS":"NOT_RUN",
  verifier:maxCalls===5?"PASS_NEGATIVE_REJECTION":"NOT_RUN",
  writer:"BLOCKED_INTERACTIVE",authorization:"NOT_GRANTED",toolsAllowed:false,
  liveProviderRecovery:"NOT_VERIFIED",independentAudit:"NOT_PERFORMED",
 });
}

async function readEvidence(directory,name){
 try{return JSON.parse(await readFile(join(directory,name),"utf8"));}
 catch{throw new Error("T12 live evidence missing or malformed: "+name);}
}
async function main(){
 const sha=process.env.ASEN_EXPECTED_SHA;
 const maxCalls=Number(process.env.ASEN_MAX_INFERENCE_CALLS);
 const temp=process.env.RUNNER_TEMP;
 assert.ok(typeof temp==="string"&&temp.length>0,"RUNNER_TEMP must be set");
 const model=(await readFile(join(temp,"asen-selected-model"),"utf8")).trim();
 const dir=resolve("asen-acceptance-evidence");
 const [budget,receipts,explorer,planner,review]=await Promise.all([
  inspectInferenceBudget({directory:temp}),
  readInferenceBudgetReceipts({directory:temp}),
  readEvidence(dir,"asen-dispatcher-explorer.json"),
  readEvidence(dir,"fixture-plan-grade.json"),
  readEvidence(dir,"real-review-verifier.json"),
 ]);
 const result=gradeLiveAcceptanceEvidence({sha,model,maxCalls,budget,receipts,explorer,planner,review});
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,"live-evidence-gate.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600});
 console.log("T12 exact-SHA provider acceptance: "+result.status+" (Writer still BLOCKED_INTERACTIVE)");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{await main();}
 catch{console.error("T12 live acceptance evidence gate rejected missing or inconsistent proof");process.exitCode=1;}
}
