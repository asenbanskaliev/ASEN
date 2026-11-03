import test from "node:test";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync,unlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";
import {pendingBackgroundJobNotifications} from "../src/runtime/background-jobs.js";

test("records terminal jobs for recovery without making them resumable",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-"));try{const journal=new BackgroundJobJournal(join(root,"jobs.json"));journal.record({id:"j1",sessionId:"s1",projectId:root,command:"echo",mode:"background",state:"completed",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),exitCode:0,eventCount:1,tail:["ok"]});const rows=journal.load("s1");assert.equal(rows.length,1);assert.equal(rows[0]!.resumable,false);assert.equal(journal.load("s2").length,0);}finally{rmSync(root,{recursive:true,force:true});}
});

test("recovers an interrupted job as non-resumable status",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-running-"));try{const journal=new BackgroundJobJournal(join(root,"jobs.json")),now=new Date().toISOString();journal.record({id:"j-running",sessionId:"s1",projectId:root,command:"long",mode:"monitor",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});const row=journal.load("s1")[0];assert.equal(row?.state,"interrupted");assert.equal(row?.resumable,false);}finally{rmSync(root,{recursive:true,force:true});}
});

test("refuses corrupt journal data instead of interpreting it as an empty healthy store",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-corrupt-")),file=join(root,"jobs.json");try{writeFileSync(file,"{broken",{mode:0o600});const journal=new BackgroundJobJournal(file);assert.throws(()=>journal.load("s1"),/corrupt/u);}finally{rmSync(root,{recursive:true,force:true});}
});

test("serializes journal updates from independent Pi processes without losing records",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-concurrent-"));t.after(()=>rmSync(root,{recursive:true,force:true}));const file=join(root,"jobs.json"),moduleUrl=pathToFileURL(join(process.cwd(),"src/runtime/background-job-journal.ts")).href;
 const childScript=`import {BackgroundJobJournal} from ${JSON.stringify(moduleUrl)};const journal=new BackgroundJobJournal(process.env.ASEN_TEST_JOURNAL);const prefix=process.env.ASEN_TEST_PREFIX;const project=process.env.ASEN_TEST_PROJECT;for(let i=0;i<50;i++){const now=new Date().toISOString();journal.record({id:prefix+i,sessionId:"shared-session",projectId:project,command:"test",mode:"background",state:"completed",createdAt:now,updatedAt:now,exitCode:0,eventCount:0,tail:[]});}`;
 const run=(prefix:string)=>new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childScript],{cwd:process.cwd(),env:{...process.env,ASEN_TEST_JOURNAL:file,ASEN_TEST_PREFIX:prefix,ASEN_TEST_PROJECT:root},stdio:["ignore","ignore","pipe"]});let stderr="";child.stderr.setEncoding("utf8").on("data",chunk=>{stderr+=chunk;});child.once("error",reject);child.once("close",code=>code===0?resolve():reject(new Error(`journal writer ${prefix} exited ${code}: ${stderr}`)));});
 const outcomes=await Promise.allSettled([run("first-"),run("second-")]);for(const outcome of outcomes)if(outcome.status==="rejected")throw outcome.reason;
 const rows=new BackgroundJobJournal(file).load("shared-session",root);assert.equal(rows.length,100);assert.equal(new Set(rows.map(row=>row.id)).size,100);
});

test("journal refuses to reclaim an orphaned lock by pathname and resumes after explicit cleanup",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-orphan-lock-"));try{const file=join(root,"jobs.json"),lock=`${file}.lock`,journal=new BackgroundJobJournal(file);writeFileSync(lock,JSON.stringify({pid:999999999,createdAt:0}),{mode:0o600});assert.throws(()=>journal.record({id:"j1",sessionId:"s1",projectId:root,command:"echo",mode:"background",state:"completed",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),exitCode:0,eventCount:0,tail:[]}),/busy/u);assert.equal(readFileSync(lock,"utf8"),JSON.stringify({pid:999999999,createdAt:0}));unlinkSync(lock);journal.record({id:"j1",sessionId:"s1",projectId:root,command:"echo",mode:"background",state:"completed",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),exitCode:0,eventCount:0,tail:[]});assert.equal(journal.load("s1").length,1);}finally{rmSync(root,{recursive:true,force:true});}
});

