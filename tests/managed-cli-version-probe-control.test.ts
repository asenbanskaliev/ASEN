import test from "node:test";
import assert from "node:assert/strict";
import {watch} from "node:fs";
import {readFile,readdir,stat} from "node:fs/promises";
import path from "node:path";
import {api,fixture,snapshot,preserved,baseReport,invocation,absent,inspectManagedInstall} from "./helpers/managed-cli-probe.js";
test("managed CLI refuses unconfirmed preaborted invalid and unverified requests before effects",async()=>{
 const {probeManagedCliVersion}=await api(),f=await fixture(),before=await snapshot(f);
 const managedRoot=path.join(f.prefix,"install"),children=(await readdir(managedRoot)).sort(),rootMtime=(await stat(managedRoot)).mtimeMs;
 const aborted=new AbortController();aborted.abort();
 for(const [extra,reason] of [
  [{confirmed:false},"confirmation-required"],[{signal:aborted.signal},"cancelled-before-launch"],
  [{timeoutMs:0},"invalid-bounds"],[{timeoutMs:20001},"invalid-bounds"],[{timeoutMs:1.5},"invalid-bounds"],
  [{maxOutputBytes:0},"invalid-bounds"],[{maxOutputBytes:65537},"invalid-bounds"],[{version:"9.9.9"},"metadata-unverified"],
 ] as const){
  const request={prefix:f.prefix,version:"0.1.0",confirmed:true};
  Object.assign(request,extra); // Each boundary case explicitly overrides the defaults.
  const report=await probeManagedCliVersion(request);
  baseReport(report);assert.equal(report.cliVersion,"not-run");assert.equal(report.reason,reason);
  assert.equal(report.stdout,"");assert.equal(report.stderr,"");assert.equal(report.exitCode,null);assert.equal(report.signal,null);
  assert.equal(report.launchAttempts,0);assert.equal(report.launcherPid,null);assert.equal(report.termination,"not-started");assert.equal(report.temporaryData,null);
  assert.equal(await absent(f.record),true);await preserved(before);
  assert.deepEqual((await readdir(managedRoot)).sort(),children);
  assert.equal((await stat(managedRoot)).mtimeMs,rootMtime);
 }
 const invalid=await fixture("unverified"),saved=await snapshot(invalid);
 const invalidRoot=path.join(invalid.prefix,"install"),invalidChildren=(await readdir(invalidRoot)).sort(),invalidMtime=(await stat(invalidRoot)).mtimeMs;
 const report=await probeManagedCliVersion({prefix:invalid.prefix,version:"0.1.0",confirmed:true});
 assert.equal(report.cliVersion,"not-run");assert.equal(report.reason,"metadata-unverified");assert.equal(await absent(invalid.record),true);await preserved(saved);
 assert.deepEqual((await readdir(invalidRoot)).sort(),invalidChildren);assert.equal((await stat(invalidRoot)).mtimeMs,invalidMtime);
});
test("managed CLI output overflow is capped and remains ambiguous",async()=>{
 const f=await fixture("overflow"),before=await snapshot(f),{probeManagedCliVersion}=await api();
 const report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true,maxOutputBytes:16});
 baseReport(report);assert.equal(report.cliVersion,"ambiguous");assert.equal(report.reason,"output-limit");
 assert.equal(report.stdout,"x".repeat(16));assert.equal(report.stderr,"");assert.equal(report.launchAttempts,1);assert.equal(report.termination,"closed");
 await invocation(f);await preserved(before);
});

test("managed CLI deadline is bounded and never becomes runtime readiness",async()=>{
 const f=await fixture("hang"),before=await snapshot(f),{probeManagedCliVersion}=await api();
 const report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true,timeoutMs:7000});
 baseReport(report);assert.equal(report.cliVersion,"ambiguous");assert.equal(report.reason,"timeout");assert.equal(report.launchAttempts,1);
 assert.equal(report.stdout,"");assert.equal(report.stderr,"");assert.equal(report.termination,"closed");
 assert.notEqual(report.temporaryData?.disposition,"removed");await preserved(before);
});
test("managed CLI cancellation after program readiness closes without a false observation",async()=>{
 const f=await fixture("hang"),before=await snapshot(f),{probeManagedCliVersion}=await api(),abort=new AbortController();
 const watcher=watch(f.root,(_event,name)=>{if(String(name)==="ready")abort.abort();});
 const timer=setTimeout(()=>abort.abort(),10000);
 try{
  const report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true,signal:abort.signal,timeoutMs:18000});
  baseReport(report);assert.equal(report.cliVersion,"ambiguous");assert.equal(report.reason,"cancelled");
  assert.equal(report.launchAttempts,1);assert.equal(report.termination,"closed");assert.equal(report.stdout,"");assert.equal(report.stderr,"");
  assert.equal(await readFile(f.ready,"utf8"),"READY");await invocation(f);await preserved(before);
 }finally{clearTimeout(timer);watcher.close();}
});
test("managed CLI post-execution drift is ambiguous and changed data is not repaired",async()=>{
 const f=await fixture("drift"),before=await snapshot(f,true),{probeManagedCliVersion}=await api();
 const report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true});
 baseReport(report);assert.equal(report.cliVersion,"ambiguous");assert.equal(report.reason,"candidate-drift");
 assert.equal(report.stdout,"0.1.0\n");assert.equal(report.stderr,"");assert.equal(report.exitCode,0);assert.equal(report.launchAttempts,1);
 assert.equal(await readFile(f.bin,"utf8"),"CHANGED");await preserved(before);await invocation(f);
 assert.equal((await inspectManagedInstall({prefix:f.prefix})).status,"foreign");
});
test("managed CLI retains unknown temporary bytes while observing only the CLI version",async()=>{
 const f=await fixture("foreign"),before=await snapshot(f),{probeManagedCliVersion}=await api();
 const report=await probeManagedCliVersion({prefix:f.prefix,version:"0.1.0",confirmed:true});
 baseReport(report);assert.equal(report.cliVersion,"observed");assert.equal(report.reason,null);assert.equal(report.temporaryData?.disposition,"retained");
 const called=await invocation(f);assert.equal(await readFile(path.join(called.home,"foreign.txt"),"utf8"),"FOREIGN");
 assert.equal(report.stdout,"0.1.0\n");assert.equal(report.stderr,"");assert.equal(report.exitCode,0);await preserved(before);
});
