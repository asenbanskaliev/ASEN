import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(".github/workflows/asen-real-agent-acceptance.yml","utf8");
const marker="ci: lote real ASEN E2B E3 C01";
function job(name:string):string{
 const start=source.indexOf("\n  "+name+":");
 assert.ok(start>=0,"Falta el trabajo: "+name);
 const remainder=source.slice(start+1);
 const next=remainder.slice(1).search(/\n  [a-z0-9-]+:\n/u);
 return next<0?remainder:remainder.slice(0,next+1);
}
test("Fase E4: una señal exacta activa los tres ensayos reales existentes sin duplicar motores",()=>{
 for(const name of ["shell-asen-beam-c01","real-parent-consumption","real-repaired-review"]){
  const body=job(name);
  assert.ok(body.includes(marker),name);
  assert.match(body,/github\.run_attempt == 1/u);
  assert.match(body,/github\.event_name == 'push'/u);
  assert.match(body,/environment: ollama-cloud-beam/u);
  assert.match(body,/github\.repository == 'asenbanskaliev\/ASEN'/u);
  assert.match(body,/integration\/megatanda-1-3-20261123/u);
 }
 const parent=job("real-parent-consumption");
 assert.match(parent,/scripts\/t12-real-child-parent-consumption\.mjs/u);
 const review=job("real-repaired-review");
 assert.match(review,/scripts\/t12-real-repair-revalidation\.mjs/u);
 const reference=job("shell-asen-beam-c01");
 assert.match(reference,/scripts\/r4-two-pi-beam-c01\.mjs/u);
});
test("Fase E4: cada prueba usa Pi con SHA exacto, modelo registrado y recibos separados",()=>{
 for(const name of ["shell-asen-beam-c01","real-parent-consumption","real-repaired-review"]){
  const body=job(name);
  assert.match(body,/ASEN_EXPECTED_SHA: \$\{\{ github\.sha \}\}/u);
  assert.match(body,/persist-credentials: false/u);
  assert.match(body,/permissions:\n      contents: read/u);
  assert.match(body,/OLLAMA_API_KEY/u);
  assert.doesNotMatch(body,/NVIDIA_API_KEY|autoApproveWriter|autoMerge: true/u);
 }
});
