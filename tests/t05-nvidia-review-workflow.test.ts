import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const workflow=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
const liveTask=readFileSync(new URL("../scripts/t04-t05-nvidia-cycle.ts",import.meta.url),"utf8");

test("T04/T05 CI runs a real Pi 1.2 NVIDIA cycle through ASEN writer and reviewer paths",()=>{
 assert.match(workflow,/@earendil-works\/pi-coding-agent@1\.2\.0/u);
 assert.match(workflow,/NVIDIA_API_KEY:\s*\$\{\{ secrets\.NVIDIA_API_KEY \}\}/u);
 assert.match(workflow,/timeout 1050s tsx scripts\/t04-t05-nvidia-cycle\.ts/u);
 assert.doesNotMatch(workflow,/ASEN_T05_PI_LIVE_OK/u);
 assert.match(liveTask,/new Dispatcher\(runner,input\.evidence\)\.dispatch\(input\.request\)/u);
 assert.match(liveTask,/providerCredential:"NVIDIA_API_KEY"/u);
 assert.match(liveTask,/nvidia\/nemotron-3\.5-lightning-30b-a3b/u);
 assert.match(liveTask,/issueOrganicWriterAdmission\(applicability,\[target\]\)/u);
 assert.match(liveTask,/evidence\.addRouteDecision\(candidate,plan\.routeEvidence/u);
 assert.match(liveTask,/noTools:true/u);
 assert.match(liveTask,/spawn\(process\.execPath,\["--import",tsxImportUrl\(\),"\.\/scripts\/t04-t05-nvidia-cycle\.ts"\]/u);
});

test("live provider evidence binds interruption, recovery, correction and independent review",()=>{
 assert.match(liveTask,/assert\.equal\(git\(sourceRoot,"rev-parse","HEAD"\),expectedSha/u);
 assert.match(liveTask,/SIGSTOP/u);assert.match(liveTask,/SIGKILL/u);
 assert.match(liveTask,/reconcileInterruptedAuthorizedWrite/u);assert.match(liveTask,/replayExecutions,0/u);
 assert.match(liveTask,/runReviewer[\s\S]*"fail"/u);assert.match(liveTask,/runReviewer[\s\S]*"pass"/u);
 assert.match(liveTask,/acceptance:\{authority:"asen-deterministic-evidence-gate",accepted:true/u);
});

test("missing NVIDIA credentials are an explicit blocked result and are never logged",()=>{
 assert.match(liveTask,/if\(!process\.env\.NVIDIA_API_KEY\)throw new Error\("NVIDIA_API_KEY missing; the integrated Pi\/NVIDIA scenario is BLOCKED"\)/u);
 assert.doesNotMatch(liveTask,/stdout\.write\([^\n]*NVIDIA_API_KEY|JSON\.stringify\([^\n]*NVIDIA_API_KEY/u);
});
