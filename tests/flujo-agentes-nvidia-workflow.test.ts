import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const entry=readFileSync(new URL("../.github/workflows/memory-openrouter-e2e.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
const flow=readFileSync(new URL("../.github/workflows/asen-flujo-agentes-nvidia.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
const ci=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");

test("T02/T06: NVIDIA real solo desde una selección humana explícita",()=>{
 assert.match(entry,/\n          - flujo\n/u);
 assert.match(entry,/if: inputs\.modo == 'flujo'/u);
 assert.match(entry,/uses: \.\/\.github\/workflows\/asen-flujo-agentes-nvidia\.yml/u);
 assert.match(entry,/cost_acknowledged: \$\{\{ inputs\.coste_desconocido_autorizado \}\}/u);
 assert.match(flow,/^on:\s*\n  workflow_call:/mu);
 assert.doesNotMatch(flow,/^  (?:pull_request|push|schedule|workflow_dispatch):/mu);
 assert.match(flow,/github\.event_name == 'workflow_dispatch'/u);
 assert.match(flow,/github\.actor == 'asenbanskaliev'/u);
 assert.match(flow,/github\.ref == 'refs\/heads\/feat\/flujo-de-agentes-20261115'/u);
 assert.match(flow,/test "\$GITHUB_RUN_ATTEMPT" = 1/u);
 assert.match(flow,/test "\$COSTE_AUTORIZADO" = true/u);
 assert.match(flow,/test "\$GITHUB_SHA" = "\$SHA_ESPERADO"/u);
});

test("T02/T06: ninguna credencial llega a preparación ni se permite escritura Git",()=>{
 const start=flow.indexOf("\n  preparar:"),second=flow.indexOf("\n  probar-explorer-verifier:");
 assert.ok(start>=0&&second>start);
 const preparation=flow.slice(start,second), execution=flow.slice(second);
 assert.doesNotMatch(preparation,/secrets\.NVIDIA_API_KEY/u);
 assert.match(execution,/secrets\.NVIDIA_API_KEY/u);
 assert.match(flow,/permissions:\s*\n  contents: read/u);
 assert.doesNotMatch(flow,/contents: write|pull-requests: write|id-token: write/u);
 assert.match(flow,/persist-credentials: false/u);
 assert.match(execution,/t06-nvidia-pi-concurrent\.ts/u);
 assert.doesNotMatch(execution,/t06-nvidia-dual-writer-native|t08-github-real-fix/u);
 const script=readFileSync(new URL("../scripts/t06-nvidia-pi-concurrent.ts",import.meta.url),"utf8");
 assert.match(script,/noTools:true/u);
 assert.match(script,/startReadOnly\(/u);
 assert.match(script,/maxConcurrency:2/u);
 assert.doesNotMatch(script,/startControlledWorker\(/u);
});

test("CodeRabbit: repetir únicamente el trabajo NVIDIA bloquea cualquier consumo",()=>{
 const start=flow.indexOf("\n  probar-explorer-verifier:");
 assert.ok(start>=0);
 const section=flow.slice(start);
 const call=section.indexOf("timeout 250s node --import tsx scripts/t06-nvidia-pi-concurrent.ts");
 const guard=section.lastIndexOf('test "$GITHUB_RUN_ATTEMPT" = 1',call);
 const secret=section.lastIndexOf('test -n "$NVIDIA_API_KEY"',call);
 assert.ok(call>=0&&guard>=0&&secret>guard&&call>secret,
  "El propio trabajo debe detener cualquier repetición antes de consumir NVIDIA");
 const execution=section.slice(section.indexOf("- name: Comprobar Explorer y Verifier Pi reales"));
 assert.ok(execution.includes('test "$GITHUB_RUN_ATTEMPT" = 1'));
 assert.equal(section.slice(0,call).match(/test "\$GITHUB_RUN_ATTEMPT" = 1/gu)?.length,1,
  "La comprobación debe estar en este trabajo, no depender de preparación");
});

test("T03/T04/T05/T07/T08/T09/T10: la megatanda sin modelos cubre los contratos integrados",()=>{
 const start=ci.indexOf("\n  agentes-t02-t05-t06:"),end=ci.indexOf("\n  test:",start);
 assert.ok(start>=0&&end>start);
 const offline=ci.slice(start,end);
 for(const name of [
  "runtime-profiles","pi-model-reviewer","odd-agent-review-command",
  "ordinary-review-assessment","parallel-worktree-reconciliation",
  "agent-flow-overview","panel-observation-integration",
  "judgment-day","generated-code-trial-admission",
  "agent-flow-ab-comparison","agent-flow-ab-series",
  "review-acceptance-receipt","t11-rail-observer"
 ])assert.ok(offline.includes("tests/"+name+".test.ts"),"Falta prueba: "+name);
 assert.doesNotMatch(offline,/secrets\.|NVIDIA_API_KEY/u);
 assert.match(offline,/npm run typecheck/u);
});

test("T08: el ensayo de reparación sigue requiriendo controles separados",()=>{
 const source=readFileSync(new URL("../scripts/t08-github-real-fix.ts",import.meta.url),"utf8");
 assert.match(source,/blockUnisolatedGeneratedCodeTrial\("T08"\)/u);
 const work=readFileSync(new URL("../.github/workflows/t08-github-approved-fix.yml",import.meta.url),"utf8");
 assert.match(work,/asen-t08-revisores/u);
 assert.match(work,/asen-t08-reparacion/u);
 assert.match(work,/cost_acknowledged/u);
 assert.doesNotMatch(flow,/\bauto-merge\b|\bauto-fix\b/u);
});


test("M2 T06: ensayo NVIDIA limitado a permiso de una ejecución",()=>{
 const start=ci.indexOf("\n  t06-nvidia-free-api:"),end=ci.indexOf("\n  # T06: dos sesiones Pi RPC",start);
 assert.ok(start>=0&&end>start);
 const job=ci.slice(start,end);
 for(const required of ["pull_request.number == 149","feat/asen-equipo-E-M2-g2-compactacion-148","pull_request.head.repo.full_name == github.repository","event.label.name == 'asen-t06-nvidia-una-vez'","github.actor == 'asenbanskaliev'","issues: write","gh api --method DELETE","ASEN_EXPECTED_SHA"]){assert.ok(job.includes(required),"Falta puerta NVIDIA M2: "+required);}
 assert.ok(job.includes("t06-nvidia-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}"));
 assert.ok(job.includes("asen-t06-nvidia-consumido:$ASEN_EXPECTED_SHA"));
 assert.ok(job.includes("gh api --method POST"));
 assert.ok(job.includes("test \"$GITHUB_RUN_ATTEMPT\" = 1"));
 const piNative=ci.slice(ci.indexOf("\n  t06-nvidia-pi-native:"),ci.indexOf("\n\n  managed-update-windows:"));
 assert.ok(piNative.includes("pull_request.number == 61"));
 assert.ok(piNative.includes("pull_request.number == 149"));
 assert.ok(piNative.includes("asen-t06-nvidia-pi-consumido:$ASEN_EXPECTED_SHA"));
 assert.ok(piNative.includes("maxConcurrency:2")===false,"La concurrencia se limita dentro del script Pi");
 assert.ok(job.includes('index("asen-t06-nvidia-una-vez")'));
 assert.ok(!job.includes("pull_request.number == 150"));
 const probe=readFileSync(new URL("../scripts/t06-nvidia-free-api-probe.mjs",import.meta.url),"utf8");
 for(const model of ["nvidia/nemotron-3.5-lightning-30b-a3b","nvidia/nemotron-3.5-super-vl-120b-a12b"])assert.ok(probe.includes(model));
 assert.ok(probe.includes("distinctModelIdsVerified"));assert.ok(probe.includes("retryCount:0"));
 const windowsStart=ci.indexOf("\n  managed-update-windows:");
 const windowsEnd=ci.indexOf("\\n  generated-code-docker-sandbox:",windowsStart);
 assert.ok(windowsStart>=0&&windowsEnd>windowsStart);
 const windows=ci.slice(windowsStart,windowsEnd);
 assert.ok(windows.includes("runs-on: windows-latest"));
 assert.ok(windows.includes("tests/managed-install.test.ts"));
 assert.ok(windows.includes("tests/t09-lifecycle.test.ts"));
 assert.ok(windows.includes("interrupted upgrade"));
 assert.ok(windows.includes("unhealthy automatic rollback"));
 assert.ok(windows.includes("npm run typecheck"));
});
