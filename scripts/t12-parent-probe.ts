/** Real Pi TUI witness extension; NOT a production entry point.
 * The child is a deterministic READ-ONLY fixture. Only status+ack are exposed
 * to the Beam-powered parent. The native Pi events are observed, never faked.
 */
import {writeFileSync} from "node:fs";
import {createAsenExtension} from "../extensions/asen.js";

const traceFile=process.env.ASEN_PARENT_TRACE_FILE;
const readyFile=process.env.ASEN_PARENT_READY_FILE;
const home=process.env.ASEN_PARENT_PRIVATE_HOME;
if(!traceFile||!readyFile||!home)throw Error("Pi parent witness requires bounded private paths");
const events:Array<Record<string,unknown>>=[];
function record(kind:string,extra:Record<string,unknown>={}):void{
 events.push({kind,...extra});
 writeFileSync(traceFile,JSON.stringify({events})+"\n",{mode:0o600});
}
export default function parentProbe(pi:any):void{
 let startTool:any;
 const allowed=new Set(["asen_agent_status","asen_agent_ack"]);
 const facade={
  on:(name:string,handler:unknown)=>pi.on(name,handler),
  getFlag:(name:string)=>pi.getFlag(name),
  registerCommand:(name:string,def:unknown)=>pi.registerCommand(name,def),
  sendMessage:(message:any,options:any)=>{
   if(message.customType==="asen.agent.result"){
    record("result_enqueued",{eventId:message.details?.eventId,
     agentId:message.details?.agentId,options});
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
     agentId:args[1]?.id,taskFound:response?.details?.task?.record?.state==="completed",
    });
    if(tool.name==="asen_agent_ack")record("acknowledged",{
     eventId:args[1]?.eventId,confirmed:response?.details?.acknowledged===true,
    });
    return response;
   }});
  },
 };
 createAsenExtension({
  homeDir:()=>home,
  autoAdvancePlans:false,
  enableAgentRuntime:true,enableTodoRuntime:false,
  enableWorkspaceRuntime:false,enableMemoryRuntime:false,
  agentRunner:{run:async(request:any)=>({
   id:request.id,ok:true,
   output:"Read-only fixture observation: the disposable project contains one README. No files were modified.",
  })},
 })(facade as any);
 pi.registerCommand("t12-parent-notice",{
  description:"Start one ASEN read-only fixture child; native Pi parent must consume its terminal notice",
  handler:async(_args:string,ctx:any)=>{
   if(!startTool)throw Error("The ASEN read-only start tool is unavailable");
   // This is a trusted acceptance instruction, not untrusted child output.
   pi.sendMessage({
    customType:"asen.t12.acceptance_instruction",
    content:"READ-ONLY acceptance instruction: when the ASEN terminal result arrives, inspect the exact task using asen_agent_status (pass its agent ID), then call asen_agent_ack (pass its durable eventId) only if the task really completed. Do not edit files or invoke other tools. Explain the observed actions briefly.",
    display:false,
   },{triggerTurn:false});
   await startTool.execute("t12-parent-start",{
    prompt:"Read the disposable fixture only; do not use tools or write.",
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
 pi.on("agent_start",()=>record("parent_turn_start"));
 pi.on("agent_end",(_event:unknown,ctx:any)=>{
  record("parent_turn_end");
  setTimeout(()=>ctx.shutdown(),300);
 });
 pi.on("session_start",()=>writeFileSync(readyFile,"ready\n",{mode:0o600}));
}
