import test from "node:test";
import assert from "node:assert/strict";
import {realpath} from "node:fs/promises";
import path from "node:path";
import {api,fixture,snapshot,preserved,baseReport,invocation,inspectManagedInstall} from "./helpers/managed-cli-probe.js";
for(const unicode of [false,true]){
 test("managed CLI observes exact version and fixed private invocation"+(unicode?" with Unicode paths":""),async()=>{
  const f=await fixture("ok",unicode),before=await snapshot(f),{probeManagedCliVersion}=await api();
  const old=process.env.ASEN_PROBE_SECRET;process.env.ASEN_PROBE_SECRET="MUST-NOT-PASS";
  try{
   const report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true});
   baseReport(report);assert.equal(report.cliVersion,"observed",JSON.stringify(report));assert.equal(report.reason,null);
   assert.equal(report.stdout,"0.1.0\n");assert.equal(report.stderr,"");assert.equal(report.exitCode,0);assert.equal(report.signal,null);
   assert.equal(report.launchAttempts,1);assert.equal(report.termination,"closed");assert.equal(typeof report.launcherPid,"number");
   const called=await invocation(f);assert(called.home.startsWith(report.temporaryData!.path));await preserved(before);
   const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,null);assert.equal(inventory.runtimeReady,false);
  }finally{if(old===undefined)delete process.env.ASEN_PROBE_SECRET;else process.env.ASEN_PROBE_SECRET=old;}
 });
}
test("Windows managed CLI launches through the lexical path when realpath yields an 8.3 alias",async t=>{
 if(process.platform!=="win32"){t.skip("Windows path canonicalization behavior");return;}
 const f=await fixture("ok"),lexicalEntry=path.resolve(f.bin),canonicalEntry=await realpath(lexicalEntry);
 const normalize=(value:string)=>path.normalize(value).toLowerCase();
 if(normalize(lexicalEntry)===normalize(canonicalEntry)){
  t.diagnostic(`This runner did not expose a distinct 8.3 path for ${lexicalEntry}`);
 }
 const {probeManagedCliVersion}=await api(),report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true});
 assert.equal(report.cliVersion,"observed",JSON.stringify(report));
 const called=await invocation(f);
 assert.equal(normalize(called.entry),normalize(lexicalEntry),"CreateProcess argv must retain the lexical absolute entry path");
 if(normalize(lexicalEntry)!==normalize(canonicalEntry))assert.notEqual(normalize(called.entry),normalize(canonicalEntry),"do not pass a realpath-generated 8.3 alias as argv");
});
for(const [mode,reason,stdout,stderr,exitCode] of [
 ["wrong","version-mismatch","WRONG\n","",0],["stderr","stderr-not-empty","0.1.0\n","fixture warning\n",0],["exit","exit-mismatch","0.1.0\n","",7],
] as const){
 test("managed CLI refuses "+reason+" without promoting readiness",async()=>{
  const f=await fixture(mode),before=await snapshot(f),{probeManagedCliVersion}=await api();
  const report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true});
  baseReport(report);assert.equal(report.cliVersion,"failed");assert.equal(report.reason,reason);
  assert.equal(report.stdout,stdout);assert.equal(report.stderr,stderr);assert.equal(report.exitCode,exitCode);assert.equal(report.signal,null);
  assert.equal(report.launchAttempts,1);assert.equal(report.termination,"closed");await invocation(f);await preserved(before);
 });
}
