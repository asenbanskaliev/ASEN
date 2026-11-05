import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
const planner=readFileSync(new URL("../scripts/t12-real-model-plan.mjs",import.meta.url),"utf8");
const reviewVerifier=readFileSync(new URL("../scripts/t12-real-review-verifier.mjs",import.meta.url),"utf8");
const verifierBrief=readFileSync(new URL("../scripts/t12-verifier-brief.mjs",import.meta.url),"utf8");
const parentChild=readFileSync(new URL("../scripts/t12-real-child-parent-consumption.mjs",import.meta.url),"utf8");
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
  assert.match(reviewVerifier,/createT12VerifierBrief\(/u,"Verifier must build its prompt from validated immutable evidence");
  assert.match(verifierBrief,/AssertionError/u,"Only actual failed assertions may enter the compact model prompt");
  assert.match(verifierBrief,/COPY the id, criterion, exitCode/u,"Verifier prompt must preserve literal acceptance criteria");
  assert.match(verifierBrief,/Write your OWN specific failure observations/u,"Verifier must produce original failure explanations");
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

test("EF-601 live Pi parent+child receipt is restricted to one exact Beam run attempt",()=>{
 const jobStart=workflow.indexOf("  real-parent-consumption:");
 const jobEnd=workflow.indexOf("\n  real-tui-stream-crash:",jobStart);
 assert.ok(jobStart>=0&&jobEnd>jobStart,"Missing isolated native Pi parent+child lane");
 const job=workflow.slice(jobStart,jobEnd);
 assert.match(job,/github\.run_attempt == 1/u);
 assert.ok(job.includes("Pi parent-child Beam proof"));
 assert.match(job,/environment: ollama-cloud-beam/u);
 assert.match(job,/timeout 250s node scripts\/t12-real-child-parent-consumption\.mjs/u);
 assert.match(parentChild,/assert\.equal\(process\.env\.GITHUB_RUN_ATTEMPT,"1"/u);
 assert.match(parentChild,/witnessMode===undefined\|\|witnessMode==="idle"\|\|witnessMode==="busy"/u);
 assert.doesNotMatch(job,/\n    env:\n      ASEN_OLLAMA_API_KEY:/u,"Provider credential must not be job-wide");
 const keyCount=job.match(/ASEN_OLLAMA_API_KEY: \$\{\{ secrets\.OLLAMA_API_KEY \}\}/gu)||[];
 assert.equal(keyCount.length,2,"Only provider install/model selection and authenticated Pi run receive the key");
 assert.match(job,/name: Install pinned Beam provider into isolated Pi home\n        shell: bash\n        env:\n          ASEN_OLLAMA_API_KEY: \$\{\{ secrets\.OLLAMA_API_KEY \}\}/u);
 assert.match(job,/name: Native Pi parent and optional real Pi RPC child — isolated, bounded Beam\n        shell: bash\n        env:\n          ASEN_OLLAMA_API_KEY: \$\{\{ secrets\.OLLAMA_API_KEY \}\}/u);
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
  assert.match(verifierBrief,/exactly three records: tests, scope, review/u);
  assert.match(verifierBrief,/Include all three reviewer findings/u);
  assert.match(reviewVerifier,/reviewFindings:judgeResults\[0\]\.grade\.findings/u);
  assert.match(reviewVerifier,/judgeResults\[1\]\.grade\.findings\.map/u);
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

test("T12 real-provider workflow pins the immutable strict stage-order mode without enabling Ollama by default",()=>{
 const budget=readFileSync(new URL("../scripts/t12-inference-budget.mjs",import.meta.url),"utf8");
 const start=workflow.indexOf("  real-provider-acceptance:");
 assert.ok(start>=0,"Missing real provider job");
 const job=workflow.slice(start);
 assert.match(job,/ASEN_STRICT_INFERENCE_ORDER: '1'/u);
 assert.match(job,/ASEN_MAX_INFERENCE_CALLS:/u);
 assert.match(job,/head_commit\.message == 'ci: one-time Ollama Cloud provider smoke'/u);
 assert.match(budget,/stage-order policy cannot change within one run/u);
 assert.match(budget,/duplicated or out of order/u);
 assert.match(budget,/unapproved inference stage label/u);
 assert.match(budget,/readInferenceBudgetReceipts\(\{directory\}\)/u);
 assert.match(budget,/if\(policy\.schema===2&&item\.label!==stageLabels\(policy\.limit\)\[call-1\]\)/u);
});

test("T12 real Ollama calls remain one-shot, branch-pinned and cannot run on GitHub rerun",()=>{
 const section=workflow.slice(workflow.indexOf("  real-provider-acceptance:"));
 assert.match(section,/github\.ref == 'refs\/heads\/feat\/t12-integrated-acceptance-merge'/u);
 assert.match(section,/github\.run_attempt == 1/u);
 assert.match(section,/head_commit\.message == 'ci: one-time Ollama Cloud provider smoke'/u);
 assert.match(section,/environment: ollama-cloud-beam/u);
 assert.match(section,/ASEN_STRICT_INFERENCE_ORDER: '1'/u);
 const budget=readFileSync(new URL("../scripts/t12-inference-budget.mjs",import.meta.url),"utf8");
 assert.match(budget,/GITHUB_ACTIONS==="true"&&process\.env\.GITHUB_RUN_ATTEMPT!=="1"/u);
 assert.match(budget,/real-provider rerun is not authorized/u);
});
test("T12 Reviewer candidate and both judgment IDs are derived from the same frozen fixture",()=>{
 const gate=readFileSync(new URL("../scripts/t12-live-evidence-gate.mjs",import.meta.url),"utf8");
 assert.match(gate,/review\.candidateId,"t12-review-"\+review\.fixtureSha256\.slice\(0,12\)/u);
 assert.match(gate,/judge\.id,review\.candidateId\+":"\+/u);
 assert.match(reviewVerifier,/t12-review-\$\{candidateSha256\.slice\(0,12\)\}/u);
});

test("T12 combined F1/F4/F7 batch keeps negative, expiry and exact-SHA closure evidence in offline CI",()=>{
 const offline=workflow.slice(workflow.indexOf("  offline-static-validation:"),workflow.indexOf("  real-provider-acceptance:"));
 assert.match(offline,/tests\/background-job-journal\.test\.ts/u);
 assert.match(offline,/tests\/writer-authorization-snapshot\.test\.ts/u);
 assert.match(offline,/tests\/t12-provider-failure\.test\.ts/u);
 assert.match(offline,/tests\/t12-acceptance-ledger\.test\.ts/u);
 assert.match(offline,/F7 create exact-SHA provider-free acceptance ledger \(never claim FULL\)/u);
 assert.match(offline,/ASEN_OFFLINE_TESTS_PASSED: '1'/u);
 assert.match(offline,/ASEN_EXPECTED_SHA: \$\{\{ github\.sha \}\}/u);
 assert.match(offline,/node scripts\/t12-acceptance-ledger\.mjs/u);
 assert.ok(offline.indexOf("F2/F3 deterministic fixture and planning contracts")<
  offline.indexOf("F7 create exact-SHA provider-free acceptance ledger"),
  "The F7 ledger must not be produced before offline negative and recovery tests");
 const ledger=readFileSync(new URL("../scripts/t12-acceptance-ledger.mjs",import.meta.url),"utf8");
 assert.match(ledger,/globalFull:false/u);
 assert.match(ledger,/externalCi:"NOT_ASSERTED_BY_THIS_REPORT"/u);
 assert.match(ledger,/F4:"BLOCKED_INTERACTIVE"/u);
 assert.match(ledger,/F7:"SELF_AUDIT_ONLY"/u);
});

test("T12 real inference cannot begin before the exact-SHA offline acceptance succeeds",()=>{
 const start=workflow.indexOf("  real-provider-acceptance:");
 assert.ok(start>=0,"Real Ollama provider job must exist");
 const provider=workflow.slice(start);
 assert.match(provider,/needs: offline-static-validation/u);
 assert.match(provider,/github\.run_attempt == 1/u);
 assert.match(provider,/ASEN_STRICT_INFERENCE_ORDER: '1'/u);
 assert.match(provider,/F7 reconcile exact-SHA real evidence after strict gate \(never FULL\)/u);
 const evidenceGate=provider.indexOf("node scripts/t12-live-evidence-gate.mjs");
 const ledger=provider.indexOf("node scripts/t12-acceptance-ledger.mjs");
 assert.ok(evidenceGate>0&&ledger>evidenceGate,
  "F7 must recheck evidence only after the original strict live gate has passed");
 assert.match(provider,/ASEN_INCLUDE_VALIDATED_LIVE_EVIDENCE: '1'/u);
 assert.match(provider,/ASEN_OFFLINE_TESTS_PASSED: '1'/u);
});
test("T12 live F7 ledger recomputes the strict grade from original receipts instead of trusting status JSON",()=>{
 const ledger=readFileSync(new URL("../scripts/t12-acceptance-ledger.mjs",import.meta.url),"utf8");
 assert.match(ledger,/readInferenceBudgetReceipts\(\{directory:temp\}\)/u);
 assert.match(ledger,/inspectInferenceBudget\(\{directory:temp\}\)/u);
 assert.match(ledger,/loadJson\("asen-dispatcher-explorer\.json"\)/u);
 assert.match(ledger,/loadJson\("fixture-plan-grade\.json"\)/u);
 assert.match(ledger,/loadJson\("real-review-verifier\.json"\)/u);
 assert.match(ledger,/gradeLiveAcceptanceEvidence\(\{/u);
 assert.match(ledger,/matchT12ValidatedLiveGate\(\{reported,computed\}\)/u);
 assert.match(ledger,/globalFull:false/u);
});


test("Ollama Cloud credentials are restricted to authenticated steps in real-agent lanes",()=>{
 const expectations=[
  ["real-stream-interruption",["Select only the pinned registered Ollama Beam model in isolated Pi home","Interrupt one authentic Pi RPC child only after a streamed model text delta"]],
  ["real-ef603-coalescing",["Select only registered pinned Ollama Beam in disposable Pi home","Confirm real Pi concurrent dedupe with one reserved Beam inference"]],
  ["real-repaired-review",["Select only pinned registered Beam in isolated Pi home","Execute read-only real Pi Reviewer then Verifier with exact repaired fixture"]],
  ["real-provider-acceptance",["Install pinned Ollama Cloud provider extension","Bounded Ollama Cloud provider smoke","Real ASEN Dispatcher explorer with Ollama Cloud (read-only)","Real model planning on graded ASEN Explorer findings","Real ASEN Reviewer (two blind judgments) and Verifier reject deliberate defects"]],
 ] as const;
 for(const [jobName,stepNames] of expectations){
  const start=workflow.indexOf("  "+jobName+":");
  assert.ok(start>=0,"Missing real-provider lane "+jobName);
  const next=/\n  [a-z0-9-]+:\n/g;next.lastIndex=start+5;
  const end=next.exec(workflow)?.index??workflow.length;
  const job=workflow.slice(start,end);
  assert.doesNotMatch(job,/\n    env:\n      ASEN_OLLAMA_API_KEY:/u,jobName+" must not expose the provider key job-wide");
  const scopes=job.match(/^\s{10}ASEN_OLLAMA_API_KEY: \$\{\{ secrets\.OLLAMA_API_KEY \}\}$/gmu)||[];
  assert.equal(scopes.length,stepNames.length,jobName+" must scope the key only to authenticated steps");
  for(const stepName of stepNames){
   const heading="      - name: "+stepName,startStep=job.indexOf(heading);
   assert.ok(startStep>=0,jobName+" missing authenticated step "+stepName);
   const nextStep=job.indexOf("\n      - ",startStep+heading.length);
   const step=job.slice(startStep,nextStep<0?undefined:nextStep);
   assert.ok(step.includes("ASEN_OLLAMA_API_KEY: ${{ secrets.OLLAMA_API_KEY }}"),jobName+" exposes key at the wrong scope for "+stepName);
  }
 }
});
