import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {inspectParallelWriterReadiness} from "../src/runtime/parallel-writer-readiness.js";
import {acquireWorkspaceWriter} from "../src/runtime/workspace-writer-lease.js";

function setup(t:import("node:test").TestContext){
 const folder=mkdtempSync(join(tmpdir(),"asen-ef303-worktrees-"));
 t.after(()=>rmSync(folder,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const root=join(folder,"repository"),a=join(folder,"lane-a"),b=join(folder,"lane-b");
 mkdirSync(root);
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");
 git("config","user.name","ASEN readiness");
 git("config","user.email","asen@example.invalid");
 mkdirSync(join(root,"src"));
 writeFileSync(join(root,"src","a.ts"),"a0\n");
 writeFileSync(join(root,"src","b.ts"),"b0\n");
 git("add",".");git("commit","-qm","baseline");
 const head=git("rev-parse","HEAD");
 git("worktree","add","--detach",a,head);
 git("worktree","add","--detach",b,head);
 return {root,a,b,head,git};
}
test("EF-303 disjoint linked worktrees have two independent real leases and preserved files",t=>{
 const f=setup(t);
 const a={root:f.a,head:f.head,paths:["src/a.ts"]},b={root:f.b,head:f.head,paths:["src/b.ts"]};
 const readiness=inspectParallelWriterReadiness([a,b]);
 assert.equal(readiness.status,"READINESS_ONLY");
 assert.equal(readiness.humanApproval,false);
 assert.equal(readiness.integrationApproved,false);
 const one=acquireWorkspaceWriter({root:f.a,expectedHead:f.head,allowedPaths:a.paths,authorizationId:"authorization-a"});
 const two=acquireWorkspaceWriter({root:f.b,expectedHead:f.head,allowedPaths:b.paths,authorizationId:"authorization-b"});
 try{
  writeFileSync(join(f.a,"src","a.ts"),"a1\n");
  writeFileSync(join(f.b,"src","b.ts"),"b1\n");
  one.verify();two.verify();
  assert.equal(readFileSync(join(f.a,"src","b.ts"),"utf8"),"b0\n");
  assert.equal(readFileSync(join(f.b,"src","a.ts"),"utf8"),"a0\n");
  assert.equal(readFileSync(join(f.root,"src","a.ts"),"utf8"),"a0\n");
  assert.equal(readFileSync(join(f.root,"src","b.ts"),"utf8"),"b0\n");
 }finally{one.release();two.release();}
});
test("EF-303 duplicate worktree and overlapping file or folder scopes fail closed",t=>{
 const f=setup(t),a={root:f.a,head:f.head,paths:["src/a.ts"]};
 const duplicate={root:f.a,head:f.head,paths:["src/b.ts"]};
 assert.throws(()=>inspectParallelWriterReadiness([a,duplicate]),/share a worktree/u);
 for(const paths of [["src/a.ts"],["src"],["src/a.ts","src/b.ts"]])
  assert.throws(()=>inspectParallelWriterReadiness([a,{root:f.b,head:f.head,paths}]),/overlap/u);
 assert.throws(()=>inspectParallelWriterReadiness([a,{root:f.b,head:"0".repeat(40),paths:["src/b.ts"]}]),/Stale/u);
 assert.throws(()=>inspectParallelWriterReadiness([a,{root:f.b,head:f.head,paths:["src/b.ts","src/b.ts"]}]),/Invalid/u);
 assert.throws(()=>inspectParallelWriterReadiness([a,{root:f.b,head:f.head,paths:[".git/config"]}]),/Invalid/u);
});
test("EF-303 worktree must be clean and on the same repository with exact SHA",t=>{
 const f=setup(t),a={root:f.a,head:f.head,paths:["src/a.ts"]};
 const b={root:f.b,head:f.head,paths:["src/b.ts"]};
 writeFileSync(join(f.b,"src","b.ts"),"dirty\n");
 assert.throws(()=>inspectParallelWriterReadiness([a,b]),/not clean/u);
 const unrelated=mkdtempSync(join(tmpdir(),"asen-ef303-unrelated-"));
 t.after(()=>rmSync(unrelated,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",unrelated,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","other");git("config","user.email","other@example.invalid");
 writeFileSync(join(unrelated,"other.txt"),"other\n");git("add",".");git("commit","-qm","other");
 assert.throws(()=>inspectParallelWriterReadiness([a,{root:unrelated,head:git("rev-parse","HEAD"),paths:["other.txt"]}]),/same repository/u);
});

test("EF-303 a symlink inside a candidate's declared scope blocks readiness",t=>{
 if(process.platform==="win32"){t.skip("Symlink creation requires Windows privileges");return;}
 const f=setup(t),left={root:f.a,head:f.head,paths:["src/a.ts"]};
 symlinkSync(join(f.b,"src","b.ts"),join(f.b,"src","alias.ts"));
 assert.throws(()=>inspectParallelWriterReadiness([left,{root:f.b,head:f.head,paths:["src/alias.ts"]}]),
  /symbolic link|not clean/u);
});
