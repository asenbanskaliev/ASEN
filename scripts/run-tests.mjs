import {spawn} from "node:child_process";
import {realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {isAbsolute,relative,resolve} from "node:path";
import {discoverTestFiles,planTestRuns} from "./test-plan.mjs";

const MAX_TIMER_DELAY_MS=2_147_483_647;
const DEFAULT_LIMITS=Object.freeze({
 chunkMs:600_000,
 overallMs:1_800_000,
 termGraceMs:5_000,
 killWaitMs:2_000,
});
const ENV_LIMITS={
 chunkMs:"ASEN_TEST_CHUNK_TIMEOUT_MS",
 overallMs:"ASEN_TEST_OVERALL_TIMEOUT_MS",
 termGraceMs:"ASEN_TEST_TERM_GRACE_MS",
 killWaitMs:"ASEN_TEST_KILL_WAIT_MS",
};
const realClock={
 now:()=>Date.now(),
 setTimeout:(callback,delay)=>setTimeout(callback,delay),
 clearTimeout:timer=>clearTimeout(timer),
};

export function resolveWatchdogLimits(env){
 if(env===undefined||env===null||typeof env!=="object")throw new TypeError("test runner runtime environment is required");
 const limits={...DEFAULT_LIMITS};
 for(const [key,name] of Object.entries(ENV_LIMITS)){
  if(!(name in env))continue;
  const raw=env[name];
  if(typeof raw!=="string"||!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw))){
   throw new TypeError(`${name} must be a positive integer in milliseconds`);
  }
  if(Number(raw)>MAX_TIMER_DELAY_MS)throw new TypeError(`${name} exceeds the Node timer maximum`);
  limits[key]=Number(raw);
 }
 return limits;
}

function testMembers(args){
 const members=args.filter(value=>typeof value==="string"&&value.endsWith(".test.ts"));
 if(members.length===0||members.some(value=>isAbsolute(value)||relative(".",value).startsWith(".."))){
  throw new TypeError("test runner requires repository-relative test chunk members");
 }
 return members;
}

function disposeChild(child){
 for(const stream of [child.stdin,child.stdout,child.stderr])stream?.destroy?.();
 child.unref?.();
}

function signalChild(child,signal,platform,killProcess){
 try{
  if(platform==="win32")child.kill?.(signal);
  else if(Number.isInteger(child.pid))killProcess(-child.pid,signal);
 }catch(error){
  if(error?.code!=="ESRCH")return;
 }
}

export function runChildWithWatchdog({
 args,name,scope,limitMs,termGraceMs,killWaitMs,platform=process.platform,
 clock=realClock,stderr=line=>console.error(line),spawnChild,killProcess=process.kill,
}){
 const durations=[limitMs,termGraceMs,killWaitMs];
 if(!Array.isArray(args)||typeof name!=="string"||!name||!["chunk","overall"].includes(scope)
  ||durations.some(value=>!Number.isSafeInteger(value)||value<=0||value>MAX_TIMER_DELAY_MS)||typeof spawnChild!=="function"){
  throw new TypeError("invalid test runner watchdog input");
 }
 const members=testMembers(args);
 const started=clock.now();
 let child;
 try{
  child=spawnChild(args,{name});
 }catch(error){
  return Promise.reject(error);
 }
 return new Promise((resolveResult,reject)=>{
  let phase="running";
  let settled=false;
  const timers=new Set();
  const later=(callback,delay)=>{
   const timer=clock.setTimeout(()=>{timers.delete(timer);callback();},delay);
   timers.add(timer);
  };
  const finish=(result,cleanup)=>{
   if(settled)return;
   settled=true;
   for(const timer of timers)clock.clearTimeout(timer);
   timers.clear();
   if(cleanup!=="unconfirmed"){
    child.removeListener("close",onClose);
    child.removeListener("error",onError);
   }
   if(result.code===124){
    if(cleanup==="unconfirmed")disposeChild(child);
    stderr(`TEST_RUNNER_TIMEOUT owner=test-runner scope=${scope} chunk=${name} members=${members.join(",")} elapsed_ms=${clock.now()-started} limit_ms=${limitMs} cleanup=${cleanup}`);
   }
   resolveResult(result);
  };
  const onClose=(code,signal)=>{
   if(settled){
    child.removeListener("close",onClose);
    child.removeListener("error",onError);
   }else if(phase!=="running"||clock.now()-started>=limitMs)finish({code:124,signal:null},"confirmed");
   else finish({code,signal},"not-required");
  };
  const onError=error=>{
   if(phase==="running"&&!settled){
    settled=true;
    for(const timer of timers)clock.clearTimeout(timer);
    timers.clear();
    child.removeListener("close",onClose);
    child.removeListener("error",onError);
    reject(error);
   }
  };
  child.once("close",onClose);
  child.on("error",onError);
  later(()=>{
   if(settled)return;
   phase="terminating";
   signalChild(child,"SIGTERM",platform,killProcess);
   if(settled)return;
   later(()=>{
    if(settled)return;
    phase="killing";
    signalChild(child,"SIGKILL",platform,killProcess);
    if(!settled)later(()=>finish({code:124,signal:null},"unconfirmed"),killWaitMs);
   },termGraceMs);
  },limitMs);
 });
}

