import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {autorizarT06RevisionAutomatica,T06_REVISION_MENSAJE} from
 "../src/runtime/agents/t06-auto-review-authority.js";
const valid=():NodeJS.ProcessEnv=>({
 ASEN_T06_AUTO_REVIEW_ONLY:"1",ASEN_T06_COST_ACK:"true",
 ASEN_T06_SOURCE_SHA:"5bd752374f2db630a9d2ab0887e1025134a4e13f",
 ASEN_T06_SOURCE_RUN_ID:"44792916571",ASEN_T06_BEHAVIOR_RUN_ID:"44794317489",
 ASEN_T06_EXPECTED_SHA:"a".repeat(40),
 ASEN_T06_HEAD_COMMIT_MESSAGE:T06_REVISION_MENSAJE,
 ASEN_T06_REVIEW_MODEL_A:"nvidia/nemotron-3.5-bolt-e4b",
 ASEN_T06_REVIEW_MODEL_B:"nvidia/nemotron-3.5-super-vl-120b-a12b",
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
 GITHUB_EVENT_NAME:"push",GITHUB_ACTOR:"asenbanskaliev",
 GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
 GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"12345",GITHUB_SHA:"a".repeat(40)
});
test("T06 dos jueces no se autorizan por variables incompletas ni PR",()=>{
 assert.equal(autorizarT06RevisionAutomatica(valid()),true);
 for(const [key,value] of [
  ["ASEN_T06_AUTO_REVIEW_ONLY","0"],["ASEN_T06_COST_ACK","false"],
  ["ASEN_T06_SOURCE_SHA","b".repeat(40)],["ASEN_T06_SOURCE_RUN_ID","42"],
  ["ASEN_T06_BEHAVIOR_RUN_ID","42"],["ASEN_T06_EXPECTED_SHA","b".repeat(40)],
  ["ASEN_T06_HEAD_COMMIT_MESSAGE","otro"],
  ["ASEN_T06_REVIEW_MODEL_A","nvidia/otro"],["ASEN_T06_REVIEW_MODEL_B","nvidia/otro"],
  ["GITHUB_ACTIONS","false"],["GITHUB_REPOSITORY","cualquiera"],
  ["GITHUB_EVENT_NAME","pull_request"],["GITHUB_ACTOR","otro"],
  ["GITHUB_REF","refs/heads/main"],["GITHUB_RUN_ATTEMPT","2"],
  ["GITHUB_RUN_ID","0"],["GITHUB_SHA","b".repeat(40)]
 ] as const)assert.equal(autorizarT06RevisionAutomatica({...valid(),[key]:value}),false,key);
});
test("La nueva revisión no puede obtener permisos de escritura ni heredar consentimientos",()=>{
 const source=readFileSync("scripts/t06-native-independent-review.ts","utf8");
 const runner=readFileSync("scripts/t06-autorrevision-nvidia.ts","utf8");
 const flow=readFileSync(".github/workflows/asen-t06-autorrevision-nvidia.yml","utf8");
 assert.match(source,/requireFinalSettlement:true/u);
 assert.match(source,/noTools:true/u);
 assert.match(source,/autorizarT06RevisionAutomatica/u);
 assert.match(runner,/verifyT06IndependentReviewInputs/u);
 assert.match(runner,/consultarCatalogoNvidia/u);
 assert.match(flow,/node scripts\/t12-pi-retry-settings\.mjs/u);
 assert.match(flow,/actions\/download-artifact@/u);
 assert.match(flow,/run-id: 44792916571/u);
 assert.match(flow,/run-id: 44794317489/u);
 assert.doesNotMatch(flow,/^\s+environment:|contents: write|pull-requests: write|git push|git merge/mu);
});
