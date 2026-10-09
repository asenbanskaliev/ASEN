import assert from "node:assert/strict";
import {spawnContained} from "../src/evidence/spawn-contained.js";
import test from "node:test";

test("contained process forwards only the child stdout and stderr",{timeout:10000},async()=>{
 const child=spawnContained(process.execPath,["-e","process.stdout.write('child stdout');process.stderr.write('child stderr');"],{stdio:["ignore","pipe","pipe"]});
 const stdout:Buffer[]=[],stderr:Buffer[]=[];
 child.stdout?.on("data",(chunk:Buffer)=>stdout.push(chunk));
 child.stderr?.on("data",(chunk:Buffer)=>stderr.push(chunk));
 const code=await new Promise<number>((resolve,reject)=>{
  child.once("error",reject);
  child.once("close",value=>resolve(value??-1));
 });
 assert.equal(code,0);
 assert.equal(Buffer.concat(stdout).toString("utf8"),"child stdout");
 assert.equal(Buffer.concat(stderr).toString("utf8"),"child stderr");
});
