import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {discoverTestFiles,planTestShards} from "./test-plan.mjs";
import {resolveTestShard} from "./run-tests.mjs";

export const CI_SHARD_LAYOUT=Object.freeze([
 Object.freeze({os:"ubuntu-24.04",platform:"linux",count:1}),
 Object.freeze({os:"windows-latest",platform:"win32",count:3}),
 Object.freeze({os:"macos-latest",platform:"darwin",count:2}),
]);

function requireSha(sha){
 if(typeof sha!=="string"||!/^[0-9a-f]{40}$/.test(sha))throw new Error("Expected exact 40-character candidate SHA");
 return sha;
}
function configForOs(os){
 const config=CI_SHARD_LAYOUT.find(item=>item.os===os);
 if(!config)throw new Error("Unknown CI test shard operating system");
 return config;
}
function members(runs){
 return runs.flatMap(run=>run.args.filter(arg=>arg.endsWith(".test.ts")));
}

export function createShardReceipt({os,sha,index,count,files}){
 requireSha(sha);
 const config=configForOs(os);
 if(!Number.isSafeInteger(index)||index<0||index>=config.count||count!==config.count){
  throw new Error("CI shard index or total does not match pinned matrix");
 }
 const runs=planTestShards({platform:config.platform,testFiles:files,nodeOptions:[],shardCount:count})[index];
 if(!runs?.length)throw new Error("CI shard must contain tests");
 const testFiles=members(runs);
 assert.equal(new Set(testFiles).size,testFiles.length,"duplicate test member within CI shard");
 return {schemaVersion:1,candidateSha:sha,os,index,count,chunkNames:runs.map(run=>run.name),testFiles};
}

export function verifyShardReceipts({receipts,files,sha}){
 requireSha(sha);
 const expectedTotal=CI_SHARD_LAYOUT.reduce((sum,config)=>sum+config.count,0);
 assert.equal(receipts.length,expectedTotal,"exactly six CI shard receipts required");
 for(const config of CI_SHARD_LAYOUT){
  const seen=new Set();
  for(let index=0;index<config.count;index++){
   const matching=receipts.filter(item=>item.os===config.os&&item.index===index);
   assert.equal(matching.length,1,"CI shard receipt missing or duplicated");
   const actual=matching[0];
   assert.equal(actual.schemaVersion,1);
   assert.deepEqual(Object.keys(actual).sort(),
    ["candidateSha","chunkNames","count","index","os","schemaVersion","testFiles"].sort());
   const expected=createShardReceipt({os:config.os,sha,index,count:config.count,files});
   assert.deepEqual(actual,expected,"CI receipt differs from exact candidate plan");
   for(const file of actual.testFiles){
    assert.equal(seen.has(file),false,"duplicate test across CI shards");
    seen.add(file);
   }
  }
  assert.deepEqual([...seen].sort(),[...files].sort(),"CI shards must cover every test exactly once on each OS");
 }
}

async function cli(){
 const mode=process.argv[2];
 if(mode!=="emit"&&mode!=="verify")throw new Error("Expected emit or verify command");
 const sha=requireSha(process.env.ASEN_EXPECTED_SHA);
 const actualSha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 assert.equal(actualSha,sha,"exact candidate checkout required");
 const files=await discoverTestFiles(process.cwd());
 const dir=resolve("ci-shard-receipts");
 if(mode==="emit"){
  const os=process.env.ASEN_TEST_SHARD_OS;
  const config=configForOs(os);
  assert.equal(process.platform,config.platform,"CI shard OS does not match runner");
  const {index,count}=resolveTestShard(process.env);
  const receipt=createShardReceipt({os,sha,index,count,files});
  await mkdir(dir,{recursive:true});
  const path=join(dir,os+"-"+index+".json");
  await writeFile(path,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
  console.log("CI_SHARD_TEST_RECEIPT "+os+" "+index+"/"+count+" files="+receipt.testFiles.length+" sha="+sha);
 }else{
  const names=(await readdir(dir)).sort();
  const expectedNames=CI_SHARD_LAYOUT.flatMap(config=>
   Array.from({length:config.count},(_,index)=>config.os+"-"+index+".json")).sort();
  assert.deepEqual(names,expectedNames,"six exact CI shard receipt files required");
  const receipts=await Promise.all(names.map(async name=>JSON.parse(await readFile(join(dir,name),"utf8"))));
  verifyShardReceipts({receipts,files,sha});
  console.log("CI_SHARD_COVERAGE_PASS "+sha+" six shards; full suite on Ubuntu, Windows and macOS");
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 cli().catch(error=>{console.error(error);process.exitCode=1;});
}
