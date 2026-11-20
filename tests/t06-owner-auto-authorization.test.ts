import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {autorizaT06EscrituraAislada,MENSAJE_T06_AUTOMATICO} from "../src/runtime/agents/t06-owner-auto-authorization.js";
const ok=():NodeJS.ProcessEnv=>({
 ASEN_T06_AUTO_OWNER:"1",ASEN_T06_STATIC_WRITE_ONLY:"1",
 ASEN_T06_COST_ACK:"true",ASEN_T06_EXPECTED_SHA:"a".repeat(40),
 ASEN_T06_HEAD_COMMIT_MESSAGE:MENSAJE_T06_AUTOMATICO,
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
 GITHUB_ACTOR:"asenbanskaliev",GITHUB_EVENT_NAME:"push",
 GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
 GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"123456",GITHUB_SHA:"a".repeat(40)
});
test("T06 solo permite dos Writers aislados con autorización exacta del propietario",()=>{
 assert.equal(autorizaT06EscrituraAislada(ok()),true);
 for(const [key,value] of [
  ["ASEN_T06_AUTO_OWNER","0"],["ASEN_T06_STATIC_WRITE_ONLY","0"],
  ["ASEN_T06_COST_ACK","false"],["ASEN_T06_EXPECTED_SHA","b".repeat(40)],
  ["ASEN_T06_HEAD_COMMIT_MESSAGE","otro cambio"],
  ["GITHUB_ACTIONS","false"],["GITHUB_REPOSITORY","otra/organizacion"],
  ["GITHUB_ACTOR","otro-usuario"],["GITHUB_EVENT_NAME","pull_request"],
  ["GITHUB_EVENT_NAME","workflow_dispatch"],["GITHUB_REF","refs/heads/main"],
  ["GITHUB_RUN_ATTEMPT","2"],["GITHUB_RUN_ID","0"],["GITHUB_SHA","no-hash"]
 ] as const)
  assert.equal(autorizaT06EscrituraAislada({...ok(),[key]:value}),false,key);
 assert.equal(autorizaT06EscrituraAislada({}),false);
});
test("T06 automático mantiene controles de ámbito, pruebas y permisos",()=>{
 const source=readFileSync("scripts/t06-nvidia-dual-writer-native.ts","utf8");
 const flow=readFileSync(".github/workflows/asen-t06-writers-automatico.yml","utf8");
 const manual=readFileSync(".github/workflows/t06-github-approved-writers.yml","utf8");
 assert.match(source,/if\(githubMode\)await requireLiveT06GithubApprovals\(\)/u);
 assert.match(source,/requireDistinctT06Approvals\(intents/u);
 assert.match(source,/autorizaT06EscrituraAislada\(process\.env\)/u);
 assert.match(source,/autoMerge:false/u);
 assert.match(flow,/t06-owner-auto-authorization\.ts/u);
 assert.match(flow,/scripts\/t06-nvidia-dual-writer-native\.ts/u);
 assert.match(flow,/scripts\/t06-verificar-codigo-aislado-github\.ts/u);
 assert.match(flow,/github\.run_attempt == 1/u);
 assert.match(flow,/github\.actor == 'asenbanskaliev'/u);
 assert.match(flow,/github\.event\.head_commit\.message == 'ci\(asen\): probar dos Writers T06 NVIDIA una vez'/u);
 assert.match(flow,/ASEN_T06_STATIC_WRITE_ONLY: "1"/u);
 assert.match(flow,/NVIDIA_API_KEY: /u);
 assert.doesNotMatch(flow,/^\s+environment:/mu);
 assert.doesNotMatch(flow,/contents: write|pull-requests: write|git push|git merge|workflow_dispatch:/iu);
 assert.match(manual,/name: asen-t06-writer-a/u);
 assert.match(manual,/name: asen-t06-writer-b/u);
});
