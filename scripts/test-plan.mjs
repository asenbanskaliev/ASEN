import {readdir} from "node:fs/promises";
import {join,relative,sep} from "node:path";

export const WINDOWS_PROCESS_TESTS=Object.freeze([
 "tests/ask-user-rpc.test.ts",
 "tests/execution-revision.test.ts",
 "tests/pi-native-skill-load.test.ts",
 "tests/pi-process-runner.test.ts",
 "tests/pi-session-recovery-e2e.test.ts",
 "tests/spawn-contained.test.ts",
]);

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
 if(platform!=="win32")return [{name:"all",args:[...base,...sorted]}];
 for(const file of WINDOWS_PROCESS_TESTS){
  if(!seen.has(file))throw new Error(`Missing Windows process test: ${file}`);
 }
 const processSet=new Set(WINDOWS_PROCESS_TESTS);
 const remaining=sorted.filter(file=>!processSet.has(file));
 const runs=[];
 if(remaining.length>0)runs.push({name:"remaining",args:[...base,...remaining]});
 runs.push({name:"process-heavy",args:[...base,"--test-concurrency=1",...WINDOWS_PROCESS_TESTS]});
 return runs;
}
