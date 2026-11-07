/** EF-002/701/704: join the 20-case contract, A/B/ASEN claimed behavior
 * and 60 independent integrity receipts. No text-only parity or matching
 * self-written JSON can promote a real execution, Writer consent or FULL.
 */
import assert from "node:assert/strict";
import {mkdir,lstat,realpath,writeFile} from "node:fs/promises";
import {dirname,resolve,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {buildAgentABCaseReadiness} from "./agent-ab-case-readiness.mjs";
import {buildObservationScaffold} from "./agent-observable-scaffold.mjs";
import {CASE_IDS,REFERENCE_SHA,compareAgentObservations} from "./agent-observable-parity.mjs";
import {auditObservableReceipts} from "./agent-observable-receipts.mjs";
import {readAgentABManifest} from "./agent-ab-manifest-reader.mjs";
const SOURCES=Object.freeze(["A","B","ASEN"]);
const EXPLICIT=/^[a-f0-9]{40}$/u;
const REASONS=Object.freeze({
 RECEIPT_FAILURE:"RECEIPT_INTEGRITY_FAILURE",
 REFERENCE_DIFFERENCE:"REFERENCE_DIFFERENCE_NOT_INDEPENDENTLY_ATTESTED",
 CANDIDATE_DIFFERENCE:"CANDIDATE_DIFFERENCE_NOT_INDEPENDENTLY_ATTESTED",
 TRIPLE_MATCH:"MATCHED_BYTES_NOT_INDEPENDENTLY_ATTESTED",
 MISSING:"INCOMPLETE_OR_UNTRUSTED_EXECUTION",
});
/** A matching digest is integrity only, not proof the source host or model ran.
 * This gate cannot be made to return FULL by a caller-provided document.
 */
export async function assembleAgentABAcceptance({
 candidateSha,root,reference,candidate,
}){
 assert.ok(typeof candidateSha==="string"&&EXPLICIT.test(candidateSha),
  "Full exact ASEN candidate SHA is mandatory");
 assert.ok(typeof root==="string"&&isAbsolute(root),
  "A/B evidence must use an explicit absolute root");
 const scaffold=reference&&candidate?{reference,candidate}:buildObservationScaffold(candidateSha);
 assert.ok((reference&&candidate)||(!reference&&!candidate),
  "Reference and ASEN evidence must be provided together");
 const plan=buildAgentABCaseReadiness({candidateSha});
 const comparison=compareAgentObservations({...scaffold,candidateSha});
 const integrity=await auditObservableReceipts({...scaffold,candidateSha,root});
 assert.equal(comparison.results.length,20);
 assert.equal(integrity.rows.length,60);
 assert.deepEqual(plan.sourceCommits,REFERENCE_SHA);
 const rows=CASE_IDS.map(id=>{
  const casePlan=plan.cases.find(c=>c.id===id);
  assert.ok(casePlan);
  const row=comparison.results.find(r=>r.id===id);
  assert.ok(row);
  const receipts=SOURCES.map(source=>{
   const receipt=integrity.rows.find(r=>r.id===id&&r.source===source);
   assert.ok(receipt);
   return {source,status:receipt.status,reason:receipt.reason};
  });
  const status=receipts.some(r=>r.status==="FAIL")?"FAIL_INTEGRITY":"BLOCKED";
  let reason=REASONS.MISSING;
  if(status==="FAIL_INTEGRITY")reason=REASONS.RECEIPT_FAILURE;
  else if(receipts.every(r=>r.status==="INTEGRITY_ONLY")){
   reason=row.status==="FAIL"?
    (row.reason==="REFERENCE_A_B_BEHAVIOR_DIFFERS"?REASONS.REFERENCE_DIFFERENCE:REASONS.CANDIDATE_DIFFERENCE):
    row.status==="MATCH"?REASONS.TRIPLE_MATCH:REASONS.MISSING;
  }
  return Object.freeze({id,mode:casePlan.mode,
   humanConsentRequired:casePlan.requiresHumanConsent,
   status,reason,claim:row.status,receipts:Object.freeze(receipts)});
 });
 const fail=rows.filter(r=>r.status==="FAIL_INTEGRITY").length;
 const report=Object.freeze({
  schema:"asen-agent-ab-combined-gate/v1",candidateSha,
  referenceShas:REFERENCE_SHA,
  totalCases:20,expectedSlots:60,
  integrityOnly:integrity.counts.integrityOnly,
  sourceCasesExecutedAndAttested:0,
  actualIndependentReviews:0,
  consentedWriterRuns:0,
  claimedMatches:comparison.counts.match,
  claimedDifferences:comparison.counts.fail,
  casesBlocked:20-fail,failedIntegrityCases:fail,
  gate:"BLOCKED_NO_INDEPENDENT_LIVE_ATTESTATION",
  globalFull:false,writerAuthorized:false,
  rows:Object.freeze(rows),
 });
 assert.equal(report.rows.length,20);
 assert.equal(report.rows.flatMap(r=>r.receipts).length,60);
 assert.equal(report.globalFull,false);
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2&&process.argv.length!==5)
   throw Error("Usage: node scripts/agent-ab-combined-gate.mjs [reference.json asen.json receipt-root]");
  const candidateSha=process.env.ASEN_EXPECTED_SHA,output=process.env.ASEN_AB_COMBINED_OUTPUT;
  if(!candidateSha||!output||!isAbsolute(output))
   throw Error("Exact candidate SHA and absolute output path required");
  const evidenceRoot=process.argv.length===5?resolve(process.argv[4]):resolve(".");
  const docs=process.argv.length===5?{
   reference:await readAgentABManifest(resolve(process.argv[2])),
   candidate:await readAgentABManifest(resolve(process.argv[3])),
  }:{};
  const result=await assembleAgentABAcceptance({candidateSha,root:evidenceRoot,...docs});
  await mkdir(dirname(output),{recursive:true});
  const outputDir=await lstat(dirname(output));
  if(!outputDir.isDirectory()||outputDir.isSymbolicLink()||
     await realpath(dirname(output))!==dirname(output))
   throw Error("A/B report directory cannot be an alias or symlink");
  await writeFile(output,JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("EF701_AB_COMBINED_BLOCKED "+JSON.stringify({cases:result.totalCases,
   receiptSlots:result.expectedSlots,integrityOnly:result.integrityOnly,
   globalFull:false}));
 }catch(error){console.error(error instanceof Error?error.message:"Composite gate failed");process.exitCode=1;}
}
