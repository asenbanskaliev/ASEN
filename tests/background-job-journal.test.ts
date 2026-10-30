import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
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
 await Promise.all([run("first-"),run("second-")]);const rows=new BackgroundJobJournal(file).load("shared-session",root);assert.equal(rows.length,100);assert.equal(new Set(rows.map(row=>row.id)).size,100);
});

test("journal refuses to reclaim an orphaned lock by pathname and resumes after explicit cleanup",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-job-journal-orphan-lock-"));try{const file=join(root,"jobs.json"),lock=`${file}.lock`,journal=new BackgroundJobJournal(file);writeFileSync(lock,JSON.stringify({pid:999999999,createdAt:0}),{mode:0o600});assert.throws(()=>journal.record({id:"j1",sessionId:"s1",projectId:root,command:"echo",mode:"background",state:"completed",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),exitCode:0,eventCount:0,tail:[]}),/busy/u);assert.equal(readFileSync(lock,"utf8"),JSON.stringify({pid:999999999,createdAt:0}));unlinkSync(lock);journal.record({id:"j1",sessionId:"s1",projectId:root,command:"echo",mode:"background",state:"completed",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),exitCode:0,eventCount:0,tail:[]});assert.equal(journal.load("s1").length,1);}finally{rmSync(root,{recursive:true,force:true});}
});

