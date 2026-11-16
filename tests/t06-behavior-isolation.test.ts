import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {checkT06Behavior} from "../src/runtime/agents/t06-behavior-isolation.js";

test("T06 valida código funcional mediante Node con permisos limitados",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t06-isolated-"));
 try{
  writeFileSync(join(root,"t06-writer-a.mjs"),
   "export function sumEvenNumbers(x){if(!Array.isArray(x)||x.some(n=>!Number.isSafeInteger(n)))throw new TypeError();return x.filter(n=>n%2===0).reduce((a,b)=>a+b,0);}\n");
  writeFileSync(join(root,"t06-writer-b.mjs"),
   "export function normalizeNames(x){if(!Array.isArray(x)||x.some(n=>typeof n!=='string'))throw new TypeError();return [...new Set(x.map(n=>n.trim().toLowerCase()).filter(Boolean))].sort();}\n");
  assert.equal(checkT06Behavior(root,"t06-writer-a.mjs","sumEvenNumbers"),true);
  assert.equal(checkT06Behavior(root,"t06-writer-b.mjs","normalizeNames"),true);
  assert.equal(checkT06Behavior(root,"../secreto","sumEvenNumbers"),false);
  assert.equal(checkT06Behavior(root,"t06-writer-a.mjs","normalizeNames"),false);
  writeFileSync(join(root,"t06-writer-a.mjs"),"export function sumEvenNumbers(){return 17}\n");
  assert.equal(checkT06Behavior(root,"t06-writer-a.mjs","sumEvenNumbers"),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("T06 el proceso de pruebas no puede leer archivos ajenos",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t06-permission-"));
 try{
  writeFileSync(join(root,"privado.txt"),"NO LEER");
  const result=spawnSync(process.execPath,["--permission","--input-type=module",
   "--eval","import {readFileSync} from 'node:fs';readFileSync('./privado.txt');"],
   {cwd:root,encoding:"utf8",
    env:Object.fromEntries(["SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","TMPDIR"]
     .filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!])),
    timeout:4000});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/ERR_ACCESS_DENIED|Access to this API has been restricted/u);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("T06 deniega enlace simbólico como archivo de resultado",()=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t06-symlink-"));
 try{
  mkdirSync(join(root,"exterior"));
  writeFileSync(join(root,"exterior","fuera.mjs"),
   "export function sumEvenNumbers(){return 0}\n");
  try{symlinkSync(join(root,"exterior","fuera.mjs"),
   join(root,"t06-writer-a.mjs"),"file");}
  catch{return;} // Windows sin permiso de symlink: otros tests cubren el bloqueo.
  assert.equal(checkT06Behavior(root,"t06-writer-a.mjs","sumEvenNumbers"),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
