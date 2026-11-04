/** EF-604 one-shot genuine Pi RPC streaming cancellation after native text_delta.
 * Exactly one read-only Beam request. A later separate OS process must reopen
 * the durable cancelled outcome without ever running a provider or a Writer.
 */
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";
import {gradeStreamInterruptionEvidence} from "./t12-stream-interruption-grade.mjs";
const repo=fileURLToPath(new URL("../",import.meta.url));
const sha=process.env.ASEN_EXPECTED_SHA,model=process.env.ASEN_SELECTED_MODEL;
assert.match(sha??"",/^[0-9a-f]{40}$/u);
assert.ok(model==="beam"||model==="beam:cloud","Pinned registered Ollama Beam is mandatory");
assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1","No rerun may silently consume additional model quota");
assert.equal(process.platform,"linux","This exact native Beam witness is Linux only");
assert.ok(process.env.OLLAMA_API_KEY,"Only explicit scoped Ollama Cloud credentials allowed");
assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
const packageMeta=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works",
 "pi-coding-agent","package.json"),"utf8"));
assert.equal(packageMeta.version,"1.2.0","Native Pi runtime must be pinned to 1.2.0");
const piBinary=resolve(repo,"node_modules","@earendil-works","pi-coding-agent",
 typeof packageMeta.bin==="string"?packageMeta.bin:packageMeta.bin.pi);
