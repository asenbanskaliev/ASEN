/** T12 exact-SHA read-only acceptance gate. Does not call Pi, Ollama or Writer. */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectInferenceBudget} from "./t12-inference-budget.mjs";

export function gradeLiveAcceptanceEvidence({sha,model,maxCalls,budget,explorer,planner,review}){
 assert.match(sha,/^[0-9a-f]{40}$/u,"T12 exact commit SHA required");
 assert.ok(typeof model==="string"&&["beam","beam:cloud"].includes(model),"T12 unapproved model");
 assert.ok([3,5].includes(maxCalls),"T12 call budget must be three or five");
 assert.deepEqual(budget,{
  limit:maxCalls,reserved:maxCalls,remaining:0,authorization:"NOT_GRANTED",
 },"T12 call receipts must prove every bounded invocation");
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
 assert.equal(planner.authorization,"NOT_GRANTED","Planner authorization must be denied");
 assert.equal(planner.taskCount,3,"Planner must produce all three scoped tasks");
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
  assert.ok(Array.isArray(review.reviewer)&&review.reviewer.length===2,
   "Two real blind Reviewer judgments required");
  for(const judge of review.reviewer){
   assert.equal(judge.grade?.passed,true,"Reviewer judgment did not pass");
   assert.equal(judge.grade?.findingCount,undefined,"Reviewer judgment is not the Verifier");
   assert.equal(judge.grade?.findings?.length,3,"Reviewer omitted grounded defects");
  }
  assert.equal(review.verifier?.grade?.passed,true,"Real Verifier grade is not PASS");
  assert.equal(review.verifier.grade.verdict,"fail","Verifier must reject deliberate defects");
  assert.equal(review.verifier.grade.checkCount,3,"Verifier omitted failed tests");
  assert.equal(review.verifier.grade.findingCount,3,"Verifier omitted reviewer defects");
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
 const [budget,explorer,planner,review]=await Promise.all([
  inspectInferenceBudget({directory:temp}),
  readEvidence(dir,"asen-dispatcher-explorer.json"),
  readEvidence(dir,"fixture-plan-grade.json"),
  readEvidence(dir,"real-review-verifier.json"),
 ]);
 const result=gradeLiveAcceptanceEvidence({sha,model,maxCalls,budget,explorer,planner,review});
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,"live-evidence-gate.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600});
 console.log("T12 exact-SHA provider acceptance: "+result.status+" (Writer still BLOCKED_INTERACTIVE)");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{await main();}
 catch{console.error("T12 live acceptance evidence gate rejected missing or inconsistent proof");process.exitCode=1;}
}
