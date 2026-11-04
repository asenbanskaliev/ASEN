/** EF-604: two real Pi 1.2 TUI host processes, hard death of first host
 * while a real Pi RPC child is alive, then restart of the SAME session.
 * No model invocation, no Writer, and no claim of live LLM resume.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {gradeNativeTuiCrashRecovery} from "./t12-native-tui-crash-grade.mjs";
const repo=fileURLToPath(new URL("../",import.meta.url));
const sha=process.env.ASEN_EXPECTED_SHA;
assert.match(sha??"",/^[0-9a-f]{40}$/u);
assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
assert.equal(process.platform,"linux","Native TUI crash harness is Linux-only");
const meta=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
assert.equal(meta.version,"1.2.0");
const piBinary=join(repo,"node_modules","@earendil-works","pi-coding-agent",
 typeof meta.bin==="string"?meta.bin:meta.bin.pi);
const extension=join(repo,"extensions","asen.ts");
const probe=join(repo,"scripts","t12-native-tui-crash-probe.ts");
const temp=realpathSync(mkdtempSync(join(tmpdir(),"asen-native-tui-crash-")));
const home=join(temp,"home"),project=join(temp,"project"),identityFile=join(temp,"scope.json"),
 sessionFile=join(temp,"pi-native-session.jsonl"),output=join(repo,"asen-acceptance-evidence","native-tui-crash-recovery.json");
mkdirSync(home,{mode:0o700});mkdirSync(project);
const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
git("init","-q");git("config","user.name","ASEN TUI crash test");git("config","user.email","asen-crash@example.invalid");
writeFileSync(join(project,"README.md"),"ISOLATED REAL PI TUI PARENT CRASH TEST; NO INFERENCE\n");
git("add","README.md");git("commit","-qm","baseline");const baseline=git("rev-parse","HEAD");
const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,"agent"),
 ASEN_NO_SKILL_REGISTRY:"1",PI_TELEMETRY:"0",TERM:"xterm-256color",
 ASEN_TUI_CRASH_HOME:home,ASEN_TUI_CRASH_IDENTITY:identityFile,ASEN_TUI_CRASH_PI_BINARY:piBinary};
for(const name of Object.keys(env))
 if(name.startsWith("GIT_")||/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(name))delete env[name];
let phase="PREPARING",original,second;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const digest=createHash("sha256");
try{
 const pty=await import("node-pty");
 function launch(mode){
  const marker=join(temp,mode+"-ready.json");
  const child=pty.spawn(process.execPath,[piBinary,
   "--no-extensions","--extension",extension,"--extension",probe,
   "--no-skills","--no-builtin-tools","--session",sessionFile,
   "--provider","openai","--model","gpt-4o"],
   {cwd:project,cols:120,rows:35,name:"xterm-256color",
    env:{...env,ASEN_TUI_CRASH_PHASE:mode,ASEN_TUI_CRASH_MARKER:marker}});
  let exited=false;
  let exitInfo=null;
  child.onData(data=>digest.update(data));
  const exit=new Promise(resolve=>child.onExit(result=>{
   exited=true;exitInfo=result;resolve(result);
  }));
  return {child,marker,exit,isExited:()=>exited,getExit:()=>exitInfo};
 }
 async function untilReady(host,maxMs=45000){
  const deadline=Date.now()+maxMs;
  while(Date.now()<deadline){
   if(existsSync(host.marker)){
    let data;
    try{data=JSON.parse(readFileSync(host.marker,"utf8"));}catch{await sleep(60);continue;}
    if(data.error)throw Error("Pi TUI probe failed in "+data.phase+": "+data.error);
    if(data.ready===true)return data;
   }
   if(host.isExited())throw Error("Native Pi TUI exited before readiness");
   await sleep(75);
  }
  throw Error("Native Pi TUI readiness exceeded bounded deadline");
 }
 phase="NATIVE_TUI_PARENT_WITH_RPC_CHILD_RUNNING";
 original=launch("start");
 const witness=await untilReady(original);
 assert.equal(witness.ready,true);
 const start=JSON.parse(readFileSync(identityFile,"utf8"));
 assert.ok(Number.isSafeInteger(start.parentPid)&&start.parentPid>0);
 assert.ok(Number.isSafeInteger(start.childPid)&&start.childPid>0);
 assert.notEqual(start.parentPid,start.childPid);
 assert.equal(start.nativePiRpcGetState,true,"A real native Pi RPC child must confirm get_state");
 assert.equal(start.scope.projectId,realpathSync(project));
 assert.equal(start.parentPid,original.child.pid);
 // Verify liveness immediately before OS kills the actual native Pi TUI.
 assert.equal(process.kill(start.childPid,0),true,
  "Real native Pi RPC child must still be alive when parent is killed");
 phase="FORCE_KILL_PARENT_NO_CLEAN_SHUTDOWN";
 assert.equal(process.kill(original.child.pid,"SIGKILL"),true);
 const exit=await Promise.race([
  original.exit,
  sleep(8000).then(()=>{throw Error("Native Pi TUI did not settle after hard kill");}),
 ]);
 assert.ok(exit.exitCode!==0||(Number.isSafeInteger(exit.signal)&&exit.signal!==0),
  "SIGKILL may not masquerade as graceful shutdown");
 // The child process was started without model tools or credentials. Shut it
 // down explicitly; a zombie cannot become a new provider execution.
 try{process.kill(start.childPid,"SIGKILL");}catch(error){
  if(!error||error.code!=="ESRCH")throw error;
 }
 phase="NATIVE_TUI_RESTART_SAME_SESSION";
 second=launch("reopen");
 const reopened=await untilReady(second);
 const reexit=await Promise.race([
  second.exit,
  sleep(8000).then(()=>{throw Error("Second native Pi TUI did not shut down");}),
 ]);
 assert.equal(reexit.exitCode,0,"Real restarted Pi TUI must exit normally");
 assert.equal(reopened.interrupted,true);
 assert.equal(reopened.scope.sessionId,start.scope.sessionId);
 assert.equal(reopened.scope.projectId,start.scope.projectId);
 assert.equal(reopened.agentId,start.agentId);
 assert.notEqual(reopened.parentPid,start.parentPid);
 assert.equal(reopened.pendingCount,1);
 assert.equal(reopened.uncertainCount,1);
 assert.equal(reopened.ackBlocked,2);
 assert.equal(reopened.replayedCalls,0);
 assert.equal(reopened.writerAuthorized,false);
 assert.equal(reopened.modelCalls,0);
 assert.equal(git("status","--porcelain"),"");
 assert.equal(git("rev-parse","HEAD"),baseline);
 const report={schema:"asen-native-pi-tui-crash-recovery/v1",candidateSha:sha,
  status:"PASS_NATIVE_TUI_PARENT_CRASH_WITH_ACTIVE_PI_RPC_CHILD",
  piVersion:meta.version,platform:"linux",hostProcesses:2,
  parentForceKilled:true,childPiRpcActiveAtParentDeath:true,
  nativePiRpcGetState:true,sessionIdReused:true,
  durableAgentState:"interrupted",pendingNotices:1,
  uncertainNotices:1,ackBlocked:2,
  providerCalls:0,replayedCalls:0,writerAuthorized:false,humanConsent:false,
  modelStreamInterrupted:false,fullInteractiveHostRecovery:false,
  sourceGitUnchanged:true,globalFull:false,tuiOutputSha256:digest.digest("hex")};
 assert.equal(gradeNativeTuiCrashRecovery(report,sha).globalFull,false);
 mkdirSync(join(repo,"asen-acceptance-evidence"),{recursive:true});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("EF604_NATIVE_TUI_CRASH_NO_MODEL_PASS "+JSON.stringify({
  status:report.status,hostProcesses:2,providerCalls:0,globalFull:false}));
}catch(error){
 console.error("EF604_NATIVE_TUI_CRASH_FAILED "+phase+" "+(error instanceof Error?error.name:"Error"));
 process.exitCode=1;
}finally{
 for(const host of [original,second])if(host&&!host.isExited())try{host.child.kill();}catch{}
 if(existsSync(identityFile))try{
  const start=JSON.parse(readFileSync(identityFile,"utf8"));
  if(Number.isSafeInteger(start.childPid)&&start.childPid>0)
   try{process.kill(start.childPid,"SIGKILL");}catch{}
 }catch{}
 try{rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
 catch{process.exitCode=1;}
}
