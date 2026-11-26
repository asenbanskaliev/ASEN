import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isT06JavaScriptSyntaxValid} from
 "../src/runtime/agents/t06-javascript-syntax.js";

test("T06 acepta JavaScript ES2022 normal sin ejecutar el módulo",()=>{
 for(const source of [
  "export function sumEvenNumbers(numbers){return numbers.filter(n=>n%2===0).reduce((a,b)=>a+b,0)}",
  "export function normalizeNames(items){return [...new Set(items.map(x=>x.trim().toLowerCase()))].sort()}",
  "export function sumEvenNumbers(numbers){if(!Array.isArray(numbers))throw new TypeError();return 0;}"
 ])assert.equal(isT06JavaScriptSyntaxValid(source),true);
});
test("T06 rechaza anotaciones y construcciones TypeScript en archivos mjs",()=>{
 for(const source of [
  "export function sumEvenNumbers(numbers: number[]) { return 0; }",
  "export function normalizeNames(items: string[]): string[] { return []; }",
  "interface Dato { valor: number }; export function sumEvenNumbers(x){return 0}",
  "export function sumEvenNumbers(x){return x as number}",
  "export function sumEvenNumbers(x){const y: number=0;return y;}"
 ])assert.equal(isT06JavaScriptSyntaxValid(source),false,source);
});
test("T06 bloquea código sintácticamente roto o de tamaño excesivo",()=>{
 for(const source of [
  "", "export function sumEvenNumbers(x){", "export function f( {", "x".repeat(10_001)
 ])assert.equal(isT06JavaScriptSyntaxValid(source),false);
});
test("T06 el Writer siempre usa el control sintáctico sin ejecutar el código",()=>{
 const code=readFileSync(new URL("../scripts/t06-nvidia-dual-writer-native.ts",import.meta.url),"utf8");
 assert.match(code,/if\(!isT06JavaScriptSyntaxValid\(code\)\)throw Error/u);
 assert.match(code,/if\(present&&exactScope\)/u);
 assert.match(code,/if\(!staticOnly\)blockUnisolatedGeneratedCodeTrial\("T06"\)/u);
});
