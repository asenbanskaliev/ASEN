import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {inspectParallelWorktreeChanges} from "../src/runtime/agents/parallel-worktree-change-inspection.js";

function fixture(t:TestContext){
 const source=resolve(mkdtempSync(join(tmpdir(),"asen-t06-review-origin-"))),
  parent=resolve(mkdtempSync(join(tmpdir(),"asen-t06-review-siblings-"))),
  root=join(parent,"asen-worker-scope-001");
 const git=(worktree:string,...args:string[])=>execFileSync("git",["-C",worktree,...args],
  {encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git(source,"init","-q");git(source,"config","user.name","ASEN evidence test");
 git(source,"config","user.email","asen-inspect@example.invalid");
 git(source,"config","core.autocrlf","false");
 writeFileSync(join(source,"a.ts"),"export const a = 1;\n");
 writeFileSync(join(source,"b.ts"),"export const b = 2;\n");
 writeFileSync(join(source,".gitignore"),"*.cache\n");
 git(source,"add","a.ts","b.ts",".gitignore");git(source,"commit","-qm","baseline");
 const head=git(source,"rev-parse","HEAD");
 git(source,"worktree","add","--detach",root,head);
 const inspect=(opts:Record<string,unknown>={})=>inspectParallelWorktreeChanges({
  sourceRoot:source,worktreeRoot:root,baseRevision:head,writeSurfaces:["a.ts"],...opts
 } as Parameters<typeof inspectParallelWorktreeChanges>[0]);
 t.after(()=>{
  if(existsSync(root))try{git(source,"worktree","remove","--force",root);}catch{}
  rmSync(source,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});
 });
 return {source,root,head,git,inspect};
}

test("T06 exact frozen worktree produces advisory clean, never delivery acceptance",t=>{
 const f=fixture(t),result=f.inspect();
 assert.equal(result.status,"clean");
 assert.equal(result.sourceVerified,true);assert.equal(result.headMatchesBase,true);
 assert.deepEqual(result.changedPaths,[]);assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.autoMerge,false);
});

test("T06 scoped tracked edits remain advisory and cannot silently approve Writer output",t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,"a.ts"),"export const a = 4;\n");
 const result=f.inspect();
 assert.equal(result.status,"scoped-changes");
 assert.deepEqual(result.changedPaths,["a.ts"]);
 assert.deepEqual(result.outOfScopePaths,[]);
 assert.equal(result.acceptance,"not-accepted");
});

test("T06 detects out-of-scope tracked, untracked and ignored files",t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,"b.ts"),"export const b = 5;\n");
 writeFileSync(join(f.root,"unknown.txt"),"not approved\n");
 writeFileSync(join(f.root,"secret.cache"),"ignored but unapproved\n");
 const result=f.inspect();
 assert.equal(result.status,"out-of-scope");
 assert.deepEqual(result.changedPaths,["b.ts","secret.cache","unknown.txt"]);
 assert.deepEqual(result.outOfScopePaths,["b.ts","secret.cache","unknown.txt"]);
 assert.equal(result.autoMerge,false);
});

test("T06 committed head drift remains visible instead of appearing clean",t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,"a.ts"),"export const a = 10;\n");
 f.git(f.root,"add","a.ts");f.git(f.root,"commit","-qm","unauthorized candidate drift");
 const result=f.inspect();
 assert.equal(result.status,"head-diverged");assert.equal(result.headMatchesBase,false);
 assert.deepEqual(result.changedPaths,["a.ts"]);assert.equal(result.acceptance,"not-accepted");
});

test("T06 missing, unrelated or malformed worktree evidence fails closed",t=>{
 const f=fixture(t);
 for(const options of [{worktreeRoot:f.source},{worktreeRoot:join(f.root,"missing")},
  {baseRevision:"z".repeat(40)},{writeSurfaces:["../other"]},{writeSurfaces:[".git/config"]},
  {sourceRoot:"relative"}]){
  const result=f.inspect(options);
  assert.equal(result.status,"unavailable");assert.equal(result.sourceVerified,false);
  assert.equal(result.autoMerge,false);
 }
});

test("T06 el permiso exacto distingue mayúsculas en rutas Git",t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,"case.ts"),"export const v=1;\n");
 const result=f.inspect({writeSurfaces:["Case.ts"]});
 assert.equal(result.status,"out-of-scope","La ruta diferente no recibe autorización");
 assert.deepEqual(result.changedPaths,["case.ts"]);
 assert.deepEqual(result.outOfScopePaths,["case.ts"]);
 assert.equal(result.autoMerge,false);
});

test("T06 enumera archivos nuevos anidados y conserva su ámbito exacto",t=>{
 const f=fixture(t);
 mkdirSync(join(f.root,"nuevo"),{recursive:true});
 writeFileSync(join(f.root,"nuevo","dentro.ts"),"export const v=1;\n");
 const permitted=f.inspect({writeSurfaces:["nuevo/dentro.ts"]});
 assert.equal(permitted.status,"scoped-changes");
 assert.deepEqual(permitted.changedPaths,["nuevo/dentro.ts"]);
 assert.deepEqual(permitted.outOfScopePaths,[]);
 const forbidden=f.inspect({writeSurfaces:["a.ts"]});
 assert.equal(forbidden.status,"out-of-scope");
 assert.deepEqual(forbidden.outOfScopePaths,["nuevo/dentro.ts"]);
});
