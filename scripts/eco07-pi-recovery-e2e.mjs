import assert from "node:assert/strict";
import {mkdir,readdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {parseTodoFile,SessionTodoStore} from "../src/runtime/todo-store.ts";

const repository=await realpath(process.cwd());
const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repository,encoding:"utf8"}).trim();
assert.equal(revision,process.env.ASEN_EXPECTED_SHA,"ECO-07 Pi recovery must test the exact candidate SHA");
if(!process.env.GROQ_API_KEY)throw new Error("GROQ_API_KEY is unavailable to the ECO-07 Actions job");
const piPackage=JSON.parse(await readFile(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json",import.meta.url),"utf8"));
assert.equal(piPackage.version,"1.1.0","ECO-07 provider run must use Pi 1.1.0");

const evidenceDir=path.join(repository,"eco07-pi-evidence");
await mkdir(evidenceDir,{recursive:true});
const transcriptPath=path.join(evidenceDir,"events.jsonl");
const evidencePath=path.join(evidenceDir,"recovery.json");
const scratch=await import("node:fs/promises").then(fs=>fs.mkdtemp(path.join(tmpdir(),"asen-eco07-groq-")));
const home=path.join(scratch,"home"),agentDir=path.join(home,".pi","agent"),sessionDir=path.join(home,"sessions"),asenDir=path.join(home,".asen");
const stepsFile=path.join(scratch,"steps.jsonl"),todoFile=path.join(asenDir,"todos.json");
const sessionId=`eco07-recovery-${revision.slice(0,12)}`;
const title="ECO-07 recovery review: audit evidence, then inspect task state transitions";
await Promise.all([mkdir(agentDir,{recursive:true,mode:0o700}),mkdir(sessionDir,{recursive:true,mode:0o700}),mkdir(asenDir,{recursive:true,mode:0o700})]);
await writeFile(transcriptPath,"",{mode:0o600});
const cli=path.join(path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))),"bundle","cli.js");
const asenExtension=path.join(repository,"extensions","asen.ts");
const probeExtension=fileURLToPath(new URL("./eco07-pi-recovery-probe-extension.mjs",import.meta.url));
const baseEnv={...Object.fromEntries(["PATH","SystemRoot","WINDIR","TEMP","TMP","TMPDIR","LANG","TERM"].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]])),HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:agentDir,PI_CODING_AGENT_SESSION_DIR:sessionDir,PI_TELEMETRY:"0",GROQ_API_KEY:process.env.GROQ_API_KEY,ASEN_ECO07_SESSION_ID:sessionId,ASEN_ECO07_PROJECT:repository,ASEN_ECO07_STEPS_FILE:stepsFile};
const redacted=value=>String(value).replaceAll(process.env.GROQ_API_KEY,"[redacted]").slice(-1200);
const record=async(kind,details={})=>writeFile(transcriptPath,`${JSON.stringify({at:new Date().toISOString(),kind,...details})}\n`,{flag:"a",mode:0o600});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const snapshot=async()=>parseTodoFile(await readFile(todoFile,"utf8"));
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
  const args=[cli,"--mode","rpc","--session-id",sessionId,"--session-dir",sessionDir,"--no-extensions","--extension",asenExtension,"--extension",probeExtension,"--provider","groq","--model","openai/gpt-oss-120b","--no-skills","--tools","read,asen_todo_*,asen_eco07_record_step"];
  const child=spawn(process.execPath,args,{cwd:repository,env:baseEnv,stdio:["pipe","pipe","pipe"]});
  let buffer="",stderr="",stdoutBytes=0,closed;
  const requests=new Map();
  const events=[];
  child.stdout.on("data",chunk=>{
    stdoutBytes+=chunk.length;
    if(stdoutBytes>2_000_000){child.kill("SIGKILL");return;}
    buffer+=chunk.toString();
    let end;
    while((end=buffer.indexOf("\n"))>=0){
      const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
      let value;try{value=JSON.parse(line);}catch{child.kill("SIGKILL");continue;}
      events.push(value);void record(`${label}:pi-event`,{type:value.type,command:value.command,method:value.method,toolName:value.toolName,stopReason:value.message?.stopReason});
      if(value.type==="extension_ui_request"&&value.method==="confirm"){
        const titleText=String(value.title??"");const message=String(value.message??"");
        if(titleText!=="Resume blocked ASEN task?"||!message.includes(title)||!message.includes("explicit review is required")){
          requests.get(value.id)?.reject(new Error("Pi requested an unexpected confirmation"));continue;
        }
        // This is the affirmative test-user response to ASEN's explicit resume dialog; no release authority is requested or granted.
        void record(`${label}:resume-consent`,{title:titleText,confirmed:true});
        child.stdin.write(`${JSON.stringify({type:"extension_ui_response",id:value.id,confirmed:true})}\n`);
      }
      if(value.type==="response"&&value.id&&requests.has(value.id)){
        const pending=requests.get(value.id);requests.delete(value.id);
        value.success===false?pending.reject(new Error(value.error??`${value.command} failed`)):pending.resolve(value);
      }
    }
  });
  child.stderr.on("data",chunk=>{stderr=redacted(stderr+chunk.toString()).slice(-3000);});
  closed=new Promise(resolve=>child.once("close",(code,signal)=>{
    for(const [id,pending] of requests){requests.delete(id);pending.reject(new Error(`${label} Pi process exited (${code??signal})`));}
    resolve({code,signal});
  }));
  child.once("error",error=>{for(const pending of requests.values())pending.reject(error);});
  const send=(type,payload={})=>new Promise((resolve,reject)=>{
    const id=`${label}-${type}-${Math.random().toString(36).slice(2)}`;
    requests.set(id,{resolve,reject});
    child.stdin.write(`${JSON.stringify({id,type,...payload})}\n`);
    const timeout=setTimeout(()=>{if(requests.delete(id))reject(new Error(`${label} Pi ${type} timed out; stderr=${stderr}`));},180_000);
    const pending=requests.get(id);requests.set(id,{resolve:value=>{clearTimeout(timeout);pending.resolve(value);},reject:error=>{clearTimeout(timeout);pending.reject(error);}});
  });
  const stop=async(signal="SIGKILL")=>{
    if(child.exitCode===null&&child.signalCode===null)child.kill(signal);
    return closed;
  };
  return {child,events,send,stop,stderr,getClosed:()=>closed};
}

