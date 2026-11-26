import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

/** Ejercicio de Pi TUI auténtico sin credenciales ni modelos.
 * Se reserva a la matriz Linux: otros sistemas tienen pruebas propias de Pi.
 * Los hijos son instrumentados, nunca prueban Writers NVIDIA reales. */
const native=process.platform==="linux"&&process.env.CI==="true"&&
 process.env.ASEN_TEST_SHARD_OS==="ubuntu-24.04";
const root=dirname(dirname(fileURLToPath(import.meta.url)));
test("T07 Pi TUI auténtico observa dos hijos persistidos y refresca el panel",{
 skip:native?false:"El host T07 se ejecuta en la matriz Linux de CI",
 timeout:180_000
},t=>{
 const tmp=mkdtempSync(join(tmpdir(),"asen-t07-native-ci-"));
 t.after(()=>rmSync(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 const output=join(tmp,"resultado.json");
 const sha=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 assert.match(sha,/^[a-f0-9]{40}$/u);
 const run=spawnSync(process.execPath,["--import","tsx",
  join(root,"scripts","t07-native-pi-flow-smoke.mjs")],{
  cwd:root,encoding:"utf8",timeout:150_000,maxBuffer:512*1024,
  env:{...process.env,ASEN_EXPECTED_SHA:sha,ASEN_T07_NATIVE_TUI_REPORT:output}
 });
 const evidence=existsSync(output)?JSON.parse(readFileSync(output,"utf8")):null;
 assert.equal(run.status,0,
  "Pi TUI real falló: "+JSON.stringify({
   error:run.error?.message??null,signal:run.signal??null,
   stdout:String(run.stdout??"").slice(-1800),
   stderr:String(run.stderr??"").slice(-1800),
   evidence
  }));
 assert.ok(evidence,"El ensayo no guardó el recibo");
 assert.equal(evidence.sha,sha);
 assert.equal(evidence.piVersion,"1.2.0");
 assert.equal(evidence.realPiTuiObserved,true);
 assert.equal(evidence.childJournalsVerified,true);
 assert.equal(evidence.initialRunningObserved,true);
 assert.equal(evidence.terminalRefreshObserved,true);
 assert.equal(evidence.realNvidiaWriterObserved,false);
 assert.equal(evidence.humanWriterApprovalObserved,false);
 assert.equal(evidence.acceptance,"not-accepted");
 assert.equal(evidence.autoMerge,false);
 assert.equal(evidence.globalFull,false);
 assert.equal(evidence.result,"PASS_TUI_INSTRUMENTED_CHILDREN_ONLY");
});
