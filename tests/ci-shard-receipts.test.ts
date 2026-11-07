import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Test-only JavaScript CI manifest helper is outside runtime TypeScript package.
import {CI_SHARD_LAYOUT,createShardReceipt,verifyShardReceipts} from "../scripts/ci-shard-receipts.mjs";
// @ts-expect-error Test-only JavaScript planner is outside runtime TypeScript package.
import {discoverTestFiles} from "../scripts/test-plan.mjs";

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
