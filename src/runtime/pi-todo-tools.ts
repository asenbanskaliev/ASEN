import {realpath} from "node:fs/promises";
import {isAbsolute,resolve} from "node:path";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {TaskState} from "./task-replay.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TodoContext} from "./todo-store.js";

const id={type:"string",minLength:1,maxLength:1024},title={type:"string",minLength:1,maxLength:2048},states=["planned","running","blocked","done","cancelled"];
function cancelled():Error{const error=new Error("Todo update cancelled");error.name="AbortError";return error;}
function throwIfCancelled(signal?:AbortSignal):void{if(signal?.aborted)throw cancelled();}
async function confirmWithAbort(confirm:(signal?:AbortSignal)=>Promise<boolean>,signal?:AbortSignal):Promise<boolean>{
 throwIfCancelled(signal);if(!signal)return confirm();let onAbort!:()=>void;
 const aborted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(cancelled());signal.addEventListener("abort",onAbort,{once:true});if(signal.aborted)onAbort();});
 try{const result=await Promise.race([Promise.resolve().then(()=>confirm(signal)),aborted]);throwIfCancelled(signal);return result;}finally{signal.removeEventListener("abort",onAbort);}
}
async function contextOf(context:any):Promise<TodoContext>{const sessionId=context?.sessionManager?.getSessionId?.(),cwd=context?.cwd;if(typeof sessionId!=="string"||!sessionId||typeof cwd!=="string"||!isAbsolute(cwd))throw new Error("ASEN Todo requires the active Pi session and project");return {sessionId,projectId:await realpath(resolve(cwd))};}
async function bindContext(host:any){
 const manager=host?.sessionManager,sessionId=manager?.getSessionId?.(),cwd=host?.cwd;
 const validate=()=>{if(host.sessionManager!==manager||manager.getSessionId()!==sessionId||host.cwd!==cwd)throw new Error("Todo session changed before persistence or delivery");};
 const context=await contextOf(host);validate();return {context,validate};
}
const output=(details:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(details)}],details});
export const ASEN_TODO_TOOL_NAMES=Object.freeze(["asen_todo_add","asen_todo_update","asen_todo_list"] as const);
export function registerTodoTools(pi:{registerTool?:(tool:ToolDefinition<any>)=>void},store:()=>Promise<SessionTodoStore>):void{
 pi.registerTool?.({name:"asen_todo_add",label:"Add ASEN Todo",description:"Add a task to the private Todo list for the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["title"],properties:{title}},execute:async(_id,params,signal,_update,host)=>{throwIfCancelled(signal);const value=(params as {title?:unknown}).title;if(typeof value!=="string")throw new Error("Invalid Todo title");const binding=await bindContext(host),active=await store();binding.validate();return output(await active.add(value,binding.context,signal,binding.validate));}});
 pi.registerTool?.({name:"asen_todo_update",label:"Update ASEN Todo",description:"Move a current-session Todo task through a valid state transition using its expected revision. Resuming a task blocked by restart requires explicit Pi UI confirmation.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id","revision","state"],properties:{id,revision:{type:"integer",minimum:1},state:{type:"string",enum:states},reason:{type:"string",maxLength:8192}}},execute:async(_id,params,signal,_update,host)=>{throwIfCancelled(signal);const value=params as {id?:unknown;revision?:unknown;state?:unknown;reason?:unknown};if(typeof value.id!=="string"||typeof value.revision!=="number"||typeof value.state!=="string"||!(states as string[]).includes(value.state))throw new Error("Invalid Todo update");if(value.reason!==undefined&&typeof value.reason!=="string")throw new Error("Invalid Todo reason");const binding=await bindContext(host),active=await store(),context=binding.context;binding.validate();throwIfCancelled(signal);let confirmedBlockedResume=false;if(value.state==="running"){
   const item=(await active.list(context)).find(candidate=>candidate.taskId===value.id),current=item?.current;
   if(current?.state==="blocked"){
    if(current.revision!==value.revision)throw new Error("Todo revision conflict");
    const title=(item?.title??"blocked task").slice(0,240),reason=(current.reason??"explicit review is required").slice(0,500);
    if(host?.hasUI!==true||typeof host?.ui?.confirm!=="function"||await confirmWithAbort(dialogSignal=>host.ui.confirm("Resume blocked ASEN task?",`${title}\n${reason}\nContinue this task in the current session and project?`,dialogSignal?{signal:dialogSignal}:undefined),signal)!==true)throw new Error("Explicit Pi UI confirmation is required to resume a blocked Todo task");confirmedBlockedResume=true;
   }
  }throwIfCancelled(signal);const currentContext=await contextOf(host);if(currentContext.sessionId!==context.sessionId||currentContext.projectId!==context.projectId)throw new Error("Todo session changed before update");return output(await active.update(value.id,context,value.revision,value.state as TaskState,confirmedBlockedResume?"User confirmed blocked-task resume in Pi UI":value.reason as string|undefined,signal,binding.validate));}});
 pi.registerTool?.({name:"asen_todo_list",label:"List ASEN Todos",description:"List Todo tasks belonging to the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,properties:{}},execute:async(_id,_params,signal,_update,host)=>{throwIfCancelled(signal);const binding=await bindContext(host),active=await store();binding.validate();const rows=await active.list(binding.context);throwIfCancelled(signal);binding.validate();return output(rows);}});
}
