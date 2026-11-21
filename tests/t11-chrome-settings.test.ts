import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readT11Chrome,writeT11Chrome,parseT11Chrome} from "../src/runtime/ui/t11-chrome-settings.js";

test("T11 cabecera: posición y superficie versionadas y recuperadas",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-t11-chrome-"));t.after(()=>rmSync(home,{recursive:true,force:true}));
 assert.deepEqual(readT11Chrome(home),{header:"top",surface:"transparent",source:"default"});
 for(const header of ["top","below-input","split"] as const){
  writeT11Chrome(home,{header,surface:"tinted"});
  assert.deepEqual(readT11Chrome(home),{header,surface:"tinted",source:"saved"});
 }
 assert.deepEqual(JSON.parse(readFileSync(join(home,".asen","t11-chrome.json"),"utf8")),{schema:1,header:"split",surface:"tinted"});
});
test("T11 cabecera: niega entradas corruptas, escapes, campos de permisos y esquemas ajenos",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-t11-chrome-bad-"));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const dir=join(home,".asen");mkdirSync(dir);const target=join(dir,"t11-chrome.json");
 for(const row of ["{","{}",JSON.stringify({schema:2,header:"split",surface:"tinted"}),
  JSON.stringify({schema:1,header:"../top",surface:"transparent"}),
  JSON.stringify({schema:1,header:"top",surface:"tinted",permission:"super-yolo"}),
  JSON.stringify({schema:1,header:"top",surface:"red"})]){
  writeFileSync(target,row);assert.deepEqual(readT11Chrome(home),{header:"top",surface:"transparent",source:"invalid"});
 }
 assert.equal(parseT11Chrome({schema:1,header:"split",surface:"tinted"})?.header,"split");
 assert.throws(()=>writeT11Chrome(home,{header:"../../x",surface:"tinted"} as never),/no válidas/);
});
test("T11 cabecera: archivo enlazado no se lee ni pisa",t=>{
 const home=mkdtempSync(join(tmpdir(),"asen-t11-chrome-link-"));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const dir=join(home,".asen");mkdirSync(dir);const outside=join(home,"fuera"),target=join(dir,"t11-chrome.json");
 writeFileSync(outside,"intacto");
 try{symlinkSync(outside,target,"file");}catch(e){if(process.platform==="win32"&&(e as NodeJS.ErrnoException).code==="EPERM"){t.skip("No se permiten enlaces en Windows");return;}throw e;}
 assert.equal(readT11Chrome(home).source,"invalid");
 assert.throws(()=>writeT11Chrome(home,{header:"split",surface:"tinted"}),/no seguro/);
 assert.equal(readFileSync(outside,"utf8"),"intacto");
});
