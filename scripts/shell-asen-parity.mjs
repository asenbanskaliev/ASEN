/** R4-04 active parity: a single Pi-based Shell reference vs Pi-based ASEN.
 * The retired A/B/ASEN three-run ledger remains historical, never a FULL gate.
 * This module can expose gaps and differences, not independently attest execution.
 */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,realpathSync,writeFileSync} from "node:fs";
import {createHmac,timingSafeEqual} from "node:crypto";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const BASELINE_FILE=new URL("../registry/parity/shell-asen-baseline-v1.json",import.meta.url);
const SCENARIOS_FILE=new URL("../registry/parity/shell-asen-case-readiness-v1.json",import.meta.url);
const REQUIRED_IDS=Object.freeze(Array.from({length:20},(_,i)=>"C"+String(i+1).padStart(2,"0")));
const EXACT_SHA=/^[a-f0-9]{40}$/u;
const TRACE_FIELDS=Object.freeze(["route","roles","guards","checks","notifications","effects"]);
const SOURCE_IDS=Object.freeze(["SHELL","ASEN"]);
const trustedBaseline=Object.freeze({
 commit:"1f74e9e24473e7e121a96b1680444ae0196d3009",
 tree:"64d14750450d0144d65230eb0b6ecc69d841a8f3",version:"4.6.0",
});
const same=(obj,keys)=>Boolean(obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join("|")===[...keys].sort().join("|"));
export function validateShellAsenBaseline(input){
 assert.ok(same(input,["schema","purpose","reference","candidate","sources","cases",
  "slotsRequired","legacyTriadStatus","fullRequiresIndependentReview"]),
  "Unexpected primary reference manifest fields");
 assert.equal(input.schema,"asen-pi-shell-parity-baseline/v1");
 assert.ok(typeof input.purpose==="string"&&input.purpose.length>30);
 assert.ok(same(input.reference,["id","repository","tag","commit","tree","packageVersion","host"]));
 assert.equal(input.reference.id,"SHELL");
 assert.equal(input.reference.repository,"Gen"+"tleman-Programming/"+"gen"+"tle-shell");
 assert.equal(input.reference.tag,"v4.6.0");
 assert.equal(input.reference.commit,trustedBaseline.commit);
 assert.equal(input.reference.tree,trustedBaseline.tree);
 assert.equal(input.reference.packageVersion,trustedBaseline.version);
 assert.equal(input.reference.host,"pi");
 assert.deepEqual(input.candidate,{id:"ASEN",host:"pi"});
 assert.deepEqual(input.sources,SOURCE_IDS);
 assert.deepEqual(input.cases,REQUIRED_IDS);
 assert.equal(input.slotsRequired,40);
 assert.equal(input.legacyTriadStatus,"HISTORICAL_NON_NORMATIVE");
 assert.equal(input.fullRequiresIndependentReview,true);
 return Object.freeze(input);
}
const ALLOWED_FIELDS=Object.freeze([...TRACE_FIELDS]);
const MODES=new Set(["direct","read-only","safety","planning","write","review",
 "notification","recovery","provider-unavailable","human-decision","end-to-end"]);
