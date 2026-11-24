import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Git puede materializar CRLF en Windows. La aceptación inspecciona la misma semántica YAML en los tres sistemas.\nconst workflow=readFileSync(".github/workflows/asen-real-agent-acceptance.yml","utf8").replace(/\\r\\n?/gu,"\\n");
const marker="ci: lote real ASEN E2B E3 C01";
const jobs=["shell-asen-beam-c01","real-parent-consumption","real-repaired-review"] as const;

function job(name:string,text=workflow):string{
 const start=text.indexOf("\n  "+name+":");
 assert.ok(start>=0,"Falta el trabajo: "+name);
 const remainder=text.slice(start+1);
 const next=remainder.slice(1).search(/\n  [a-z0-9-]+:\n/u);
 return next<0?remainder:remainder.slice(0,next+1);
}
function guard(name:string,text=workflow):string{
 const body=job(name,text);
 const match=/^    if: >-\n((?:^      .*\n)+)/mu.exec(body);
 assert.ok(match,"Falta condición de aceptación para "+name);
 return match[1]!;
}
function assertExactBatchGuard(name:string,text=workflow):void{
 const rules=guard(name,text);
 const expected=new RegExp("^      github\\.event\\.head_commit\\.message == '"+
  marker+"'\\)?$","mu");
 assert.match(rules,expected,"El mensaje debe aparecer como condición ejecutable y no como comentario");
 assert.match(rules,/github\.event_name == 'push'/u);
 assert.match(rules,/github\.run_attempt == 1/u);
 assert.match(rules,/github\.repository == 'asenbanskaliev\/ASEN'/u);
 assert.match(rules,/github\.ref == 'refs\/heads\/integration\/megatanda-1-3-20261123'/u);
}
function assertBatchStartsRealChild(text=workflow):void{
 const body=job("real-parent-consumption",text);
 const real=[
  '          elif test "$ASEN_ACCEPTANCE_COMMIT_MESSAGE" = "ci: one-time Pi parent-child Beam proof" ||',
  '               test "$ASEN_ACCEPTANCE_COMMIT_MESSAGE" = "'+marker+'"; then',
  '            timeout 250s node scripts/t12-real-child-parent-consumption.mjs',
 ].join("\n");
 assert.ok(body.includes(real),"El lote debe lanzar el padre e hijo reales en modo de espera, sin usar una prueba simulada");
}

test("E4: el mensaje de lote está en la guarda ejecutable de los tres trabajos",()=>{
 for(const name of jobs){
  assertExactBatchGuard(name);
  const body=job(name);
  assert.match(body,/environment: ollama-cloud-beam/u);
  assert.match(body,/ASEN_EXPECTED_SHA: \$\{\{ github\.sha \}\}/u);
  assert.match(body,/persist-credentials: false/u);
  assert.match(body,/permissions:\n      contents: read/u);
  assert.match(body,/OLLAMA_API_KEY/u);
  assert.doesNotMatch(body,/NVIDIA_API_KEY|autoApproveWriter|autoMerge: true/u);
 }
 assertBatchStartsRealChild();
 assert.match(job("real-repaired-review"),/scripts\/t12-real-repair-revalidation\.mjs/u);
 assert.match(job("shell-asen-beam-c01"),/scripts\/r4-two-pi-beam-c01\.mjs/u);
});

test("E4: comentario que menciona la señal no puede activar el lote",()=>{
 const target="      github.event.head_commit.message == '"+marker+"')";
 assert.ok(workflow.includes(target));
 const altered=workflow.replace(target,"      # "+target.trim());
 assert.throws(()=>assertExactBatchGuard("shell-asen-beam-c01",altered));
});

test("E4: un lote desviado a una prueba simulada se rechaza",()=>{
 const original=[
  '          elif test "$ASEN_ACCEPTANCE_COMMIT_MESSAGE" = "ci: one-time Pi parent-child Beam proof" ||',
  '               test "$ASEN_ACCEPTANCE_COMMIT_MESSAGE" = "'+marker+'"; then',
  '            timeout 250s node scripts/t12-real-child-parent-consumption.mjs',
 ].join("\n");
 const tampered=workflow.replace(original,original.replace("t12-real-child-parent-consumption.mjs","t12-real-parent-consumption.mjs"));
 assert.notEqual(tampered,workflow);
 assert.throws(()=>assertBatchStartsRealChild(tampered));
});
