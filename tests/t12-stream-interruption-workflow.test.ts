import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(
 new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
const from=workflow.indexOf("  real-stream-interruption:");
const to=workflow.indexOf("  real-repaired-review:",from);
test("EF-703 streamed Beam interruption is a single opt-in exact-SHA readonly job",()=>{
 assert.ok(from>0&&to>from,"Dedicated streaming proof must precede repaired review");
 const lane=workflow.slice(from,to);
 for(const item of [
  "needs: offline-static-validation",
  "github.repository == 'asenbanskaliev/ASEN'",
  "refs/heads/feat/t12-integrated-acceptance-merge",
  "github.run_attempt == 1",
  "github.event_name == 'push'",
  "ci: one-time Pi streamed-child interruption Beam proof",
  "github.event.head_commit.message == 'ci: one-time Pi streamed-child interruption Beam proof'",
  "environment: ollama-cloud-beam",
  "persist-credentials: false",
  "ASEN_EXPECTED_SHA: $"+"{{ github.sha }}",
  "ASEN_OLLAMA_API_KEY: $"+"{{ secrets.OLLAMA_API_KEY }}",
  "npm:pi-ollama-cloud@0.13.1",
  "beam:cloud",
  "No Beam model, no provider fallback",
  "node --import tsx scripts/t12-real-stream-interruption.mjs",
  "real-pi-stream-interruption.json",
 ])assert.ok(lane.includes(item),"Missing read-only one-shot guard "+item);
 assert.doesNotMatch(lane,/(?:OPENROUTER_API_KEY|GROQ_API_KEY|NVIDIA_API_KEY|WRITE_GRANT|writerAuthorized: true|continue-on-error: true)/u);
 assert.doesNotMatch(lane,/contains\\(github\\.event\\.head_commit\\.message/u,
  "The free-model acceptance must require the exact opt-in commit message");
 assert.match(lane,/timeout 220s/u);
 assert.match(lane,/timeout-minutes: 12/u);
 assert.ok(lane.includes("github.sha")&&!lane.includes("github.ref_name"),
  "The provider run must be pinned to the exact immutable SHA");
});