const CONSENT_CASES=new Set(["C06","C07","C08","C18","C19","C20"]);
export function validateShellAsenScenarios(manifest){
 assert.ok(same(manifest,["schema","description","comparisonFields","sources","cases"]));
 assert.equal(manifest.schema,"asen-shell-asen-scenarios/v1");
 assert.ok(typeof manifest.description==="string"&&manifest.description.length>30);
 assert.deepEqual(manifest.comparisonFields,ALLOWED_FIELDS);
 assert.deepEqual(manifest.sources,SOURCE_IDS);
 assert.ok(Array.isArray(manifest.cases)&&manifest.cases.length===20);
 return manifest.cases.map((entry,i)=>{
  assert.ok(same(entry,["id","scenario","requiredObservableFields","mode",
   "requiresHumanConsent","stage"]));
  assert.equal(entry.id,REQUIRED_IDS[i]);
  assert.ok(typeof entry.scenario==="string"&&entry.scenario.length>=12&&entry.scenario.length<=512);
  assert.ok(MODES.has(entry.mode),"Unknown scenario mode");
  assert.equal(entry.requiresHumanConsent,CONSENT_CASES.has(entry.id));
  assert.equal(entry.stage,"NOT_EXECUTED","Scenario preflight cannot claim runtime execution");
  assert.ok(Array.isArray(entry.requiredObservableFields)&&entry.requiredObservableFields.length>0&&
   entry.requiredObservableFields.length<=ALLOWED_FIELDS.length&&
   new Set(entry.requiredObservableFields).size===entry.requiredObservableFields.length&&
   entry.requiredObservableFields.every(key=>ALLOWED_FIELDS.includes(key)),
   "Invalid observable contract fields");
  return Object.freeze({id:entry.id,mode:entry.mode,requiresHumanConsent:entry.requiresHumanConsent,
   requiredObservableFields:Object.freeze([...entry.requiredObservableFields]),
   stage:"NOT_EXECUTED"});
 });
}
export function buildShellAsenReadiness({candidateSha,baseline=JSON.parse(readFileSync(BASELINE_FILE,"utf8")),
 scenarios=JSON.parse(readFileSync(SCENARIOS_FILE,"utf8"))}){
 assert.match(candidateSha??"",EXACT_SHA,"Exact candidate SHA required");
 const reference=validateShellAsenBaseline(baseline);
 assert.notEqual(candidateSha,reference.reference.commit,"Candidate and reference cannot be same SHA");
 const cases=validateShellAsenScenarios(scenarios);
 assert.deepEqual(cases.map(x=>x.id),REQUIRED_IDS);
 const rows=cases.map(c=>Object.freeze({id:c.id,mode:c.mode,
  requiresHumanConsent:c.requiresHumanConsent,
  requiredObservableFields:c.requiredObservableFields,
  status:"BLOCKED_REAL_SHELL_AND_ASEN_EXECUTIONS",
  sources:Object.freeze([{source:"SHELL",sha:reference.reference.commit,status:"NOT_EXECUTED"},
   {source:"ASEN",sha:candidateSha,status:"NOT_EXECUTED"}])}));
 return Object.freeze({
  schema:"asen-shell-asen-readiness/v1",status:"PENDING_TWO_PI_RUNTIME_OBSERVATIONS",
  candidateSha,referenceSha:reference.reference.commit,referenceTag:reference.reference.tag,
  referenceTree:reference.reference.tree,referenceVersion:reference.reference.packageVersion,
  candidateHost:"pi",referenceHost:"pi",sources:SOURCE_IDS,
  casesPrepared:rows.length,sourceSlotsRequired:40,evidenceCaptured:0,
  shellCasesExecuted:0,asenCasesExecuted:0,casesBlocked:rows.length,
  rows,historicalTriad:{active:false,previousSlots:60,methodologyOnly:true},
  humanConsentReceived:false,independentReviewPerformed:false,
  globalFull:false,
  disclaimer:"Both actual Pi runtimes must execute the same cases and provide separately verified source/host receipts; matching self-supplied JSON, two --help outputs or a methodology installer do not prove parity.",
 });
}
/** Compare claimed observable values without ever certifying claimed runtime provenance.
 * The caller cannot change this module into an approval or independent audit.
 */
