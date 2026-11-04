/**
 * T12 exact-SHA acceptance ledger.
 * This is a bounded read-only summary, NOT an independent audit or authority grant.
 * Provider-free tests cannot produce a real-provider PASS or global FULL.
 */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir,lstat,realpath} from "node:fs/promises";
import {resolve,join,dirname,isAbsolute,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectInferenceBudget,readInferenceBudgetReceipts} from "./t12-inference-budget.mjs";
import {gradeLiveAcceptanceEvidence} from "./t12-live-evidence-gate.mjs";

const positiveStates=new Set(["PASS_BOUNDED_READ_ONLY","PARTIAL_CALL_BUDGET"]);

/** Accept the report only when it is byte-for-byte the strict graded result.
 * Never treat a standalone status JSON file as provider authorization.
 */
export function matchT12ValidatedLiveGate({reported,computed}){
 assert.deepEqual(reported,computed,
  "T12 live acceptance ledger differs from strict real-evidence gate");
 return Object.freeze(computed);
}
export function buildT12AcceptanceLedger({sha,offlineConfirmed,liveEvidence=null}){
 assert.match(sha,/^[0-9a-f]{40}$/u,"T12 acceptance ledger needs an exact SHA");
 assert.equal(offlineConfirmed,true,"T12 provider-free tests must have completed successfully");
 let liveState="NOT_RUN";
 if(liveEvidence!==null){
  assert.ok(liveEvidence&&typeof liveEvidence==="object"&&!Array.isArray(liveEvidence),
   "T12 real evidence must be a validated report");
  assert.equal(liveEvidence.candidateSha,sha,"T12 real evidence belongs to another SHA");
  assert.ok(positiveStates.has(liveEvidence.status)&&liveEvidence.passed===true,
   "T12 failed or unrecognized real evidence cannot become PASS");
  assert.equal(liveEvidence.provider,"ollama-cloud","T12 real provider mismatch");
  assert.ok(["beam","beam:cloud"].includes(liveEvidence.model),"T12 real model mismatch");
  assert.equal(liveEvidence.authorization,"NOT_GRANTED","T12 real evidence must deny Writer authority");
  assert.equal(liveEvidence.writer,"BLOCKED_INTERACTIVE","T12 real Writer remains blocked");
  assert.equal(liveEvidence.liveProviderRecovery,"NOT_VERIFIED","T12 live recovery cannot be inferred");
  assert.equal(liveEvidence.independentAudit,"NOT_PERFORMED","T12 audit independence cannot be inferred");
  assert.equal(liveEvidence.toolsAllowed,false,"T12 bounded provider must not use tools");
  assert.equal(liveEvidence.explorer,"PASS","T12 Explorer has no real PASS");
  assert.equal(liveEvidence.planner,"PASS","T12 Planner has no real PASS");
  if(liveEvidence.status==="PASS_BOUNDED_READ_ONLY"){
   assert.equal(liveEvidence.inferenceCalls,5,"T12 five model invocations required");
   assert.equal(liveEvidence.reviewer,"PASS_TWO_JUDGMENTS","T12 two blind Reviewers required");
   assert.equal(liveEvidence.verifier,"PASS_NEGATIVE_REJECTION","T12 real Verifier receipt required");
  }else{
   assert.equal(liveEvidence.inferenceCalls,3,"T12 partial mode must be capped at three calls");
   assert.equal(liveEvidence.reviewer,"NOT_RUN","T12 partial cannot claim a Reviewer");
   assert.equal(liveEvidence.verifier,"NOT_RUN","T12 partial cannot claim Verifier");
  }
  liveState=liveEvidence.status;
 }
 const hasRealExplorerPlanner=positiveStates.has(liveState);
 const readOnlyComplete=liveState==="PASS_BOUNDED_READ_ONLY";
 return Object.freeze({
  schema:1,candidateSha:sha,classification:hasRealExplorerPlanner?"SELF_ASSESSED_WITH_REAL_RECEIPT":"SELF_ASSESSED_PROVIDER_FREE",
  globalStatus:"PARTIAL",globalFull:false,
  evidenceType:readOnlyComplete?"REAL_READ_ONLY_PLUS_PROVIDER_FREE":hasRealExplorerPlanner?"REAL_EXPLORER_PLANNER_PARTIAL_PLUS_PROVIDER_FREE":"PROVIDER_FREE_ONLY",
  independentAudit:"NOT_PERFORMED",authorization:"NOT_GRANTED",
  externalCi:"NOT_ASSERTED_BY_THIS_REPORT",
  units:Object.freeze({
   F0:"PARTIAL_CI_MATRIX_PENDING",F1:"PARTIAL_LIVE_NEGATIVE_MISSING",
   F2:hasRealExplorerPlanner?"PASS_REAL_READ_ONLY":"PASS_PROVIDER_FREE_ONLY",
   F3:hasRealExplorerPlanner?"PASS_REAL_READ_ONLY":"PASS_PROVIDER_FREE_ONLY",
   F4:"BLOCKED_INTERACTIVE",
   F5:readOnlyComplete?"PASS_BOUNDED_NEGATIVE_REJECTION":"PARTIAL_REAL_VERIFIER_MISSING",
   F6:"PARTIAL_REAL_PROVIDER_RECOVERY_MISSING",
   F7:"SELF_AUDIT_ONLY",
  }),
  liveProviderEvidence:liveState,
  notes:Object.freeze([
   "A passing provider-free suite cannot certify real Ollama calls",
   "The Writer requires an authentic one-time interactive authorization",
   "F6 live interruption, timeout, quota and restart remain unverified",
   "Release, cross-platform CI and independent review require separate evidence",
  ]),
 });
}

