import assert from "node:assert/strict";
import {mkdir,open,readdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {SessionTodoStore,todoProjectStorageFile} from "../src/runtime/todo-store.ts";
import {eco07ProviderRateLimitError} from "../src/runtime/eco07-provider-failure.ts";
import {resolveEco07Provider} from "./eco07-provider-config.mjs";
import {createJsonlQueue,createRpcController,createSecretSanitizer,runCleanup} from "./eco07-recovery-io.mjs";

const repository=await realpath(process.cwd());
const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repository,encoding:"utf8"}).trim();
assert.equal(revision,process.env.ASEN_EXPECTED_SHA,"ECO-07 Pi recovery must test the exact candidate SHA");
const {provider,model,apiKey,credential,extension}=resolveEco07Provider(process.env);
let piPackage;
try{piPackage=JSON.parse(await readFile(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json",import.meta.url),"utf8"));}
catch{throw new Error("ECO-07 installed Pi package metadata is unavailable or malformed");}
assert.equal(piPackage.version,"1.1.0","ECO-07 provider run must use Pi 1.1.0");

const evidenceDir=path.join(repository,"eco07-pi-evidence");
await mkdir(evidenceDir,{recursive:true});
const transcriptPath=path.join(evidenceDir,"events.jsonl");
const evidencePath=path.join(evidenceDir,"recovery.json");
const scratch=await import("node:fs/promises").then(fs=>fs.mkdtemp(path.join(tmpdir(),`asen-eco07-${provider}-`)));
const home=path.join(scratch,"home"),agentDir=path.join(home,".pi","agent"),sessionDir=path.join(home,"sessions"),asenDir=path.join(home,".asen");
const stepsFile=path.join(scratch,"steps.jsonl"),readsFile=path.join(scratch,"reads.jsonl"),todoRoot=path.join(asenDir,"todos"),legacyTodoFile=path.join(asenDir,"todos.json"),todoFile=todoProjectStorageFile(todoRoot,repository);
const sessionId=`eco07-recovery-${revision.slice(0,12)}`;
const todoIdentity={sessionId,projectId:repository};
const title="ECO-07 recovery review: audit evidence, then inspect task state transitions";
await Promise.all([mkdir(agentDir,{recursive:true,mode:0o700}),mkdir(sessionDir,{recursive:true,mode:0o700}),mkdir(asenDir,{recursive:true,mode:0o700})]);
assert.equal(typeof piPackage.bin?.pi,"string","Pi package must expose its pinned CLI executable");
const piPackageRoot=path.dirname(fileURLToPath(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json",import.meta.url)));
const cli=path.resolve(piPackageRoot,piPackage.bin.pi);
const asenExtension=path.join(repository,"extensions","asen.ts");
const probeExtension=fileURLToPath(new URL("./eco07-pi-recovery-probe-extension.mjs",import.meta.url));
const baseEnv={...Object.fromEntries(["PATH","SystemRoot","WINDIR","TEMP","TMP","TMPDIR","LANG","TERM"].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]])),HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:agentDir,PI_CODING_AGENT_SESSION_DIR:sessionDir,PI_TELEMETRY:"0",[credential]:apiKey,ASEN_ECO07_SESSION_ID:sessionId,ASEN_ECO07_PROJECT:repository,ASEN_ECO07_STEPS_FILE:stepsFile,ASEN_ECO07_READS_FILE:readsFile,ASEN_ECO07_TODO_FILE:todoFile,ASEN_ECO07_TASK_TITLE:title};
const sanitize=createSecretSanitizer(apiKey);
const redacted=value=>sanitize(String(value));
const transcript=createJsonlQueue({file:await open(transcriptPath,"w",0o600),sanitize});
const record=transcript.record;
const recordAsync=(...args)=>{const pending=record(...args);pending.catch(()=>{});return pending;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const openTodoStore=()=>SessionTodoStore.openProjectScoped(todoRoot,legacyTodoFile);
const snapshot=async()=>{const store=await openTodoStore(),[active,archived]=await Promise.all([store.list(todoIdentity),store.archived(todoIdentity)]);return {items:[...active,...archived]};};
async function findPersistedPlan(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory()){const found=await findPersistedPlan(filename);if(found)return found;continue;}
    if(!entry.isFile())continue;
    const contents=await readFile(filename,"utf8").catch(()=>"");
    if(contents.includes("ASEN_ECO07_PENDING_PLAN: inspect-closure-audit -> inspect-task-reducer"))return filename;
  }
}
const currentItem=async()=>{
  const data=await snapshot();
  const matches=data.items.filter(item=>item.events[0]?.sessionId===sessionId&&item.events[0]?.projectId===repository);
  if(matches.length>1)throw new Error("Pi created duplicate session/project Todo tasks");
  return matches.find(item=>item.title===title);
};
function startPi(label){
  const args=[cli,"--mode","rpc","--session-id",sessionId,"--session-dir",sessionDir,"--no-extensions",...(extension?["--extension",extension]:[]),"--extension",asenExtension,"--extension",probeExtension,"--provider",provider,"--model",model,"--no-skills","--tools","asen_todo_*,asen_eco07_*"];
  const child=spawn(process.execPath,args,{cwd:repository,env:{...baseEnv,ASEN_ECO07_PHASE:label},stdio:["pipe","pipe","pipe"]});
  let buffer="",stderr="",stdoutBytes=0;
  let resumeConfirmed=false;
  const events=[];
  let controller;
  const onStdout=chunk=>{
    stdoutBytes+=chunk.length;
    if(stdoutBytes>2_000_000){child.kill("SIGKILL");return;}
    buffer+=chunk.toString();
    let end;
    while((end=buffer.indexOf("\n"))>=0){
      const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
      let value;try{value=JSON.parse(line);}catch{child.kill("SIGKILL");continue;}
      events.push(value);void recordAsync(`${label}:pi-event`,{type:value.type,command:value.command,method:value.method,toolName:value.toolName,stopReason:value.message?.stopReason,...(typeof value.message?.errorMessage==="string"?{providerError:redacted(value.message.errorMessage)}:{})});
      const rateLimit=controller.observe(value);
      if(rateLimit)void recordAsync(`${label}:provider-rate-limit`,{message:rateLimit});
      if(label==="restarted"&&!resumeConfirmed&&value.type==="tool_execution_start"&&!["asen_todo_list","asen_todo_update"].includes(value.toolName)){
        void recordAsync("blocked-work-before-resume-rejected",{toolName:value.toolName});
        child.kill("SIGKILL");continue;
      }
      if(value.type==="extension_ui_request"&&value.method==="confirm"){
        const titleText=String(value.title??"");const message=String(value.message??"");
        if(titleText!=="Resume blocked ASEN task?"||!message.includes(title)||!message.includes("explicit review is required")){
          void controller.stop("SIGKILL");continue;
        }
        // This is the affirmative test-user response to ASEN's explicit resume dialog; no release authority is requested or granted.
        resumeConfirmed=true;
        void recordAsync(`${label}:resume-consent`,{title:titleText,confirmed:true});
        void controller.write({type:"extension_ui_response",id:value.id,confirmed:true}).catch(()=>{});
      }
    }
  };
  const onStderr=chunk=>{stderr=redacted(stderr+chunk.toString()).slice(-3000);};
  controller=createRpcController({child,label,classifyProviderFailure:eco07ProviderRateLimitError,redact:redacted,dispose:()=>{child.stdout.off("data",onStdout);child.stderr.off("data",onStderr);buffer="";}});
  child.stdout.on("data",onStdout);child.stderr.on("data",onStderr);
  return {child,events,send:controller.send,stop:controller.stop,get stderr(){return stderr;},getClosed:controller.getClosed,getProviderFailure:controller.getProviderFailure};
}

let phase="starting";
let first,second;
try{
  first=startPi("initial");
  await first.send("get_commands");
  phase="starting-task";
  const initialTurn=first.send("prompt",{message:`Use the ASEN Todo tools to create exactly one task titled exactly ${JSON.stringify(title)}. The task's ordered pending checklist is ASEN_ECO07_PENDING_PLAN: inspect-closure-audit -> inspect-task-reducer. Step one is to inspect docs/audit/eco07-closure-evidence-2026-10-12.md and record a 1–2 sentence summary mentioning PARTIAL, real Pi, and interruption. Step two is to inspect src/runtime/task-replay.ts and record a 1–2 sentence summary mentioning planned, running, blocked, session, and project. Move the task from planned to running using its current revision. Persist the complete task plan in this Pi session's history, but do not read either source file or begin either review step yet. Do not finish it, do not mark it done, and do not call asen_eco07_record_step. Reply briefly after the running state is saved.`});
  void initialTurn.catch(()=>{});
  let started;
  const startDeadline=Date.now()+180_000;
  while(Date.now()<startDeadline){
    try{
      const item=await currentItem();
      if(item){started=item;const state=item.events.at(-1)?.state;if(state==="running")break;if(["done","cancelled"].includes(state))throw new Error(`Pi ended the task before interruption (${state})`);if(first.events.some(event=>event.type==="agent_settled"))throw new Error(`Pi settled without persisting a running task${first.getProviderFailure()?`: ${first.getProviderFailure()}`:""}`);}
    }catch(error){if(error?.code!=="ENOENT")throw error;}
    const exit=await Promise.race([first.getClosed().then(value=>({closed:value})),sleep(25).then(()=>null)]);
    if(exit)throw new Error(`Initial Pi exited before saving running task (${JSON.stringify(exit.closed)}): ${first.stderr}`);
  }
  started=await currentItem();
  assert.equal(started?.events.at(-1)?.state,"running","Pi/ASEN must persist the task as running before interruption");
  assert.equal(started.events[0].sessionId,sessionId);assert.equal(started.events[0].projectId,repository);
  assert.equal(started.events.length,2,"The initial task must have one planned and one running event");
  const settleDeadline=Date.now()+30_000;
  while(!first.events.some(event=>event.type==="agent_settled")&&Date.now()<settleDeadline){
    const exit=await Promise.race([first.getClosed().then(value=>({closed:value})),sleep(25).then(()=>null)]);
    if(exit)throw new Error(`Initial Pi closed before recording its completed task-start tool result (${JSON.stringify(exit.closed)})`);
  }
  const settled=first.events.find(event=>event.type==="agent_settled");
  assert.ok(settled,"Pi must persist the task-start turn before interruption");
  assert.equal(settled.aborted,false,"Pi must finish the task-start turn naturally before interruption");
  const initialTools=first.events.filter(event=>event.type==="tool_execution_start").map(event=>event.toolName);
  assert.ok(initialTools.length>=2&&initialTools.every(name=>["asen_todo_add","asen_todo_update","asen_todo_list"].includes(name)),"Before interruption Pi may only establish the task identity and running state; no pending review step may start");
  const persistedPlanFile=await findPersistedPlan(sessionDir);
  assert.ok(persistedPlanFile,"Pi must persist the pending ordered review checklist in the original session history before interruption");
  await record("pending-plan-persisted",{sessionId,sessionFile:path.relative(sessionDir,persistedPlanFile),orderedSteps:["inspect-closure-audit","inspect-task-reducer"]});
  await record("running-task-persisted",{commit:revision,taskId:started.taskId,sessionId,projectId:repository,eventRevisions:started.events.map(event=>event.revision),state:"running"});
  const earlySteps=await readFile(stepsFile,"utf8").catch(error=>error?.code==="ENOENT"?"":Promise.reject(error));
  assert.equal(earlySteps,"","No task step may run before the restart");
  phase="forced-interruption";
  const initialPid=first.child.pid;
  const interruption=await first.stop("SIGKILL");
  assert.equal(interruption.killAccepted,true,"The running Pi process must accept the forced process kill");
  assert.equal(interruption.cleanupConfirmed,true,"The forced interruption must observe Pi process close");
  await initialTurn.catch(()=>{});
  await record("process-killed",{pid:initialPid,...interruption});

  phase="restart-recovery";
  second=startPi("restarted");
  await second.send("get_commands");
  let recovered=await currentItem();
  assert.deepEqual(recovered.events.map(event=>event.state),["planned","running","blocked"],"Pi restart must preserve history and block interrupted work");
  assert.match(recovered.events.at(-1).reason,/explicit review is required/u);
  await record("task-recovered",{taskId:recovered.taskId,sessionId,projectId:repository,events:recovered.events.map(({revision,state,at,reason})=>({revision,state,at,reason}))});

  phase="identity-isolation";
  const store=await openTodoStore();
  assert.deepEqual(await store.list({sessionId:"eco07-wrong-session",projectId:repository}),[],"Wrong session must not see recovered task");
  await assert.rejects(()=>store.update(recovered.taskId,{sessionId:"eco07-wrong-session",projectId:repository},recovered.events.at(-1).revision,"running"),/unavailable/u);
  assert.deepEqual(await store.list({sessionId,projectId:path.join(scratch,"wrong-project")}),[],"Wrong project must not see recovered task");
  await assert.rejects(()=>store.update(recovered.taskId,{sessionId,projectId:path.join(scratch,"wrong-project")},recovered.events.at(-1).revision,"running"),/unavailable/u);
  assert.deepEqual((await currentItem()).events.map(event=>event.state),["planned","running","blocked"],"Wrong session must not mutate the recovered task");
  await record("wrong-identity-rejected",{taskId:recovered.taskId,wrongSession:{visibleItems:0,mutationRejected:true},wrongProject:{visibleItems:0,mutationRejected:true},stateUnchanged:true});

  phase="explicit-resume-and-completion";
  await second.send("prompt",{message:`Continue the recovered task now. This is an execution request: do not answer with a text-only summary. First call asen_todo_list and verify this exact task id ${JSON.stringify(recovered.taskId)} belongs to this session and project. Then call asen_todo_update with that task id, revision ${recovered.events.at(-1).revision}, and state running. Pi will ask the user for explicit resume confirmation; wait for that confirmation before doing any review work. After confirmation, call asen_eco07_read_pending_review with step inspect-closure-audit. Immediately call asen_eco07_record_step with step inspect-closure-audit and a summary of at least 20 characters that explicitly contains the exact words PARTIAL, real Pi, interruption. Check the tool result: if recording failed, correct the summary and retry before proceeding. Next call asen_eco07_read_pending_review with step inspect-task-reducer. Immediately call asen_eco07_record_step with step inspect-task-reducer and a summary of at least 20 characters containing the exact words planned, running, blocked, session, project. Check the tool result; correct any failed recording before proceeding. Both record_step tools must report success before marking done. Never mark done merely because you attempted a tool call. Follow the ordered pending checklist in this same Pi session. Finally update the same task to done using its latest revision. A text-only reply without the required tool calls is a failed task. Never create a second task and do not use approval, publishing, or merge actions.`});

  const finishDeadline=Date.now()+240_000;
  while(Date.now()<finishDeadline){
    recovered=await currentItem();
    if(recovered.events.at(-1)?.state==="done")break;
    if(second.events.some(event=>event.type==="agent_settled")&&recovered.events.at(-1)?.state==="blocked")throw new Error("Restarted Pi settled without resuming the recovered task");
    const exit=await Promise.race([second.getClosed().then(value=>({closed:value})),sleep(25).then(()=>null)]);
    if(exit)throw new Error(`Restarted Pi exited before completing task (${JSON.stringify(exit.closed)}): ${second.stderr}`);
  }
  recovered=await currentItem();
  assert.deepEqual(recovered.events.map(event=>event.state),["planned","running","blocked","running","done"],"Only the same recovered task may progress to completion");
  assert.deepEqual(recovered.events.map(event=>event.revision),[1,2,3,4,5],"Persisted task history must have one strictly ordered revision for each transition");
  // A model can claim completion without performing the required review. Evidence, not the Todo label, determines success.
  const rows=(await readFile(stepsFile,"utf8").catch(error=>error?.code==="ENOENT"?"":Promise.reject(error))).trim().split("\n").filter(Boolean).map(line=>JSON.parse(line));
  assert.equal(rows.length,2,"Pi must record both review steps before declaring the task complete");
  assert.deepEqual(rows.map(row=>row.step),["inspect-closure-audit","inspect-task-reducer"],"Both pending review steps must run exactly once and in order");
  assert.ok(rows.every(row=>row.sessionId===sessionId&&row.projectId===repository));
  const reads=(await readFile(readsFile,"utf8").catch(error=>error?.code==="ENOENT"?"":Promise.reject(error))).trim().split("\n").filter(Boolean).map(line=>JSON.parse(line));
  assert.deepEqual(reads.map(row=>row.step),["inspect-closure-audit","inspect-task-reducer"],"Pi must read each pending review file exactly once and in order");
  assert.ok(second.events.filter(event=>event.type==="tool_execution_start"&&event.toolName==="asen_eco07_read_pending_review").length>=2,"Pi must invoke the resume-gated ASEN review tool; persisted successful reads enforce exact order and uniqueness");
  assert.equal(first.events.filter(event=>event.type==="extension_ui_request"&&event.method==="confirm").length,0);
  assert.equal(second.events.filter(event=>event.type==="extension_ui_request"&&event.method==="confirm").length,1,"Resume requires one explicit affirmative Pi confirmation");
  const final={candidate:revision,provider,model,piVersion:piPackage.version,sessionId,projectId:repository,taskId:recovered.taskId,events:recovered.events.map(({revision,state,at,reason})=>({revision,state,at,reason})),persistedPlan:{sessionFile:path.relative(sessionDir,persistedPlanFile),orderedSteps:["inspect-closure-audit","inspect-task-reducer"]},reads:reads.map(({step,file,at})=>({step,file,at})),steps:rows.map(({step,summary,at})=>({step,summary,at})),initialProcessPid:first.child.pid,restartedProcessPid:second.child.pid,interruptionSignal:"SIGKILL",wrongSession:{visible:0,mutationRejected:true},wrongProject:{visible:0,mutationRejected:true},explicitResumeConsent:true,approvalAuthorityGranted:false,publishAuthorityGranted:false,mergeAuthorityGranted:false,result:"PASS"};
  const completionShutdown=await second.stop("SIGKILL");
  assert.equal(completionShutdown.cleanupConfirmed,true,"Successful recovery must observe restarted Pi process close");
  await transcript.drainAndClose();
  await rm(scratch,{recursive:true,force:true});
  await writeFile(evidencePath,`${JSON.stringify(final,null,2)}\n`,{mode:0o600});
  console.log(JSON.stringify(final));
}catch(error){
  let flushFailure;
  await runCleanup(error,[
    async()=>{if(first)await first.stop("SIGKILL");},
    async()=>{if(second)await second.stop("SIGKILL");},
    async()=>{try{await transcript.drainAndClose();}catch(failure){flushFailure=failure;throw failure;}},
    async()=>{
      const task=await currentItem().catch(()=>undefined);
      const readRows=(await readFile(readsFile,"utf8").catch(()=>"")).split("\n").filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {malformed:true};}});
      const steps=(await readFile(stepsFile,"utf8").catch(()=>"")).split("\n").filter(Boolean).map(line=>{try{const {step,summary,sessionId:owner,projectId,at}=JSON.parse(line);return {step,summary,sessionId:owner,projectId,at};}catch{return {malformed:true};}});
      const summarizeProcess=process=>({label:process.label,events:process.events.map(event=>({type:event.type,toolName:event.toolName,method:event.method,stopReason:event.message?.stopReason,...(typeof event.message?.errorMessage==="string"?{providerError:redacted(event.message.errorMessage)}:{}),aborted:event.aborted})),assistantReplies:process.events.filter(event=>event.type==="message_end"&&event.message?.role==="assistant"&&event.message?.stopReason==="stop").map(event=>redacted((event.message.content??[]).filter(part=>part?.type==="text").map(part=>part.text).join("\n")).slice(-600)),stderr:process.stderr});
      const processTrace=[first&&summarizeProcess({label:"initial",events:first.events,stderr:first.stderr}),second&&summarizeProcess({label:"restarted",events:second.events,stderr:second.stderr})].filter(Boolean);
      const report={candidate:revision,provider,model,phase,result:"FAIL",task:task&&{taskId:task.taskId,title:task.title,events:task.events.map(({revision,state,at,reason})=>({revision,state,at,reason}))},reads:readRows,steps,processTrace,error:redacted(error?.stack??error),...(flushFailure?{transcriptFlushError:redacted(flushFailure?.stack??flushFailure)}:{})};
      await writeFile(evidencePath,`${JSON.stringify(report,null,2)}\n`,{mode:0o600});
      console.error(JSON.stringify(report));
    },
    async()=>rm(scratch,{recursive:true,force:true}),
  ]);
}