export function compareShellAsenClaims({readiness,observations}){
 assert.equal(readiness?.schema,"asen-shell-asen-readiness/v1");
 assert.ok(same(observations,["schema","candidateSha","referenceSha","rows"]));
 assert.equal(observations.schema,"asen-shell-asen-observations/v1");
 assert.equal(observations.candidateSha,readiness.candidateSha);
 assert.equal(observations.referenceSha,readiness.referenceSha);
 assert.ok(Array.isArray(observations.rows)&&observations.rows.length<=40);
 const slotMap=new Map();
 for(const row of observations.rows){
  assert.ok(same(row,["id","source","sha","execution","trace","receipt"]));
  assert.ok(REQUIRED_IDS.includes(row.id)&&SOURCE_IDS.includes(row.source));
  const expected=row.source==="SHELL"?readiness.referenceSha:readiness.candidateSha;
  assert.equal(row.sha,expected,"Foreign SHA in comparison");
  assert.ok(["real","static","simulated"].includes(row.execution));
  assert.ok(typeof row.receipt==="string"&&row.receipt.length>0&&row.receipt.length<=1024);
  assert.ok(same(row.trace,TRACE_FIELDS)&&typeof row.trace.route==="string");
  for(const key of TRACE_FIELDS.slice(1))assert.ok(Array.isArray(row.trace[key])&&
   row.trace[key].length<=100&&row.trace[key].every(x=>typeof x==="string"&&x.length<=120));
  const key=row.id+":"+row.source;
  assert.ok(!slotMap.has(key),"Duplicated Pi runtime observation");
  slotMap.set(key,row);
 }
 const cases=REQUIRED_IDS.map(id=>{
  const shell=slotMap.get(id+":SHELL"),asen=slotMap.get(id+":ASEN");
  if(!shell||!asen)return {id,status:"BLOCKED",reason:"TWO_PI_RUNS_REQUIRED"};
  if(shell.execution!=="real"||asen.execution!=="real")
   return {id,status:"BLOCKED",reason:"REAL_EXECUTION_REQUIRED"};
  const differences=TRACE_FIELDS.filter(field=>
   JSON.stringify(shell.trace[field])!==JSON.stringify(asen.trace[field]));
  return differences.length?
   {id,status:"DIFFERENCE_CLAIM_UNATTESTED",differences,reason:"INDEPENDENT_HOST_PROVENANCE_NOT_VERIFIED"}:
   {id,status:"MATCH_CLAIM_UNATTESTED",reason:"INDEPENDENT_HOST_PROVENANCE_NOT_VERIFIED"};
 });
 return Object.freeze({schema:"asen-shell-asen-observable-comparison/v1",
  candidateSha:readiness.candidateSha,referenceSha:readiness.referenceSha,
  requiredSlots:40,claimedSlots:slotMap.size,cases,
  certifiedMatches:0,certifiedDifferences:0,independentReviewPerformed:false,
  humanConsentReceived:false,globalFull:false,
  disclaimer:"Only a matching, authenticated host receipt and independent acceptance gate may promote a claimed comparison. This function never certifies FULL.",
 });
}
const ISO_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const RUN_FIELD=/^[1-9][0-9]*$/u;
const DIGEST64=/^[a-f0-9]{64}$/u;
/**
 * UFC-M5-06: convert one captured, graded C01 beam report into the observation pair the
 * shipped comparator consumes. Identity first: SHA equality against the readiness, plausible
 * CI run identity, a canonical non-symlink artifact whose bytes match the report exactly.
 * A report that already claims promotion is refused; execution may only be marked real when
 * the report carries the bounded agent-start proof. This never weakens comparator rules;
 * verdicts still leave the comparator UNATTESTED until attestC01Comparison sees genuine inputs.
 */
