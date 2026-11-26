import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {blockUnisolatedGeneratedCodeTrial} from "../src/runtime/agents/generated-code-trial-admission.js";
test("T06 y T08 no admiten pruebas reales mientras falte aislamiento de red",()=>{
 for(const name of ["T06","T08"] as const)
  assert.throws(()=>blockUnisolatedGeneratedCodeTrial(name),new RegExp(name+" BLOQUEADO"));
});
test("T06/T08 comprueban la barrera antes de credenciales y proveedores",()=>{
 for(const [file,name] of [
  ["t06-nvidia-dual-writer-native.ts","T06"],
  ["t08-github-real-fix.ts","T08"]
 ] as const){
  const source=readFileSync(new URL("../scripts/"+file,import.meta.url),"utf8");
  const start=source.indexOf("async function main():Promise<void>");
  const guard=source.indexOf('blockUnisolatedGeneratedCodeTrial("'+name+'")',start);
  const secret=source.indexOf("if(!process.env.NVIDIA_API_KEY)",start);
  assert.ok(start>=0&&guard>start&&secret>guard,file);
 }
});

test("La ejecución habitual usa Pi nativo y no arranca Docker por una PR",()=>{
 const ci=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");
 const start=ci.indexOf("\n  generated-code-docker-sandbox:");
 assert.ok(start>=0,"La prueba aislada debe seguir disponible solo como opción");
 const job=ci.slice(start);
 const guard=job.split("\n    runs-on:")[0]??"";
 for(const required of [
  "github.event_name == 'pull_request'",
  "github.event.action == 'labeled'",
  "github.event.label.name == 'asen-codigo-aislado-una-vez'",
  "github.actor == 'asenbanskaliev'",
  "github.event.pull_request.number == 61",
  "github.event.pull_request.head.repo.full_name == github.repository",
  "github.head_ref == 'feat/flujo-de-agentes-20261115'"
 ])assert.ok(guard.includes(required),"Falta protección: "+required);
 assert.doesNotMatch(guard,/\|\|/u,"No admitir rutas alternativas de ejecución automática");
 assert.doesNotMatch(guard,/synchronize|opened|reopened/u,
  "Una actualización normal de la PR no puede iniciar Docker");
 assert.match(ci,/generated-code-docker-sandbox:[\s\S]*?ASEN_DOCKER_TESTS_CI: "1"/u);
 const trial=readFileSync(new URL("../scripts/t08-github-real-fix.ts",import.meta.url),"utf8");
 assert.match(trial,/blockUnisolatedGeneratedCodeTrial\("T08"\)/u,
  "El ensayo avanzado sigue bloqueado hasta tener garantías de seguridad");
});
