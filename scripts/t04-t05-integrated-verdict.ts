import assert from "node:assert/strict";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";

const root=process.env.ASEN_T05_EVIDENCE_DIR;
const sha=process.env.ASEN_EXPECTED_SHA;
if(!root||!sha||!/^[a-f0-9]{40}$/.test(sha))throw new Error("Evidence directory and exact candidate SHA required");
mkdirSync(root,{recursive:true});
const read=(file:string)=>readFileSync(join(root,file),"utf8");
const provider=JSON.parse(read("live-write-evidence.json"));
assert.equal(provider.candidateSha,sha);
assert.equal(provider.baseSha,sha);
assert.equal(provider.result,"PASS");
assert.equal(provider.provider,"nvidia");
assert.ok(provider.piProcessId>0);
assert.deepEqual(provider.allowedPaths,["docs/t05-live-execution.txt"]);
assert.deepEqual(provider.observedPaths,provider.allowedPaths);
const patch=read("live-write.diff");
assert.equal(createHash("sha256").update(patch).digest("hex"),provider.patchSha256);
const scenarios=read("r4-scenarios.log");
const recovery=read("t04-t05-recovery-evidence.log");
for(const marker of [
 "hard process death after the authorized write is recovered as interrupted and cannot replay",
 "authorized retry runs once; competing and stale writers fail closed"
])assert.ok(recovery.includes(marker),`Missing real recovery test: ${marker}`);
assert.match(recovery,/# fail 0\b/);
assert.match(scenarios,/# fail 0\b/);
const common={candidateSha:sha,provider:"nvidia",model:provider.model,providerTaskId:provider.taskId,providerEvidence:"live-write-evidence.json",recoveryEvidence:"t04-t05-recovery-evidence.log",scenarioEvidence:"r4-scenarios.log",checkedAt:new Date().toISOString()};
const verdicts={
 T04:{...common,result:"PARTIAL",reason:"Hard-kill recovery and no-replay are proven by real process tests, but the interrupted child was not the Pi/NVIDIA writer itself."},
 T05:{...common,result:"PARTIAL",reason:"Real Pi/NVIDIA authorized write and local guards are verified; independent candidate review/correction/acceptance is not demonstrated end-to-end."}
};
writeFileSync(join(root,"t04-t05-verdicts.json"),JSON.stringify(verdicts,null,2)+"\n");
process.stdout.write(JSON.stringify(verdicts)+"\n");
