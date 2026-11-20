import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {autorizarNvidiaUnaVez,MENSAJE_NVIDIA_UNICO} from "../scripts/autorizar-nvidia-una-vez.mjs";

const valid=()=>({
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
 GITHUB_EVENT_NAME:"push",GITHUB_ACTOR:"asenbanskaliev",
 GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
 GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"44790981792",
 GITHUB_SHA:"08c484560fac6e0d599e3872e366993c1e07cba0",ASEN_NVIDIA_EXPECTED_SHA:"08c484560fac6e0d599e3872e366993c1e07cba0",
 ASEN_NVIDIA_COST_ACK:"1",
 ASEN_NVIDIA_HEAD_COMMIT_MESSAGE:MENSAJE_NVIDIA_UNICO
});
test("Acepta solo el primer cambio autorizado del propietario",()=>{
 assert.equal(autorizarNvidiaUnaVez(valid()),true);
 for(const [campo,valor] of [
  ["GITHUB_ACTIONS","false"],["GITHUB_REPOSITORY","otra/organizacion"],
  ["GITHUB_EVENT_NAME","pull_request"],["GITHUB_EVENT_NAME","workflow_dispatch"],
  ["GITHUB_ACTOR","dependabot[bot]"],["GITHUB_REF","refs/heads/main"],
  ["GITHUB_RUN_ATTEMPT","2"],["GITHUB_RUN_ID","0"],
  ["GITHUB_SHA","b".repeat(40)],["ASEN_NVIDIA_EXPECTED_SHA","x"],
  ["ASEN_NVIDIA_COST_ACK","0"],["ASEN_NVIDIA_HEAD_COMMIT_MESSAGE","cambio ordinario"]
 ]){
  assert.equal(autorizarNvidiaUnaVez({...valid(),[campo]:valor}),false,campo+":"+valor);
 }
 assert.equal(autorizarNvidiaUnaVez({}),false);
});
test("El flujo aislado no requiere aprobación de entornos y no concede escrituras",()=>{
 const flow=readFileSync(".github/workflows/asen-nvidia-real-una-vez.yml","utf8");
 assert.match(flow,/^on:\n  push:\n    branches:/mu);
 assert.match(flow,/paths:\n      - \.github\/workflows\/asen-nvidia-real-una-vez\.yml/u);
 assert.match(flow,/github\.event\.head_commit\.message == 'ci\(asen\): ejecutar prueba única NVIDIA autorizada'/u);
 assert.match(flow,/github\.actor == 'asenbanskaliev'/u);
 assert.match(flow,/github\.run_attempt == 1/u);
 assert.match(flow,/autorizar-nvidia-una-vez\.mjs/u);
 assert.match(flow,/tests\/nvidia-una-vez-guard\.test\.mjs/u);
 assert.match(flow,/scripts\/t06-nvidia-free-api-probe\.mjs/u);
 assert.match(flow,/scripts\/t06-nvidia-pi-concurrent\.ts/u);
 assert.match(flow,/needs: \[nvidia-api\]/u);
 assert.match(flow,/NVIDIA_API_KEY: \$\{\{ secrets\.NVIDIA_API_KEY \}\}/u);
 assert.match(flow,/persist-credentials: false/u);
 assert.match(flow,/permissions:\n  contents: read/u);
 assert.doesNotMatch(flow,/^\s+environment:/mu);
 assert.doesNotMatch(flow,/^\s+workflow_dispatch:|^\s+pull_request:|^\s+schedule:/mu);
 assert.doesNotMatch(flow,/contents: write|pull-requests: write|git push|git merge|rerun/iu);
});

test("Una autorización usada no puede arrancar otra ejecución NVIDIA",()=>{
 assert.equal(autorizarNvidiaUnaVez({...valid(),GITHUB_RUN_ID:"999999999"}),false);
 assert.equal(autorizarNvidiaUnaVez({...valid(),GITHUB_SHA:"b".repeat(40),
  ASEN_NVIDIA_EXPECTED_SHA:"b".repeat(40)}),false);
});