export function observationsFromC01Report({report,readiness,artifactPath}){
 assert.equal(report?.schema,"asen-r4-c01-two-real-pi-inferences/v1","only the shipped C01 beam report shape can be consumed");
 assert.equal(report?.caseId,"C01","the C01 adapter only consumes caseId C01");
 assert.equal(readiness?.schema,"asen-shell-asen-readiness/v1");
 assert.equal(report.candidateSha,readiness.candidateSha,"Foreign candidate SHA in the C01 report");
 assert.equal(report.referenceSha,readiness.referenceSha,"Foreign reference SHA in the C01 report");
 assert.equal(report.referenceSha,trustedBaseline.commit,"the C01 report must carry the frozen reference commit");
 assert.match(String(report.runId),RUN_FIELD,"a consumed report requires a real CI run identity");
 assert.match(String(report.runAttempt),RUN_FIELD,"a consumed report requires a real CI run attempt");
 assert.equal(report.modelCallsVerifiedByAgentStarts,true,"a consumed report must carry real-observation proof");
 assert.equal(report.certifiedFullCases,0,"capture reports never carry promotion state");
 assert.equal(report.globalFull,false,"capture reports never carry promotion state");
 assert.equal(report.independentReviewPerformed,false,"capture reports never carry promotion state");
 const answers=report.sourceAnswers;
 assert.ok(Array.isArray(answers)&&answers.length===2,"a C01 report must carry exactly two source answers");
 assert.ok(new Set(answers.map(a=>a.source)).size===2,"Duplicated source answers in the C01 report");
 assert.deepEqual(answers.map(a=>a.source).sort(),["ASEN","SHELL"]);
 let canonical;
 try{canonical=realpathSync(artifactPath);}
 catch{throw new Error("artifact path must be canonical, never symlinked or redirected");}
 assert.equal(canonical,resolve(artifactPath),"artifact path must be canonical, never symlinked or redirected");
 const parsed=JSON.parse(readFileSync(canonical,"utf8"));
 assert.deepEqual(parsed,report,"artifact bytes do not match the consumed report");
 const rows=answers.map(a=>{
  assert.ok(same(a,["source","outputDigest","answerDigest","answerSample","answerChars",
   "toolCalls","agentStarts","model","hostVersion","projectUnchanged"]),
   `unexpected C01 answer shape for ${a?.source}`);
  assert.match(a.outputDigest,DIGEST64,`${a.source}: bounded output digest is required for a real observation`);
  assert.match(a.answerDigest,DIGEST64,`${a.source}: bounded answer digest is required`);
  assert.ok(Number.isInteger(a.agentStarts)&&a.agentStarts>=1&&a.agentStarts<=2,
   `${a.source}: a real observation needs a bounded agent-start count`);
  assert.ok(Number.isInteger(a.toolCalls)&&a.toolCalls>=0,`${a.source}: tool-call count missing`);
  assert.ok(Number.isInteger(a.answerChars)&&a.answerChars>=1&&a.answerChars<=8000,
   `${a.source}: real answer text is required for a real observation`);
  assert.ok(typeof a.answerSample==="string"&&a.answerSample.length>=1&&a.answerSample.length<=300,
   `${a.source}: answer sample missing`);
  assert.equal(a.hostVersion,"1.2.0",`${a.source}: pinned host version required`);
  assert.match(a.model,/^[A-Za-z0-9][A-Za-z0-9.:-]{0,59}$/u,`${a.source}: model identity required`);
  const bound=a.source==="SHELL"?report.referenceSha:report.candidateSha;
  return Object.freeze({id:report.caseId,source:a.source,sha:bound,execution:"real",
   trace:Object.freeze({route:`pi:${a.hostVersion}/model:${a.model}`,
    roles:Object.freeze([`assistant-turns:${a.agentStarts}`]),
    guards:Object.freeze(a.toolCalls===0?["no-tool-calls"]:["tool-calls-observed"]),
    checks:Object.freeze(a.projectUnchanged?["fixture-unchanged"]:["fixture-changed"]),
    notifications:Object.freeze(["bounded-answer-observed"]),
    effects:Object.freeze(a.projectUnchanged?[]:["filesystem-mutation"])}),
   receipt:`c01-beam run=${report.runId}/${report.runAttempt} sha=${bound.slice(0,12)} `+
    `out=${a.outputDigest.slice(0,16)} answer=${a.answerDigest.slice(0,16)}`});
 });
 return Object.freeze({schema:"asen-shell-asen-observations/v1",
  candidateSha:report.candidateSha,referenceSha:report.referenceSha,rows:Object.freeze(rows)});
}
/** Consent for parity consumption: SHA-bound, run-bound, single-decision, never replayable. */
export function validateParityConsentReceipt(receipt,run){
 assert.ok(same(receipt,["schema","receiptId","grantedBy","grantedAt","candidateSha","decision","runId","runAttempt"]),
  "Unexpected consent receipt shape");
 assert.equal(receipt.schema,"asen-parity-consent-receipt/v1");
 assert.match(receipt.receiptId,/^[a-z0-9][a-z0-9._-]{7,63}$/u,"Invalid consent receiptId");
 assert.match(receipt.grantedBy,/^owner:[A-Za-z0-9._-]{1,100}$/u,"consent must be granted under an owner identity");
 assert.match(receipt.grantedAt,ISO_TIME,"Invalid grantedAt time");
 assert.match(receipt.candidateSha,EXACT_SHA,"consent receipt requires the exact candidate SHA");
 assert.match(String(receipt.runId),RUN_FIELD,"consent receipt requires a real run id");
 assert.match(String(receipt.runAttempt),RUN_FIELD,"consent receipt requires a real run attempt");
 assert.equal(receipt.decision,"consumption-and-attestation-wiring",
  "only the consumption-and-attestation-wiring decision may be consented here");
 if(run!==undefined){
  assert.equal(receipt.candidateSha,run.candidateSha,"consent receipt is not bound to this candidate SHA");
  assert.equal(String(receipt.runId)===String(run.runId)&&String(receipt.runAttempt)===String(run.runAttempt),true,
   "consent receipt is bound to a different run and is not replayable into this run");
 }
 return Object.freeze(receipt);
}
/** The independent witness: a reviewer identity that is not the granting owner. */
export function validateParityReviewRecord(record,run){
 assert.ok(same(record,["schema","reviewerId","performedAt","candidateSha","runId","runAttempt","verdict","findings"]),
  "Unexpected independent review record shape");
 assert.equal(record.schema,"asen-parity-independent-review/v1");
 assert.match(record.reviewerId,/^[a-z][a-z0-9._:-]{3,99}$/u,"Invalid reviewer identity");
 assert.ok(!/^owner:/u.test(record.reviewerId),"the reviewer identity must be independent of the owner grant");
 assert.match(record.performedAt,ISO_TIME,"Invalid performedAt time");
 assert.match(record.candidateSha,EXACT_SHA,"review record requires the exact candidate SHA");
 assert.match(String(record.runId),RUN_FIELD,"review record requires a real run id");
 assert.match(String(record.runAttempt),RUN_FIELD,"review record requires a real run attempt");
 assert.equal(record.verdict,"approved","Independent review verdict must be approved to witness attestation");
 assert.ok(typeof record.findings==="string"&&record.findings.length>=10&&record.findings.length<=512,
  "Missing findings: an empty review proves nothing");
 if(run!==undefined){
  assert.equal(record.candidateSha,run.candidateSha,"review record is not bound to this candidate SHA");
  assert.equal(String(record.runId)===String(run.runId)&&String(record.runAttempt)===String(run.runAttempt),true,
   "review record is bound to a different run and is not replayable into this run");
 }
 return Object.freeze(record);
}
/**
 * Only an out-of-band authority may supply these independent signing keys.
 * Well-shaped, unkeyed owner/reviewer strings are NOT evidence of real consent
 * or an independent review. Signed v2 records are bound to exactly one run.
 */
