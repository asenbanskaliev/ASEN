import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {autorizarT08Auto,T08_AUTO_MENSAJE,isGithubHostedT08AutoSandboxRun} from
 "../src/runtime/agents/t08-owner-auto-authorization.js";
const valid=():NodeJS.ProcessEnv=>({
 ASEN_T08_OWNER_AUTO:"1",ASEN_T08_COST_ACK:"true",
 ASEN_T08_REVIEW_A:"nvidia/nemotron-3.5-bolt-e4b",
 ASEN_T08_REVIEW_B:"nvidia/nemotron-3.5-super-vl-120b-a12b",
 ASEN_T08_WRITER_MODEL:"nvidia/nemotron-3.5-lightning-30b-a3b",
 ASEN_T08_HEAD_COMMIT_MESSAGE:T08_AUTO_MENSAJE,
 ASEN_T08_EXPECTED_SHA:"a".repeat(40),
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
 GITHUB_ACTOR:"asenbanskaliev",GITHUB_EVENT_NAME:"push",
 GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
 GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"1234",GITHUB_SHA:"a".repeat(40),
 ASEN_DOCKER_TESTS_CI:"1",RUNNER_ENVIRONMENT:"github-hosted",RUNNER_OS:"Linux"
});
test("T08 permite solo el lote auténtico de un propietario, sin reciclar su consentimiento",()=>{
 assert.equal(autorizarT08Auto(valid()),true);
 assert.equal(isGithubHostedT08AutoSandboxRun(valid()),true);
 for(const [key,v] of [
  ["ASEN_T08_OWNER_AUTO","0"],["ASEN_T08_COST_ACK","false"],
  ["ASEN_T08_REVIEW_A","otro"],["ASEN_T08_REVIEW_B","otro"],
  ["ASEN_T08_WRITER_MODEL","otro"],["ASEN_T08_HEAD_COMMIT_MESSAGE","otra cosa"],
  ["ASEN_T08_EXPECTED_SHA","b".repeat(40)],["GITHUB_ACTIONS","false"],
  ["GITHUB_REPOSITORY","otro/repo"],["GITHUB_ACTOR","otro"],
  ["GITHUB_EVENT_NAME","pull_request"],["GITHUB_REF","refs/heads/main"],
  ["GITHUB_RUN_ATTEMPT","2"],["GITHUB_RUN_ID","0"],
  ["GITHUB_SHA","b".repeat(40)]
 ] as const)assert.equal(autorizarT08Auto({...valid(),[key]:v}),false,key);
 for(const [key,v] of [
  ["ASEN_DOCKER_TESTS_CI","0"],["RUNNER_ENVIRONMENT","self-hosted"],["RUNNER_OS","Windows"]
 ] as const)assert.equal(isGithubHostedT08AutoSandboxRun({...valid(),[key]:v}),false,key);
});
test("T08 automático conserva los permisos humanos de su vía antigua y no fusiona",()=>{
 const w=readFileSync(".github/workflows/asen-t08-auto-aislado.yml","utf8");
 const manual=readFileSync(".github/workflows/t08-github-approved-fix.yml","utf8");
 const source=readFileSync("scripts/t08-github-real-fix.ts","utf8");
 assert.match(manual,/name: asen-t08-revisores/u);
 assert.match(manual,/name: asen-t08-reparacion/u);
 assert.match(source,/requireLiveT08GithubApprovals\("fix"\)/u);
 assert.match(source,/autorizarT08Auto\(\)/u);
 assert.match(w,/scripts\/t08-github-real-fix\.ts review/u);
 assert.match(w,/scripts\/t08-github-real-fix\.ts fix/u);
 assert.match(w,/node scripts\/t12-pi-retry-settings\.mjs/u);
 assert.match(w,/actions\/download-artifact@/u);
 assert.match(w,/needs: \[revisar\]/u);
 assert.doesNotMatch(w,/^\s+environment:|contents: write|pull-requests: write|git push|git merge/mu);
});
