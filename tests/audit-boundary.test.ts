import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {copyFileSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";

test("tracked boundary checks paths and text while excluding binary payloads",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-boundary-"));
 try{
  mkdirSync(join(root,"scripts"));
  copyFileSync(resolve("scripts/audit-upstream-boundary.mjs"),join(root,"scripts/audit-upstream-boundary.mjs"));
  execFileSync("git",["init","-q",root]);
  const stage=()=>execFileSync("git",["-C",root,"add","-A"]);
  const audit=()=>spawnSync(process.execPath,[join(root,"scripts/audit-upstream-boundary.mjs")],{cwd:root,encoding:"utf8"});
  const marker="gen"+"tle";
  writeFileSync(join(root,"binary.dat"),Buffer.from([0,71,101,110,116,108,101]));
  stage();assert.equal(audit().status,0);
  writeFileSync(join(root,"notes.txt"),`Reference ${marker} detected`);
  stage();assert.equal(audit().status,1);
  rmSync(join(root,"notes.txt"));
  writeFileSync(join(root,`${marker}.txt`),"opaque data");
  stage();assert.equal(audit().status,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
