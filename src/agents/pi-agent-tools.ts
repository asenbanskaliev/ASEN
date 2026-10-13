import {AgentProjectAccess} from "./agent-project-access.js";
import {realpath} from "node:fs/promises";
import {isAbsolute,resolve} from "node:path";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {AgentRuntime} from "./agent-runtime.js";
import type {AgentSessionIdentity} from "./agent-runtime.js";
import type {TrustedTaskAgentBinder} from "../runtime/trusted-task-agent-binder.js";
import type {SessionTodoStore} from "../runtime/todo-store.js";

const text={type:"string",minLength:1,maxLength:32000};
const rootSchema={type:"string",minLength:1,maxLength:4096};
const idSchema={type:"string",minLength:1,maxLength:1024};
function cancelled():Error{const error=new Error("Agent task cancelled");error.name="AbortError";return error;}
function throwIfCancelled(signal?:AbortSignal):void{if(signal?.aborted)throw cancelled();}
async function confirmWithAbort(confirm:(signal?:AbortSignal)=>Promise<boolean>,signal?:AbortSignal):Promise<boolean>{
 throwIfCancelled(signal);if(!signal)return confirm();let onAbort!:()=>void;
 const aborted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(cancelled());signal.addEventListener("abort",onAbort,{once:true});if(signal.aborted)onAbort();});
 try{const result=await Promise.race([Promise.resolve().then(()=>confirm(signal)),aborted]);throwIfCancelled(signal);return result;}finally{signal.removeEventListener("abort",onAbort);}
}
const result=(value:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(value)}],details:value});
async function identity(context:any):Promise<AgentSessionIdentity>{
 const sessionId=context?.sessionManager?.getSessionId?.(),cwd=context?.cwd;
 if(typeof sessionId!=="string"||!sessionId||sessionId!==sessionId.trim()||typeof cwd!=="string"||!isAbsolute(cwd))throw new Error("ASEN agent tools require the active Pi session and project");
 return {sessionId,projectId:await realpath(resolve(cwd))};
}
export const ASEN_AGENT_TOOL_NAMES=Object.freeze(["asen_agent_start","asen_agent_status","asen_agent_cancel","asen_agent_continue"] as const);
/** Exposes only read-only explorer work by default; write agents require an internal fresh ASEN grant. */
export function registerAgentTools(pi:{registerTool?:(tool:ToolDefinition<any>)=>void},runtime:()=>Promise<AgentRuntime>,todoLink?:{todos:()=>Promise<SessionTodoStore>;binder:()=>Promise<TrustedTaskAgentBinder>}):()=>void{
 const access=new AgentProjectAccess();
 const selectedIdentity=async(root:unknown,context:any,launch:boolean,signal?:AbortSignal)=>access.resolve(root,context,await identity(context),launch,()=>confirmWithAbort(dialogSignal=>context.ui.confirm("Authorize another project?",`Start a read-only ASEN agent in ${String(root)}? Access applies only to this live session and project.`,dialogSignal?{signal:dialogSignal}:undefined),signal),signal);
 pi.registerTool?.({name:"asen_agent_start",label:"Start ASEN agent",description:"Queue an isolated, read-only Pi agent task in the current session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["prompt"],properties:{prompt:text,root:rootSchema,todoId:idSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);
  const prompt=(params as {prompt?:unknown})?.prompt;if(typeof prompt!=="string"||!prompt.trim()||prompt.length>32000)throw new Error("Invalid agent prompt");
  const session=await selectedIdentity((params as {root?:unknown}).root,context,true,signal);
  const todoId=(params as {todoId?:unknown}).todoId;
  if(todoId!==undefined){
   if(typeof todoId!=="string"||!todoId.trim()||!todoLink)throw new Error("Todo binding is unavailable");
   const task=(await (await todoLink.todos()).list(session)).find(item=>item.taskId===todoId);
   if(!task||task.current.state==="done"||task.current.state==="cancelled"||task.current.state==="blocked")throw new Error("Todo must be an active, owned task before agent launch");
  }
  throwIfCancelled(signal);
  const active=await runtime(),taskId=await active.startExplorer({prompt,session},signal);
  if(typeof todoId==="string"){
   try{await (await todoLink!.binder()).bind(todoId,taskId,session);}
   catch(error){await active.cancel(taskId,session).catch(()=>{});throw error;}
  }
  return result({id:taskId,state:"queued",role:"explorer",...(typeof todoId==="string"?{todoId}:{})});
 }});
 pi.registerTool?.({name:"asen_agent_status",label:"ASEN agent status",description:"List owned agent tasks, or query one task and its durable state history by id.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,properties:{id:idSchema,root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);
  const taskId=(params as {id?:unknown})?.id;
  if(taskId!==undefined&&(typeof taskId!=="string"||!taskId.trim()||taskId.length>1024))throw new Error("Invalid agent task id");
  const active=await runtime(),session=await selectedIdentity((params as {root?:unknown}).root,context,false,signal);throwIfCancelled(signal);
  if(typeof taskId==="string")return result({id:taskId,task:await active.query(taskId,session)});
  const rows=await active.list(session);
  return result(rows.map(({id,role,state,createdAt,updatedAt,summary})=>({id,role,state,createdAt,updatedAt,...(summary?{summary}:{})})));
 }});
 pi.registerTool?.({name:"asen_agent_cancel",label:"Cancel ASEN agent",description:"Cancel a queued or running task owned by the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id"],properties:{id:idSchema,root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);const taskId=(params as {id?:unknown})?.id;if(typeof taskId!=="string")throw new Error("Invalid agent task id");const active=await runtime();return result({id:taskId,cancelled:await active.cancel(taskId,await selectedIdentity((params as {root?:unknown}).root,context,false,signal))});
 }});
 pi.registerTool?.({name:"asen_agent_continue",label:"Continue ASEN agent",description:"Resume a safe read-only task after confirming it belongs to the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id"],properties:{id:idSchema,root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);const taskId=(params as {id?:unknown})?.id;if(typeof taskId!=="string")throw new Error("Invalid agent task id");const session=await selectedIdentity((params as {root?:unknown}).root,context,false,signal);throwIfCancelled(signal);
  if(context?.hasUI!==true||typeof context?.ui?.confirm!=="function"||!await confirmWithAbort(dialogSignal=>context.ui.confirm("Continue agent task?","This starts a new read-only attempt for the saved task in this same session and project.",dialogSignal?{signal:dialogSignal}:undefined),signal))throw new Error("Explicit Pi UI confirmation is required to continue an agent task");
  const next=await (await runtime()).continue(taskId,session,signal);return result({id:next,state:"queued",continuedFrom:taskId,role:"explorer"});
 }});
 return ()=>access.reset();
}
