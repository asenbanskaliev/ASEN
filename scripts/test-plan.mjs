import {readdir} from "node:fs/promises";
import {join,relative,sep} from "node:path";

export const WINDOWS_PROCESS_TESTS=Object.freeze([
 "tests/ask-user-rpc.test.ts",
 "tests/gsp06-pi-free-probes.test.ts",
 "tests/ecosystem-baseline.test.ts",
 // Retain 40 competing writes and multiprocess fixtures without unrelated
 // Windows test files contending for the private-store filesystem operations.
 "tests/history-store.test.ts",
 "tests/memory-migrations.test.ts",
 "tests/memory-session-identity.test.ts",
 // Uses the same contained-process launch path as execution-revision; keep its
 // cold Windows startup out of the concurrently running ordinary test files.
 "tests/evidence-tdd.test.ts",
 "tests/execution-revision.test.ts",
 "tests/pi-native-skill-load.test.ts",
 "tests/pi-process-runner.test.ts",
 "tests/pi-session-recovery-e2e.test.ts",
 // Starts three contained Node processes over one temporary registry project.
 "tests/skill-registry-restart.test.ts",
 // Exercises durable agent recovery, child-process crashes and private-store locks.
 "tests/pi-agent-runtime.test.ts",
 "tests/spawn-contained.test.ts",
 // Hosted Windows ordinary-chunk load exhausted this strict command witness's
 // existing execution deadline. Preserve that deadline and serialize its launches.
 "tests/lifecycle-tdd-completion.test.ts",
 // This test intentionally runs 40 contending private-store writes. Keep that
 // lock stress out of ordinary Windows chunks with unrelated filesystem work.
 "tests/workspace-attribution.test.ts",
]);

// Spawn-heavy Pi RPC fixtures have strict *existing* timeouts: isolate the test
// processes from the many concurrent ordinary test modules rather than raising
// deadlines or ignoring failures. Each member remains covered by exact-SHA receipts.
const POSIX_ISOLATED_PROCESS_TESTS=new Set([
 "tests/pi-process-runner.test.ts",
 "tests/pi-agent-runtime.test.ts",
]);
const WINDOWS_REMAINING_CHUNK_SIZE=50;
const WINDOWS_PROCESS_CHUNK_SIZE=4;
const MACOS_CHUNK_SIZE=50;
const comparePaths=(left,right)=>left<right?-1:left>right?1:0;

export async function discoverTestFiles(root){
 const testRoot=join(root,"tests");
 const files=[];
 async function walk(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  entries.sort((left,right)=>comparePaths(left.name,right.name));
  for(const entry of entries){
   const path=join(directory,entry.name);
   if(entry.isDirectory())await walk(path);
   else if(entry.isFile()&&entry.name.endsWith(".test.ts"))files.push(relative(root,path).split(sep).join("/"));
  }
 }
 await walk(testRoot);
 return files;
}

export function planTestRuns({platform,testFiles,nodeOptions}){
 if(testFiles.length===0)throw new Error("No test files were discovered");
 const seen=new Set();
 for(const file of testFiles){
  if(seen.has(file))throw new Error(`Duplicate test file: ${file}`);
  seen.add(file);
 }
 const sorted=[...testFiles].sort(comparePaths);
 const base=["--import","tsx","--test",...nodeOptions];
 if(platform==="darwin"||platform==="linux"){
  const ordinary=sorted.filter(file=>!POSIX_ISOLATED_PROCESS_TESTS.has(file));
  const processHeavy=sorted.filter(file=>POSIX_ISOLATED_PROCESS_TESTS.has(file));
  const runs=[];
  if(platform==="darwin"){
   for(let index=0;index<ordinary.length;index+=MACOS_CHUNK_SIZE){
    const chunk=ordinary.slice(index,index+MACOS_CHUNK_SIZE);
    runs.push({name:`macos-${Math.floor(index/MACOS_CHUNK_SIZE)+1}`,args:[...base,...chunk]});
   }
  }else if(ordinary.length){runs.push({name:"all",args:[...base,...ordinary]});}
  for(const file of processHeavy){
   runs.push({name:`isolated-${file.slice(file.lastIndexOf("/")+1).replace(".test.ts","")}`,args:[...base,"--test-concurrency=1",file]});
  }
  return runs;
 }
 if(platform!=="win32")return [{name:"all",args:[...base,...sorted]}];
 for(const file of WINDOWS_PROCESS_TESTS){
  if(!seen.has(file))throw new Error(`Missing Windows process test: ${file}`);
 }
 const processSet=new Set(WINDOWS_PROCESS_TESTS);
 const remaining=sorted.filter(file=>!processSet.has(file));
 const runs=[];
 for(let index=0;index<remaining.length;index+=WINDOWS_REMAINING_CHUNK_SIZE){
  const chunk=remaining.slice(index,index+WINDOWS_REMAINING_CHUNK_SIZE);
  runs.push({name:`remaining-${Math.floor(index/WINDOWS_REMAINING_CHUNK_SIZE)+1}`,args:[...base,...chunk]});
 }
 for(let index=0;index<WINDOWS_PROCESS_TESTS.length;index+=WINDOWS_PROCESS_CHUNK_SIZE){
  const chunk=WINDOWS_PROCESS_TESTS.slice(index,index+WINDOWS_PROCESS_CHUNK_SIZE);
  runs.push({name:`process-heavy-${Math.floor(index/WINDOWS_PROCESS_CHUNK_SIZE)+1}`,args:[...base,"--test-concurrency=1",...chunk]});
 }
 return runs;
}


// Measured chunk durations from run 41972127550; scheduling weights, never skipped tests.
const HISTORIC_CHUNK_SECONDS=Object.freeze({
 win32:Object.freeze({
  "remaining-1":43.631,"remaining-2":67.198,"remaining-3":50.865,
  "remaining-4":266.188,"remaining-5":171.692,"remaining-6":78.907,
  "remaining-7":300.340,"process-heavy-1":214.587,"process-heavy-2":84.747,
  "process-heavy-3":115.457,"process-heavy-4":236.775,
 }),
 darwin:Object.freeze({
  "macos-1":33.167,"macos-2":128.987,"macos-3":100.012,
  "macos-4":136.530,"macos-5":46.250,"macos-6":38.663,
  "macos-7":92.518,"macos-8":64.014,
 }),
});

export function planTestShards({platform,testFiles,nodeOptions,shardCount}){
 const runs=planTestRuns({platform,testFiles,nodeOptions});
 if(!Number.isSafeInteger(shardCount)||shardCount<1||shardCount>runs.length){
  throw new TypeError("test shard count must be a positive integer no greater than the number of chunks");
 }
 const buckets=Array.from({length:shardCount},()=>({seconds:0,runs:[]}));
 const sorted=runs.map((run,index)=>({
  run,index,
  seconds:HISTORIC_CHUNK_SECONDS[platform]?.[run.name]
   ??Math.max(20,run.args.filter(arg=>arg.endsWith(".test.ts")).length*(platform==="win32"?1.5:1)),
 })).sort((left,right)=>right.seconds-left.seconds||left.index-right.index);
 for(const item of sorted){
  let owner=0;
  for(let index=1;index<buckets.length;index++){
   if(buckets[index].seconds<buckets[owner].seconds)owner=index;
  }
  buckets[owner].runs.push(item);
  buckets[owner].seconds+=item.seconds;
 }
 return buckets.map(bucket=>bucket.runs
  .sort((left,right)=>left.index-right.index)
  .map(item=>item.run));
}
