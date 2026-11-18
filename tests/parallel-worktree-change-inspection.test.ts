import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {chmodSync,existsSync,mkdirSync,mkdtempSync,renameSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {delimiter,isAbsolute,join,resolve} from "node:path";
import {inspectParallelWorktreeChanges,inspectParallelWorktreeChangesAsync} from "../src/runtime/agents/parallel-worktree-change-inspection.js";

function fixture(t:TestContext){
 const source=resolve(mkdtempSync(join(tmpdir(),"asen-t06-review-origin-"))),
  parent=resolve(mkdtempSync(join(tmpdir(),"asen-t06-review-siblings-"))),
  root=join(parent,"asen-worker-scope-001");
 const gitEnv={...process.env};
 for(const key of Object.keys(gitEnv))if(/^GIT_/iu.test(key))delete gitEnv[key];
 const git=(worktree:string,...args:string[])=>execFileSync("git",["-C",worktree,...args],
  {encoding:"utf8",stdio:["ignore","pipe","pipe"],env:gitEnv}).trim();
 git(source,"init","-q");git(source,"config","user.name","ASEN evidence test");
 git(source,"config","user.email","asen-inspect@example.invalid");
 git(source,"config","core.autocrlf","false");
 writeFileSync(join(source,"a.ts"),"export const a = 1;\n");
 writeFileSync(join(source,"b.ts"),"export const b = 2;\n");
 writeFileSync(join(source,".gitignore"),"*.cache\n");
 git(source,"add","a.ts","b.ts",".gitignore");git(source,"commit","-qm","baseline");
 const head=git(source,"rev-parse","HEAD");
 git(source,"worktree","add","--detach",root,head);
 const input=(opts:Record<string,unknown>={})=>({
  sourceRoot:source,worktreeRoot:root,baseRevision:head,writeSurfaces:["a.ts"],...opts
 } as Parameters<typeof inspectParallelWorktreeChanges>[0]);
 const inspect=(opts:Record<string,unknown>={})=>inspectParallelWorktreeChanges(input(opts));
 const inspectAsync=(opts:Record<string,unknown>={})=>inspectParallelWorktreeChangesAsync(input(opts));
 t.after(()=>{
  if(existsSync(root))try{git(source,"worktree","remove","--force",root);}catch{}
  rmSync(source,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});
 });
 return {source,root,head,git,inspect,inspectAsync};
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

test("T07: el sondeo Git asíncrono conserva las decisiones del inspector manual",async t=>{
 const f=fixture(t);
 assert.deepEqual(await f.inspectAsync(),f.inspect());
 writeFileSync(join(f.root,"a.ts"),"export const a = 11;\n");
 assert.deepEqual(await f.inspectAsync(),f.inspect());
 writeFileSync(join(f.root,"b.ts"),"fuera del alcance\n");
 assert.deepEqual(await f.inspectAsync(),f.inspect());
 f.git(f.root,"add","a.ts");f.git(f.root,"commit","-qm","cambio no aceptado");
 assert.deepEqual(await f.inspectAsync(),f.inspect());
 assert.deepEqual(await f.inspectAsync({worktreeRoot:join(f.root,"inexistente")}),
  f.inspect({worktreeRoot:join(f.root,"inexistente")}));
});


test("T06: dos inspecciones ignoran GIT_DIR ajeno heredado de Windows o Pi",async t=>{
 const f=fixture(t),prior=process.env.GIT_DIR;
 process.env.GIT_DIR=join(f.source,".git");
 try{
  const direct=f.inspect(),poll=await f.inspectAsync();
  assert.equal(direct.status,"clean");
  assert.deepEqual(poll,direct,"Git -C inspecciona el worktree, no el GIT_DIR heredado");
  writeFileSync(join(f.root,"b.ts"),"cambio no autorizado\n");
  assert.equal(f.inspect().status,"out-of-scope");
  assert.equal((await f.inspectAsync()).status,"out-of-scope");
 }finally{
  if(prior===undefined)delete process.env.GIT_DIR;
  else process.env.GIT_DIR=prior;
 }
});

test("T07: preparar un archivo entre diff y ls-files no puede generar un estado limpio",async t=>{
 if(process.platform==="win32"){t.skip("Carrera reproducible con intérprete POSIX");return;}
 const f=fixture(t);
 const realGit=execFileSync("which",["git"],{encoding:"utf8"}).trim();
 const wrapper=join(f.source,"bin");
 mkdirSync(wrapper,{recursive:true});
 writeFileSync(join(f.root,"fuera.txt"),"cambio ajeno\n");
 const gitShim=join(wrapper,"git");
 writeFileSync(gitShim,'#!/bin/sh\ncase " $* " in\n *" diff "*)\n  '+JSON.stringify(realGit)+' "$@"\n  '+JSON.stringify(realGit)+' -C '+JSON.stringify(f.root)+' add -- fuera.txt\n  ;;\n *) exec '+JSON.stringify(realGit)+' "$@" ;;\nesac\n');
 chmodSync(gitShim,0o755);
 const before=process.env.PATH;
 try{
  process.env.PATH=wrapper+delimiter+(before??"");
  const actual=await f.inspectAsync();
  assert.equal(actual.status,"out-of-scope","No permitir clean por cambio de índice");
  assert.deepEqual(actual.outOfScopePaths,["fuera.txt"]);
  assert.equal(actual.autoMerge,false);
 }finally{
  if(before===undefined)delete process.env.PATH;else process.env.PATH=before;
 }
});


test("T06: el índice Git sustituido por un enlace no se lee ni declara limpio",async t=>{
 if(process.platform==="win32"){t.skip("La creación de enlaces requiere permisos externos en Windows");return;}
 const f=fixture(t),gitIndex=f.git(f.root,"rev-parse","--git-path","index");
 const index=isAbsolute(gitIndex)?gitIndex:resolve(f.root,gitIndex);
 const original=index+".asen-resguardo";
 renameSync(index,original);
 try{
  symlinkSync(original,index);
  const result=await f.inspectAsync();
  assert.equal(result.status,"unavailable","Un índice enlazado no acredita estado limpio");
  assert.equal(result.sourceVerified,false);assert.equal(result.autoMerge,false);
 }finally{
  rmSync(index,{force:true});renameSync(original,index);
 }
});