let phase="starting";
let first,second;
try{
  first=startPi("initial");
  await first.send("get_commands");
  phase="starting-task";
  const initialTurn=first.send("prompt",{message:`Use the ASEN Todo tools to create exactly one task titled exactly ${JSON.stringify(title)}. The task's ordered pending checklist is ASEN_ECO07_PENDING_PLAN: inspect-closure-audit -> inspect-task-reducer. Step one is to inspect docs/audit/eco07-closure-evidence-2026-10-12.md; step two is to inspect src/runtime/task-replay.ts. Move the task from planned to running using its current revision. Persist this task plan in this Pi session's history, but do not read either source file or begin either review step yet. Do not finish it, do not mark it done, and do not call asen_eco07_record_step. Reply briefly after the running state is saved.`});
  void initialTurn.catch(()=>{});
  let started;
  const startDeadline=Date.now()+180_000;
  while(Date.now()<startDeadline){
    try{
      const item=await currentItem();
      if(item){started=item;const state=item.events.at(-1)?.state;if(state==="running")break;if(["done","cancelled"].includes(state))throw new Error(`Pi ended the task before interruption (${state})`);}
    }catch(error){if(error?.code!=="ENOENT")throw error;}
    const exit=await Promise.race([first.getClosed().then(value=>({closed:value})),sleep(25).then(()=>null)]);
    if(exit)throw new Error(`Initial Pi exited before saving running task (${JSON.stringify(exit.closed)}): ${first.stderr}`);
  }
  started=await currentItem();
  assert.equal(started?.events.at(-1)?.state,"running","Pi/ASEN must persist the task as running before interruption");
  assert.equal(started.events[0].sessionId,sessionId);assert.equal(started.events[0].projectId,repository);
  assert.equal(started.events.length,2,"The initial task must have one planned and one running event");
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
  await first.stop("SIGKILL");
  await initialTurn.catch(()=>{});
  await record("process-killed",{pid:initialPid,signal:"SIGKILL"});

  phase="restart-recovery";
  second=startPi("restarted");
  await second.send("get_commands");
  let recovered=await currentItem();
  assert.deepEqual(recovered.events.map(event=>event.state),["planned","running","blocked"],"Pi restart must preserve history and block interrupted work");
  assert.match(recovered.events.at(-1).reason,/explicit review is required/u);
  await record("task-recovered",{taskId:recovered.taskId,sessionId,projectId:repository,events:recovered.events.map(({revision,state,at,reason})=>({revision,state,at,reason}))});

  phase="identity-isolation";
  const store=await SessionTodoStore.open(todoFile);
  assert.deepEqual(await store.list({sessionId:"eco07-wrong-session",projectId:repository}),[],"Wrong session must not see recovered task");
  await assert.rejects(()=>store.update(recovered.taskId,{sessionId:"eco07-wrong-session",projectId:repository},recovered.events.at(-1).revision,"running"),/unavailable/u);
  assert.deepEqual(await store.list({sessionId,projectId:path.join(scratch,"wrong-project")}),[],"Wrong project must not see recovered task");
  await assert.rejects(()=>store.update(recovered.taskId,{sessionId,projectId:path.join(scratch,"wrong-project")},recovered.events.at(-1).revision,"running"),/unavailable/u);
  assert.deepEqual((await currentItem()).events.map(event=>event.state),["planned","running","blocked"],"Wrong session must not mutate the recovered task");
  await record("wrong-identity-rejected",{taskId:recovered.taskId,wrongSession:{visibleItems:0,mutationRejected:true},wrongProject:{visibleItems:0,mutationRejected:true},stateUnchanged:true});

  phase="explicit-resume-and-completion";
  await second.send("prompt",{message:`The same task is interrupted and blocked. Recover it from this Pi session's persisted conversation and its ASEN Todo record; use asen_todo_list to confirm identity. Read the persisted ASEN_ECO07_PENDING_PLAN checklist from the existing session history and continue its remaining steps in order. Call asen_todo_update for the same task id ${JSON.stringify(recovered.taskId)}, using revision ${recovered.events.at(-1).revision}, and state running. Pi will show its explicit resume confirmation; wait for that confirmation before continuing. Use the available asen_eco07_record_step tool once for each pending checklist item, with the corresponding step id. Follow the task plan's exact files, order, and summary requirements. After both saved review steps are complete, update the same task to done using its latest revision. Do not create another task or use any approval, publishing, or merge action.`});

  const finishDeadline=Date.now()+240_000;
  while(Date.now()<finishDeadline){
    recovered=await currentItem();
    if(recovered.events.at(-1)?.state==="done")break;
    const exit=await Promise.race([second.getClosed().then(value=>({closed:value})),sleep(25).then(()=>null)]);
    if(exit)throw new Error(`Restarted Pi exited before completing task (${JSON.stringify(exit.closed)}): ${second.stderr}`);
  }
  recovered=await currentItem();
  assert.deepEqual(recovered.events.map(event=>event.state),["planned","running","blocked","running","done"],"Only the same recovered task may progress to completion");
  assert.deepEqual(recovered.events.map(event=>event.revision),[1,2,3,4,5],"Persisted task history must have one strictly ordered revision for each transition");
  const rows=(await readFile(stepsFile,"utf8")).trim().split("\n").filter(Boolean).map(line=>JSON.parse(line));
  assert.deepEqual(rows.map(row=>row.step),["inspect-closure-audit","inspect-task-reducer"],"Both pending review steps must run exactly once and in order");
  assert.ok(rows.every(row=>row.sessionId===sessionId&&row.projectId===repository));
  assert.equal(first.events.filter(event=>event.type==="extension_ui_request"&&event.method==="confirm").length,0);
  assert.equal(second.events.filter(event=>event.type==="extension_ui_request"&&event.method==="confirm").length,1,"Resume requires one explicit affirmative Pi confirmation");
  const final={candidate:revision,provider:"groq",model:"openai/gpt-oss-120b",piVersion:piPackage.version,sessionId,projectId:repository,taskId:recovered.taskId,events:recovered.events.map(({revision,state,at,reason})=>({revision,state,at,reason})),persistedPlan:{sessionFile:path.relative(sessionDir,persistedPlanFile),orderedSteps:["inspect-closure-audit","inspect-task-reducer"]},steps:rows.map(({step,summary,at})=>({step,summary,at})),initialProcessPid:first.child.pid,restartedProcessPid:second.child.pid,interruptionSignal:"SIGKILL",wrongSession:{visible:0,mutationRejected:true},wrongProject:{visible:0,mutationRejected:true},explicitResumeConsent:true,approvalAuthorityGranted:false,publishAuthorityGranted:false,mergeAuthorityGranted:false,result:"PASS"};
  await writeFile(evidencePath,`${JSON.stringify(final,null,2)}\n`,{mode:0o600});
  console.log(JSON.stringify(final));
}catch(error){
  const report={candidate:revision,provider:"groq",phase,result:"FAIL",error:redacted(error?.stack??error)};
  await writeFile(evidencePath,`${JSON.stringify(report,null,2)}\n`,{mode:0o600});
  throw error;
}finally{
  if(first)await first.stop("SIGKILL");
  if(second)await second.stop("SIGKILL");
  await rm(scratch,{recursive:true,force:true});
}
