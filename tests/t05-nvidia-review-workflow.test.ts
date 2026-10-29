import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const workflow=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
const liveTask=readFileSync(new URL("../scripts/t05-nvidia-live-write.ts",import.meta.url),"utf8");

test("T05 CI runs a real Pi 1.2 NVIDIA task through ASEN's authorized writer path",()=>{
 assert.match(workflow,/@earendil-works\/pi-coding-agent@1\.2\.0/u);
 assert.match(workflow,/NVIDIA_API_KEY:\s*\$\{\{ secrets\.NVIDIA_API_KEY \}\}/u);
 assert.match(workflow,/node --import tsx scripts\/t05-nvidia-live-write\.ts/u);
 assert.doesNotMatch(workflow,/ASEN_T05_PI_LIVE_OK|--no-tools[^\n]*nvidia/u);
 assert.match(liveTask,/new Dispatcher\(runner,evidence\)\.dispatch\(request\)/u);
 assert.match(liveTask,/providerCredential:"NVIDIA_API_KEY"/u);
 assert.match(liveTask,/model:"nvidia\/nemotron-3\.5-lightning-30b-a3b"/u);
 assert.match(liveTask,/issueOrganicWriterAdmission\(applicability,\[target\]\)/u);
});

test("live provider evidence is tied to the exact candidate and exact changed-file set",()=>{
 assert.match(liveTask,/assert\.equal\(git\(sourceRoot,"rev-parse","HEAD"\),expectedSha/u);
 assert.match(liveTask,/assert\.deepEqual\(changedPaths,\[target\]/u);
 assert.match(liveTask,/assert\.equal\(git\(root,"rev-parse","HEAD"\),baseSha/u);
 assert.match(liveTask,/contentSha256:fileSha256/u);
 assert.match(liveTask,/patchSha256:createHash\("sha256"\)\.update\(patch\)/u);
 assert.match(liveTask,/piProcessId/u);
 assert.match(liveTask,/result:"PASS"/u);
});

test("missing NVIDIA credentials are an explicit blocked result and are never logged",()=>{
 assert.match(liveTask,/if\(!process\.env\.NVIDIA_API_KEY\)throw new Error\("NVIDIA_API_KEY missing; the live authorized-write scenario is BLOCKED"\)/u);
 assert.doesNotMatch(liveTask,/stdout\.write\([^\n]*NVIDIA_API_KEY|JSON\.stringify\([^\n]*NVIDIA_API_KEY/u);
});
