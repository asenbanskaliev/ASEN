import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {discoverTestFiles,planTestRuns} from "./test-plan.mjs";

function spawnNode(args){
 return new Promise((resolveResult,reject)=>{
  const child=spawn(process.execPath,args,{stdio:"inherit",env:process.env});
  child.once("error",reject);
  child.once("close",(code,signal)=>resolveResult({code,signal}));
 });
}

export async function runTestPlan(runs,run=spawnNode){
 for(const testRun of runs){
  const result=await run(testRun.args);
  if(result.code!==0||result.signal!==null)return result;
 }
 return {code:0,signal:null};
}

export async function main({cwd=process.cwd(),platform=process.platform,nodeOptions=process.argv.slice(2)}={}){
 const files=await discoverTestFiles(cwd);
 return runTestPlan(planTestRuns({platform,testFiles:files,nodeOptions}));
}

const entryPath=process.argv[1]&&resolve(process.argv[1]);
if(entryPath===fileURLToPath(import.meta.url)){
 try{
  const result=await main();
  if(result.signal!==null)process.kill(process.pid,result.signal);
  else process.exitCode=result.code??1;
 }catch(error){
  console.error(error);
  process.exitCode=1;
 }
}
