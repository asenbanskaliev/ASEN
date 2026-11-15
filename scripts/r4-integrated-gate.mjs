/** R4-02/03: same-workflow exact-SHA technical gate.
 * GitHub-native needs results are NOT independent review, Release Gate or
 * external A/B/Writer/LLM observations. No provider and no repository write.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildR4RequirementInventory} from "./r4-requirement-inventory.mjs";

export const REQUIRED_JOBS=Object.freeze([
 "test-shard-coverage","architecture","t12-integrated-security",
 "pi-support-matrix","t12-real-pi-tui-dialog",
]);
const shaPattern=/^[a-f0-9]{40}$/u;
const runPattern=/^[1-9][0-9]*$/u;
const expectedRepo="asenbanskaliev/ASEN";
const expectedBranch="feat/t12-integrated-acceptance-merge";
const reviewedRepairBranch="fix/ci-portable-baseline-20261113";
const allowedHead=(branch,baseRef)=>branch===expectedBranch||branch===reviewedRepairBranch&&baseRef===expectedBranch;

export function evaluateR4IntegratedGate({expectedSha,headSha,repository,branch,baseRef,eventName,
 runId,runAttempt,jobs,inventory}){
 assert.ok(inventory?.schema==="asen-r4-requirement-inventory/v1",
  "R4 needs validated inventory, not a caller's FULL assertion");
 assert.ok(jobs&&typeof jobs==="object"&&!Array.isArray(jobs),
  "R4 job results must be an object from this workflow");
 assert.deepEqual(Object.keys(jobs).sort(),[...REQUIRED_JOBS].sort(),
  "R4 needs exactly the known same-workflow prerequisites");
 for(const status of Object.values(jobs))assert.ok(typeof status==="string"&&
  ["success","failure","cancelled","skipped","timed_out","action_required"].includes(status),
  "Invalid GitHub job state");
 const checks=[
  {id:"candidate_exact_sha",passed:shaPattern.test(expectedSha??"")&&headSha===expectedSha,
   evidence:"Git checkout HEAD compared with immutable PR head"},
  {id:"allowed_repository",passed:repository===expectedRepo,evidence:"GitHub event repository"},
  {id:"allowed_branch",passed:eventName==="pull_request"&&allowedHead(branch,baseRef),
   evidence:"Explicit PR-only CI scope"},
  {id:"same_workflow_run",passed:runPattern.test(String(runId??""))&&
   runPattern.test(String(runAttempt??"")),evidence:"GitHub Actions run and attempt IDs"},
  {id:"requirements_inventory",passed:inventory.summary.efTotal===28&&
   inventory.summary.uiTotal===14&&inventory.summary.abCases===20&&
   inventory.summary.uiCases===24&&inventory.summary.specs===20&&
   inventory.summary.sourceSlotsRequired===40&&
   inventory.comparisonSources?.join(",")==="SHELL,ASEN",
   evidence:"28 EF, 14 UI, 20 Shell/ASEN cases, 40 two-Pi slots, 24 UI-C and 20 specs"},
  ...REQUIRED_JOBS.map(id=>({id:"same_run_"+id,passed:jobs[id]==="success",
   evidence:"Native needs."+id+".result="+jobs[id]})),
 ];
 const passed=checks.every(x=>x.passed);
 return Object.freeze({
  schema:"asen-r4-integrated-technical/v1",mode:"AUTOMATED_TECHNICAL_ONLY",
  candidateSha:expectedSha,observedCheckoutSha:headSha,repository,branch,baseRef:baseRef??null,
  provenance:{source:"GITHUB_ACTIONS_SAME_WORKFLOW_NEEDS",runId:String(runId),runAttempt:String(runAttempt),
   crossWorkflowReleaseGate:"NOT_EVALUATED",externalGitHubHistory:"NOT_EVALUATED"},
  status:passed?"R4_TECHNICAL_PASS":"R4_TECHNICAL_FAIL",
  technicalChecks:checks,requirements:inventory,
  externalEvidence:{
   shellParity:"NOT_ATTESTED",realModelPerRole:"NOT_ATTESTED",
   writerHumanConsent:"NOT_ATTESTED",independentReviewer:"NOT_ATTESTED",
   nativeUiParity:"NOT_ATTESTED",releaseGate:"NOT_EVALUATED",
  },
  independentReviewPerformed:false,writerAuthorized:false,globalFull:false,
  disclaimer:"Technical PASS covers only mandatory jobs in this exact CI run. It never certifies FULL, historical CI references, human consent, external Release Gate, or independent R4.",
 });
}
function repositoryInventory(){
 const read=path=>readFileSync(resolve(path),"utf8");
 return buildR4RequirementInventory({
  efMarkdown:read("odd/tasks/equivalencia-funcional-agentes-full.md"),
  uiMarkdown:read("odd/tasks/"+"gen"+"tle-shell-v4.6.0-paridad-ui-odd.md"),
 });
}
export function githubActionInput(env,headSha,inventory){
 assert.equal(env.GITHUB_ACTIONS,"true","R4 evidence may only be emitted by a real GitHub Actions run");
 assert.equal(env.GITHUB_EVENT_NAME,"pull_request","R4 is scoped to PR events");
 assert.equal(env.GITHUB_REPOSITORY,expectedRepo,"R4 repository provenance mismatch");
 assert.ok(allowedHead(env.GITHUB_HEAD_REF,env.GITHUB_BASE_REF),"R4 branch or target provenance mismatch");
 assert.ok(typeof env.ASEN_R4_JOB_RESULTS==="string"&&env.ASEN_R4_JOB_RESULTS.length<4096,
  "Missing or oversized native needs result");
 const jobs=JSON.parse(env.ASEN_R4_JOB_RESULTS);
 return {expectedSha:env.ASEN_EXPECTED_SHA,headSha,repository:env.GITHUB_REPOSITORY,
  branch:env.GITHUB_HEAD_REF,baseRef:env.GITHUB_BASE_REF,eventName:env.GITHUB_EVENT_NAME,
  runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,jobs,inventory};
}
function main(){
 const headSha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",timeout:5000}).trim();
 const report=evaluateR4IntegratedGate(githubActionInput(process.env,headSha,repositoryInventory()));
 const outDir=resolve("r4-integrated-evidence");
 mkdirSync(outDir,{recursive:false,mode:0o700});
 writeFileSync(resolve(outDir,"r4-integrated-report.json"),JSON.stringify(report,null,2)+"\n",
  {flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:report.status,sha:report.candidateSha,
  runId:report.provenance.runId,failed:report.technicalChecks.filter(x=>!x.passed).map(x=>x.id),
  counts:report.requirements.summary,globalFull:false}));
 if(report.status!=="R4_TECHNICAL_PASS")process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(err){console.error("R4_INTEGRATED_REJECTED: "+(err instanceof Error?err.message:"unknown"));process.exitCode=1;}
}