test("Windows lock EPERM and concurrent durable progress remain bounded without claiming another lock",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-eperm-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const moduleUrl=pathToFileURL(join(process.cwd(),"src/runtime/background-job-journal.ts")).href;
 const script=`
import assert from "node:assert/strict";
import fs from "node:fs";
import {syncBuiltinESMExports} from "node:module";
import {BackgroundJobJournal} from ${JSON.stringify(moduleUrl)};
const scenario=process.env.ASEN_TEST_SCENARIO,root=process.env.ASEN_TEST_ROOT,file=root+"/"+scenario+".json",lock=file+".lock";
if(scenario!=="non-windows")Object.defineProperty(process,"platform",{value:"win32"});
const originalOpen=fs.openSync,originalWrite=fs.writeFileSync,originalClose=fs.closeSync,originalSync=fs.fsyncSync,originalWait=Atomics.wait,originalNow=Date.now;
const denied=Object.assign(new Error("injected lock denial"),{code:"EPERM"}),exists=Object.assign(new Error("injected post-open failure"),{code:"EEXIST"});let attempts=0,lockFd,waits=0,clock=0;
if(["recover","persistent","progress","churn"].includes(scenario))originalWrite(lock,"other owner");
if(scenario==="unsafe")fs.mkdirSync(lock);
if(scenario==="symlink")fs.symlinkSync("foreign-target",lock);
fs.openSync=function(path,...args){if(path===lock){attempts++;if(["recover","persistent","missing","vanished","unsafe","symlink","non-windows"].includes(scenario)&&(!["recover","vanished"].includes(scenario)||attempts===1))throw denied;const result=originalOpen.call(this,path,...args);lockFd=result;return result;}return originalOpen.call(this,path,...args);};
fs.writeFileSync=function(path,...args){if(path===lockFd&&["post-open","post-open-swap"].includes(scenario))throw denied;if(path===lockFd&&scenario==="post-open-eexist")throw exists;return originalWrite.call(this,path,...args);};
fs.fsyncSync=function(fd){if(scenario==="post-fsync"&&fd===lockFd)throw denied;return originalSync.call(this,fd);};
fs.closeSync=function(fd){const result=originalClose.call(this,fd);if(["cleanup-swap","post-open-swap"].includes(scenario)&&fd===lockFd){fs.renameSync(lock,lock+".original");originalWrite(lock,"foreign replacement");}return result;};
Atomics.wait=function(){waits++;
  if(scenario==="recover"){assert.equal(fs.readFileSync(lock,"utf8"),"other owner");fs.unlinkSync(lock);}
  if(scenario==="progress"||scenario==="churn"){
   // Simulate a different owner completing distinct atomic journal versions.
   // Its real lock is never reclaimed by the waiting process.
   originalWrite(file,"[]"+(" ".repeat(waits)));
   if(scenario==="progress"&&waits===5)fs.unlinkSync(lock);
  }
  clock+=1000;return "ok";};
Date.now=()=>clock;
syncBuiltinESMExports();
const now=new Date().toISOString(),snapshot={id:"one",sessionId:"s",projectId:root,command:"test",mode:"background",state:"completed",createdAt:now,updatedAt:now,exitCode:0,eventCount:0,tail:[]};
try{
 const journal=new BackgroundJobJournal(file);
 if(scenario==="recover"||scenario==="vanished"){journal.record(snapshot);assert.equal(attempts,2);assert.equal(waits,1);assert.equal(journal.load("s").length,1);}
  else if(scenario==="progress"){journal.record(snapshot);assert.equal(attempts,6);assert.equal(waits,5);assert.equal(journal.load("s").length,1);}
  else if(scenario==="churn"){assert.throws(()=>journal.record(snapshot),/busy/u);assert.equal(attempts,16);assert.equal(waits,15);assert.equal(fs.readFileSync(lock,"utf8"),"other owner");}
 else if(scenario==="cleanup-swap"){journal.record(snapshot);assert.equal(fs.readFileSync(lock,"utf8"),"foreign replacement");assert.equal(fs.readFileSync(lock+".original","utf8").includes("pid"),true);}
 else{assert.throws(()=>journal.record(snapshot),error=>error===(scenario==="post-open-eexist"?exists:denied));assert.equal(fs.existsSync(file),false);if(scenario==="persistent"||scenario==="missing"){assert.equal(attempts,4);assert.equal(waits,3);if(scenario==="persistent")assert.equal(fs.readFileSync(lock,"utf8"),"other owner");}else{assert.equal(attempts,1);assert.equal(waits,0);if(scenario==="unsafe")assert.equal(fs.lstatSync(lock).isDirectory(),true);if(scenario==="symlink")assert.equal(fs.lstatSync(lock).isSymbolicLink(),true);if(scenario==="post-open-swap")assert.equal(fs.readFileSync(lock,"utf8"),"foreign replacement");if(["post-open","post-open-eexist","post-fsync"].includes(scenario))assert.equal(fs.existsSync(lock),false);}}
}finally{fs.openSync=originalOpen;fs.writeFileSync=originalWrite;fs.closeSync=originalClose;fs.fsyncSync=originalSync;Atomics.wait=originalWait;Date.now=originalNow;syncBuiltinESMExports();}
`;
 for(const scenario of ["recover","persistent","progress","churn","missing","vanished","unsafe","post-open","post-open-swap","post-open-eexist","post-fsync","cleanup-swap",...(process.platform==="win32"?[]:["non-windows","symlink"])]){
  const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",script],{cwd:process.cwd(),env:{...process.env,ASEN_TEST_ROOT:root,ASEN_TEST_SCENARIO:scenario},encoding:"utf8",timeout:15000});
  assert.equal(result.status,0,`${scenario}: ${result.stderr||result.error?.message||"unknown error"}`);
 }
});


