/** EF-604 exact-SHA proof: SIGKILL a real Pi TUI while its ASEN Explorer's native Pi RPC is streaming. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const repo=fileURLToPath(new URL("../",import.meta.url)),sha=process.env.ASEN_EXPECTED_SHA;
const model=process.env.ASEN_SELECTED_MODEL,apiKey=process.env.OLLAMA_API_KEY;
assert.match(sha??"",/^[0-9a-f]{40}$/u);
assert.ok(model==="beam"||model==="beam:cloud","Only registered free Beam is allowed");
assert.ok(apiKey,"Scoped Ollama Cloud key is required");
assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1","Provider run is one-shot; do not rerun");
assert.equal(process.platform,"linux","Native Pi TUI stream proof is Linux-only");
assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
const meta=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
assert.equal(meta.version,"1.2.0");
const piBinary=resolve(repo,"node_modules","@earendil-works","pi-coding-agent",
 typeof meta.bin==="string"?meta.bin:meta.bin.pi);
const root=realpathSync(mkdtempSync(join(tmpdir(),"asen-live-tui-crash-")));
const home=join(root,"home"),project=join(root,"project"),probe=join(repo,"scripts","t12-real-tui-stream-probe.ts");
const sessionFile=join(root,"session.jsonl"),store=join(home,".asen","agents.json");
const marker=join(root,"probe.json"),output=join(repo,"asen-acceptance-evidence","real-pi-tui-stream-crash.json");
mkdirSync(home,{recursive:true,mode:0o700});mkdirSync(project);
const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
git("init","-q");git("config","user.name","ASEN live Pi TUI crash test");
git("config","user.email","asen-live-tui@example.invalid");
writeFileSync(join(project,"README.md"),"Disposable read-only real Pi stream crash fixture.\n");
git("add","README.md");git("commit","-qm","isolated baseline");const baseline=git("rev-parse","HEAD");
const digest=createHash("sha256"),temp=process.env.RUNNER_TEMP;
assert.ok(temp&&resolve(temp)===temp);
const env={...process.env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,".pi","agent"),
 PI_TELEMETRY:"0",PI_OLLAMA_WEB_TOOLS:"0",TERM:"xterm-256color",
 ASEN_REAL_TUI_HOME:home,ASEN_REAL_TUI_MARKER:marker,ASEN_REAL_TUI_STORE:store,
 ASEN_REAL_TUI_PACKAGE_ROOT:repo,ASEN_EXPECTED_SHA:sha,ASEN_SELECTED_MODEL:model};
for(const key of Object.keys(env))
 if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key)&&key!=="OLLAMA_API_KEY")delete env[key];
const pty=await import("node-pty");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let first,second,childPid,phase="PREPARED",taskId,sessionId;
function launch(mode,extra={}){
 const hostEnv={...env,ASEN_REAL_TUI_PHASE:mode,...extra};
 if(mode==="reopen"){delete hostEnv.OLLAMA_API_KEY;delete hostEnv.ASEN_OLLAMA_API_KEY;}
 const child=pty.spawn(process.execPath,[piBinary,"--no-extensions","--extension",probe,
  "--no-skills","--no-builtin-tools","--session",sessionFile,
  "--provider","ollama-cloud","--model",model],
  {cwd:project,cols:120,rows:35,name:"xterm-256color",
   env:hostEnv});
 child.onData(data=>digest.update(data));
 let exitInfo,exited=false;
 const exit=new Promise(resolve=>child.onExit(value=>{exitInfo=value;exited=true;resolve(value);}));
 return {child,exit,isExited:()=>exited,getExit:()=>exitInfo};
}
async function markerUntil(predicate,host,deadlineMs){
 const deadline=Date.now()+deadlineMs;
 while(Date.now()<deadline){
  if(existsSync(marker)){
   let value;try{value=JSON.parse(readFileSync(marker,"utf8"));}catch{await sleep(50);continue;}
   if(Number.isSafeInteger(value.childPid))childPid=value.childPid;
   if(typeof value.taskId==="string")taskId=value.taskId;
   if(typeof value.sessionId==="string")sessionId=value.sessionId;
   if(value.phase==="probe_failed"||value.phase==="stream_observation_failed")
    throw Error("Pi extension probe did not satisfy the bounded lifecycle contract");
   if(predicate(value))return value;
  }
  if(host?.isExited())throw Error("Native Pi TUI exited before the evidence marker");
  await sleep(75);
 }
 throw Error("Bounded native Pi TUI marker deadline exceeded");
}
async function killGroup(pid){
 if(!Number.isSafeInteger(pid)||pid<=1)return;
 try{process.kill(-pid,"SIGKILL");}catch(error){
  if(error?.code==="ESRCH")return;
  try{process.kill(pid,"SIGKILL");}catch(nested){if(nested?.code!=="ESRCH")throw nested;}
 }
}
try{
 phase="NATIVE_TUI_START_AND_REAL_CHILD_STREAM";
 first=launch("start");
 const streamed=await markerUntil(value=>value.phase==="streaming",first,170_000);
 assert.equal(typeof streamed.taskId,"string");
 assert.equal(streamed.sessionId.length>0,true);
 assert.equal(streamed.projectId,realpathSync(project));
 assert.ok(Number.isSafeInteger(streamed.childPid)&&streamed.childPid>1);
 assert.equal(streamed.selection?.source,"child-reported");
 assert.equal(streamed.selection?.model?.provider,"ollama-cloud");
 assert.ok(["beam","beam:cloud"].includes(streamed.selection?.model?.id));
 assert.ok(Number.isSafeInteger(streamed.deltaCharacters)&&streamed.deltaCharacters>0);
 taskId=streamed.taskId;sessionId=streamed.sessionId;childPid=streamed.childPid;
 assert.equal(process.kill(childPid,0),true,"Native Pi RPC must still be alive during the observed text stream");
 phase="KILL_PARENT_DURING_STREAM";
 assert.equal(process.kill(first.child.pid,"SIGKILL"),true);
 const parentExit=await Promise.race([first.exit,sleep(8000).then(()=>{throw Error("Pi TUI parent did not die");})]);
 assert.ok(parentExit.exitCode!==0||(Number.isSafeInteger(parentExit.signal)&&parentExit.signal!==0));
 await killGroup(childPid);
 phase="REOPEN_SAME_TUI_SESSION_AND_CORRELATE";
 second=launch("reopen",{ASEN_REAL_TUI_TASK_ID:taskId,ASEN_EXPECTED_SESSION:sessionId});
 const recovered=await markerUntil(value=>value.phase==="recovered",second,60_000);
 const reexit=await Promise.race([second.exit,sleep(8000).then(()=>{throw Error("Recovered Pi TUI did not exit normally");})]);
 assert.equal(reexit.exitCode,0);
 assert.equal(recovered.taskId,taskId);assert.equal(recovered.sessionId,sessionId);
 assert.equal(recovered.projectId,streamed.projectId);assert.equal(recovered.state,"interrupted");
 assert.equal(recovered.replayCount,0);assert.equal(recovered.terminalNotice,false);
 assert.equal(recovered.writerAuthorized,false);
 assert.equal(git("status","--porcelain"),"");assert.equal(git("rev-parse","HEAD"),baseline);
 const report={schema:"asen-real-pi-tui-stream-crash/v1",candidateSha:sha,
  status:"PASS_REAL_PI_TUI_CRASH_DURING_CHILD_STREAM_AND_RECOVERY",
  piVersion:meta.version,provider:"ollama-cloud",model:streamed.selection.model.id,
  parentTuiHardKilledDuringChildTextDelta:true,childNativePidObserved:true,
  assistantTextDeltaObserved:true,assistantCharactersObserved:streamed.deltaCharacters,
  exactTaskSessionProjectReconciled:true,durableState:"interrupted",
  replayedCalls:0,providerCallsReserved:1,providerCallsActuallyObserved:null,
  terminalNotice:false,projectUnchanged:true,noTools:true,writerAuthorized:false,
  humanConsent:false,globalFull:false,tuiOutputSha256:digest.digest("hex")};
 mkdirSync(join(repo,"asen-acceptance-evidence"),{recursive:true});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("EF604_REAL_PI_TUI_STREAM_CRASH_PASS "+JSON.stringify({
  status:report.status,model:report.model,providerCallsReserved:1,globalFull:false}));
}catch(error){
 try{mkdirSync(join(repo,"asen-acceptance-evidence"),{recursive:true});
  writeFileSync(output,JSON.stringify({schema:"asen-real-pi-tui-stream-crash/v1",
   candidateSha:sha,status:"FAIL_OR_INCOMPLETE",stage:phase,
   providerCallsReserved:phase.includes("STREAM")?1:0,providerCallsActuallyObserved:null,
   writerAuthorized:false,globalFull:false,diagnostic:error instanceof Error?error.name:"Error"})+"\n",
   {flag:"wx",mode:0o600});}catch{}
 console.error("EF604_REAL_PI_TUI_STREAM_CRASH_FAILED "+phase);
 process.exitCode=1;
}finally{
 if(first&&!first.isExited())try{first.child.kill("SIGKILL");}catch{}
 if(childPid)await killGroup(childPid).catch(()=>{});
 if(second&&!second.isExited())try{second.child.kill();}catch{}
 try{rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}catch{process.exitCode=1;}
}
