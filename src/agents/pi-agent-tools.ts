import {realpath} from "node:fs/promises";
import {isAbsolute,resolve} from "node:path";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {AgentRuntime} from "./agent-runtime.js";
import type {AgentSessionIdentity} from "./agent-runtime.js";

const text={type:"string",minLength:1,maxLength:32000};
const idSchema={type:"string",minLength:1,maxLength:1024};
const result=(value:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(value)}],details:value});
async function identity(context:any):Promise<AgentSessionIdentity>{
 const sessionId=context?.sessionManager?.getSessionId?.(),cwd=context?.cwd;
 if(typeof sessionId!=="string"||!sessionId||sessionId!==sessionId.trim()||typeof cwd!=="string"||!isAbsolute(cwd))throw new Error("ASEN agent tools require the active Pi session and project");
 return {sessionId,projectId:await realpath(resolve(cwd))};
}
export const ASEN_AGENT_TOOL_NAMES=Object.freeze(["asen_agent_start","asen_agent_status","asen_agent_cancel","asen_agent_continue"] as const);
/** Exposes only read-only explorer work by default; write agents require an internal fresh ASEN grant. */
export function registerAgentTools(pi:{registerTool?:(tool:ToolDefinition<any>)=>void},runtime:()=>Promise<AgentRuntime>):void{
 pi.registerTool?.({name:"asen_agent_start",label:"Start ASEN agent",description:"Queue an isolated, read-only Pi agent task in the current session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["prompt"],properties:{prompt:text}},execute:async(_id,params,signal,_update,context)=>{
  if(signal?.aborted)throw new Error("Agent task cancelled before enqueue");
  const prompt=(params as {prompt?:unknown})?.prompt;if(typeof prompt!=="string"||!prompt.trim()||prompt.length>32000)throw new Error("Invalid agent prompt");
  const active=await runtime(),taskId=await active.startExplorer({prompt,session:await identity(context)});return result({id:taskId,state:"queued",role:"explorer"});
 }});
 pi.registerTool?.({name:"asen_agent_status",label:"ASEN agent status",description:"List agent tasks belonging to the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,properties:{}},execute:async(_id,_params,_signal,_update,context)=>{
  const rows=await (await runtime()).list(await identity(context));
  return result(rows.map(({id,role,state,createdAt,updatedAt,summary})=>({id,role,state,createdAt,updatedAt,...(summary?{summary}:{})})));
 }});
 pi.registerTool?.({name:"asen_agent_cancel",label:"Cancel ASEN agent",description:"Cancel a queued or running task owned by the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id"],properties:{id:idSchema}},execute:async(_id,params,_signal,_update,context)=>{
  const taskId=(params as {id?:unknown})?.id;if(typeof taskId!=="string")throw new Error("Invalid agent task id");const active=await runtime();return result({id:taskId,cancelled:await active.cancel(taskId,await identity(context))});
 }});
 pi.registerTool?.({name:"asen_agent_continue",label:"Continue ASEN agent",description:"Resume a safe read-only task after confirming it belongs to the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id"],properties:{id:idSchema}},execute:async(_id,params,_signal,_update,context)=>{
  const taskId=(params as {id?:unknown})?.id;if(typeof taskId!=="string")throw new Error("Invalid agent task id");const session=await identity(context);
  if(context?.hasUI!==true||typeof context?.ui?.confirm!=="function"||!await context.ui.confirm("Continue agent task?","This starts a new read-only attempt for the saved task in this same session and project."))throw new Error("Explicit Pi UI confirmation is required to continue an agent task");
  const next=await (await runtime()).continue(taskId,session);return result({id:next,state:"queued",continuedFrom:taskId,role:"explorer"});
 }});
}
