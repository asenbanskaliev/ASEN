import assert from "node:assert/strict";
import test from "node:test";
import {link,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Deliberately JS-only literal SHA-scoped scaffold, no host execution.
import {buildObservationScaffold} from "../scripts/agent-observable-scaffold.mjs";
const sha="b".repeat(40),CLIS=[
 "scripts/agent-observable-parity.mjs",
 "scripts/agent-observable-receipts.mjs",
 "scripts/agent-ab-combined-gate.mjs",
] as const;
async function fixture(t:import("node:test").TestContext){
 const home=await mkdtemp(join(tmpdir(),"asen-ab-all-cli-security-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const {reference,candidate}=buildObservationScaffold(sha);
 const ref=join(home,"references.json"),local=join(home,"candidate.json");
 await writeFile(ref,JSON.stringify(reference),{flag:"wx"});
 await writeFile(local,JSON.stringify(candidate),{flag:"wx"});
 return {home,ref,local};
}
function invoke(which:typeof CLIS[number],p:Awaited<ReturnType<typeof fixture>>,input=p.ref){
 const out=join(p.home,which.split("/").at(-1)+".output.json");
 const args=which===CLIS[2]?[which,input,p.local,p.home]:
  which===CLIS[1]?[which,input,p.local,sha,p.home]:
  [which,input,p.local,sha];
 const result=spawnSync(process.execPath,args,{
  cwd:process.cwd(),encoding:"utf8",timeout:20000,windowsHide:true,maxBuffer:180000,
  env:{...process.env,ASEN_EXPECTED_SHA:sha,ASEN_AB_COMBINED_OUTPUT:out},
 });
 return {...result,out};
}
test("EF-701 all three A/B entry points reject an oversize, corrupt UTF-8 or malformed JSON manifest",{
 timeout:60000},async t=>{
 const p=await fixture(t);
 for(const [data,pattern] of [
  [Buffer.alloc(1024*1024+1,32),/Unsafe A\/B manifest/u],
  [Buffer.from([0x7b,0x22,0xc3,0x28,0x22,0x7d]),/Invalid UTF-8 JSON/u],
  [Buffer.from("NOT-JSON"),/Invalid UTF-8 JSON/u],
 ] as const){
  await writeFile(p.ref,data);
  for(const cli of CLIS){
   const result=invoke(cli,p);
   assert.notEqual(result.status,0,"Invalid "+cli+" accepted attacker-controlled input");
   assert.equal(result.stdout.trim(),"",cli+" must not emit a falsely parsed report");
   assert.match(result.stderr,pattern,cli+" must explain fail-closed class");
   if(cli===CLIS[2])await assert.rejects(()=>readFile(result.out),(error:any)=>error.code==="ENOENT");
  }
 }
});
test("EF-701 all three A/B entry points enforce the same symlink and hardlink identity",{
 timeout:60000},async t=>{
 const p=await fixture(t),symlinkPath=join(p.home,"linked-reference.json");
 try{await symlink(p.ref,symlinkPath);}
 catch(error){
  if(process.platform==="win32"&&["EPERM","EACCES"].includes((error as NodeJS.ErrnoException).code??"")){
   t.skip("Windows runner does not permit file symlinks");return;
  }
  throw error;
 }
 for(const cli of CLIS){
  const output=invoke(cli,p,symlinkPath);
  assert.notEqual(output.status,0,cli+" accepted symlink input");
  assert.equal(output.stdout.trim(),"");
  assert.match(output.stderr,/Unsafe A\/B manifest/u);
 }
 await rm(symlinkPath);
 await link(p.ref,symlinkPath);
 for(const cli of CLIS){
  const output=invoke(cli,p);
  assert.notEqual(output.status,0,cli+" accepted hardlinked input");
  assert.equal(output.stdout.trim(),"");
  assert.match(output.stderr,/Unsafe A\/B manifest/u);
 }
});
test("EF-701 normal A/B input remains blocked by real execution provenance, never FULL",{
 timeout:50000},async t=>{
 const p=await fixture(t);
 const parity=invoke(CLIS[0],p),receipts=invoke(CLIS[1],p),combined=invoke(CLIS[2],p);
 assert.equal(parity.status,1,parity.stderr);
 assert.equal(receipts.status,1,receipts.stderr);
 assert.equal(combined.status,0,combined.stderr);
 const triple=JSON.parse(parity.stdout),integrity=JSON.parse(receipts.stdout);
 const gate=JSON.parse(await readFile(combined.out,"utf8"));
 assert.equal(triple.globalFull,false);
 assert.equal(triple.counts.blocked,20);
 assert.equal(integrity.globalFull,false);
 assert.equal(integrity.counts.blocked,60);
 assert.equal(gate.globalFull,false);
 assert.equal(gate.casesBlocked,20);
 assert.equal(gate.expectedSlots,60);
 assert.equal(gate.sourceCasesExecutedAndAttested,0);
 assert.equal(gate.writerAuthorized,false);
});
