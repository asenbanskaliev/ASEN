import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
const from=workflow.indexOf("  real-ef603-coalescing:");
const to=workflow.indexOf("  real-repaired-review:",from);
test("EF-603 native Beam run is one-shot, provider-free prerequisite and strict exact-SHA read only",()=>{
 assert.ok(from>0&&to>from);
 const lane=workflow.slice(from,to);
 for(const required of [
  "needs: offline-static-validation",
  "github.repository == 'asenbanskaliev/ASEN'",
  "refs/heads/feat/t12-integrated-acceptance-merge",
  "github.run_attempt == 1",
  "github.event_name == 'push'",
  "ci: one-time Pi EF-603 coalesced Explorer Beam proof",
  "environment: ollama-cloud-beam",
  "persist-credentials: false",
  "ASEN_EXPECTED_SHA: $"+"{{ github.sha }}",
  "ASEN_OLLAMA_API_KEY: $"+"{{ secrets.OLLAMA_API_KEY }}",
  "npm:pi-ollama-cloud@0.13.1",
  "beam:cloud",
  "No registered Beam model; no paid or alternate provider fallback",
  "node --import tsx scripts/t12-real-ef603-coalescing.mjs",
  "real-ef603-coalescing.json",
  "timeout 220s",
 ])assert.ok(lane.includes(required),"Missing safe live coalescing condition: "+required);
 assert.doesNotMatch(lane,/OPENROUTER_API_KEY|GROQ_API_KEY|NVIDIA_API_KEY|writerAuthorized: true|continue-on-error: true/u);
 assert.match(lane,/timeout-minutes: 12/u);
});
test("EF-603 provider-free acceptance always runs the grader/workflow regressions",()=>{
 const offline=workflow.slice(workflow.indexOf("  offline-static-validation:"),from);
 for(const name of [
  "tests/t12-ef603-coalescing-grade.test.ts",
  "tests/t12-ef603-coalescing-workflow.test.ts",
  "node --check scripts/t12-real-ef603-coalescing.mjs",
  "node --check scripts/t12-ef603-coalescing-grade.mjs",
 ])assert.ok(offline.includes(name),"EF603 preflight does not guard "+name);
});

test("EF-603/604 provider-free job exercises trusted launch/recovery regressions on the exact SHA",()=>{
 const offline=workflow.slice(workflow.indexOf("  offline-static-validation:"),from);
 for(const required of [
  "tests/agent-coalesce-role-scope.test.ts",
  "tests/planned-explorer-multiprocess.test.ts",
  "tests/trusted-task-agent-binder.test.ts",
  "tests/task-agent-recovery-chain.test.ts",
 ])assert.ok(offline.includes(required),"Missing EF-603/604 launch regression: "+required);
 assert.ok(offline.includes("git rev-parse HEAD"),"Provider-free acceptance must bind an exact commit");
});
