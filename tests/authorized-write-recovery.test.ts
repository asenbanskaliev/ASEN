import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test,{type TestContext} from "node:test";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";
import {reconcileInterruptedAuthorizedWrite} from "../src/runtime/authorized-write-recovery.js";

function fixture(t:TestContext){
 const root=resolve(mkdtempSync(join(tmpdir(),"asen-write-recovery-"))),state=mkdtempSync(join(tmpdir(),"asen-write-recovery-state-"));
 t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(state,{recursive:true,force:true});});
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"base.txt"),"base\n");git("add","base.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),journal=new BackgroundJobJournal(join(state,"jobs.json")),now=new Date().toISOString(),id="interrupted-write",sessionId="session",allowedPaths=["target.txt"];
 journal.record({id,sessionId,projectId:root,command:"asen-pi-authorized-write",args:["target.txt"],cwd:root,mode:"background",state:"running",createdAt:now,updatedAt:now,exitCode:null,eventCount:0,tail:[],authorizationId:"authorization-one",expectedHead:head,allowedPaths,authorizationExpiresAt:new Date(Date.now()+60_000).toISOString()});
 const expected="expected exact bytes\n",expectedFileSha256={"target.txt":createHash("sha256").update(expected).digest("hex")};
 const recover=()=>reconcileInterruptedAuthorizedWrite({journal,sessionId,projectId:root,interruptedJobId:id,expectedHead:head,allowedPaths,expectedFileSha256});
 return {root,git,expected,recover};
}

test("recovery classifies no write as pending and requires fresh authorization",t=>{
 const state=fixture(t),first=state.recover(),second=state.recover();
 assert.equal(first.state,"pending");assert.equal(first.action,"fresh-authorization-required");assert.deepEqual(second,first);
});

test("recovery recognizes exact authorized bytes and forbids replay across repeated restarts",t=>{
 const state=fixture(t);writeFileSync(join(state.root,"target.txt"),state.expected);
 const first=state.recover(),second=state.recover();
 assert.equal(first.state,"completed");assert.equal(first.action,"do-not-replay");assert.deepEqual(second,first);
});

test("recovery blocks partial, external and changed-HEAD outcomes as uncertain",t=>{
 const partial=fixture(t);writeFileSync(join(partial.root,"target.txt"),"partial");assert.equal(partial.recover().state,"uncertain");
 const external=fixture(t);writeFileSync(join(external.root,"target.txt"),external.expected);writeFileSync(join(external.root,"outside.txt"),"external\n");assert.equal(external.recover().state,"uncertain");
 const stale=fixture(t);writeFileSync(join(stale.root,"target.txt"),stale.expected);writeFileSync(join(stale.root,"new.txt"),"commit\n");stale.git("add","new.txt");stale.git("commit","-qm","advance");assert.equal(stale.recover().state,"uncertain");
});
