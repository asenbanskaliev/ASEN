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
 if(platform==="darwin"){
  const runs=[];
  for(let index=0;index<sorted.length;index+=MACOS_CHUNK_SIZE){
   const chunk=sorted.slice(index,index+MACOS_CHUNK_SIZE);
   runs.push({name:`macos-${Math.floor(index/MACOS_CHUNK_SIZE)+1}`,args:[...base,...chunk]});
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
