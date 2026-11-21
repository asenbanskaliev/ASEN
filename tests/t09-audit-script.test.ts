import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";

const sha="a".repeat(40);
function run(root:string){
 return spawnSync(process.execPath,["--import","tsx","scripts/t09-auditar-ensayo-t06.ts"],{
  cwd:process.cwd(),env:{...process.env,
   GITHUB_ACTIONS:"true",ASEN_T06_EXPECTED_SHA:sha,
   ASEN_T06_WRITER_REPORT_DIR:root},
  encoding:"utf8",timeout:20_000
 });
}
test("T09 crea un diagnóstico bloqueado si falta el informe real, sin hacer llamadas",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t09-archivos-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const response=run(root);
 assert.equal(response.status,0,response.stderr);
 const stored=JSON.parse(readFileSync(join(root,"t09-readiness.json"),"utf8"));
 assert.equal(stored.schema,"asen.t09.native-trial-readiness/v1");
 assert.equal(stored.sha,sha);
 assert.equal(stored.status,"blocked");
 assert.equal(stored.measurements,null);
 assert.equal(stored.referenceCompared,false);
 assert.equal(stored.billingVerified,false);
 assert.equal(stored.globalFull,false);
 assert.ok(!JSON.stringify(stored).includes("NVIDIA_API_KEY"));
 const duplicate=run(root);
 assert.notEqual(duplicate.status,0);
 assert.equal(readFileSync(join(root,"t09-readiness.json"),"utf8").includes('"status": "blocked"'),true);
});
test("T09 bloquea un informe de Writer fallido incluso si se declara simultaneidad",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t09-fallido-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(join(root,"t06-dual-native-evidence.json"),JSON.stringify({
  schema:"asen.t06.native-dual-writer/v1",sha,concurrent:true,
  result:"BLOCKED_OR_PARTIAL_NEEDS_REVIEW",workers:[]
 }));
 const response=run(root);
 assert.equal(response.status,0,response.stderr);
 const stored=JSON.parse(readFileSync(join(root,"t09-readiness.json"),"utf8"));
 assert.equal(stored.status,"blocked");
 assert.equal(stored.measurements,null);
 assert.equal(stored.globalFull,false);
});
