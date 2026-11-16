import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {T08_TARGET,T08_BUGGY_SOURCE,verifyT08Source,checkT08Behavior} from
 "../src/runtime/agents/t08-controlled-fixture.js";

const corrected=`export function sumEvenNumbers(numbers) {
  if (!Array.isArray(numbers) || !numbers.every(Number.isSafeInteger))
    throw new TypeError("Solo enteros finitos");
  return numbers.reduce((sum, value) => sum + (value % 2 === 0 ? value : 0), 0);
}
`;

test("T08 el error de validación es real y la reparación propuesta cumple casos extremos",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t08-fixture-test-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.equal(verifyT08Source(T08_BUGGY_SOURCE),true);
 writeFileSync(join(root,T08_TARGET),T08_BUGGY_SOURCE);
 assert.equal(checkT08Behavior(root),false);
 writeFileSync(join(root,T08_TARGET),corrected);
 assert.equal(verifyT08Source(corrected),true);
 assert.equal(checkT08Behavior(root),true);
});
test("T08 nunca ejecuta código con imports, herramientas o llamadas peligrosas",()=>{
 for(const code of [
  "",42,"export const sumEvenNumbers = () => 0;",
  "import fs from 'node:fs';\n"+corrected,
  "export function sumEvenNumbers(a){ return process.env.NVIDIA_API_KEY; }",
  "export function sumEvenNumbers(a){ return globalThis; }",
  "export function sumEvenNumbers(a){ return eval('1'); }",
  "export function sumEvenNumbers(a){ return fetch('https://example.com'); }",
  "export function sumEvenNumbers(a){ return a; }\nexport const x=1;",
  "export async function sumEvenNumbers(a){ await Promise.resolve(1); return 1; }"
 ])
  assert.equal(verifyT08Source(code),false,String(code).slice(0,90));
});
test("T08 no permite enlaces simbólicos como archivo de reparación",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-t08-symlink-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.equal(checkT08Behavior(root),false);
});
