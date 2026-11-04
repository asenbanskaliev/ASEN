/** EF-604: REAL installed Pi 1.2 RPC host restart, authenticated ASEN store,
 * and production notice journal. Child model execution and Writer are NOT tested here.
 * No provider credentials or model requests. All state lives in a disposable root.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync,spawn,spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {readFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {SessionManager} from "@earendil-works/pi-coding-agent";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";

function piMessage():Parameters<SessionManager["appendMessage"]>[0]{
 return {role:"assistant" as const,content:[{type:"text" as const,text:"Local recovery fixture: no model invoked"}],
  api:"fixture",provider:"fixture",model:"fixture",
  usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,
   cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
  stopReason:"stop" as const,timestamp:Date.now()};
}
function scrubEnv(home:string,probeTrace:string){
 const env:NodeJS.ProcessEnv={...process.env,
  HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,".pi","agent"),
  ASEN_NATIVE_RESTART_HOME:home,ASEN_NATIVE_RESTART_TRACE:probeTrace,
  PI_TELEMETRY:"0",PI_OFFLINE:"1",ASEN_NO_SKILL_REGISTRY:"1"};
 for(const k of Object.keys(env)){
  if(k.startsWith("GIT_")||/(?:API[_-]?KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(k))
   delete env[k];
 }
 return env;
}
const repo=fileURLToPath(new URL("../",import.meta.url));
const extension=pathToFileURL(join(repo,"extensions","asen.ts")).href;
function probeCode(){
 // The real Pi extension entry point is registered in this real native Pi host.
 // A replaced mock host cannot pass the native RPC session identity assertions.
 return [
  'import {appendFileSync} from "node:fs";',
  'import {createAsenExtension} from '+JSON.stringify(extension)+';',
  'export default function(pi){',
  ' createAsenExtension({homeDir:()=>process.env.ASEN_NATIVE_RESTART_HOME,',
  '  enableAgentRuntime:true,enableTodoRuntime:false,enableWorkspaceRuntime:false,',
  '  enableMemoryRuntime:false,autoAdvancePlans:false,',
  '  agentRunner:{run:async()=>{throw Error("UNEXPECTED_AGENT_MODEL_OR_DISPATCH");}}',
  ' })(pi);',
  ' const track=(kind,ctx)=>appendFileSync(process.env.ASEN_NATIVE_RESTART_TRACE,',
  '  JSON.stringify({kind,pid:process.pid,sessionId:ctx?.sessionManager?.getSessionId?.()??null,',
  '   cwd:ctx?.cwd??null,mode:ctx?.mode??null})+"\\n");',
  ' pi.on("session_start",(_event,ctx)=>track("native_session_start",ctx));',
  ' pi.on("agent_start",(_event,ctx)=>track("unexpected_agent_start",ctx));',
  '}'
 ].join("\n")+"\n";
}
function readTrace(file:string){
 if(!existsSync(file))return [];
 return readFileSync(file,"utf8").trim().split(/\r?\n/u).filter(Boolean).map(s=>JSON.parse(s));
}
async function completedReadOnly(runtime:AgentRuntime,session:{sessionId:string;projectId:string},name:string){
 const pending=new Promise<any>((resolve,reject)=>{
  const timer=setTimeout(()=>{cancel();reject(Error("Durable read-only completion timeout"));},12000);
  const cancel=runtime.subscribeTerminal(record=>{
   if(record.role==="explorer"&&record.state==="completed"&&
      record.sessionId===session.sessionId&&record.projectId===session.projectId){
    clearTimeout(timer);cancel();resolve(record);
   }
  });
 });
 // Runner is deterministic and provider-free; this is NOT a real Pi child inference.
 const id=await runtime.startReadOnly({role:"explorer",prompt:name,session});
 const record=await pending;
 assert.equal(record.id,id);
 assert.equal(record.state,"completed");
 assert.equal((await runtime.query(id,session))?.record.state,"completed");
 return record;
}
test("EF-604 authentic Pi RPC host restart, forced process death and durable isolation never replay uncertain results",
 {timeout:180000},async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-native-pi-restart-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const home=join(root,"home"),project=join(root,"project"),sessions=join(root,"sessions");
 await Promise.all([mkdir(home),mkdir(project),mkdir(sessions)]);
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],
  {encoding:"utf8",timeout:10000,windowsHide:true}).trim();
 git("init","-q");git("config","user.name","ASEN native restart test");
 git("config","user.email","asen-restart@example.invalid");
 await writeFile(join(project,"README.md"),"DISPOSABLE NATIVE PI RESTART FIXTURE\n");
 git("add","README.md");git("commit","-qm","baseline");
 const baseline=git("rev-parse","HEAD");
 const pi=SessionManager.create(project,sessions);
 pi.appendSessionInfo("ASEN native restart without provider");
 pi.appendMessage(piMessage());
 const sessionFile=pi.getSessionFile(),sessionId=pi.getSessionId();
 assert.ok(sessionFile&&existsSync(sessionFile));
 const scope={sessionId,projectId:await realpath(project)};
 const asen=join(home,".asen");await mkdir(asen,{recursive:true});
 const storePath=join(asen,"agents.json"),noticePath=join(asen,"agent-notices.json");
 const runtime=await AgentRuntime.open({storeFile:storePath,runner:{run:async request=>({
  id:request.id,ok:true,output:request.prompt})}});
 const attempted=await completedReadOnly(runtime,scope,"attempted-evidence-fixture");
 const pending=await completedReadOnly(runtime,scope,"pending-evidence-fixture");
 const journal=new AgentNotificationJournal(noticePath);
 const first=await journal.record({...scope,id:attempted.id,state:attempted.state});
 assert.equal(await journal.claim(first.eventId,scope),true);
 const second=await journal.record({...scope,id:pending.id,state:pending.state});
 const before=await readFile(noticePath);
 const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
 const stableJournal=async()=>digest(await readFile(noticePath));
 const baselineDigest=digest(before);
 assert.deepEqual((await journal.list(scope)).map(x=>x.delivery),["attempted","pending"]);
 const probe=join(root,"native-probe.ts"),trace=join(root,"native-trace.jsonl");
 await writeFile(probe,probeCode(),{flag:"wx",mode:0o600});
 const packageMetadata=JSON.parse(readFileSync(join(repo,"node_modules",
  "@earendil-works","pi-coding-agent","package.json"),"utf8"));
 assert.equal(packageMetadata.version,"1.2.0","Real pinned Pi 1.2.0 required");
 const piEntrypoint=fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
 const binary=join(dirname(piEntrypoint),"bundle","cli.js");
 const env=scrubEnv(home,trace);
 const run=(file:string)=>{
  const cmd={id:"native-restart-state",type:"get_state"};
  const child=spawnSync(process.execPath,[binary,"--mode","rpc","--session",file,
   "--no-extensions","--extension",probe,"--no-skills","--no-builtin-tools"],{
   cwd:project,env,encoding:"utf8",input:JSON.stringify(cmd)+"\n",
   timeout:35000,maxBuffer:128*1024,windowsHide:true,
  });
  assert.equal(child.error,undefined,"Pi native process could not start");
  assert.equal(child.status,0,"Pi native RPC failed: "+child.stderr.slice(0,550));
  const messages=child.stdout.trim().split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));
  const responses=messages.filter(x=>x.type==="response"&&x.id===cmd.id&&x.command==="get_state");
  assert.equal(responses.length,1,"Exactly one native Pi get_state response required");
  assert.equal(responses[0].success,true,"Native Pi did not load its persisted session");
  return {state:responses[0].data,pid:readTrace(trace).at(-1)?.pid};
 };
 const firstRun=run(sessionFile);
 assert.equal(firstRun.state.sessionId,sessionId);
 assert.equal(firstRun.state.sessionFile,sessionFile);
 assert.deepEqual((await journal.list(scope)).map(x=>x.delivery),["attempted","pending"]);
 assert.equal(await stableJournal(),baselineDigest,"Headless Pi must not transmit or update either notice");
 const secondRun=run(sessionFile);
 assert.equal(secondRun.state.sessionId,sessionId);
 assert.equal(secondRun.state.sessionFile,sessionFile);
 assert.notEqual(secondRun.pid,firstRun.pid,"Second launch must be a distinct native Pi process");
 const events=readTrace(trace);
 assert.equal(events.filter(e=>e.kind==="native_session_start").length,2);
 assert.ok(events.every(e=>e.kind==="native_session_start"),
  "No model start or unsolicited agent execution may occur");
 assert.deepEqual(events.map(e=>e.sessionId),[sessionId,sessionId]);
 assert.deepEqual(events.map(e=>e.cwd),[scope.projectId,scope.projectId]);
 assert.deepEqual((await journal.list(scope)).map(x=>x.delivery),["attempted","pending"]);
 assert.equal(await stableJournal(),baselineDigest,"Pi restart must not acknowledge or replay notices");
 const recovered=await AgentRuntime.open({storeFile:storePath,runner:{run:async()=>{throw Error("RESTART_DISPATCH_FORBIDDEN");}}});
 const tasks=await recovered.list(scope);
 assert.equal(tasks.length,2);
 assert.deepEqual(tasks.map(x=>x.state),["completed","completed"]);
 assert.deepEqual((await new AgentNotificationJournal(noticePath).list(scope)).map(x=>x.delivery),["attempted","pending"]);
 assert.equal(await journal.claim(first.eventId,scope),false,"An attempted notice must not auto-retry");
 await assert.rejects(()=>journal.acknowledge(first.eventId,scope,attempted.id,"completed"),
  /enqueued before coordinator acknowledgement/u);
 assert.equal(git("status","--porcelain"),"","Native Pi restart must preserve the disposable project");
 assert.equal(git("rev-parse","HEAD"),baseline);
 const other=SessionManager.create(project,sessions);
 other.appendSessionInfo("Other host session is not authorized for previous notice");
 other.appendMessage(piMessage());
 const foreign=run(other.getSessionFile()!);
 assert.notEqual(foreign.state.sessionId,sessionId);
 assert.deepEqual(await journal.list({sessionId:foreign.state.sessionId,projectId:scope.projectId}),[]);
 assert.equal(await stableJournal(),baselineDigest);
 // A genuine Pi RPC process must survive a normal get_state response until
 // explicitly killed; this is a hard OS failure, not a clean session_shutdown.
 const cmdId="native-hard-kill";
 const argv=[binary,"--mode","rpc","--session",sessionFile,
  "--no-extensions","--extension",probe,"--no-skills","--no-builtin-tools"];
 const killed=await new Promise<{pid:number;code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{
  const child=spawn(process.execPath,argv,{cwd:project,env,stdio:["pipe","pipe","pipe"],
   windowsHide:true});
  let stdout="",stderr="",answered=false,requestedKill=false,settled=false;
  const finish=(error?:Error,code:number|null=null,signal:NodeJS.Signals|null=null)=>{
   if(settled)return;
   settled=true;clearTimeout(timeout);
   if(error)reject(error);
   else if(!answered||!requestedKill||!child.pid||code===0)
    reject(Error("Pi did not survive RPC request until forced termination"));
   else resolve({pid:child.pid,code,signal});
  };
  const timeout=setTimeout(()=>{
   child.kill("SIGKILL");finish(Error("Native Pi did not respond before forced termination"));
  },30000);
  child.stdout.on("data",(chunk:Buffer)=>{
   stdout+=chunk.toString("utf8");
   if(stdout.length>131072){child.kill("SIGKILL");finish(Error("Unbounded Pi RPC output"));return;}
   for(let newline=stdout.indexOf("\n");newline>=0;newline=stdout.indexOf("\n")){
    const line=stdout.slice(0,newline).trim();stdout=stdout.slice(newline+1);
    let reply:any;try{reply=JSON.parse(line);}catch{continue;}
    if(reply?.type!=="response"||reply.id!==cmdId)continue;
    if(reply.success!==true||reply.command!=="get_state"||reply.data?.sessionId!==sessionId){
     child.kill("SIGKILL");finish(Error("Native Pi response did not bind owned session"));return;
    }
    answered=true;requestedKill=child.kill("SIGKILL");
    if(!requestedKill)finish(Error("Forced Pi host termination was not delivered"));
    break;
   }
  });
  child.stderr.on("data",(chunk:Buffer)=>{
   stderr+=chunk.toString("utf8");if(stderr.length>131072)stderr=stderr.slice(-8192);
  });
  child.on("error",error=>finish(error));
  child.on("close",(code,signal)=>finish(undefined,code,signal));
  child.stdin.write(JSON.stringify({id:cmdId,type:"get_state"})+"\n");
 });
 assert.ok(killed.pid>0,"A real native Pi OS process must have been forcibly terminated");
 const afterKill=run(sessionFile);
 assert.equal(afterKill.state.sessionId,sessionId);
 assert.equal(afterKill.state.sessionFile,sessionFile);
 assert.notEqual(afterKill.pid,killed.pid);
 assert.equal(await stableJournal(),baselineDigest,
  "Forced Pi death plus restart cannot mutate or replay uncertain notices");
 assert.deepEqual((await journal.list(scope)).map(row=>row.delivery),["attempted","pending"]);
 const allEvents=readTrace(trace);
 assert.equal(allEvents.length,5,"Exactly five real Pi processes should start");
 assert.deepEqual(allEvents.map(event=>event.kind),Array(5).fill("native_session_start"));
 assert.deepEqual(allEvents.map(event=>event.sessionId),
  [sessionId,sessionId,foreign.state.sessionId,sessionId,sessionId]);
 const evidence={schema:"asen-native-pi-restart/v1",status:"PASS_NATIVE_PI_HEADLESS_RESTART_BOUNDED",
  piVersion:packageMetadata.version,hostProcessCount:5,sameSessionRestarts:3,
  osForcedTerminationObserved:true,
  nativeSessionIdentityPreserved:true,foreignSessionIsolated:true,
  persistedReadOnlyTasks:2,noticeStates:["attempted","pending"],
  observedModelCalls:0,writerAuthorized:false,coordinatorConsumption:false,globalFull:false,
  evidenceSha256:createHash("sha256").update(before).digest("hex")};
 assert.equal(evidence.globalFull,false);
 assert.equal(evidence.writerAuthorized,false);
 assert.equal(evidence.coordinatorConsumption,false);
 // Public tests emit only bounded evidence, not session paths or raw user content.
 console.log("EF604_NATIVE_PI_HEADLESS_RESTART_PASS "+JSON.stringify(evidence));
});