export function signParityProvenanceRecord(record,key){
 assert.ok(Buffer.isBuffer(key)&&key.length>=32,"attestation key must be a 32+ byte secret");
 assert.ok(record&&typeof record==="object"&&!Object.hasOwn(record,"signature"),
  "cannot sign an already signed or malformed attestation record");
 const canonical=Object.fromEntries(Object.entries(record).sort(([a],[b])=>a<b?-1:a>b?1:0));
 return Object.freeze({...record,signature:"hmac-sha256:"+createHmac("sha256",key)
  .update("asen.parity.attestation.v2\0").update(JSON.stringify(canonical)).digest("hex")});
}
function verifyParityProvenanceRecord(record,key){
 if(!Buffer.isBuffer(key)||key.length<32||typeof record?.signature!=="string"||
    !/^hmac-sha256:[a-f0-9]{64}$/iu.test(record.signature))return false;
 const {signature,...data}=record;
 const expected=signParityProvenanceRecord(data,key).signature;
 return timingSafeEqual(Buffer.from(signature.slice(12),"hex"),Buffer.from(expected.slice(12),"hex"));
}

/**
 * UFC-M5-06 attestation: with NO inputs the comparison is returned byte-identical — genuine
 * runs must not stay inert, but nothing gets promoted either. A partial pair fails closed.
 * With both genuine inputs the per-case claim status moves from *_UNATTESTED to *_ATTESTED
 * for exactly this run identity; certified counters and globalFull remain untouched here.
 * Registry stage advancement stays owned by CI assembly and independent acceptance.
 */
