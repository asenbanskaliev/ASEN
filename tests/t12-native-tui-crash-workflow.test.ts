import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const workflow=readFileSync(
 new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
test("EF-703 changes to every native TUI probe or observable A/B CLI trigger acceptance preflight",()=>{
 const push=workflow.split("  workflow_dispatch:")[0]??"";
 for(const required of [
  "scripts/t12-*.mjs",
  "scripts/t12-*.ts",
  "scripts/agent-observable-*.mjs",
  "scripts/agent-ab-*.mjs",
  "tests/**",
  "extensions/**",
  "src/**",
 ]){
  assert.ok(push.includes("      - "+required),
   "Missing monitored source path for native Pi or observable A/B: "+required);
 }
 assert.match(workflow,/EF-604 real native Pi TUI parent hard death/u);
 assert.match(workflow,/timeout 110s node scripts\/t12-native-tui-crash-recovery\.mjs/u);
 assert.match(workflow,/tests\/agent-ab-triple-cli-security\.test\.ts/u);
 assert.match(workflow,/tests\/t12-native-tui-crash-grade\.test\.ts/u);
 assert.match(workflow,/tests\/t12-native-tui-crash-workflow\.test\.ts/u);
});
test("EF-604 native parent hard-crash verification is provider-free and cannot mint FULL",()=>{
 const start=workflow.indexOf("      - name: EF-604 real native Pi TUI parent hard death");
 const end=workflow.indexOf("      - name: F6 cross-process inference recovery",start);
 assert.ok(start>0&&end>start);
 const unit=workflow.slice(start,end);
 assert.match(unit,/set -euo pipefail/u);
 assert.match(unit,/test "\$\(git rev-parse HEAD\)" = "\$ASEN_EXPECTED_SHA"/u);
 assert.doesNotMatch(unit,/OLLAMA_API_KEY|ASEN_MAX_INFERENCE_CALLS|environment: ollama-cloud-beam/u);
 assert.match(unit,/x\.globalFull!==false/u);
 assert.match(unit,/x\.providerCalls!==0/u);
 assert.match(unit,/x\.writerAuthorized!==false/u);
});
