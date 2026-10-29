import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";
import {BackgroundJobRegistry} from "../src/runtime/background-jobs.js";
import {retryInterruptedAuthorized} from "../src/runtime/authorized-job-retry.js";

test("authorized retry runs once; competing and stale writers fail closed",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-authorized-retry-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");
 writeFileSync(join(root,"target.txt"),"initial\n");git("add","target.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),journal=new BackgroundJobJournal(join(root,".git","jobs.json")),now=new Date().toISOString();
 const command="authorized-operation";
 journal.record({id:"interrupted",sessionId:"session",projectId:root,command,mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[]});
 let executions=0;
 const registry=new BackgroundJobRegistry(undefined,async()=>{executions++;writeFileSync(join(root,"target.txt"),"recovered\n");return {exitCode:0};});
 const input={journal,registry,interruptedJobId:"interrupted",newJobId:"retry-1",authorizationId:"new-approval",expectedHead:head,allowedPaths:["target.txt"],options:{sessionId:"session",projectId:root,cwd:root,command}};
 const result=await retryInterruptedAuthorized(input);
 assert.equal(result.state,"completed");assert.equal(executions,1);assert.equal(readFileSync(join(root,"target.txt"),"utf8"),"recovered\n");
 await assert.rejects(()=>retryInterruptedAuthorized({...input,newJobId:"retry-2",authorizationId:"other-approval"}),/clean workspace|not available/u);
 assert.equal(executions,1);
});
