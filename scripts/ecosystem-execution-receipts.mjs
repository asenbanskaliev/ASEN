import assert from "node:assert/strict";
import {spawnSync,execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {validateCellObservation} from "./pi-support-matrix.mjs";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");

export function admitTapResult(result){
 assert.equal(result.status,0);assert.equal(result.signal,null);assert.equal(result.error,undefined);
 const count=name=>{
  const match=result.stdout.match(new RegExp(`^# ${name} (\\d+)$`,"m"));
  assert.ok(match,`Missing final TAP ${name} summary`);return Number(match[1]);
 };
 const total=count("tests");assert.ok(total>0);assert.equal(count("pass"),total);
 for(const name of ["fail","cancelled","skipped"])assert.equal(count(name),0);
 return total;
}

export function main({output=process.argv[2],matrix=process.argv[3],candidate=process.env.ASEN_EXPECTED_SHA}={}){
 assert.match(candidate??"",/^[a-f0-9]{40}$/);
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),candidate);
 assert.ok(output&&matrix,"Usage: ecosystem-execution-receipts.mjs <output> <matrix-directory>");
 const out=resolve(output);mkdirSync(out,{recursive:true});
 const sourceBytes=readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url));
 const sourceCommit=JSON.parse(sourceBytes).commit;
 const emit=(kind,executionClass,command,observation,log)=>{
  const record={id:`ECO-02A-${process.platform}-${kind}`,candidate,sourceCommit,kind,class:executionClass,
   command,observation,result:"PASS",sourceManifestSha256:sha256(sourceBytes),logSha256:sha256(log)};
  writeFileSync(join(out,`${kind}.log`),log);
  writeFileSync(join(out,`${kind}.json`),JSON.stringify(record,null,2)+"\n");
 };
 // Fixture evidence owns the listed preflight contract only, never all ECO-02 behavior.
 const selections={
  positive:"factory waits for initialized public inventories",
  negative:"command and tool collisions stop every registration",
  failure:"partial host registration remains inert",
  recovery:"preflight rejection retries on a later session",
 };
 for(const [kind,pattern] of Object.entries(selections)){
  const args=["--import","tsx","--test","--test-reporter=tap","tests/pi-host-preflight.test.ts"];
  const result=spawnSync(process.execPath,args,{encoding:"utf8",timeout:60_000,maxBuffer:4*1024*1024});
  const count=admitTapResult(result);
  assert.ok(result.stdout.includes(pattern),"Required contract test must execute");
  emit(kind,"DETERMINISTIC_EXECUTION",`node ${args.join(" ")}`,`${count} selected preflight contract test(s) completed; pattern: ${pattern}`,result.stdout+result.stderr);
 }
 const cells=[];
 for(const version of ["0.85.1","1.1.0"])for(const mode of ["tui","rpc","json","print"]){
  const bytes=readFileSync(join(resolve(matrix),`${process.platform}-${version}-${mode}.json`));
  const cell=JSON.parse(bytes);
  assert.equal(cell.candidate,candidate);assert.equal(cell.sourceCommit,sourceCommit);assert.equal(cell.result,"PASS");
  assert.equal(cell.version,version);assert.equal(cell.mode,mode);assert.equal(cell.platform,process.platform);
  validateCellObservation(cell,cell.observation);
  assert.equal(sha256(readFileSync(join(resolve(matrix),`${cell.id}.log`))),cell.observation.logSha256);
  assert.equal(cell.observation.exitCode,0);assert.equal(cell.observation.signal,null);
  assert.equal(cell.observation.timedOut,false);assert.equal(cell.observation.modelCalls,0);
  cells.push({id:cell.id,sha256:sha256(bytes)});
 }
 const platform={linux:"linux",win32:"windows",darwin:"macos"}[process.platform];assert.ok(platform);
 const log=JSON.stringify(cells,null,2)+"\n";
 emit(platform,"OS_RUNTIME","npm run verify:pi-matrix","Eight packed real-host cells on this operating system completed with natural exit and no model calls",log);
 emit("pi-host","REAL_PI_HOST","npm run verify:pi-matrix","Pi 0.85.1 and 1.1.0 in four public modes; bounded lifecycle sample, not complete behavior parity",log);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error(error);process.exitCode=1;}
}