export function attestC01Comparison({comparison,consentReceipt,reviewRecord,runContext,provenance}){
 assert.equal(comparison?.schema,"asen-shell-asen-observable-comparison/v1");
 assert.equal(comparison?.referenceSha,trustedBaseline.commit,"the comparison must carry the frozen reference");
 assert.match(runContext?.candidateSha??"",EXACT_SHA,"run identity requires the exact candidate SHA");
 assert.match(String(runContext?.runId),RUN_FIELD,"attestation requires a real run id");
 assert.match(String(runContext?.runAttempt),RUN_FIELD,"attestation requires a real run attempt");
 assert.equal(comparison.candidateSha,runContext.candidateSha,
  "run identity mismatch between attestation context and comparison");
 const hasConsent=consentReceipt!==undefined,hasReview=reviewRecord!==undefined;
 assert.ok(hasConsent===hasReview,
  "attestation requires both a consent receipt and an independent review record");
 if(!hasConsent)return comparison;
 // Neither a self-declared reviewerId nor matching run fields authenticates a human.
 // Trust anchors come from the admission host, NEVER from the submitted records.
 assert.ok(provenance&&Buffer.isBuffer(provenance.ownerKey)&&
  Buffer.isBuffer(provenance.reviewerKey)&&provenance.ownerKey.length>=32&&
  provenance.reviewerKey.length>=32&&!provenance.ownerKey.equals(provenance.reviewerKey),
  "Attestation requires independent trusted owner and reviewer keys");
 assert.ok(verifyParityProvenanceRecord(consentReceipt,provenance.ownerKey),
  "Owner consent provenance is unverified");
 assert.ok(verifyParityProvenanceRecord(reviewRecord,provenance.reviewerKey),
  "Independent review provenance is unverified");
 const {signature:ownerSignature,...ownerFacts}=consentReceipt;
 const {signature:reviewSignature,...reviewFacts}=reviewRecord;
 validateParityConsentReceipt(ownerFacts,runContext);
 validateParityReviewRecord(reviewFacts,runContext);
 assert.notEqual(reviewRecord.reviewerId,consentReceipt.grantedBy,
  "the reviewer identity must be independent of the granting owner identity");
 const upgrade={MATCH_CLAIM_UNATTESTED:"MATCH_CLAIM_ATTESTED",
  DIFFERENCE_CLAIM_UNATTESTED:"DIFFERENCE_CLAIM_ATTESTED"};
 const cases=comparison.cases.map(row=>Object.freeze(upgrade[row.status]
  ?{...row,status:upgrade[row.status],attestation:"consent-and-independent-review-recorded"}:row));
 return Object.freeze({...comparison,cases:Object.freeze(cases),
  attestation:Object.freeze({consentReceiptId:consentReceipt.receiptId,grantedBy:consentReceipt.grantedBy,
   grantedAt:consentReceipt.grantedAt,reviewerId:reviewRecord.reviewerId,
   performedAt:reviewRecord.performedAt,decision:consentReceipt.decision}),
  independentReviewPerformed:true,
  disclaimer:"Attested claims bind exactly one CI run identity (candidate SHA, runId, runAttempt). Certified counters stay zero and globalFull stays false here: registry stage advancement remains owned by CI assembly and independent acceptance."});
}
function main(){
 const env=process.env;
 assert.equal(env.GITHUB_ACTIONS,"true","Only a real GitHub run can issue this readiness report");
 assert.equal(env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 assert.equal(env.GITHUB_EVENT_NAME,"pull_request");
 assert.equal(env.GITHUB_HEAD_REF,"feat/t12-integrated-acceptance-merge");
 const sha=env.ASEN_EXPECTED_SHA;
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",timeout:5000}).trim(),sha,
  "Readiness must match the candidate checkout");
 const report=buildShellAsenReadiness({candidateSha:sha});
 mkdirSync("r4-shell-asen-evidence",{mode:0o700});
 writeFileSync(resolve("r4-shell-asen-evidence/readiness.json"),
  JSON.stringify({...report,provenance:{runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT}},null,2)+"\n",
  {flag:"wx",mode:0o600});
 console.log(JSON.stringify({schema:report.schema,status:report.status,
  candidateSha:report.candidateSha,referenceSha:report.referenceSha,
  casesPrepared:20,requiredSlots:40,certifiedCases:0,globalFull:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(e){console.error("SHELL_ASEN_R4_REJECTED: "+(e instanceof Error?e.message:"unknown"));process.exitCode=1;}
}
