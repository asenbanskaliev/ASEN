import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";

test("tracked boundary checks paths and text while excluding binary payloads",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-boundary-"));
 try{
  mkdirSync(join(root,"scripts","memory-parity","writer-a"),{recursive:true});
  mkdirSync(join(root,"scripts","memory-parity","writer-b"),{recursive:true});
  mkdirSync(join(root,"registry","parity"),{recursive:true});
  copyFileSync(resolve("scripts/audit-upstream-boundary.mjs"),join(root,"scripts/audit-upstream-boundary.mjs"));
  copyFileSync(resolve("scripts/audit-memory-parity.mjs"),join(root,"scripts/audit-memory-parity.mjs"));
  copyFileSync(resolve("scripts/memory-parity/additional-slices.mjs"),join(root,"scripts","memory-parity","additional-slices.mjs"));
  copyFileSync(resolve("scripts/memory-parity/writer-a/index.mjs"),join(root,"scripts","memory-parity","writer-a","index.mjs"));
  copyFileSync(resolve("scripts/memory-parity/writer-b/index.mjs"),join(root,"scripts","memory-parity","writer-b","index.mjs"));
  copyFileSync(resolve("registry/parity/memory-protocol-contracts-v1.json"),join(root,"registry","parity","memory-protocol-contracts-v1.json"));
  copyFileSync(resolve("registry/parity/memory-observation-pin-contracts-v1.json"),join(root,"registry","parity","memory-observation-pin-contracts-v1.json"));
  copyFileSync(resolve("registry/parity/memory-upstream-v3.json"),join(root,"registry","parity","memory-upstream-v3.json"));
  execFileSync("git",["init","-q",root]);
  const stage=()=>execFileSync("git",["-C",root,"add","-A"]);
  const audit=()=>spawnSync(process.execPath,[join(root,"scripts/audit-upstream-boundary.mjs")],{cwd:root,encoding:"utf8"});
  const manifest=JSON.parse(readFileSync(join(root,"registry","parity","memory-upstream-v3.json"),"utf8"));
  const marker=manifest.targets[0].repository.split("/").at(-1);
  writeFileSync(join(root,"binary.dat"),Buffer.from([0,101,110,103,114,97,109]));
  writeFileSync(join(root,"registry","parity","skill-sources-v1.json"),`{"repository":"gen${"tle"}"}`);
  stage();assert.equal(audit().status,0,"both exact provenance manifests are allowed");

  const tampered=structuredClone(manifest);
  for(const target of tampered.targets){
   target.repository="attacker/owned";
   target.apiRefUrl=`https://api.github.com/repos/${target.repository}/git/ref/tags/${target.tag}`;
   target.tagUrl=`https://github.com/${target.repository}/releases/tag/${target.tag}`;
  }
  for(const source of tampered.sources){
   const target=tampered.targets.find((candidate:any)=>candidate.id===source.targetId);
   source.rawUrl=`https://raw.githubusercontent.com/${target.repository}/${target.commit}/${source.path}`;
  }
  writeFileSync(join(root,"registry","parity","memory-upstream-v3.json"),JSON.stringify(tampered));
  assert.equal(audit().status,1,"tampered provenance is rejected before its marker is trusted");
  writeFileSync(join(root,"registry","parity","memory-upstream-v3.json"),JSON.stringify(manifest));

  const validator=readFileSync(join(root,"scripts","audit-memory-parity.mjs"));
  writeFileSync(join(root,"scripts","audit-memory-parity.mjs"),`// ${marker}`);
  assert.equal(audit().status,1,"the exact untracked pre-staging script is inspected");
  writeFileSync(join(root,"scripts","audit-memory-parity.mjs"),validator);
  mkdirSync(join(root,"tests"));
  writeFileSync(join(root,"tests","memory-parity-reference.test.ts"),`// ${marker}`);
  assert.equal(audit().status,1,"the exact untracked pre-staging test is inspected");
  rmSync(join(root,"tests","memory-parity-reference.test.ts"));

  writeFileSync(join(root,"notes.txt"),`Reference ${marker} detected`);
  stage();assert.equal(audit().status,1,"the provenance identifier must fail outside the exact allowlisted manifest");
  rmSync(join(root,"notes.txt"));
  writeFileSync(join(root,`${marker}.txt`),"opaque data");
  stage();assert.equal(audit().status,1,"a tracked path marker outside the allowlist is rejected");
 }finally{rmSync(root,{recursive:true,force:true});}
});
