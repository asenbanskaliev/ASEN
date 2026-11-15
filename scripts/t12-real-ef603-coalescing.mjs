/** EF-603 one-shot real Pi/Beam proof of durable concurrent deduplication.
 * Three concurrent identical ASEN requests must create one durable Explorer
 * and ONE native Pi RPC process. One logical inference is reserved; HTTP
 * request count is not instrumented. No tools, no Writer, no alternate provider.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {gradeEf603LiveCoalescing} from "./t12-ef603-coalescing-grade.mjs";
const repo=fileURLToPath(new URL("../",import.meta.url));
const sha=process.env.ASEN_EXPECTED_SHA,model=process.env.ASEN_SELECTED_MODEL;
assert.match(sha??"",/^[a-f0-9]{40}$/u);
assert.ok(model==="beam"||model==="beam:cloud","EF-603 uses only registered Ollama Beam");
assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1","Provider reruns are disallowed");
assert.equal(process.platform,"linux","Pinned native Beam witness is Linux only");
assert.ok(process.env.OLLAMA_API_KEY,"Explicit scoped Ollama credentials required");
assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
const pkg=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works",
 "pi-coding-agent","package.json"),"utf8"));
assert.equal(pkg.version,"1.2.0");
const piBinary=resolve(repo,"node_modules","@earendil-works","pi-coding-agent",
 typeof pkg.bin==="string"?pkg.bin:pkg.bin.pi);
const runnerTemp=process.env.RUNNER_TEMP;
assert.ok(runnerTemp&&resolve(runnerTemp)===runnerTemp);
const root=await mkdtemp(join(tmpdir(),"asen-ef603-real-pi-"));
const output=join(repo,"asen-acceptance-evidence","real-ef603-coalescing.json");
const reservation=join(runnerTemp,"asen-ef603-one-beam-request.claim");
let stage="INIT",callsReserved=0,realStarts=0,recordState=null,textDeltaCount=0,textCharacters=0;
try{
 await writeFile(reservation,"one-read-only-beam-call:"+sha+"\n",{flag:"wx",mode:0o600});
 callsReserved=1;
 const project=join(root,"project"),privateHome=join(root,"home");
 await mkdir(project);await mkdir(privateHome);
 const git=(...args)=>execFileSync("git",["-C",project,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","ASEN EF-603 read-only fixture");
 git("config","user.email","asen-ef603@example.invalid");
 await writeFile(join(project,"README.md"),"DISPOSABLE EF-603 REAL PI READ-ONLY FIXTURE\n");
 git("add","README.md");git("commit","-qm","baseline");
 const baseline=git("rev-parse","HEAD");
 const session={sessionId:"ef603-"+sha.slice(0,20),projectId:await realpath(project)};
 const runner=new PiProcessRunner({
  command:process.execPath,rpcArgs:[piBinary,"--mode","rpc"],
  extraArgs:["--provider","ollama-cloud"],
  providerExtension:"npm:pi-ollama-cloud@0.13.1",
  providerCredential:"OLLAMA_API_KEY",
  validateRuntimeVersion:true,policyRoot:repo,noTools:true,
  timeoutMs:130000,maxOutputBytes:450000,
  onProcessStart:()=>{realStarts++;},
  onAssistantTextDelta:observation=>{textDeltaCount++;textCharacters+=observation.observedCharacters;},
 });
 const runtime=await AgentRuntime.open({
  storeFile:join(privateHome,"agents.json"),runner,maxConcurrency:4
 });
 const selections=[];
 const unsubscribeSelection=runner.subscribeChildSelection(observation=>{
  if(observation.sessionId===session.sessionId&&observation.projectId===session.projectId)
   selections.push({provider:observation.model?.provider??null,model:observation.model?.id??null,source:observation.source});
 });
 const prompt="Perform a read-only diagnostic. In three short sentences explain why two simultaneous callers of the same exact read-only analysis should share a single running task. Do not call tools, run commands, create files or modify the project.";
 const done=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{
   unsubscribe();reject(Error("EF603_REAL_PI_TERMINAL_TIMEOUT"));
  },170000);
  const unsubscribe=runtime.subscribeTerminal(record=>{
   if(record.sessionId!==session.sessionId||record.projectId!==session.projectId)return;
   clearTimeout(timeout);unsubscribe();resolve(record);
  });
 });
 stage="CONCURRENT_EXPLORER_START";
 const requests=Array.from({length:3},()=>runtime.startReadOnly({
  role:"explorer",prompt,session,model
 }));
 const ids=await Promise.all(requests);
 assert.equal(new Set(ids).size,1,
  "Three identical concurrent requests must share the same durable Explorer ID");
 assert.equal(realStarts<=1,true,"At most one native Pi process may start");
 stage="REAL_PI_WAIT";
 const terminal=await done;
 recordState=terminal.state;
 assert.equal(terminal.id,ids[0]);
 assert.equal(terminal.role,"explorer");
 assert.equal(terminal.state,"completed",
  "The genuine Pi Beam inference must finish successfully, not merely start");
 unsubscribeSelection();
 assert.equal(selections.length,1,"Exactly one child-reported Pi model selection must accompany the one deduplicated process");
 assert.equal(selections[0]?.provider,"ollama-cloud");
 assert.equal(selections[0]?.model,model);
 assert.equal(selections[0]?.source,"child-reported","Selection provenance must remain explicit");
 assert.ok(textDeltaCount>0&&textCharacters>0,"A real assistant text delta must be observed from the single Pi process");
 const persisted=await runtime.list(session);
 assert.equal(persisted.length,1,"Coalescing may not persist a duplicate task");
 assert.equal(persisted[0].state,"completed");
 assert.equal((await runtime.query(ids[0],session))?.record.state,"completed");
 assert.equal(realStarts,1,"Exactly one authentic Pi RPC process must execute");
 stage="PRESERVATION";
 assert.equal(git("status","--porcelain"),"");
 assert.equal(git("rev-parse","HEAD"),baseline);
 const report={
  schema:"asen-ef603-real-pi-coalescing/v1",candidateSha:sha,
  status:"PASS_REAL_PI_EXPLORER_ONE_EXECUTION",piVersion:pkg.version,
  provider:"ollama-cloud",model,logicalRequests:3,uniqueAgentIds:1,
  nativePiProcessCount:realStarts,providerCallsReserved:callsReserved,providerCallsActuallyObserved:null,
  selectionObservations:selections.length,selectionSource:selections[0]?.source??null,
  selectedProvider:selections[0]?.provider??null,selectedModel:selections[0]?.model??null,
  assistantTextDeltaObserved:textDeltaCount>0,assistantTextDeltaCount:textDeltaCount,
  assistantCharactersObserved:textCharacters,
  durableAgents:1,durableState:"completed",role:"explorer",
  reviewerVerifierPolicy:"DISTINCT_RUNS_NO_COALESCING",
  sameSession:true,sameProject:true,gitUnchanged:true,noTools:true,
  writerAuthorized:false,humanConsent:false,independentABParity:false,globalFull:false,
 };
 assert.equal(gradeEf603LiveCoalescing(report,sha).globalFull,false);
 await mkdir(join(repo,"asen-acceptance-evidence"),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("EF603_REAL_PI_EXPLORER_ONCE_PASS "+JSON.stringify({
  status:report.status,logicalRequests:3,nativePiProcesses:realStarts,
  providerCallsReserved:1,providerCallsActuallyObserved:null,globalFull:false
 }));
}catch(error){
 try{
  await mkdir(join(repo,"asen-acceptance-evidence"),{recursive:true});
  await writeFile(output,JSON.stringify({
   schema:"asen-ef603-real-pi-coalescing-failure/v1",
   candidateSha:sha,status:"FAIL_NOT_PROVEN",stage,
   providerCallsReserved:callsReserved,nativePiProcessCount:realStarts,
   durableState:recordState,writerAuthorized:false,globalFull:false
  })+"\n",{flag:"wx",mode:0o600});
 }catch{/* No evidence file is a failure. */}
 console.error("EF603_REAL_PI_COALESCING_FAILED "+stage+
  " "+(error instanceof Error?error.name:"UnknownError"));
 process.exitCode=1;
}finally{
 try{await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
 catch{process.exitCode=1;console.error("EF603 cleanup failed");}
}
