import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const script=new URL("../scripts/audit-behavior-skills.mjs",import.meta.url);

test("El catálogo de auditoría exige asen-ts-testing y no la skill Go eliminada",async()=>{
 const raw=await readFile(script,"utf8");
 const list=raw.match(/const required=\[([\s\S]*?)\];/u)?.[1];
 assert.ok(list,"Debe mantenerse la lista de skills exigidas");
 const names=[...list.matchAll(/"(asen-[a-z-]+)"/gu)].map(match=>match[1]);
 assert.ok(names.includes("asen-ts-testing"),"El contrato vigente de pruebas es TypeScript");
 assert.equal(names.includes("asen-go-testing"),false,"No exigir una skill eliminada deliberadamente");
 assert.equal(new Set(names).size,names.length,"No duplicar entradas en el catálogo");
 const output=execFileSync(process.execPath,[fileURLToPath(script)],{
  cwd:fileURLToPath(new URL("../",import.meta.url)),encoding:"utf8",timeout:20_000
 });
 assert.match(output,/behavior skills: \d+ PASS/u);
});
