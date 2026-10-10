import {realpath} from "node:fs/promises";
import {resolve} from "node:path";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {TaskState} from "./task-replay.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TodoContext} from "./todo-store.js";

const id={type:"string",minLength:1,maxLength:1024},title={type:"string",minLength:1,maxLength:2048},states=["planned","running","blocked","done","cancelled"];
async function contextOf(context:any):Promise<TodoContext>{const sessionId=context?.sessionManager?.getSessionId?.(),cwd=context?.cwd;if(typeof sessionId!=="string"||!sessionId||typeof cwd!=="string")throw new Error("ASEN Todo requires the active Pi session and project");return {sessionId,projectId:await realpath(resolve(cwd))};}
const output=(details:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(details)}],details});
export const ASEN_TODO_TOOL_NAMES=Object.freeze(["asen_todo_add","asen_todo_update","asen_todo_list"] as const);
export function registerTodoTools(pi:{registerTool?:(tool:ToolDefinition<any>)=>void},store:()=>Promise<SessionTodoStore>):void{
 pi.registerTool?.({name:"asen_todo_add",label:"Add ASEN Todo",description:"Add a task to the private Todo list for the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["title"],properties:{title}},execute:async(_id,params,_signal,_update,host)=>{const value=(params as {title?:unknown}).title;if(typeof value!=="string")throw new Error("Invalid Todo title");return output(await (await store()).add(value,await contextOf(host)));}});
 pi.registerTool?.({name:"asen_todo_update",label:"Update ASEN Todo",description:"Move a current-session Todo task through a valid state transition using its expected revision.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id","revision","state"],properties:{id,revision:{type:"integer",minimum:1},state:{type:"string",enum:states},reason:{type:"string",maxLength:8192}}},execute:async(_id,params,_signal,_update,host)=>{const value=params as {id?:unknown;revision?:unknown;state?:unknown;reason?:unknown};if(typeof value.id!=="string"||typeof value.revision!=="number"||typeof value.state!=="string"||!(states as string[]).includes(value.state))throw new Error("Invalid Todo update");if(value.reason!==undefined&&typeof value.reason!=="string")throw new Error("Invalid Todo reason");return output(await (await store()).update(value.id,await contextOf(host),value.revision,value.state as TaskState,value.reason as string|undefined));}});
 pi.registerTool?.({name:"asen_todo_list",label:"List ASEN Todos",description:"List Todo tasks belonging to the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,properties:{}},execute:async(_id,_params,_signal,_update,host)=>output(await (await store()).list(await contextOf(host)))});
}
