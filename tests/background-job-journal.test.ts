import test from "node:test";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync,unlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";

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

test("Windows lock EPERM handling keeps contention bounded and never claims another lock",t=>{
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
if(["recover","persistent"].includes(scenario))originalWrite(lock,"other owner");
if(scenario==="unsafe")fs.mkdirSync(lock);
if(scenario==="symlink")fs.symlinkSync("foreign-target",lock);
fs.openSync=function(path,...args){if(path===lock){attempts++;if(["recover","persistent","missing","unsafe","symlink","non-windows"].includes(scenario)&&(scenario!=="recover"||attempts===1))throw denied;const result=originalOpen.call(this,path,...args);lockFd=result;return result;}return originalOpen.call(this,path,...args);};
fs.writeFileSync=function(path,...args){if(path===lockFd&&["post-open","post-open-swap"].includes(scenario))throw denied;if(path===lockFd&&scenario==="post-open-eexist")throw exists;return originalWrite.call(this,path,...args);};
fs.fsyncSync=function(fd){if(scenario==="post-fsync"&&fd===lockFd)throw denied;return originalSync.call(this,fd);};
fs.closeSync=function(fd){const result=originalClose.call(this,fd);if(["cleanup-swap","post-open-swap"].includes(scenario)&&fd===lockFd){fs.renameSync(lock,lock+".original");originalWrite(lock,"foreign replacement");}return result;};
Atomics.wait=function(){waits++;if(scenario==="recover"){assert.equal(fs.readFileSync(lock,"utf8"),"other owner");fs.unlinkSync(lock);}clock+=1000;return "ok";};
Date.now=()=>clock;
syncBuiltinESMExports();
const now=new Date().toISOString(),snapshot={id:"one",sessionId:"s",projectId:root,command:"test",mode:"background",state:"completed",createdAt:now,updatedAt:now,exitCode:0,eventCount:0,tail:[]};
try{
 const journal=new BackgroundJobJournal(file);
 if(scenario==="recover"){journal.record(snapshot);assert.equal(attempts,2);assert.equal(waits,1);assert.equal(journal.load("s").length,1);}
 else if(scenario==="cleanup-swap"){journal.record(snapshot);assert.equal(fs.readFileSync(lock,"utf8"),"foreign replacement");assert.equal(fs.readFileSync(lock+".original","utf8").includes("pid"),true);}
 else{assert.throws(()=>journal.record(snapshot),error=>error===(scenario==="post-open-eexist"?exists:denied));assert.equal(fs.existsSync(file),false);if(scenario==="persistent"){assert.equal(attempts,4);assert.equal(waits,3);assert.equal(fs.readFileSync(lock,"utf8"),"other owner");}else{assert.equal(attempts,1);assert.equal(waits,0);if(scenario==="unsafe")assert.equal(fs.lstatSync(lock).isDirectory(),true);if(scenario==="symlink")assert.equal(fs.lstatSync(lock).isSymbolicLink(),true);if(scenario==="post-open-swap")assert.equal(fs.readFileSync(lock,"utf8"),"foreign replacement");if(["post-open","post-open-eexist","post-fsync"].includes(scenario))assert.equal(fs.existsSync(lock),false);}}
}finally{fs.openSync=originalOpen;fs.writeFileSync=originalWrite;fs.closeSync=originalClose;fs.fsyncSync=originalSync;Atomics.wait=originalWait;Date.now=originalNow;syncBuiltinESMExports();}
`;
 for(const scenario of ["recover","persistent","missing","unsafe","post-open","post-open-swap","post-open-eexist","post-fsync","cleanup-swap",...(process.platform==="win32"?[]:["non-windows","symlink"])]){
  const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",script],{cwd:process.cwd(),env:{...process.env,ASEN_TEST_ROOT:root,ASEN_TEST_SCENARIO:scenario},encoding:"utf8",timeout:15000});
  assert.equal(result.status,0,`${scenario}: ${result.stderr||result.error?.message||"unknown error"}`);
 }
});

