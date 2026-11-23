import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {createT06ReadOnlyGitFixture} from "../src/runtime/agents/t06-read-only-git-fixture.js";
import {selectSkills} from "../src/skills/registry.js";

test("E2A: las skills nativas Pi existen en ambos hijos antes de iniciar NVIDIA",()=>{
 const root=resolve(process.cwd());
 const selected=selectSkills({phase:"apply",codeChange:true,risk:"high"}).map(x=>x.path);
 assert.ok(selected.length>0,"La selección de aplicación requiere contratos de skills");
 const fixture=createT06ReadOnlyGitFixture({skillRoot:root,skillPaths:selected});
 try{
  const git=fixture.observe();
  assert.equal(git.sourceClean,true);assert.equal(git.isolated,true);
  assert.equal(git.children.length,2);
  for(const path of selected){
   assert.ok(existsSync(join(fixture.sourceRoot,path)));
   for(const child of fixture.children){
    assert.equal(readFileSync(join(child,path),"utf8"),readFileSync(join(root,path),"utf8"));
   }
  }
  assert.ok(git.children.every(x=>x.clean&&x.pinned&&x.linked));
 }finally{fixture.cleanup();}
});

test("E2A: no se admiten rutas de skills externas ni duplicadas",()=>{
 for(const paths of [["../archivo"],["skills/asen-apply/SKILL.md","skills/asen-apply/SKILL.md"],[".git/config"]])
  assert.throws(()=>createT06ReadOnlyGitFixture({skillRoot:process.cwd(),skillPaths:paths}),/bounded trusted set/);
});

test("E2A: Git conserva el espacio inicial de estado antes de extraer el nombre",()=>{
 const output=" M a.txt\n";
 const changed=output.split(/\r?\n/u).filter(Boolean).map(row=>row.slice(3));
 assert.deepEqual(changed,["a.txt"]);
 assert.notDeepEqual(output.trim().split(/\r?\n/u).filter(Boolean).map(row=>row.slice(3)),["a.txt"]);
});
