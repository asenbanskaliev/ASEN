import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {excludeCodeGraphIndexLocally} from "../src/interaction/codegraph-local-exclude.js";
import {createCodeGraphTool,type CodeGraphRunner} from "../src/interaction/code-intelligence.js";

function setup(t:test.TestContext){
 const root=mkdtempSync(join(tmpdir(),"asen-codegraph-exclude-"));
 t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN exclude test");git("config","user.email","fixture@example.invalid");
 writeFileSync(join(root,"index.ts"),"export const f=1;\n");git("add","index.ts");git("commit","-qm","baseline");
 return {root,git};
}
test("Git-local CodeGraph exclusion does not change tracked files or duplicate patterns",t=>{
 const {root,git}=setup(t);
 const index=join(root,".codegraph");mkdirSync(index);writeFileSync(join(index,".gitignore"),"*\n!.gitignore\n");
 assert.match(git("status","--porcelain"),/\.codegraph/u);
 const first=excludeCodeGraphIndexLocally(root);
 assert.equal(first.status,"added",JSON.stringify(first));
 assert.equal(git("status","--porcelain"),"");
 const next=excludeCodeGraphIndexLocally(root);
 assert.equal(next.status,"present",JSON.stringify(next));
 const content=readFileSync(first.path!,"utf8");
 assert.equal(content.split(/\r?\n/u).filter(line=>line===".codegraph/").length,1);
 assert.equal(git("log","-1","--pretty=%s"),"baseline");
});
test("Existing exclusion content is preserved and equivalent entries are never duplicated",t=>{
 const {root}=setup(t),file=join(root,".git","info","exclude");
 writeFileSync(file,"# user rules\nimportant/\n/.codegraph\n");
 const result=excludeCodeGraphIndexLocally(root);
 assert.equal(result.status,"present",JSON.stringify(result));
 assert.equal(readFileSync(file,"utf8"),"# user rules\nimportant/\n/.codegraph\n");
});
test("Symlinked Git exclusion cannot be written even with existing index authorization",t=>{
 if(process.platform==="win32"){t.skip("Windows symlink creation requires additional privileges");return;}
 const {root}=setup(t),file=join(root,".git","info","exclude"),outside=join(root,"outside");
 writeFileSync(outside,"foreign\n");rmSync(file,{force:true});symlinkSync(outside,file);
 assert.equal(excludeCodeGraphIndexLocally(root).status,"failed");
 assert.equal(readFileSync(outside,"utf8"),"foreign\n");
});
test("Local exclusion must follow the common git directory for linked worktrees",t=>{
 const {root,git}=setup(t),worktree=join(root,"..","worktree-"+Math.random().toString(36).slice(2));
 t.after(()=>rmSync(worktree,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 git("worktree","add","--detach",worktree,"HEAD");
 const result=excludeCodeGraphIndexLocally(worktree);
 assert.equal(result.status,"added",JSON.stringify(result));
 assert.match(readFileSync(join(root,".git","info","exclude"),"utf8"),/\.codegraph\//u);
});

test("Only approved indexing may change Git-local exclude; model queries remain read-only",async t=>{
 const {root,git}=setup(t),file=join(root,".git","info","exclude");
 const before=readFileSync(file,"utf8");
 const runner:CodeGraphRunner=async args=>{
  if(args[0]==="init"){
   const directory=join(root,".codegraph");mkdirSync(directory);
   writeFileSync(join(directory,".gitignore"),"*\n!.gitignore\n");
  }
  return {stdout:"indexed",stderr:""};
 };
 const tool=createCodeGraphTool(runner),call=async(operation:"init"|"query"|"sync",allowed:boolean)=>
  await tool.execute("t07-exclude",{operation,...(operation==="query"?{query:"symbol"}:{})},undefined,undefined,{
   cwd:root,hasUI:true,ui:{confirm:async()=>allowed},
  } as any);
 assert.equal((await call("query",false)).details.status,"completed");
 assert.equal(readFileSync(file,"utf8"),before,"read-only query must never edit Git metadata");
 assert.equal((await call("init",false)).details.status,"denied");
 assert.equal(readFileSync(file,"utf8"),before,"declined init must not edit Git metadata");
 const init=await call("init",true);
 assert.equal(init.details.status,"completed");
 assert.equal((init.details as {localExclude:{status:string}}).localExclude.status,"added");
 assert.equal(git("status","--porcelain"),"","approved init must hide its index from status");
 assert.equal((await call("sync",false)).details.status,"denied");
 assert.equal((await call("sync",true)).details.status,"completed");
 assert.equal(readFileSync(file,"utf8").split(/\r?\n/u).filter(line=>line===".codegraph/").length,1);
});
