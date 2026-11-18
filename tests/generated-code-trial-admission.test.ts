import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {blockUnisolatedGeneratedCodeTrial} from "../src/runtime/agents/generated-code-trial-admission.js";
test("T06 y T08 no admiten pruebas reales mientras falte aislamiento de red",()=>{
 for(const name of ["T06","T08"] as const)
  assert.throws(()=>blockUnisolatedGeneratedCodeTrial(name),new RegExp(name+" BLOQUEADO"));
});
test("T06/T08 comprueban la barrera antes de credenciales y proveedores",()=>{
 for(const [file,name] of [
  ["t06-nvidia-dual-writer-native.ts","T06"],
  ["t08-github-real-fix.ts","T08"]
 ] as const){
  const source=readFileSync(new URL("../scripts/"+file,import.meta.url),"utf8");
  const start=source.indexOf("async function main():Promise<void>");
  const guard=source.indexOf('blockUnisolatedGeneratedCodeTrial("'+name+'")',start);
  const secret=source.indexOf("if(!process.env.NVIDIA_API_KEY)",start);
  assert.ok(start>=0&&guard>start&&secret>guard,file);
 }
});
