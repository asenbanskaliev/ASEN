import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
const planner=readFileSync(new URL("../scripts/t12-real-model-plan.mjs",import.meta.url),"utf8");
const reviewVerifier=readFileSync(new URL("../scripts/t12-real-review-verifier.mjs",import.meta.url),"utf8");
const adversarialReview=readFileSync(new URL("../skills/asen-adversarial-review/SKILL.md",import.meta.url),"utf8");
const verificationSkill=readFileSync(new URL("../skills/asen-verify/SKILL.md",import.meta.url),"utf8");

test("T12 Pi child stages resolve the npm-installed runtime from PATH",()=>{
 for(const name of [
  "Real ASEN Dispatcher explorer with Ollama Cloud (read-only)",
  "Real model planning on graded ASEN Explorer findings",
  "Real ASEN Reviewer (two blind judgments) and Verifier reject deliberate defects",
 ]){
  const heading=`      - name: ${name}`;
  const start=workflow.indexOf(heading);
  assert.notEqual(start,-1,`Missing workflow stage: ${name}`);
  const end=workflow.indexOf("\n      - name:",start+heading.length);
  const stage=workflow.slice(start,end===-1?undefined:end);
  assert.match(stage,/export PATH="\$PWD\/node_modules\/\.bin:\$PATH"/,
   `${name} must expose the pinned, locally installed Pi executable to spawned ASEN children`);
  assert.match(stage,/node --import tsx scripts\/t12-[^ ]+\.mjs/u,
   `${name} imports TypeScript-authored modules and must install the tsx loader`);
 }
});

