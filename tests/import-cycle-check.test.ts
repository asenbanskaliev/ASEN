import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import test from "node:test";

const script=fileURLToPath(new URL("../scripts/check-import-cycles.mjs",import.meta.url));
const fixture=(name:string)=>fileURLToPath(new URL(`./fixtures/import-cycles/${name}/`,import.meta.url));

function check(name:string){
 return spawnSync(process.execPath,[script,fixture(name)],{encoding:"utf8"});
}

test("rejects a six-module import cycle",()=>{
 const result=check("six-node");
 assert.equal(result.status,1);
 assert.match(result.stderr,/Import cycle limit exceeded: 6 modules/u);
});

test("accepts a five-module import cycle",()=>{
 const result=check("five-node");
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Import cycle check passed: largest SCC is 5 modules/u);
});

test("ignores a six-module cycle made only of named type imports",()=>{
 const result=check("named-type-only");
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Import cycle check passed: largest SCC is 1 modules/u);
});

test("counts mixed named type and value imports as runtime edges",()=>{
 const result=check("mixed-named");
 assert.equal(result.status,1);
 assert.match(result.stderr,/Import cycle limit exceeded: 6 modules/u);
});

test("accepts the production runtime layout",()=>{
 const result=spawnSync(process.execPath,[script,"src"],{encoding:"utf8"});
 assert.equal(result.status,0,result.stderr);
});
