import test from "node:test";
import assert from "node:assert/strict";
import {runAsen,ASEN_HELP} from "../src/cli.js";

test("el CLI rechaza staging sin una ruta ejecutable y no toca el hogar",async()=>{
 let stdout="",stderr="",homeLookups=0;
 const result=await runAsen([
  "managed","update","--manifest","/tmp/manifest.json","--package-root","/tmp/package","--stage","--yes",
 ],{},{
  homeDirectory:()=>{homeLookups++;throw new Error("No debe consultar el hogar");},
  stdout:text=>{stdout+=text;},
  stderr:text=>{stderr+=text;},
 });
 assert.equal(result,2);
 assert.equal(stdout,"");
 assert.match(stderr,/managed update --manifest .*--dry-run/u);
 assert.equal(homeLookups,0);
});

test("la ayuda no anuncia staging que el producto no ejecuta",()=>{
 assert.match(ASEN_HELP,/managed update --manifest .*--dry-run/u);
 assert.doesNotMatch(ASEN_HELP,/--stage --yes/u);
});
