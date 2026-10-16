import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {runTestPlan} from "../../scripts/run-tests.mjs";

export async function main({env=process.env,platform=process.platform,run=runTestPlan}={}){
 const source=env.ECOSYSTEM_BASELINE_REPOSITORY;
 if(typeof source!=="string"||source.trim().length===0){
  throw new TypeError("ECOSYSTEM_BASELINE_REPOSITORY is required for the retained-source witness");
 }
 return run([{name:"retained-source",args:["--import","tsx","--test","tests/ecosystem-baseline.test.ts"]}],undefined,{
  platform,
  limits:{chunkMs:600_000,overallMs:600_000,termGraceMs:5_000,killWaitMs:2_000},
 });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await main();
  if(result.signal!==null)process.kill(process.pid,result.signal);
  else process.exitCode=result.code??1;
 }catch(error){
  console.error(error);
  process.exitCode=1;
 }
}
