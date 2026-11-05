/** R4-04 active parity: a single Pi-based Shell reference vs Pi-based ASEN.
 * The retired A/B/ASEN three-run ledger remains historical, never a FULL gate.
 * This module can expose gaps and differences, not independently attest execution.
 */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
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