test("interrupted retry claim is atomic and cannot be replayed",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-retry-claim-"));
 try{
  const journal=new BackgroundJobJournal(join(root,"jobs.json")),now=new Date().toISOString();
  journal.record({id:"original",sessionId:"s",projectId:root,command:"original-command",mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
  const binding={sessionId:"s",projectId:root,interruptedJobId:"original",authorizedCommand:"safe-command",operationDigest:"a".repeat(64),expectedHead:"b".repeat(40),allowedPaths:["allowed.txt"],authorizationExpiresAt:new Date(Date.now()+60_000).toISOString()};
  const claim=journal.claimInterruptedForRetry({...binding,newJobId:"retry-1",authorizationId:"fresh-approval"});
  assert.equal(claim.resumable,false);assert.equal(claim.command,"safe-command");assert.equal(claim.authorizationId,"fresh-approval");assert.equal(claim.operationDigest,binding.operationDigest);
  assert.equal(journal.load("s",root).find(row=>row.id==="original")?.state,"stopped");
  assert.throws(()=>journal.claimInterruptedForRetry({...binding,newJobId:"retry-2",authorizationId:"another-approval"}),/not available/u);
  assert.equal(journal.load("s",root).filter(row=>row.id.startsWith("retry-")).length,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("authorization identifiers are durably single-use and ambiguous attempts cannot be replayed",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-retry-replay-"));
 try{
  const journal=new BackgroundJobJournal(join(root,"jobs.json")),now=new Date().toISOString(),base={sessionId:"s",projectId:root,authorizedCommand:"safe-command",operationDigest:"c".repeat(64),expectedHead:"d".repeat(40),allowedPaths:["allowed.txt"],authorizationExpiresAt:new Date(Date.now()+60_000).toISOString()};
  for(const id of ["first","second"])journal.record({id,sessionId:"s",projectId:root,command:"old-command",mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
  journal.claimInterruptedForRetry({...base,interruptedJobId:"first",newJobId:"retry-1",authorizationId:"one-use"});
  for(let index=0;index<105;index++){const at=new Date(Date.now()+index).toISOString();journal.record({id:`ordinary-${index}`,sessionId:"s",projectId:root,command:"test",mode:"background",state:"completed",createdAt:at,updatedAt:at,exitCode:0,eventCount:0,tail:[]});}
  assert.throws(()=>journal.claimInterruptedForRetry({...base,interruptedJobId:"second",newJobId:"retry-2",authorizationId:"one-use"}),/already consumed/u);
  assert.throws(()=>journal.claimInterruptedForRetry({...base,interruptedJobId:"first",newJobId:"retry-3",authorizationId:"fresh-but-ambiguous"}),/not available|uncertain outcome/u);
  assert.equal(journal.load("s",root).filter(row=>row.originalJobId==="first").length,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("delivery-state persistence preserves unresolved T04 retry entitlements",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-retry-delivery-retention-"));
 try{
  const journal=new BackgroundJobJournal(join(root,"jobs.json")),now=new Date().toISOString();
  journal.record({id:"original",sessionId:"s",projectId:root,command:"old-command",mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
  const binding={sessionId:"s",projectId:root,interruptedJobId:"original",authorizedCommand:"safe-command",operationDigest:"e".repeat(64),expectedHead:"f".repeat(40),allowedPaths:["allowed.txt"],authorizationExpiresAt:new Date(Date.now()+60_000).toISOString()};
  journal.claimInterruptedForRetry({...binding,newJobId:"retry-1",authorizationId:"one-use"});
  for(let index=0;index<105;index++){
   const at=new Date(Date.now()+index).toISOString();
   journal.record({id:`ordinary-${index}`,sessionId:"s",projectId:root,command:"test",mode:"background",state:"completed",createdAt:at,updatedAt:at,exitCode:0,eventCount:0,tail:[]});
  }
  journal.record({id:"delivered",sessionId:"s",projectId:root,command:"test",mode:"background",state:"completed",createdAt:now,updatedAt:new Date(Date.now()+200).toISOString(),exitCode:0,eventCount:0,tail:[]});
  journal.updateDeliveryState("delivered","s",root,"enqueued");
  journal.updateDeliveryState("delivered","s",root,"pending","temporary delivery failure");
  journal.updateDeliveryState("delivered","s",root,"pending");
  const rows=journal.load("s",root);
  assert.equal(rows.find(row=>row.id==="delivered")?.deliveryError,undefined);
  assert.equal(rows.find(row=>row.id==="retry-1")?.authorizationId,"one-use");
  assert.equal(rows.find(row=>row.id==="retry-1")?.state,"interrupted");
  assert.throws(()=>journal.claimInterruptedForRetry({...binding,interruptedJobId:"retry-1",newJobId:"retry-2",authorizationId:"one-use"}),/already consumed/u);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("forced termination of a real writer recovers interruption without replay or forged delivery",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-crash-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const journalPath=join(root,"jobs.json"),marker=join(root,"executions.txt"),moduleUrl=pathToFileURL(join(process.cwd(),"src/runtime/background-job-journal.ts")).href;
 const childScript=`import {BackgroundJobJournal} from ${JSON.stringify(moduleUrl)};
import {writeFileSync} from "node:fs";
const journal=new BackgroundJobJournal(process.env.ASEN_TEST_JOURNAL);
const now=new Date().toISOString();
journal.record({id:"crashed-job",sessionId:"crash-session",projectId:process.env.ASEN_TEST_PROJECT,command:"synthetic authorized child",mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
writeFileSync(process.env.ASEN_TEST_MARKER,"once\\n");
process.stdout.write("PERSISTED\\n");
setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childScript],{cwd:process.cwd(),env:{...process.env,ASEN_TEST_JOURNAL:journalPath,ASEN_TEST_PROJECT:root,ASEN_TEST_MARKER:marker},stdio:["ignore","pipe","pipe"],windowsHide:true});
 t.after(()=>{if(child.exitCode===null&&!child.killed)child.kill("SIGKILL");});
 let stderr="";
 child.stderr.setEncoding("utf8").on("data",(chunk:string)=>{stderr+=chunk.slice(0,1000);});
 await new Promise<void>((resolve,reject)=>{
  let observed="",done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve();};
  const timer=setTimeout(()=>{child.kill("SIGKILL");finish(new Error("child did not persist a ready journal before bounded deadline: "+stderr));},12000);
  child.stdout.setEncoding("utf8").on("data",(chunk:string)=>{observed+=chunk;if(observed.includes("PERSISTED"))finish();});
  child.once("error",(error:Error)=>finish(error));
  child.once("close",(code:number|null)=>finish(new Error("child exited before crash injection: "+code+" "+stderr)));
 });
 const closed=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("SIGKILL did not terminate isolated writer")),5000);child.once("close",()=>{clearTimeout(timer);resolve();});});
 assert.equal(child.kill("SIGKILL"),true,"test injects one real forced process termination");
 await closed;
 const journal=new BackgroundJobJournal(journalPath);
 const rows=journal.load("crash-session",root);
 assert.equal(rows.length,1);assert.equal(rows[0]?.id,"crashed-job");assert.equal(rows[0]?.state,"interrupted");assert.equal(rows[0]?.resumable,false);
 assert.equal(journal.load("unrelated-session",root).length,0);
 const pending=pendingBackgroundJobNotifications(rows,"crash-session",root);
 assert.equal(pending.length,0,"a read-time interruption is visible through status but must not be auto-enqueued");
 const before=readFileSync(journalPath,"utf8");
 assert.throws(()=>journal.updateDeliveryState("crashed-job","crash-session",root,"enqueued"),/Cannot deliver a running job result/u,"a stale disk running record must not be falsely acknowledged by a competing process");
 assert.equal(readFileSync(journalPath,"utf8"),before);
 assert.equal(readFileSync(marker,"utf8"),"once\n","recovery never silently reruns the terminated command");
});


test("durably interrupted retry claims cannot be marked delivered by a competing session",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-interrupted-delivery-denied-"));
 try{
  const journal=new BackgroundJobJournal(join(root,"jobs.json")),now=new Date().toISOString();
  journal.record({id:"uncertain",sessionId:"s",projectId:root,command:"unknown",mode:"background",state:"interrupted",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
  const before=readFileSync(join(root,"jobs.json"),"utf8");
  for(const state of ["pending","enqueued"] as const){
   assert.throws(()=>journal.updateDeliveryState("uncertain","s",root,state),/Cannot deliver an interrupted job result/u);
   assert.equal(readFileSync(join(root,"jobs.json"),"utf8"),before,"a refused acknowledgement cannot mutate a durable retry claim");
  }
  journal.record({id:"terminal",sessionId:"s",projectId:root,command:"known failure",mode:"background",state:"failed",createdAt:now,updatedAt:now,exitCode:8,eventCount:0,tail:[]});
  assert.equal(journal.updateDeliveryState("terminal","s",root,"enqueued").deliveryState,"enqueued","real terminal failure delivery remains usable");
 }finally{rmSync(root,{recursive:true,force:true});}
});


test("T04 retry claim cannot be overwritten by stale original child, and a bound retry starts only once",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-retry-record-guard-"));
 try{
  const file=join(root,"journal.json"),journal=new BackgroundJobJournal(file),now=new Date().toISOString();
  const original={id:"original",sessionId:"s",projectId:root,command:"original command",mode:"background" as const,args:["--input","safe"],cwd:root,state:"running" as const,createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]};
  journal.record(original);
  const auth={sessionId:"s",projectId:root,interruptedJobId:"original",newJobId:"retry-1",authorizedCommand:"approved command",authorizationId:"one-use-approval",operationDigest:"a".repeat(64),expectedHead:"b".repeat(40),allowedPaths:["owned.txt"],authorizationExpiresAt:new Date(Date.now()+60_000).toISOString()};
  const claim=journal.claimInterruptedForRetry(auth),before=readFileSync(file,"utf8");
  assert.equal(claim.cwd,root,"claim must carry working-directory identity");
  assert.deepEqual(claim.args,original.args,"claim must carry original argument identity");
  assert.throws(()=>journal.record({...original,state:"completed",exitCode:0,updatedAt:new Date(Date.now()+10_000).toISOString()}),/record conflict/u);
  assert.equal(readFileSync(file,"utf8"),before,"a stale original process cannot erase consumed authorization");
  assert.throws(()=>journal.claimInterruptedForRetry({...auth,newJobId:"retry-2",authorizationId:"new approval"}),/not available/u);
  const live={...claim,state:"running" as const,createdAt:new Date(Date.now()+1000).toISOString(),updatedAt:new Date(Date.now()+1000).toISOString()};
  assert.throws(()=>journal.record({...live,authorizationId:"other"}),/record conflict/u,"retry authority cannot be substituted");
  journal.record(live);
  const afterStart=readFileSync(file,"utf8");
  assert.throws(()=>journal.record(live),/record conflict/u,"claimed job must not start twice");
  assert.equal(readFileSync(file,"utf8"),afterStart);
  journal.record({...live,state:"completed",exitCode:0,updatedAt:new Date(Date.now()+2000).toISOString()});
  const rows=journal.load("s",root),retry=rows.find(row=>row.id==="retry-1");
  assert.equal(retry?.state,"completed");assert.equal(retry?.authorizationId,auth.authorizationId);
  assert.equal(retry?.originalJobId,"original");
  assert.equal(rows.find(row=>row.id==="original")?.state,"stopped");
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("T10 terminal receipt and scope cannot be overwritten by a later stale record",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-record-finality-"));
 try{
  const file=join(root,"journal.json"),journal=new BackgroundJobJournal(file),now=new Date().toISOString();
  const started={id:"j",sessionId:"s",projectId:root,command:"cmd",mode:"background" as const,state:"running" as const,createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]};
  journal.record(started);
  const terminal={...started,state:"failed" as const,exitCode:7,updatedAt:new Date(Date.now()+1000).toISOString(),tail:["real failure"]};
  journal.record(terminal);
  journal.updateDeliveryState("j","s",root,"enqueued");
  const before=readFileSync(file,"utf8");
  assert.throws(()=>journal.record({...terminal,state:"completed",exitCode:0}),/record conflict/u);
  assert.throws(()=>journal.record({...terminal,sessionId:"foreign",deliveryState:"enqueued" as const}),/record conflict/u);
  assert.equal(readFileSync(file,"utf8"),before,"the terminal result and delivery receipt must remain byte-identical");
  assert.equal(journal.load("s",root)[0]?.deliveryState,"enqueued");
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("F4-B expired, malformed or repeated Writer retry grants cannot revive an interrupted operation",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t12-expired-retry-"));
 try{
  const journal=new BackgroundJobJournal(join(root,"jobs.json")),now=new Date().toISOString();
  journal.record({id:"original",sessionId:"s",projectId:root,command:"old",
   mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
  const input={sessionId:"s",projectId:root,interruptedJobId:"original",newJobId:"retry-1",
   authorizedCommand:"approved safe command",authorizationId:"one-time-consent",
   operationDigest:"a".repeat(64),expectedHead:"b".repeat(40),allowedPaths:["allowed.txt"]};
  const before=readFileSync(join(root,"jobs.json"),"utf8");
  for(const authorizationExpiresAt of [
   new Date(Date.now()-60_000).toISOString(),
   new Date(0).toISOString(),
   "not-a-date",
  ]){
   assert.throws(()=>journal.claimInterruptedForRetry({...input,authorizationExpiresAt}),
    /fresh, unexpired authorization/);
   assert.equal(readFileSync(join(root,"jobs.json"),"utf8"),before,
    "An expired or malformed grant may not change durable state");
  }
  const valid={...input,authorizationExpiresAt:new Date(Date.now()+60_000).toISOString()};
  const claimed=journal.claimInterruptedForRetry(valid);
  assert.equal(claimed.authorizationId,"one-time-consent");
  assert.equal(claimed.resumable,false);
  const committed=readFileSync(join(root,"jobs.json"),"utf8");
  assert.throws(()=>journal.claimInterruptedForRetry(valid),/not available|already consumed/);
  assert.equal(readFileSync(join(root,"jobs.json"),"utf8"),committed);
  assert.throws(()=>journal.claimInterruptedForRetry({...valid,newJobId:"retry-2",
   authorizationId:"different-approval"}),/not available|uncertain outcome/);
  assert.equal(readFileSync(join(root,"jobs.json"),"utf8"),committed);
  const rows=journal.load("s",root);
  assert.equal(rows.filter(row=>row.originalJobId==="original").length,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