/** EF-703/704: retain the original exact-SHA report. A repeated run must fail
 * rather than silently replacing earlier acceptance evidence. */
export async function writeT12AcceptanceLedgerCreateOnly({file,report}){
 assert.ok(typeof file==="string"&&isAbsolute(file)&&resolve(file)===file&&
  basename(file)==="t12-acceptance-ledger.json","T12 ledger needs a normalized absolute output path");
 const parent=dirname(file),stat=await lstat(parent);
 assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(parent)===parent,
  "T12 ledger output directory must be physical and canonical");
 assert.equal(report?.globalFull,false,"T12 self-assessment cannot grant FULL");
 await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
}

async function main(){
 assert.equal(process.env.ASEN_OFFLINE_TESTS_PASSED,"1",
  "T12 ledger may only be produced after offline tests have passed");
 const sha=process.env.ASEN_EXPECTED_SHA??process.env.GITHUB_SHA;
 const dir=resolve("asen-acceptance-evidence");
 let liveEvidence=null;
 if(process.env.ASEN_INCLUDE_VALIDATED_LIVE_EVIDENCE==="1"){
  // Replay every deterministic real-evidence grade from original agent reports
  // and the durable inference ledger. A plausible status JSON alone cannot pass.
  // Offline acceptance is a prerequisite of the real-provider job in Actions.
  assert.ok(typeof process.env.RUNNER_TEMP==="string"&&process.env.RUNNER_TEMP,
   "T12 original inference receipts are unavailable");
  const temp=process.env.RUNNER_TEMP;
  const loadJson=async name=>JSON.parse(await readFile(join(dir,name),"utf8"));
  const [reported,budget,receipts,explorer,planner,review,model]=await Promise.all([
   loadJson("live-evidence-gate.json"),
   inspectInferenceBudget({directory:temp}),
   readInferenceBudgetReceipts({directory:temp}),
   loadJson("asen-dispatcher-explorer.json"),
   loadJson("fixture-plan-grade.json"),
   loadJson("real-review-verifier.json"),
   readFile(join(temp,"asen-selected-model"),"utf8"),
  ]);
  const computed=gradeLiveAcceptanceEvidence({
   sha,model:model.trim(),maxCalls:Number(process.env.ASEN_MAX_INFERENCE_CALLS),
   budget,receipts,explorer,planner,review,
  });
  liveEvidence=matchT12ValidatedLiveGate({reported,computed});
 }
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence});
 await mkdir(dir,{recursive:true});
 await writeT12AcceptanceLedgerCreateOnly({file:join(dir,"t12-acceptance-ledger.json"),report});
 console.log("T12 exact-SHA acceptance ledger: PARTIAL (no global FULL, no Writer authorization)");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{await main();}
 catch{console.error("T12 acceptance ledger rejected incomplete, stale or invalid evidence");process.exitCode=1;}
}
