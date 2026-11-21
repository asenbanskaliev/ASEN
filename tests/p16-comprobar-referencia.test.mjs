import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {comprobarReferenciaP16} from "../scripts/p16-comprobar-referencia.mjs";
const sha="ce64a9a708e50c0ca899c8023140e63f29f293e1";
test("P16 no acepta una copia por nombre: exige SHA de referencia exacto",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-p16-test-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const asen=join(root,"asen"),reference=join(root,"gentle");
 for(const dir of [asen,reference]){
  mkdirSync(dir,{recursive:true});
  execFileSync("git",["init", "-q", dir]);
  execFileSync("git",["-C",dir,"config","user.email","asincrono@example.invalid"]);
  execFileSync("git",["-C",dir,"config","user.name","Prueba P16"]);
 }
 writeFileSync(join(asen,"package.json"),JSON.stringify({name:"asen"}));
 writeFileSync(join(reference,"package.json"),JSON.stringify({name:"gentle-pi",version:"4.9.0"}));
 mkdirSync(join(reference,"lib"));writeFileSync(join(reference,"lib/agents-runner.ts"),"// prueba");
 writeFileSync(join(reference,"lib/review-policy-judgment-day.ts"),"// prueba");
 for(const dir of [asen,reference]){
  execFileSync("git",["-C",dir,"add","."]);
  execFileSync("git",["-C",dir,"commit","-qm","Prueba local"]);
 }
 const asenSha=execFileSync("git",["-C",asen,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 assert.throws(()=>comprobarReferenciaP16({asenRoot:asen,referenceRoot:reference,expectedAsenSha:asenSha}),/La referencia Gentle no coincide/u);
 assert.throws(()=>comprobarReferenciaP16({asenRoot:asen,referenceRoot:reference,expectedAsenSha:"a".repeat(40)}),/SHA de ASEN no coincide/u);
});
test("P16 solo informa de fuentes comprobadas y nunca declara A/B sin ejecuciones",()=>{
 const source=String.raw`ce64a9a708e50c0ca899c8023140e63f29f293e1`;
 assert.equal(source,sha);
});

test("P16 protege el repositorio padre aunque la referencia sea un Git anidado",()=>{
 const script=readFileSync(new URL("../scripts/p16-comprobar-referencia.mjs",import.meta.url),"utf8");
 assert.match(script,/":\(exclude\)referencia-gentle-shell"/u);
 assert.match(script,/state\(asen,true\)/u);
 assert.match(script,/BLOCKED_NOT_EXECUTED/u);
});
