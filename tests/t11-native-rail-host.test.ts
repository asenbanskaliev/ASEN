import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const hostOS:Record<string,string>={linux:"ubuntu-24.04",darwin:"macos-latest",win32:"windows-latest"};
const enabled=process.env.CI==="true"&&hostOS[process.platform]===process.env.ASEN_TEST_SHARD_OS;
const root=dirname(dirname(fileURLToPath(import.meta.url)));
test("T11: el Pi real reserva 53 columnas sin tapar el editor y se adapta a 139",{
 skip:enabled?false:"Prueba de geometría Pi reservada a Linux, macOS y Windows en CI",timeout:145000
},t=>{
 const temp=mkdtempSync(join(tmpdir(),"asen-t11-reporte-"));
 t.after(()=>rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const target=join(temp,"reporte.json");
 const sha=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const execution=spawnSync(process.execPath,[join(root,"scripts","t11-native-rail-host-check.mjs")],{
  cwd:root,encoding:"utf8",timeout:125000,maxBuffer:1024*1024,
  env:{...process.env,ASEN_EXPECTED_SHA:sha,ASEN_T11_NATIVE_RAIL_REPORT:target}
 });
 const report=existsSync(target)?JSON.parse(readFileSync(target,"utf8")):null;
 assert.equal(execution.status,0,JSON.stringify({error:execution.error?.message,signal:execution.signal,
  stdout:execution.stdout?.slice(-1200),stderr:execution.stderr?.slice(-1500),report}));
 assert.equal(report.schema,"asen.t11.native-rail/v1");
 assert.equal(report.sha,sha);assert.equal(report.result,"PASS_REAL_PI_RAIL");
 assert.deepEqual(report.closedSessions,["baseline","asen","asen-interaction","asen-bottom"]);
 assert.equal(report.interaction?.source,"native-pty-sgr");
 assert.equal(report.interaction?.folded,true);
 assert.equal(report.interaction?.focused,true);
 assert.equal(report.interaction?.focusRestored,true);
 assert.equal(report.bottomTree?.type,"vstack");
 assert.equal(report.bottomTree?.rail,8);
 assert.equal(report.bottomAt139?.type,"vstack");
 assert.equal(report.bottomRestored,true);
 assert.equal(report.nvidiaCalls,0);assert.equal(report.globalFull,false);
});
