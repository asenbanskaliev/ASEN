import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {createT06ReadOnlyGitFixture} from "../src/runtime/agents/t06-read-only-git-fixture.js";

test("T06 crea dos Git worktrees sintéticos sin tocar el repositorio del proyecto",t=>{
 const fixture=createT06ReadOnlyGitFixture();
 t.after(()=>fixture.cleanup());
 const observed=fixture.observe();
 assert.equal(observed.isolated,true);
 assert.equal(observed.sourceClean,true);
 assert.equal(observed.children.length,2);
 assert.ok(observed.children.every(child=>child.pinned&&child.clean&&child.linked));
 for(const child of fixture.children){
  assert.equal(execFileSync("git",["-C",child,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),fixture.head);
  assert.equal(execFileSync("git",["-C",child,"branch","--show-current"],{encoding:"utf8"}).trim(),"");
 }
});

test("T06 bloquea cambios incluso dentro del worktree asignado y preserva el otro",t=>{
 const fixture=createT06ReadOnlyGitFixture();
 t.after(()=>fixture.cleanup());
 writeFileSync(join(fixture.children[0],"a.txt"),"CAMBIO NO AUTORIZADO\n");
 const observed=fixture.observe();
 assert.equal(observed.children[0]!.clean,false);
 assert.equal(observed.children[1]!.clean,true);
 assert.equal(observed.sourceClean,true);
 assert.equal(observed.isolated,true);
});

test("T06 detecta archivos nuevos y no pierde el seguimiento tras la limpieza",()=>{
 const fixture=createT06ReadOnlyGitFixture();
 const child=fixture.children[1];
 writeFileSync(join(child,"nuevo.txt"),"no autorizado\n");
 assert.equal(fixture.observe().children[1]!.clean,false);
 const root=fixture.sourceRoot;
 fixture.cleanup();
 assert.equal(existsSync(root),false);
 assert.equal(existsSync(child),false);
});

test("T06 no hereda GIT_DIR ni GIT_WORK_TREE del proceso padre",()=>{
 const keys=["GIT_DIR","GIT_WORK_TREE","GIT_INDEX_FILE","GIT_CONFIG_COUNT"],
  previous=keys.map(key=>process.env[key]);
 let fixture:ReturnType<typeof createT06ReadOnlyGitFixture>|undefined;
 try{
  process.env.GIT_DIR=join(process.cwd(),"git-inexistente");
  process.env.GIT_WORK_TREE=join(process.cwd(),"checkout-ajeno");
  process.env.GIT_INDEX_FILE=join(process.cwd(),"indice-ajeno");
  process.env.GIT_CONFIG_COUNT="1";
  fixture=createT06ReadOnlyGitFixture();
  assert.equal(fixture.observe().sourceClean,true);
  assert.equal(fixture.observe().isolated,true);
 }finally{
  keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
  fixture?.cleanup();
 }
});
