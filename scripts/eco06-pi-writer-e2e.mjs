import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync,spawn} from "node:child_process";
import {mkdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const source=await realpath(process.cwd());
const expected=process.env.ASEN_EXPECTED_SHA;
assert.match(expected??"",/^[0-9a-f]{40}$/u,"A full exact candidate SHA is required");
assert.equal((await import("node:child_process")).execFileSync("git",["rev-parse","HEAD"],{cwd:source,encoding:"utf8"}).trim(),expected);
assert.equal(typeof process.env.NVIDIA_API_KEY,"string");
assert.ok(process.env.NVIDIA_API_KEY.length>0,"NVIDIA_API_KEY is missing from this Actions job");
const piPackage=JSON.parse(await readFile(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json",import.meta.url),"utf8"));
assert.equal(piPackage.version,"1.1.0","ECO-06 requires the pinned Pi 1.1.0 runtime");

const evidenceDir=path.join(source,"eco06-pi-evidence");
await mkdir(evidenceDir,{recursive:true});
const evidenceFile=path.join(evidenceDir,"writer-recovery.json");
const scratch=await import("node:fs/promises").then(fs=>fs.mkdtemp(path.join(os.tmpdir(),"asen-eco06-live-")));
const home=path.join(scratch,"home"),project=path.join(scratch,"candidate");
const hash=value=>createHash("sha256").update(value).digest("hex");
const git=(...args)=>execFileSync("git",args,{cwd:project,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
await Promise.all([mkdir(home,{recursive:true,mode:0o700}),mkdir(project,{recursive:true})]);
await writeFile(path.join(project,"README.md"),"# ECO-06 controlled write\n\nInitial candidate.\n");
git("init","-q");git("config","user.email","asen-eco06@example.invalid");git("config","user.name","ASEN ECO-06 E2E");git("add","README.md");git("commit","-qm","fixture: clean writer candidate");
const candidateRevision=git("rev-parse","HEAD"),sessionId=`eco06-live-${expected.slice(0,12)}`;
const records=[];
let host;

function startHost(phase,mode){
  const child=spawn(process.execPath,["--import","tsx","scripts/eco06-pi-writer-host.mjs"],{cwd:source,env:{...process.env,ASEN_ECO06_SOURCE_ROOT:source,ASEN_ECO06_HOME:home,ASEN_ECO06_PROJECT:project,ASEN_ECO06_SESSION_ID:sessionId,ASEN_ECO06_PHASE:phase,ASEN_ECO06_MODE:mode},stdio:["ignore","ignore","pipe","ipc"]});
  let stderr="";child.stderr.setEncoding("utf8");child.stderr.on("data",chunk=>{stderr=(stderr+chunk).slice(-4000);});
  const pending=new Map(),listeners=new Set();let sequence=0,authorizations=0;
  child.on("message",message=>{
    if(message?.kind==="authorization")authorizations++;
    for(const listener of listeners)listener(message);
    if(typeof message?.id==="string"&&pending.has(message.id)){const entry=pending.get(message.id);pending.delete(message.id);message.error?entry.reject(new Error(message.error)):entry.resolve(message.result);}
  });
  child.once("close",(code,signal)=>{for(const entry of pending.values())entry.reject(new Error(`ASEN host closed (${code??signal})`));pending.clear();});
  const closed=new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
  return {child,stderr,closed,listen(fn){listeners.add(fn);return()=>listeners.delete(fn);},get authorizations(){return authorizations;},call(op,args={}){const id=`eco06-${phase}-${++sequence}`;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});child.send({id,op,...args},error=>{if(error){pending.delete(id);reject(error);}});});}};
}
function waitFor(client,kind,timeout=180_000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error(`Timed out waiting for ${kind}`));},timeout);const off=client.listen(message=>{if(message?.kind===kind){clearTimeout(timer);off();resolve(message);}});});}
function waitForWriterOutcome(client,timeout=180_000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error("Timed out waiting for the real Pi writer"));},timeout);const off=client.listen(message=>{if(message?.kind==="partial-write"||message?.kind==="writer-finished-without-partial"){clearTimeout(timer);off();resolve(message);}});});}
function count(text,needle){return text.split(needle).length-1;}
const report={candidate:{sha:expected,fixtureCommit:candidateRevision,provider:"nvidia",model:"nvidia/nemotron-3.5-lightning-30b-a3b",piVersion:piPackage.version,nvidiaKeyPresent:true},fixture:{repository:path.basename(project),sessionId,writeSurface:"README.md"},steps:[]};
try{
  host=startHost("first","interrupt");
  await waitFor(host,"ready",30_000);
  const firstPlan=await host.call("plan");
  assert.equal(firstPlan.route,"orchestrate");
  assert.equal(firstPlan.persistedTasks.filter(task=>task.planTaskId.endsWith(":worker")).length,1);
  const firstDispatch=host.call("dispatch");
  const firstOutcome=await waitForWriterOutcome(host,180_000);
  if(firstOutcome.kind==="writer-finished-without-partial"){
    report.steps.push({event:"writer-finished-before-visible-edit",ok:firstOutcome.ok===true,outputLength:firstOutcome.outputLength,diagnostic:firstOutcome.diagnostic});
    throw new Error("Real Pi writer finished without changing the approved file; see the bounded runner diagnostic in the evidence artifact");
  }
  const partial=firstOutcome;
  const partialBytes=await readFile(path.join(project,"README.md"),"utf8");
  assert.notEqual(hash(partialBytes),hash("# ECO-06 controlled write\n\nInitial candidate.\n"));
  assert.ok(partialBytes.includes("FIRST_WRITE:"),"The real Pi worker must create the first visible partial edit");
  report.steps.push({event:"first-write-observed",agentId:partial.id,role:partial.role,path:partial.path,sha256:partial.sha256,modified:true});
  host.child.send({kind:"interrupt"});
  const killed=await host.closed;
  assert.equal(killed.signal,"SIGKILL","ASEN host must be killed after Pi modified the file");
  await firstDispatch.catch(()=>{});
  records.push({phase:"first",signal:killed.signal,stderr:host.stderr});

  host=startHost("restart","normal");
  const restarted=await waitFor(host,"ready",30_000);
  const inspectionBefore=await readFile(path.join(project,"README.md"),"utf8"),inspectionHash=hash(inspectionBefore);
  const inspection=await host.call("inspect");
  assert.equal(hash(await readFile(path.join(project,"README.md"),"utf8")),inspectionHash,"Interrupted-write inspection must not edit the candidate");
  assert.equal(inspection.details.recovery.automaticWriteAllowed,false);
  assert.equal(inspection.details.recovery.freshAuthorizationRequired,true);
  assert.equal(inspection.details.task.state,"blocked");assert.equal(inspection.details.agent.state,"interrupted");
  assert.equal(JSON.stringify(inspection).includes("FIRST_WRITE:"),false,"Inspection evidence must not disclose file contents");
  const afterRestart=await host.call("counts");
  assert.deepEqual(afterRestart.invocations,[],"Restart must not automatically invoke the interrupted worker");
  assert.equal(afterRestart.entries.filter(entry=>entry.state==="interrupted").length,1);
  report.steps.push({event:"restart-and-read-only-inspection",recoveredTaskState:inspection.details.task.state,recoveredAgentState:inspection.details.agent.state,automaticWriteAllowed:false,freshAuthorizationRequired:true,inspectionDidNotMutate:true,inspectionContentRedacted:true,modelInvocationsAfterRestart:0});
  assert.ok(restarted.invocations.length===0);

  // Preserve the inspected partial content as a clean checkpoint in the disposable
  // candidate. This changes Git metadata only; the inspected file bytes stay fixed.
  git("add","--","README.md");git("commit","-qm","test: preserve inspected interrupted write");
  const checkpointRevision=git("rev-parse","HEAD");
  assert.equal(hash(await readFile(path.join(project,"README.md"),"utf8")),inspectionHash,"Checkpointing the inspected state must not rewrite file content");
  report.steps.push({event:"inspected-state-checkpointed",revision:checkpointRevision,fileBytesUnchanged:true,decision:"preserve-reviewed-partial-change-in-disposable-candidate"});

  const secondPlan=await host.call("plan");
  assert.equal(secondPlan.route,"orchestrate");
  assert.equal(secondPlan.persistedTasks.filter(task=>task.planTaskId.endsWith(":worker")).length,1);
  const secondRun=await host.call("dispatch");
  assert.equal(secondRun.details.status,"dispatched",secondRun.details.reason);
  assert.equal(secondRun.details.role,"worker");
  assert.equal(host.authorizations,1,"The new post-restart writer must receive a fresh explicit authorization prompt");
  const secondBytes=await readFile(path.join(project,"README.md"),"utf8");
  assert.equal(count(secondBytes,"SECOND_WRITE:"),1,"Fresh authorization must cause exactly one second write");
  assert.equal(count(secondBytes,"FIRST_WRITE:"),1,"The partial write must not replay");
  report.steps.push({event:"fresh-plan-authorized-write",agentId:secondRun.details.agentId,role:secondRun.details.role,authorizationPrompts:host.authorizations,authorizationGranted:true,firstWriteCount:1,secondWriteCount:1,sha256:hash(secondBytes)});

  const reviewedHash=hash(await readFile(path.join(project,"README.md"),"utf8"));
  const review=await host.call("dispatch");
  assert.equal(review.details.status,"dispatched",review.details.reason);
  assert.equal(review.details.role,"reviewer","A distinct read-only reviewer must inspect the successful writer result");
  assert.notEqual(review.details.agentId,secondRun.details.agentId,"Independent review must use a distinct agent identity");
  assert.equal(hash(await readFile(path.join(project,"README.md"),"utf8")),reviewedHash,"Independent review must not change the worktree");
  const finalState=await host.call("counts");
  assert.equal(finalState.entries.filter(entry=>entry.role==="worker"&&entry.state==="interrupted").length,1);
  assert.equal(finalState.entries.filter(entry=>entry.role==="worker"&&entry.state==="completed").length,1);
  assert.equal(finalState.entries.filter(entry=>entry.role==="reviewer").length,1);
  assert.equal(finalState.entries.length,3,"Exactly one interrupted writer, one newly authorized writer, and one reviewer are expected");
  assert.equal(count(await readFile(path.join(project,"README.md"),"utf8"),"SECOND_WRITE:"),1);
  report.steps.push({event:"independent-review",agentId:review.details.agentId,role:review.details.role,distinctFromWriter:true,reviewDidNotMutate:true,exactlyOneSuccessfulFreshWriter:true,duplicateOperations:0});
  report.result="PASS";
  await writeFile(evidenceFile,`${JSON.stringify(report,null,2)}\n`,{mode:0o600});
  console.log(JSON.stringify(report));
}catch(error){
  report.result="FAIL";report.failure=String(error?.stack??error);
  try{const bytes=await readFile(path.join(project,"README.md"));report.fixture.finalReadmeSha256=hash(bytes);report.fixture.firstWriteCount=count(String(bytes),"FIRST_WRITE:");report.fixture.secondWriteCount=count(String(bytes),"SECOND_WRITE:");}catch{}
  await writeFile(evidenceFile,`${JSON.stringify(report,null,2)}\n`,{mode:0o600}).catch(()=>{});
  console.error(JSON.stringify(report));throw error;
}finally{
  if(host&&host.child.exitCode===null&&host.child.signalCode===null){host.child.kill("SIGKILL");await host.closed;}
  await rm(scratch,{recursive:true,force:true});
}
