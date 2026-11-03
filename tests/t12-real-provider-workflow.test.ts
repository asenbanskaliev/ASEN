import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
const planner=readFileSync(new URL("../scripts/t12-real-model-plan.mjs",import.meta.url),"utf8");

test("T12 Pi child stages resolve the npm-installed runtime from PATH",()=>{
 for(const name of [
  "Real ASEN Dispatcher explorer with Ollama Cloud (read-only)",
  "Real model planning on graded ASEN Explorer findings",
  "Real ASEN Reviewer and Verifier reject a deliberate defect",
 ]){
  const heading=`      - name: ${name}`;
  const start=workflow.indexOf(heading);
  assert.notEqual(start,-1,`Missing workflow stage: ${name}`);
  const end=workflow.indexOf("\n      - name:",start+heading.length);
  const stage=workflow.slice(start,end===-1?undefined:end);
  assert.match(stage,/export PATH="\$PWD\/node_modules\/\.bin:\$PATH"/,
   `${name} must expose the pinned, locally installed Pi executable to spawned ASEN children`);
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
