import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Test-only JavaScript CI manifest helper is outside runtime TypeScript package.
import {CI_SHARD_LAYOUT,createShardReceipt,verifyShardReceipts} from "../scripts/ci-shard-receipts.mjs";
// @ts-expect-error Test-only JavaScript planner is outside runtime TypeScript package.
import {discoverTestFiles,planTestRuns} from "../scripts/test-plan.mjs";

const sha="a".repeat(40);

test("F8 six exact-SHA shard receipts cover all test files on all three systems",async()=>{
 const files=await discoverTestFiles(process.cwd());
 const receipts=CI_SHARD_LAYOUT.flatMap(({os,count}:{os:string;count:number})=>
  Array.from({length:count},(_,index)=>createShardReceipt({os,sha,index,count,files})));
 assert.doesNotThrow(()=>verifyShardReceipts({receipts,files,sha}));
 for(const altered of [
  receipts.slice(1),
  [...receipts,receipts[0]],
  receipts.map((receipt:{candidateSha:string},index:number)=>index===0?{...receipt,candidateSha:"b".repeat(40)}:receipt),
  receipts.map((receipt:{testFiles:string[]},index:number)=>index===0?{...receipt,testFiles:receipt.testFiles.slice(1)}:receipt),
  receipts.map((receipt:{testFiles:string[]},index:number)=>index===0?{...receipt,testFiles:[...receipt.testFiles,receipt.testFiles[0]]}:receipt),
  receipts.map((receipt:{os:string},index:number)=>index===0?{...receipt,os:"windows-latest"}:receipt),
 ]){
  assert.throws(()=>verifyShardReceipts({receipts:altered,files,sha}));
 }
 assert.throws(()=>createShardReceipt({os:"windows-latest",sha,index:3,count:3,files}));
 assert.throws(()=>createShardReceipt({os:"windows-latest",sha,index:0,count:1,files}));
});


test("POSIX Pi process tests use isolated chunks without missing or duplicating coverage",()=>{
 const files=["tests/a.test.ts","tests/pi-process-runner.test.ts","tests/pi-agent-runtime.test.ts","tests/z.test.ts"];
 for(const platform of ["linux","darwin"]){
  const runs=planTestRuns({platform,testFiles:files,nodeOptions:[]});
  const members=runs.flatMap((run:{args:string[]})=>run.args.filter(arg=>arg.endsWith(".test.ts")));
  assert.deepEqual(members.sort(),[...files].sort());
  for(const run of runs){
   const processFiles=run.args.filter((arg:string)=>arg.includes("pi-process-runner.test.ts")||arg.includes("pi-agent-runtime.test.ts"));
   if(processFiles.length){
    assert.deepEqual(run.args.filter((arg:string)=>arg.endsWith(".test.ts")),processFiles);
    assert.ok(run.args.includes("--test-concurrency=1"));
   }else assert.equal(run.args.includes("--test-concurrency=1"),false);
  }
 }
});