// Managed-install tests require canonical roots; the macOS /var link and Windows 8.3 short names are not.
// The environment is rewritten only when the canonical form actually differs.
function canonicalTemporaryEnvironment(env){
 try{
  const lexical=tmpdir(),canonical=realpathSync.native(lexical);
  if(canonical===lexical)return env;
  return process.platform==="win32"?{...env,TEMP:canonical,TMP:canonical}:{...env,TMPDIR:canonical};
 }catch{return env;}
}

function spawnNode(args,context){
 return runChildWithWatchdog({
  ...context,
  args,
  spawnChild:context.spawnChild??(spawnArgs=>spawn(process.execPath,spawnArgs,{
   stdio:"inherit",
   env:canonicalTemporaryEnvironment(process.env),
   detached:context.platform!=="win32",
  })),
 });
}

export async function runTestPlan(runs,run=spawnNode,options={}){
 const clock=options.clock??realClock;
 const limits=options.limits??DEFAULT_LIMITS;
 const overallStarted=clock.now();
 const overallDeadline=overallStarted+limits.overallMs;
 for(const testRun of runs){
  const remaining=overallDeadline-clock.now();
  if(remaining<=0){
   const members=testMembers(testRun.args);
   const stderr=options.stderr??(line=>console.error(line));
   stderr(`TEST_RUNNER_TIMEOUT owner=test-runner scope=overall chunk=${testRun.name} members=${members.join(",")} elapsed_ms=${clock.now()-overallStarted} limit_ms=${limits.overallMs} cleanup=not-started`);
   return {code:124,signal:null};
  }
  const scope=remaining<=limits.chunkMs?"overall":"chunk";
  const result=await run(testRun.args,{
   name:testRun.name,
   scope,
   limitMs:Math.min(limits.chunkMs,remaining),
   termGraceMs:limits.termGraceMs,
   killWaitMs:limits.killWaitMs,
   platform:options.platform??process.platform,
   clock,
   stderr:options.stderr,
   spawnChild:options.spawnChild,
   killProcess:options.killProcess,
  });
  if(result.code!==0||result.signal!==null)return result;
  if(clock.now()>=overallDeadline){
   const members=testMembers(testRun.args);
   const stderr=options.stderr??(line=>console.error(line));
   stderr(`TEST_RUNNER_TIMEOUT owner=test-runner scope=overall chunk=${testRun.name} members=${members.join(",")} elapsed_ms=${clock.now()-overallStarted} limit_ms=${limits.overallMs} cleanup=completed`);
   return {code:124,signal:null};
  }
 }
 return {code:0,signal:null};
}

export async function main({cwd=process.cwd(),platform=process.platform,nodeOptions=process.argv.slice(2),env=process.env}={}){
 const limits=resolveWatchdogLimits(env);
 const files=await discoverTestFiles(cwd);
 return runTestPlan(planTestRuns({platform,testFiles:files,nodeOptions}),undefined,{limits,platform});
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
