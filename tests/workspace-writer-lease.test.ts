import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {acquireWorkspaceWriter} from "../src/runtime/workspace-writer-lease.js";

test("exclusive workspace writer rejects concurrent owners, stale revisions and unauthorized paths",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-writer-lease-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");
 writeFileSync(join(root,"target.txt"),"base\n");git("add","target.txt");git("commit","-qm","base");
 const head=git("rev-parse","HEAD"),args={root,expectedHead:head,authorizationId:"fresh",allowedPaths:["target.txt"]};
 assert.throws(()=>acquireWorkspaceWriter({...args,allowedPaths:["../outside"]}),/Invalid/u);
 const first=acquireWorkspaceWriter(args);
 assert.throws(()=>acquireWorkspaceWriter({...args,authorizationId:"other"}),/conflict/u);
 first.verify();first.release();
 const second=acquireWorkspaceWriter({...args,authorizationId:"other"});second.release();
 writeFileSync(join(root,"target.txt"),"next\n");git("add","target.txt");git("commit","-qm","next");
 assert.throws(()=>acquireWorkspaceWriter(args),/Stale/u);
});