test("T12 Planner uses the ASEN Dispatcher with pinned no-tools provider isolation",()=>{
 assert.match(planner,/new Dispatcher\(runner,new EvidenceStore\(\),1\)/);
 assert.match(planner,/new PiArtifactRunner\(new PiProcessRunner/);
 assert.match(planner,/expectedPhase:"tasks"/);
 assert.match(planner,/noTools:true/);
 assert.match(planner,/providerExtension:"npm:pi-ollama-cloud@0\.13\.1"/);
 assert.match(planner,/providerCredential:"OLLAMA_API_KEY"/);
 assert.doesNotMatch(planner,/\bspawn\(/);
});

test("T12 five-call live lane spends the budget on Explorer, Planner, two blind reviewers and Verifier",()=>{
 const smokeHeading="      - name: Bounded Ollama Cloud provider smoke";
 const smokeStart=workflow.indexOf(smokeHeading);
 assert.notEqual(smokeStart,-1,"Missing bounded Ollama connectivity smoke");
 const smokeEnd=workflow.indexOf("\n      - name:",smokeStart+smokeHeading.length);
 const smoke=workflow.slice(smokeStart,smokeEnd===-1?undefined:smokeEnd);
 assert.match(smoke,/ASEN_MAX_INFERENCE_CALLS.*3/u,"Standalone smoke belongs only to the 3-call lane");
 assert.ok(smoke.indexOf('if test "$ASEN_MAX_INFERENCE_CALLS" != "3"')<smoke.indexOf("node scripts/t12-inference-budget.mjs"),
  "Five-call mode must skip, not merely relabel, the standalone smoke request");

 assert.match(reviewVerifier,/for\s*\(const judge of \["judge-a","judge-b"\]\)/u,
  "The ASEN adversarial-review stage requires two separate blind judgments");
 assert.match(reviewVerifier,/reserveInferenceCall/u);
 assert.match(reviewVerifier,/noTools:true/u);
 assert.match(reviewVerifier,/gradeRealReview/u);
 assert.match(reviewVerifier,/gradeRealVerification/u);
 assert.match(reviewVerifier,/candidateSha/u);
 assert.match(reviewVerifier,/Every failed test observation must include `AssertionError` or the word `failed`/u,
  "Verifier prompt must explicitly require evidence fields accepted by the deterministic grader");
 assert.match(reviewVerifier,/criterion must exactly equal the corresponding `failedCriterion` input value/u,
  "Verifier prompt must preserve the exact deterministic acceptance criterion");
 assert.match(reviewVerifier,/gradingError:error instanceof Error\?error\.message\.split\("\\n",1\)\[0\]\.slice\(0,160\)/u,
  "Verifier rejection evidence must preserve a bounded deterministic grading diagnostic");
 assert.match(reviewVerifier,/verificationSha256:verification\.responseSha256/u,
  "Verifier rejection evidence must bind its response hash without uploading raw output");
 assert.match(reviewVerifier,/normalizeVerifierTestEvidence\(testEvidence\)/u,
  "Runtime `failedCriterion` evidence must be normalized before it reaches the Verifier grader");
 assert.match(reviewVerifier,/testEvidence:verificationTestEvidence/u,
  "Verifier grading must consume normalized evidence with exact criterion values");
 assert.match(workflow,/Real ASEN Reviewer \(two blind judgments\) and Verifier reject deliberate defects[\s\S]{0,160}if: env\.ASEN_MAX_INFERENCE_CALLS == '5'/u);
 const setupHeading="      - name: Install pinned Ollama Cloud provider extension";
 const setupStart=workflow.indexOf(setupHeading);
 assert.notEqual(setupStart,-1,"Missing pinned provider setup stage");
 const setupEnd=workflow.indexOf("\n      - name:",setupStart+setupHeading.length);
 const setup=workflow.slice(setupStart,setupEnd===-1?undefined:setupEnd);
 assert.match(setup,/node scripts\/t12-pi-retry-settings\.mjs > asen-acceptance-evidence\/pi-retry-settings\.json/u,
  "Provider retry settings must be merged after installation and only the redacted summary may be preserved");
 assert.doesNotMatch(setup,/cp .*settings\.json/u,
  "Full Pi settings must not be copied into provider evidence");
 assert.match(workflow,/name: Pi retry settings preserve installed extensions[\s\S]{0,100}tests\/t12-pi-retry-settings\.test\.ts/u,
  "The installed-extension preservation regression must run in provider-free CI");
 assert.match(adversarialReview,/one blind judge/u,
  "Each dispatched reviewer must perform only its assigned judgment");
 assert.match(adversarialReview,/tools are unavailable/u,
  "Complete frozen evidence must not trigger a tool request");
 assert.match(verificationSkill,/already supplied by the caller/u,
  "The verifier must consume fresh supplied execution evidence without requesting tools");
 assert.match(verificationSkill,/report non-compliant/u,
  "Missing execution evidence must remain a failure");
});

test("T12 provider-free acceptance runs the existing interruption, recovery, timeout and quota suites",()=>{
 const heading="      - name: F6 interruption, restart, authorization and provider failure regressions";
 const start=workflow.indexOf(heading);
 assert.notEqual(start,-1,"Missing bounded F6 provider-free regression stage");
 const end=workflow.indexOf("\n      - name:",start+heading.length);
 const stage=workflow.slice(start,end===-1?undefined:end);
 for(const path of [
  "tests/agent-store.test.ts",
  "tests/authorized-write-recovery.test.ts",
  "tests/eco06-interrupted-writer.test.ts",
  "tests/eco07-provider-failure.test.ts",
  "tests/pi-process-runner.test.ts",
  "tests/pi-session-recovery-e2e.test.ts",
  "tests/session-recovery-e2e.test.ts",
 ])assert.ok(stage.includes(path),`F6 acceptance omits ${path}`);
});

test("T12 push scope includes the real-provider acceptance scripts, not just tests or workflow YAML",()=>{
 assert.match(workflow,/^\s+- scripts\/t12-\*\.mjs$/mu);
 assert.match(workflow,/^\s+- tests\/\*\*$/mu);
 assert.match(workflow,/^\s+- src\/\*\*$/mu);
});

test("T12 workflow tests durable budget recovery and a disposable correction without agent authority",()=>{
 assert.match(workflow,/F6 cross-process inference recovery, corruption and negative checks/);
 assert.match(workflow,/node --import tsx --test tests\/t12-inference-budget\.test\.ts/);
 assert.match(workflow,/tests\/t12-disposable-correction\.test\.ts/);
 assert.match(workflow,/Inspect call receipts without spending another inference request/);
 assert.match(workflow,/node scripts\/t12-inference-budget\.mjs --report/);
});

test("T12 real acceptance never selects a miscellaneous Ollama model as fallback",()=>{
 const start=workflow.indexOf("      - name: Install pinned Ollama Cloud provider extension");
 const end=workflow.indexOf("\n      - name:",start+12);
 const section=workflow.slice(start,end);
 assert.match(section,/elif grep -Fxq "beam" asen-acceptance-evidence\/registered-model-ids\.txt/);
 assert.match(section,/Neither the pinned Beam model nor its registered alias is available/);
 assert.doesNotMatch(section,/selected="\$\(head -n 1/);
});
test("T12 live acceptance requires exact-SHA grades and retains explicit opt-in",()=>{
 assert.match(workflow,/github\.event\.head_commit\.message == 'ci: one-time Ollama Cloud provider smoke'/);
 assert.match(workflow,/Verify real provider grades and exact-SHA call receipts without inference/);
 assert.match(workflow,/node scripts\/t12-live-evidence-gate\.mjs/);
 assert.match(workflow,/tests\/t12-live-evidence-gate\.test\.ts/);
 assert.match(workflow,/PASS_BOUNDED_READ_ONLY/);
 assert.match(workflow,/PARTIAL_CALL_BUDGET/);
});

test("T12 Verifier prompt requires all three canonical reviewer findings after a real omission",()=>{
 assert.match(reviewVerifier,/review evidence MUST contain exactly three entries/);
 assert.match(reviewVerifier,/Required review\.findings objects, one per path, in canonical order/);
 assert.match(reviewVerifier,/judgeResults\[0\]\.grade\.findings\.map/);
 assert.match(reviewVerifier,/verifierReviewPaths/);
 assert.match(reviewVerifier,/verifierEvidenceKinds/);
 assert.match(reviewVerifier,/verificationSha256:verification\.responseSha256/);
});

test("T12 Explorer binds an explicit eight-field JSON schema and never logs model text on schema failure",()=>{
 const explorer=readFileSync(new URL("../scripts/t12-ollama-asen-dispatcher.mjs",import.meta.url),"utf8");
 assert.match(explorer,/inspectExplorerSchema\(content\)/);
 assert.match(explorer,/EXPLORATION_SCHEMA_INVALID/);
 assert.match(explorer,/observedShape:shape\.observedShape/);
 assert.match(explorer,/All eight top-level fields are REQUIRED/);
 assert.match(workflow,/tests\/t12-explorer-schema\.test\.ts/);
});

test("T12 Explorer requires an issued in-memory artifact proof for exact request and candidate",()=>{
 const explorer=readFileSync(new URL("../scripts/t12-ollama-asen-dispatcher.mjs",import.meta.url),"utf8");
 assert.match(explorer,/isIssuedAgentArtifactProof\(proof\)/u);
 assert.match(explorer,/proof\.requestId!==candidate\.id\+":explorer"/u);
 assert.match(explorer,/proof\.candidateId!==candidate\.id/u);
 assert.match(explorer,/proof\.candidateRevision!==revision/u);
 assert.match(explorer,/proof\.repository!==repository/u);
});
test("T12 provider evidence verifies ordered inference receipts before reporting any live acceptance",()=>{
 const gate=readFileSync(new URL("../scripts/t12-live-evidence-gate.mjs",import.meta.url),"utf8");
 const budget=readFileSync(new URL("../scripts/t12-inference-budget.mjs",import.meta.url),"utf8");
 assert.match(gate,/readInferenceBudgetReceipts\(\{directory:temp\}\)/u);
 assert.match(gate,/expectedLabels\.map\(\(label,index\)=>/u);
 assert.match(gate,/real-judge-a/u);
 assert.match(gate,/real-verifier/u);
 assert.match(budget,/export async function readInferenceBudgetReceipts/u);
 assert.match(workflow,/tests\/t12-live-evidence-gate\.test\.ts/u);
});
