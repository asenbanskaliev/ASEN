/** Test-only ASEN extension probe: real Explorer Pi RPC stream inside a native Pi TUI. */
import {realpathSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createAsenExtension} from "../extensions/asen.js";

const phase=process.env.ASEN_REAL_TUI_PHASE,home=process.env.ASEN_REAL_TUI_HOME;
const marker=process.env.ASEN_REAL_TUI_MARKER,store=process.env.ASEN_REAL_TUI_STORE;
const packageRoot=process.env.ASEN_REAL_TUI_PACKAGE_ROOT,model=process.env.ASEN_SELECTED_MODEL;
if(!["start","reopen"].includes(phase??"")||!home||!marker||!store||!packageRoot||!model)
 throw Error("Real TUI stream fixture configuration is incomplete");
const piMeta=JSON.parse(await import("node:fs/promises").then(m=>m.readFile(
 join(packageRoot,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8")));
if(piMeta.version!=="1.2.0")throw Error("Pinned Pi 1.2.0 is required");
const piBinary=resolve(packageRoot,"node_modules","@earendil-works","pi-coding-agent",
 typeof piMeta.bin==="string"?piMeta.bin:piMeta.bin.pi);
const writeMarker=(value:object)=>writeFileSync(marker,JSON.stringify(value)+"\n",{mode:0o600});
const scopeFrom=(ctx:any)=>{
 const sessionId=ctx?.sessionManager?.getSessionId?.();
 if(typeof sessionId!=="string"||!sessionId||typeof ctx?.cwd!=="string")
  throw Error("Active Pi session identity unavailable");
 return {sessionId,projectId:realpathSync(ctx.cwd)};
};
let active:{id:string;sessionId:string;projectId:string}|undefined,selection:any;
let runtimePromise:Promise<AgentRuntime>|undefined;
let reopenDispatches=0;
const base=phase==="start"?new PiProcessRunner({
 command:process.execPath,rpcArgs:[piBinary,"--mode","rpc"],extraArgs:["--provider","ollama-cloud"],
 providerExtension:"npm:pi-ollama-cloud@0.13.1",providerCredential:"OLLAMA_API_KEY",
 validateRuntimeVersion:true,policyRoot:packageRoot,noTools:true,timeoutMs:150_000,maxOutputBytes:450_000,
 onProcessStart:pid=>{if(active)writeMarker({phase:"child_started",taskId:active.id,sessionId:active.sessionId,
  projectId:active.projectId,parentPid:process.pid,childPid:pid});},
 onAssistantTextDelta:event=>{
  if(!active||!runtimePromise)return;
  void runtimePromise.then(async runtime=>{
   const task=await runtime.query(active!.id,{sessionId:active!.sessionId,projectId:active!.projectId});
   if(task?.record.state!=="running")throw Error("Explorer was not running when the native text delta arrived");
   writeMarker({phase:"streaming",taskId:active!.id,sessionId:active!.sessionId,
    projectId:active!.projectId,parentPid:process.pid,childPid:event.pid,
    requestId:event.requestId,deltaCharacters:event.observedCharacters,
    selection:selection??null});
  }).catch(()=>writeMarker({phase:"stream_observation_failed"}));
 },
}):{run:async()=>{reopenDispatches++;throw Error("AUTOMATIC_REPLAY_AFTER_TUI_CRASH_FORBIDDEN");}};
const runner:any={run:(request:any,signal?:AbortSignal)=>{
 if(phase==="reopen"){reopenDispatches++;return Promise.reject(Error("AUTOMATIC_REPLAY_AFTER_TUI_CRASH_FORBIDDEN"));}
 if(typeof request.isolationKey!=="string"||!request.isolationKey)
  return Promise.reject(Error("Exact Pi session identity is required"));
 active={id:request.id,sessionId:request.isolationKey,projectId:request.repository};
 return base.run(request,signal);
},subscribeChildSelection:(listener:any)=>phase==="start"
 ?(base as PiProcessRunner).subscribeChildSelection(value=>{if(value.taskId===active?.id)selection=value;listener(value);})
 :()=>{}};
if(phase==="start")(base as PiProcessRunner).subscribeChildSelection(value=>{
 if(value.taskId===active?.id)selection=value;
});
runtimePromise=AgentRuntime.open({storeFile:store,runner,maxConcurrency:1});
const facade=createAsenExtension({
 homeDir:()=>home,packageRoot,enableAgentRuntime:true,agentStoreFile:store,
 agentRunner:runner,agentProviderCredential:"OLLAMA_API_KEY",agentMaxConcurrency:1,
 autoAdvancePlans:false,agentRuntimeFactory:async()=>runtimePromise!,
});
export default function(pi:any):void{
 pi.on("before_agent_start",()=>{throw Error("PARENT_MODEL_TURN_FORBIDDEN_IN_CHILD_STREAM_FIXTURE");});
 facade(pi);
 pi.on("session_start",async(_event:any,ctx:any)=>{
  try{
   const scope=scopeFrom(ctx);
   if(phase==="start"){
    if(typeof pi.appendEntry!=="function"||typeof ctx.sessionManager.appendMessage!=="function")
     throw Error("Pinned Pi session persistence APIs are unavailable");
    pi.appendEntry("asen.ef604.live-stream-crash-seed",{readOnly:true,providerCallsReserved:1});
    ctx.sessionManager.appendMessage({role:"user",content:[{type:"text",
     text:"ASEN_SYNTHETIC_LIVE_CHILD_CRASH_FIXTURE_NO_PARENT_MODEL_TURN"}],timestamp:Date.now()});
    const runtime=await runtimePromise!;
    const id=await runtime.startReadOnly({role:"explorer",session:scope,model,
     prompt:"Read-only bounded interruption test. Produce a long numbered list of 160 short facts about the arithmetic sequence 1,2,3,... in plain text. Begin immediately. Do not invoke tools or write files."});
    if(typeof id!=="string"||!id)throw Error("ASEN Explorer task identity missing");
   }else{
    const runtime=await runtimePromise!,rows=await runtime.list(scope);
    const expected=process.env.ASEN_REAL_TUI_TASK_ID;
    const row=rows.find(item=>item.id===expected);
    if(rows.length!==1||!row||row.role!=="explorer"||row.state!=="interrupted"||
       row.sessionId!==scope.sessionId||row.projectId!==scope.projectId)
     throw Error("Exact interrupted Explorer did not recover in the same Pi TUI session and project");
    const notices=await import("../src/runtime/agent-notification-journal.js").then(async({AgentNotificationJournal})=>
     new AgentNotificationJournal(join(home,".asen","agent-notices.json")).list(scope));
    if(notices.some(item=>item.agentId===expected))throw Error("Interrupted nonterminal stream forged a terminal notice");
    if(reopenDispatches!==0)throw Error("Recovery automatically relaunched the interrupted Explorer");
    writeMarker({phase:"recovered",taskId:row.id,sessionId:row.sessionId,projectId:row.projectId,
     state:row.state,replayCount:reopenDispatches,terminalNotice:false,writerAuthorized:false});
    setTimeout(()=>ctx.shutdown(),250);
   }
  }catch(error){writeMarker({phase:"probe_failed",diagnostic:error instanceof Error?error.name:"Error"});
   if(phase==="reopen")setTimeout(()=>ctx.shutdown(),100);}
 });
}