const privateTemp=process.env.RUNNER_TEMP;
assert.ok(privateTemp&&resolve(privateTemp)===privateTemp);
const root=await mkdtemp(join(tmpdir(),"asen-pi-stream-cancel-"));
const output=join(repo,"asen-acceptance-evidence","real-pi-stream-interruption.json");
const reservation=join(privateTemp,"asen-stream-cancel-one-attempt.claim");
let stage="PREPARED",complete=false,createdId;
const flags={nativePid:null,deltaObservations:0,textCharacters:0,processClose:null,terminal:null};
try{
 await writeFile(reservation,"one-ollama-beam-readonly-attempt:"+sha+"\n",
  {flag:"wx",mode:0o600});
 const project=join(root,"project"),privateHome=join(root,"home");
 await mkdir(project);await mkdir(privateHome);
 const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN bounded Pi interrupt test");
 git("config","user.email","asen-stream-test@example.invalid");
 await writeFile(join(project,"README.md"),"ISOLATED READ ONLY BEAM INTERRUPTION FIXTURE\n");
 git("add","README.md");git("commit","-qm","baseline");
 const baseline=git("rev-parse","HEAD");
 const session={sessionId:"stream-interrupt-"+sha.slice(0,16),projectId:await realpath(project)};
 const store=join(privateHome,"agents.json"),journalPath=join(privateHome,"agent-notices.json");
 const abort=new AbortController();
 const runner=new PiProcessRunner({
  command:process.execPath,rpcArgs:[piBinary,"--mode","rpc"],
  extraArgs:["--provider","ollama-cloud"],
  providerExtension:"npm:pi-ollama-cloud@0.13.1",
  providerCredential:"OLLAMA_API_KEY",
  validateRuntimeVersion:true,policyRoot:repo,noTools:true,
  timeoutMs:130000,maxOutputBytes:450000,
  onProcessStart:pid=>{flags.nativePid=pid;},
  onProcessClose:details=>{
   flags.processClose={code:details.code,signal:details.signal}; // No stderr.
  },
  onAssistantTextDelta:observation=>{
   if(!flags.nativePid||observation.pid!==flags.nativePid)throw Error("Pi PID mismatch");
   flags.deltaObservations++;
   flags.textCharacters+=observation.observedCharacters;
   if(flags.deltaObservations===1)abort.abort("ASEN bounded interruption after native assistant text delta");
  },
 });
 const runtime=await AgentRuntime.open({storeFile:store,runner,maxConcurrency:1});
 const terminal=new Promise((resolveTerminal,reject)=>{
  const timeout=setTimeout(()=>reject(Error("No durable terminal record after native Pi interruption")),160000);
  const unsubscribe=runtime.subscribeTerminal(record=>{
   if(record.sessionId!==session.sessionId||record.projectId!==session.projectId)return;
   clearTimeout(timeout);unsubscribe();resolveTerminal(record);
  });
 });
 stage="REAL_BEAM_STREAMING";
 const id=await runtime.startReadOnly({role:"explorer",session,model,
  prompt:"This is a bounded read-only streaming diagnostic. Write a numbered list of 120 short, distinct facts about the arithmetic sequence 1, 2, 3, ... in plain text. Do not invoke tools. Do not write files. Begin the list immediately."
 },abort.signal);
 createdId=id;
 const record=await terminal;
 assert.equal(record.id,id);
 assert.equal(record.state,"cancelled","An aborted model stream must not be marked completed");
 assert.ok(Number.isSafeInteger(flags.nativePid)&&flags.nativePid>0,"Native Pi OS process not observed");
 assert.ok(flags.deltaObservations>=1&&flags.textCharacters>0,"A real assistant text delta must precede interruption");
 assert.equal((await runtime.query(id,session))?.record.state,"cancelled");
 assert.ok(flags.processClose&&flags.processClose.code!==0,"Aborted Pi process must not exit as a successful completion");
 assert.equal(git("status","--porcelain"),"","The isolated project cannot change");
 assert.equal(git("rev-parse","HEAD"),baseline);
 stage="DURABLE_FAILURE_REOPEN";
 const journal=new AgentNotificationJournal(journalPath);
 const notice=await journal.record({id,state:"cancelled",...session});
 assert.equal(notice.delivery,"pending","A cancelled child has no forged parent delivery");
 const verify=resolve(repo,"scripts","t12-stream-interruption-reopen.mjs");
 const clean={...process.env,
  ASEN_STREAM_STORE:store,ASEN_STREAM_JOURNAL:journalPath,
  ASEN_STREAM_AGENT:id,ASEN_STREAM_SESSION:session.sessionId,
  ASEN_STREAM_PROJECT:session.projectId};
 for(const key of Object.keys(clean))
  if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key))delete clean[key];
 const opened=spawnSync(process.execPath,["--import","tsx",verify],{
  cwd:repo,encoding:"utf8",timeout:30000,maxBuffer:80000,
  windowsHide:true,env:clean,
 });
 assert.equal(opened.error,undefined);
 assert.equal(opened.status,0,"Provider-free independent process could not verify recovery");
 const recovered=JSON.parse(opened.stdout.trim());
 assert.equal(recovered.result,"PASS_CANCELLED_PI_READONLY_REOPEN");
 assert.equal(recovered.replayedCalls,0);
 assert.equal(recovered.writerAuthorized,false);
 assert.equal(recovered.noticeDelivery,"pending");
 assert.equal(recovered.agentId,id);
 assert.equal((await journal.list(session)).length,1);
 assert.equal(git("status","--porcelain"),"");
 const report={
  schema:"asen-pi-stream-interruption/v1",
  candidateSha:sha,status:"PASS_REAL_PI_STREAM_INTERRUPTED_AND_REOPENED_BOUNDED",
  piVersion:packageMeta.version,provider:"ollama-cloud",model,
  nativeChildProcess:true,assistantTextDeltaObserved:true,
  assistantTextDeltaCount:flags.deltaObservations,
  assistantCharactersObserved:flags.textCharacters,
  nativeProcessClosedNonzero:true,
  durableState:"cancelled",reopenDifferentOsProcess:true,noticeDelivery:"pending",
  providerCallsReserved:1,replayedCalls:0,projectUnchanged:true,
  noTools:true,writerAuthorized:false,humanConsent:false,
  fullInteractiveHostRecovery:false,independentABParity:false,globalFull:false,
 };
 assert.equal(gradeStreamInterruptionEvidence(report,sha).globalFull,false);
 await mkdir(join(repo,"asen-acceptance-evidence"),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 complete=true;
 console.log("EF604_REAL_BEAM_STREAM_INTERRUPTED_REOPEN_PASS "+JSON.stringify({
  status:report.status,calls:1,provider:report.provider,globalFull:false}));
}catch(error){
 try{
  await mkdir(join(repo,"asen-acceptance-evidence"),{recursive:true});
  await writeFile(output,JSON.stringify({
   status:"FAIL_OR_INCOMPLETE",stage,candidateSha:sha,model,
   providerCallsReserved:1,writerAuthorized:false,globalFull:false,
   diagnostic:error instanceof Error?error.name:"UnknownError",
  })+"\n",{flag:"wx",mode:0o600});
 }catch{/* Missing receipt is itself a CI failure. */}
 console.error("EF604_REAL_BEAM_STREAM_INTERRUPTION_FAILED "+stage);
 process.exitCode=1;
}finally{
 try{await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
 catch{process.exitCode=1;console.error("EF604 temporary workspace cleanup failed");}
}
