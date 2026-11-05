import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {buildR4RequirementInventory} from "../scripts/r4-requirement-inventory.mjs";
import {evaluateR4IntegratedGate,githubActionInput,REQUIRED_JOBS} from "../scripts/r4-integrated-gate.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const read=path=>readFileSync(resolve(root,path),"utf8");
const efMarkdown=read("odd/tasks/equivalencia-funcional-agentes-full.md");
const uiMarkdown=read("odd/tasks/gentle-shell-v4.6.0-paridad-ui-odd.md");
const inventory=()=>buildR4RequirementInventory({efMarkdown,uiMarkdown});
const sha="a".repeat(40);
const jobs=()=>Object.fromEntries(REQUIRED_JOBS.map(x=>[x,"success"]));
const candidate=(overrides={})=>({expectedSha:sha,headSha:sha,repository:"asenbanskaliev/ASEN",
 branch:"feat/t12-integrated-acceptance-merge",eventName:"pull_request",
 runId:"40101",runAttempt:"1",jobs:jobs(),inventory:inventory(),...overrides});

test("R4-01 inventories all 28 EF, S01-S20, 14 UI and both acceptance matrices without upgrading checks",()=>{
 const x=inventory();
 assert.equal(x.schema,"asen-r4-requirement-inventory/v1");
 assert.equal(x.summary.efTotal,28);
 assert.equal(x.summary.uiTotal,14);
 assert.equal(x.summary.abCases,20);
 assert.equal(x.summary.uiCases,24);
 assert.equal(x.summary.specs,20);
 assert.equal(x.summary.efCheckedHistorical+x.summary.efPartial+x.summary.efBlocked,28);
 assert.equal(x.summary.uiCheckedHistorical+x.ui.filter(row=>row.status==="PENDING").length,14);
 assert.ok(x.abCases.every(row=>["PENDING","PASS","FAIL","BLOCKED"].includes(row.status)));
 assert.ok(x.uiCases.every(row=>row.owners.length>0&&row.finalGate));
 assert.ok(x.uiCases.find(row=>row.id==="UI-C08").owners.includes("UI-02"));
});
test("R4-01 rejects missing, duplicated or prematurely claimed canonical requirements",()=>{
 assert.throws(()=>buildR4RequirementInventory({efMarkdown:efMarkdown.replace("- [x] EF-202","- [x] EF-999"),uiMarkdown}),
  /EF checklist/u);
 assert.throws(()=>buildR4RequirementInventory({efMarkdown,uiMarkdown:uiMarkdown.replace("UI-C05\/06\/07\/08\/10","UI-C05/06/07/10")}),
  /implementation owner/u);
 assert.throws(()=>buildR4RequirementInventory({efMarkdown:efMarkdown.replace("| C20 |","| C19 |"),uiMarkdown}),
  /A\/B cases/u);
 assert.throws(()=>buildR4RequirementInventory({efMarkdown,uiMarkdown:uiMarkdown.replace("| UI-C24 |","| UI-C23 |")}),
  /UI-C01\.\.24/u);
});
test("R4-02 can pass only the same-run technical gate without promoting any EF, UI, Writer or FULL",()=>{
 const report=evaluateR4IntegratedGate(candidate());
 assert.equal(report.status,"R4_TECHNICAL_PASS");
 assert.equal(report.globalFull,false);
 assert.equal(report.independentReviewPerformed,false);
 assert.equal(report.writerAuthorized,false);
 assert.equal(report.externalEvidence.referenceAB,"NOT_ATTESTED");
 assert.equal(report.externalEvidence.releaseGate,"NOT_EVALUATED");
 assert.equal(report.provenance.crossWorkflowReleaseGate,"NOT_EVALUATED");
 assert.equal(report.requirements.summary.efCheckedHistorical,inventory().summary.efCheckedHistorical);
 assert.equal(report.requirements.summary.uiCheckedHistorical,inventory().summary.uiCheckedHistorical);
});
for(const state of ["failure","skipped","cancelled","action_required"]){
 test("R4-02 rejects a mandatory same-run job with result "+state,()=>{
  const statuses=jobs();statuses["pi-support-matrix"]=state;
  const report=evaluateR4IntegratedGate(candidate({jobs:statuses}));
  assert.equal(report.status,"R4_TECHNICAL_FAIL");
  assert.equal(report.technicalChecks.find(x=>x.id==="same_run_pi-support-matrix")?.passed,false);
  assert.equal(report.globalFull,false);
 });
}
test("R4-02 rejects missing or fabricated job evidence",()=>{
 const status=jobs();delete status["test-shard-coverage"];
 assert.throws(()=>evaluateR4IntegratedGate(candidate({jobs:status})),/exactly the known/u);
 assert.throws(()=>evaluateR4IntegratedGate(candidate({jobs:{...jobs(),faker:"success"}})),/exactly the known/u);
 assert.throws(()=>evaluateR4IntegratedGate(candidate({jobs:{...jobs(),architecture:"conclusion_approved"}})),/Invalid GitHub job state/u);
});
test("R4-02 wrong SHA, wrong repository, branch, event or absent run ID never passes",()=>{
 for(const modified of [{headSha:"b".repeat(40)},{expectedSha:"b".repeat(40)},
  {repository:"other/fork"},{branch:"feat/t05-independent-review"},{eventName:"push"},
  {runId:"0"},{runAttempt:""}]){
  const out=evaluateR4IntegratedGate(candidate(modified));
  assert.equal(out.status,"R4_TECHNICAL_FAIL");
  assert.equal(out.globalFull,false);
 }
});
test("R4-02 input provenance refuses local fakes and oversized job payloads",()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"pull_request",
  GITHUB_REPOSITORY:"asenbanskaliev/ASEN",GITHUB_HEAD_REF:"feat/t12-integrated-acceptance-merge",
  GITHUB_RUN_ID:"40101",GITHUB_RUN_ATTEMPT:"1",ASEN_EXPECTED_SHA:sha,
  ASEN_R4_JOB_RESULTS:JSON.stringify(jobs())};
 const values=githubActionInput(env,sha,inventory());
 assert.equal(values.expectedSha,sha);
 assert.deepEqual(values.jobs,jobs());
 assert.throws(()=>githubActionInput({...env,GITHUB_ACTIONS:"false"},sha,inventory()),/real GitHub Actions/u);
 assert.throws(()=>githubActionInput({...env,ASEN_R4_JOB_RESULTS:"x".repeat(4097)},sha,inventory()),/oversized/u);
 assert.throws(()=>githubActionInput({...env,GITHUB_REPOSITORY:"someone/else"},sha,inventory()),/repository provenance/u);
});
