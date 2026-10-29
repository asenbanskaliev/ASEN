import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";
import {BackgroundJobRegistry} from "../src/runtime/background-jobs.js";
import {retryInterruptedAuthorized} from "../src/runtime/authorized-job-retry.js";
import {pathToFileURL} from "node:url";

test("authorized retry runs once; competing and stale writers fail closed",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-authorized-retry-")),journalRoot=mkdtempSync(join(tmpdir(),"asen-authorized-retry-journal-"));t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(journalRoot,{recursive:true,force:true});});
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");
 writeFileSync(join(root,"target.txt"),"initial\n");git("add","target.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),journal=new BackgroundJobJournal(join(journalRoot,"jobs.json")),now=new Date().toISOString();
 const command="authorized-operation";
 journal.record({id:"interrupted",sessionId:"session",projectId:root,command,mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
 let executions=0;
 const registry=new BackgroundJobRegistry(undefined,async()=>{executions++;writeFileSync(join(root,"target.txt"),"recovered\n");return {exitCode:0};});
 const newJobId="e166e684-0601-40b1-b198-1e4c4e7678a2",input={journal,registry,interruptedJobId:"interrupted",newJobId,authorizationId:"new-approval",expectedHead:head,allowedPaths:["target.txt"],authorizationExpiresAt:new Date(Date.now()+60_000).toISOString(),options:{sessionId:"session",projectId:root,cwd:root,command}};
 const result=await retryInterruptedAuthorized(input);
 assert.equal(result.id,newJobId);assert.equal(result.state,"completed");assert.equal(result.authorizationId,"new-approval");assert.equal(executions,1);assert.equal(readFileSync(join(root,"target.txt"),"utf8"),"recovered\n");
 await assert.rejects(()=>retryInterruptedAuthorized({...input,newJobId:"e166e684-0601-40b1-b198-1e4c4e7678a3",authorizationId:"other-approval"}),/clean workspace|not available|uncertain outcome/u);
 assert.equal(executions,1);
});

test("hard process death after the authorized write is recovered as interrupted and cannot replay",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-retry-hard-kill-")),journalRoot=mkdtempSync(join(tmpdir(),"asen-retry-hard-kill-journal-"));
 t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(journalRoot,{recursive:true,force:true});});
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"target.txt"),"base\n");git("add","target.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),journalFile=join(journalRoot,"jobs.json"),target=join(root,"target.txt"),now=new Date().toISOString();
 const childCode=`require("node:fs").appendFileSync(${JSON.stringify(target)},"written-once\\n");process.kill(process.ppid,"SIGKILL");process.exit(0);`;
 const originalArgs=["-e",childCode],journal=new BackgroundJobJournal(journalFile);journal.record({id:"interrupted-original",sessionId:"session",projectId:root,command:process.execPath,args:originalArgs,cwd:root,mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
 const sourceRoot=process.cwd(),url=(path:string)=>pathToFileURL(join(sourceRoot,path)).href;
 const host=`import {BackgroundJobJournal} from ${JSON.stringify(url("src/runtime/background-job-journal.ts"))};import {BackgroundJobRegistry} from ${JSON.stringify(url("src/runtime/background-jobs.ts"))};import {retryInterruptedAuthorized} from ${JSON.stringify(url("src/runtime/authorized-job-retry.ts"))};const journal=new BackgroundJobJournal(process.env.ASEN_TEST_JOURNAL),registry=new BackgroundJobRegistry(journal);await retryInterruptedAuthorized({journal,registry,interruptedJobId:"interrupted-original",newJobId:"e166e684-0601-40b1-b198-1e4c4e7678b1",authorizationId:"hard-kill-one-use",expectedHead:process.env.ASEN_TEST_HEAD,allowedPaths:["target.txt"],authorizationExpiresAt:${JSON.stringify(new Date(Date.now()+60_000).toISOString())},options:{sessionId:"session",projectId:process.env.ASEN_TEST_ROOT,cwd:process.env.ASEN_TEST_ROOT,command:process.execPath,args:${JSON.stringify(originalArgs)}}});`;
 const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",host],{cwd:sourceRoot,env:{...process.env,ASEN_TEST_JOURNAL:journalFile,ASEN_TEST_ROOT:root,ASEN_TEST_HEAD:head},stdio:["ignore","ignore","pipe"]});
 let stderr="";child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
 const exit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("retry host did not reach the hard-kill boundary"));},10_000);child.once("error",error=>{clearTimeout(timer);reject(error);});child.once("close",(code,signal)=>{clearTimeout(timer);resolve({code,signal});});});
 assert.equal(exit.signal,"SIGKILL",stderr);assert.equal(readFileSync(target,"utf8"),"base\nwritten-once\n");
 const attemptId="e166e684-0601-40b1-b198-1e4c4e7678b1",recovered=new BackgroundJobRegistry(journal).list("session",root),attempt=recovered.find(job=>job.id===attemptId),durableAttempt=journal.load("session",root).find(job=>job.id===attemptId);
 assert.equal(attempt?.state,"interrupted");assert.equal(durableAttempt?.resumable,false);assert.equal(attempt?.authorizationId,"hard-kill-one-use");
 const fresh={journal,registry:new BackgroundJobRegistry(journal),interruptedJobId:attemptId,newJobId:"e166e684-0601-40b1-b198-1e4c4e7678b2",authorizationId:"hard-kill-second-approval",expectedHead:head,allowedPaths:["target.txt"],authorizationExpiresAt:new Date(Date.now()+60_000).toISOString(),options:{sessionId:"session",projectId:root,cwd:root,command:process.execPath,args:["-e",`require("node:fs").appendFileSync(${JSON.stringify(target)},"duplicate\\n")`]}};
 await assert.rejects(()=>retryInterruptedAuthorized(fresh),/clean workspace|uncertain outcome/u);
 assert.equal(readFileSync(target,"utf8"),"base\nwritten-once\n");
});
