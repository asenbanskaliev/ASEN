import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
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

test("E2A: no copiar skills a través de directorios enlazados fuera del proyecto",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-e2a-escape-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const trusted=join(root,"confiable"),foreign=join(root,"externo");
 mkdirSync(join(trusted,"skills"),{recursive:true});
 mkdirSync(foreign,{recursive:true});
 writeFileSync(join(foreign,"SKILL.md"),"Este contenido no pertenece al proyecto");
 try{
  symlinkSync(foreign,join(trusted,"skills","asen-trampa"),
   process.platform==="win32"?"junction":"dir");
 }catch(error){
  if(error instanceof Error&&"code" in error&&
   ["EPERM","EACCES","ENOTSUP"].includes(String(error.code))){
   t.skip("Sistema de archivos sin autorización para enlaces simbólicos");
   return;
  }
  throw error;
 }
 assert.throws(()=>createT06ReadOnlyGitFixture({
  skillRoot:trusted,skillPaths:["skills/asen-trampa/SKILL.md"]
 }),/raíz canónica autorizada/u);
});

test("E2A: Git conserva el espacio inicial de estado antes de extraer el nombre",()=>{
 const output=" M a.txt\n";
 const changed=output.split(/\r?\n/u).filter(Boolean).map(row=>row.slice(3));
 assert.deepEqual(changed,["a.txt"]);
 assert.notDeepEqual(output.trim().split(/\r?\n/u).filter(Boolean).map(row=>row.slice(3)),["a.txt"]);
});

test("E2A: la prueba de gasto se limita a un lanzamiento, sin aprobaciones de entorno",()=>{
 const workflow=readFileSync(".github/workflows/asen-e2a-nvidia-dos-writers.yml","utf8");
 const trial=readFileSync("scripts/e2a-nvidia-dual-writer-trial.ts","utf8");
 assert.match(workflow,/github\.actor == 'asenbanskaliev'/u);
 assert.match(workflow,/github\.run_attempt == 1/u);
 assert.match(workflow,/github\.event\.head_commit\.message == 'ci\(asen\): autorizar E2A controlado sin aprobaciones 20261123'/u);
 assert.match(workflow,/^permissions:\r?\n  contents: read\r?\n  actions: read/mu);
 assert.match(workflow,/GET.*actions\/runs|api\.github\.com\/repos\/.*actions\/runs/u);
 assert.match(workflow,/node scripts\/t12-pi-retry-settings\.mjs/u);
 assert.doesNotMatch(workflow,/environment:|workflow_dispatch:|\.\/\.github\/workflows\/t06-github-approved-writers/u);
 assert.match(trial,/createT06ReadOnlyGitFixture\(/u);
 assert.match(trial,/oneShotWritePath:path/u);
 assert.match(trial,/exactWriteReceipt:\{path,fileSha256:hash\(content\)\}/u);
 assert.match(trial,/autoMerge:false,globalFull:false/u);
 assert.match(trial,/if\(e.type==="tool_execution_end"&&e.isError\)observed\.toolErrors\+\+/u);
 assert.match(trial,/o\.toolErrors>0\?"HERRAMIENTA_PI_FALLIDA_O_DENEGADA"/u);
 assert.match(trial,/o\.toolErrors===0/u);
 assert.match(trial,/nativeToolErrors:o\.toolErrors/u);
 assert.match(trial,/failureCode:"POST_DISPATCH_EXCEPTION"|failureCode="POST_DISPATCH_EXCEPTION"/u);
 assert.match(trial,/!accepted\?/u);
 assert.match(trial,/const contents=paths\.map\(\(_,i\)=>"ASEN-E2A-"/u);
});
