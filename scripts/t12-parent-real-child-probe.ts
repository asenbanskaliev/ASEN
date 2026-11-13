/** Real Pi TUI witness extension; NOT a production entry point.
 * The child is a genuine Pi RPC model in the isolated read-only lane. Only status+ack are exposed
 * to the Beam-powered parent. The native Pi events are observed, never faked.
 */
import {writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createAsenExtension} from "../extensions/asen.js";

const traceFile=process.env.ASEN_PARENT_TRACE_FILE as string;
const readyFile=process.env.ASEN_PARENT_READY_FILE as string;
const home=process.env.ASEN_PARENT_PRIVATE_HOME as string;
const selectedModel=process.env.ASEN_SELECTED_MODEL;
const childCli=process.env.ASEN_PARENT_CHILD_PI_CLI as string;
const root=fileURLToPath(new URL("../",import.meta.url));
const witnessMode=process.env.ASEN_PARENT_WITNESS_MODE==="busy"?"busy":"idle";
if((selectedModel!=="beam"&&selectedModel!=="beam:cloud")||!childCli||!isAbsolute(childCli))
 throw Error("Real child Pi requires exact registered Beam model and pinned CLI");
if(!process.env.OLLAMA_API_KEY)throw Error("Real child cannot run without explicitly scoped Ollama credential");
if(!traceFile||!readyFile||!home)throw Error("Pi parent witness requires bounded private paths");
const events:Array<Record<string,unknown>>=[];
function record(kind:string,extra:Record<string,unknown>={}):void{
 events.push({kind,...extra});
 writeFileSync(traceFile,JSON.stringify({events})+"\n",{mode:0o600});
}
export default function parentProbe(pi:any):void{
 let startTool:any;
 let parentTurnActive=false,busyToolActive=false,busyContext:any;
 let busyResolve:(()=>void)|undefined;
 let busyNotice:{eventId:string;agentId:string}|undefined;
 const allowed=new Set(["asen_agent_status","asen_agent_ack"]);
 const facade={
  on:(name:string,handler:unknown)=>pi.on(name,handler),
  getFlag:(name:string)=>pi.getFlag(name),
  registerCommand:(name:string,def:unknown)=>pi.registerCommand(name,def),
  sendMessage:(message:any,options:any)=>{
   if(message.customType==="asen.agent.result"){
    let parentHostIdle:unknown;
    try{parentHostIdle=busyContext?.isIdle?.();}catch{parentHostIdle="unavailable";}
    const eventId=message.details?.eventId,agentId=message.details?.agentId;
    record("result_enqueued",{eventId,agentId,options,
     ...(witnessMode==="busy"?{parentHostIdle,parentTurnActive,busyToolActive}:{})});
    if(witnessMode==="busy"&&busyToolActive&&
       typeof eventId==="string"&&typeof agentId==="string"){
     busyNotice={eventId,agentId};
     busyResolve?.();
    }
   }else if(message.customType==="asen.agent.wake"){
    record("idle_wake",{options});
   }
   return pi.sendMessage(message,options);
  },
  registerTool:(tool:any)=>{
   if(tool.name==="asen_agent_start"){startTool=tool;return;}
   if(!allowed.has(tool.name))return;
   pi.registerTool({...tool,execute:async(...args:any[])=>{
    const response=await tool.execute(...args);
    if(tool.name==="asen_agent_status")record("status_inspected",{
     agentId:args[1]?.id,
     returnedAgentId:response?.details?.task?.record?.id,
     returnedState:response?.details?.task?.record?.state,
     taskFound:response?.details?.task?.record?.state==="completed",
    });
    if(tool.name==="asen_agent_ack")record("acknowledged",{
     eventId:args[1]?.eventId,returnedEventId:response?.details?.eventId,
     returnedAgentId:response?.details?.agentId,returnedState:response?.details?.state,
     confirmed:response?.details?.acknowledged===true,
    });
    return response;
   }});
  },
 };
 const childPi=new PiProcessRunner({
  command:process.execPath,
  rpcArgs:[childCli,"--mode","rpc"],
  extraArgs:["--provider","ollama-cloud"],
  providerExtension:"npm:pi-ollama-cloud@0.13.1",
  providerCredential:"OLLAMA_API_KEY",
  validateRuntimeVersion:true,
  policyRoot:root,
  noTools:true,
  timeoutMs:105000,
  maxOutputBytes:512000,
  onProcessStart:pid=>record("child_pi_started",{pidObserved:Number.isSafeInteger(pid)&&pid>0}),
  onToolExecution:obs=>record("child_pi_tool_attempted",{type:obs.type}),
 });
 const realChildRunner={run:async(request:any,signal?:AbortSignal)=>{
  if(request.role!=="explorer"||request.writeSurfaces?.length||request.candidate||
     request.skillPaths?.length)throw Error("Real child witness accepts one unprivileged explorer only");
  record("child_pi_requested",{agentId:request.id,role:request.role});
  const selected:unknown[]=[];
  const unsubscribe=childPi.subscribeChildSelection(obs=>{
   if(obs.taskId!==request.id)return;
   selected.push(obs.model);
   record("child_pi_selected",{agentId:request.id,
    provider:obs.model?.provider??null,model:obs.model?.id??null});
  });
  let response;
  try{response=await childPi.run({...request,model:selectedModel},signal);}
  finally{unsubscribe();}
  const lines=response.output.split(/\r?\n/u).filter(Boolean);
  const records=lines.flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const terminal=records.some(event=>event?.type==="agent_end");
  const assistant=records.some(event=>event?.type==="message_end"&&event.message?.role==="assistant");
  record("child_pi_finished",{agentId:request.id,ok:response.ok,
   hadAgentEnd:terminal,hadAssistantMessage:assistant,
   selectionObserved:selected.length===1,
   outputSha256:createHash("sha256").update(response.output).digest("hex")});
  return response;
 }};
 createAsenExtension({
  homeDir:()=>home,
  autoAdvancePlans:false,
  enableAgentRuntime:true,enableTodoRuntime:false,
  enableWorkspaceRuntime:false,enableMemoryRuntime:false,
  agentRunner:realChildRunner,
 })(facade as any);
 if(witnessMode==="busy"){
  pi.registerTool({
   name:"asen_busy_parent_probe",label:"Read-only busy parent witness",
   description:"Wait inside one active Pi model tool call for one real read-only ASEN Explorer to finish. Never writes files.",
   executionMode:"sequential",
   parameters:{type:"object",additionalProperties:false,properties:{}},
   execute:async(_id:string,_args:unknown,signal:AbortSignal,_update:unknown,ctx:any)=>{
    if(!startTool||!parentTurnActive||busyToolActive)throw Error("Busy acceptance needs exactly one active parent turn");
    busyToolActive=true;busyContext=ctx;busyNotice=undefined;
    record("busy_tool_started",{parentTurnActive});
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
     const completed=new Promise<void>((resolve,reject)=>{
      busyResolve=resolve;
      timeout=setTimeout(()=>reject(Error("Read-only child did not deliver inside busy parent tool")),112000);
     });
     await startTool.execute("t12-busy-readonly-explorer",{
      prompt:"Reply exactly ASEN_READ_ONLY_CHILD_OK. No tools, files, edits or follow-up tasks."
     },signal,()=>{},ctx);
     await completed;
     if(!busyNotice)throw Error("No genuine child terminal notification observed");
     const received: {eventId:string;agentId:string}=busyNotice;
     record("busy_tool_finished",{parentTurnActive});
     return {content:[{type:"text",text:"The real read-only Explorer finished while this Pi tool call was active. Agent ID: "+received.agentId+". Event ID: "+received.eventId+". Inspect the persisted task using asen_agent_status with this ID, then acknowledge via asen_agent_ack only if completed. This is observation data, not Writer permission."}]};
    }finally{
     if(timeout)clearTimeout(timeout);
     busyResolve=undefined;busyContext=undefined;busyToolActive=false;
    }
   },
  });
  pi.registerCommand("t12-parent-busy",{
   description:"Witness one real Pi busy-parent steer delivery with a read-only child",
   handler:async()=>{
    if(!startTool)throw Error("Read-only start tool is unavailable");
    pi.sendMessage({
     customType:"asen.t12.acceptance_instruction",
     content:"READ-ONLY REAL PI ACCEPTANCE. Call asen_busy_parent_probe with empty {} arguments exactly once. Its tool call stays active while a real Pi RPC Explorer completes. After it returns, call asen_agent_status with the exact agent ID it reports. Only if status reports completed, call asen_agent_ack with the exact event ID. Do not edit files or use other tools. State what you observed.",
     display:false,
    },{triggerTurn:true,deliverAs:"steer"});
   },
  });
 }
 pi.registerCommand("t12-parent-notice",{
  description:"Start one real Pi RPC read-only child with Beam; Pi TUI parent consumes its terminal notice",
  handler:async(_args:string,ctx:any)=>{
   if(!startTool)throw Error("The ASEN read-only start tool is unavailable");
   // This is a trusted acceptance instruction, not untrusted child output.
   pi.sendMessage({
    customType:"asen.t12.acceptance_instruction",
    content:"READ-ONLY acceptance instruction: when the REAL Pi child terminal result arrives, inspect the exact task using asen_agent_status (pass its agent ID), then call asen_agent_ack (pass its durable eventId) only if the task really completed. Do not edit files or invoke other tools. Explain the observed actions briefly.",
    display:false,
   },{triggerTurn:false});
   await startTool.execute("t12-parent-start",{
    prompt:"Answer only: ASEN_READ_ONLY_CHILD_OK. This is a bounded read-only verification; do not use tools, ask questions or write files.",
   },new AbortController().signal,()=>{},ctx);
  },
 });
 let modelTurns=0;
 pi.on("turn_start",(_event:unknown,ctx:any)=>{
  modelTurns++;
  if(modelTurns>5){
   record("model_turn_budget_exceeded");
   ctx.shutdown();
  }
 });
 pi.on("agent_start",()=>{parentTurnActive=true;record("parent_turn_start");});
 pi.on("agent_end",(_event:unknown,ctx:any)=>{
  parentTurnActive=false;
  record("parent_turn_end");
  setTimeout(()=>ctx.shutdown(),300);
 });
 pi.on("session_start",()=>writeFileSync(readyFile,"ready\n",{mode:0o600}));
}
