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
