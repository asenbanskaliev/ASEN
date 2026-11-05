import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
const from=workflow.indexOf("  real-tui-stream-crash:");
const to=workflow.indexOf("\n  real-stream-interruption:",from);
test("EF-604 live TUI crash during child inference is one exact opt-in Beam call",()=>{
 assert.ok(from>0&&to>from,"Dedicated live TUI crash job must be isolated");
 const lane=workflow.slice(from,to);
 for(const item of [
  "needs: offline-static-validation",
  "github.repository == 'asenbanskaliev/ASEN'",
  "refs/heads/feat/t12-integrated-acceptance-merge",
  "github.run_attempt == 1",
  "github.event_name == 'push'",
  "github.event.head_commit.message == 'ci: one-time Pi Beam TUI child crash proof'",
  "environment: ollama-cloud-beam",
  "ASEN_OLLAMA_API_KEY: $"+"{{ secrets.OLLAMA_API_KEY }}",
  "npm:pi-ollama-cloud@0.13.1",
  "No Beam model, no provider fallback",
  "scripts/t12-real-tui-stream-crash.mjs",
  "real-pi-tui-stream-crash.json",
 ])assert.ok(lane.includes(item),"Missing bounded exact-SHA gate "+item);
 assert.match(lane,/timeout 220s/u);assert.match(lane,/timeout-minutes: 12/u);
 assert.doesNotMatch(lane,/(?:OPENROUTER_API_KEY|GROQ_API_KEY|NVIDIA_API_KEY|WRITE_GRANT|writerAuthorized: true|continue-on-error: true|continue-on-error: )/u);
 assert.doesNotMatch(lane,/contains\s*\(\s*github\.event\.head_commit\.message/u);
});
