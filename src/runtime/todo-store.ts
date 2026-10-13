import {randomUUID} from "node:crypto";
import {readFile,rename} from "node:fs/promises";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";
import {applyTaskEvent,replayTask,type TaskEvent,type TaskState} from "./task-replay.js";
import type {SkillPhase,SkillSelectionContext} from "../skills/registry.js";

const SCHEMA="asen.todo/v1" as const,MAX_TASKS=2000,MAX_EVENTS=20000;
export type TodoPlanRole="primary"|"explorer"|"worker"|"reviewer"|"verifier"|"clarifier";
export interface TodoPlanMetadata{role:TodoPlanRole;skillPaths:string[];skillSelection?:SkillSelectionContext;priority?:number;}
export interface TodoItem{taskId:string;title:string;events:TaskEvent[];requestId?:string;dependsOn?:string[];description?:string;plan?:TodoPlanMetadata;}
export interface TodoFile{schema:typeof SCHEMA;revision:number;items:TodoItem[];}
export interface TodoContext{sessionId:string;projectId:string;}
function throwIfCancelled(signal?:AbortSignal):void{if(signal?.aborted){const error=new Error("Todo update cancelled");error.name="AbortError";throw error;}}
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const identity=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=1024&&v===v.trim()&&v===v.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
function validPlan(value:unknown):value is TodoPlanMetadata{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const hasSelection=Object.hasOwn(value,"skillSelection"),hasPriority=Object.hasOwn(value,"priority"),keys=["role","skillPaths",...(hasSelection?["skillSelection"]:[]),...(hasPriority?["priority"]:[])];
 if(!exact(value,keys)||!(["primary","explorer","worker","reviewer","verifier","clarifier"] as unknown[]).includes(value.role)||!Array.isArray(value.skillPaths)||value.skillPaths.some(p=>typeof p!=="string"||!/^skills\/asen-[a-z-]+\/SKILL\.md$/u.test(p))||new Set(value.skillPaths).size!==value.skillPaths.length)return false;
 if(hasPriority&&(!Number.isSafeInteger(value.priority)||Number(value.priority)<1||Number(value.priority)>100))return false;
 if(!hasSelection)return value.role==="primary"||value.role==="clarifier";
 const selectionRaw=value.skillSelection;if(!selectionRaw||typeof selectionRaw!=="object"||Array.isArray(selectionRaw)||Object.getPrototypeOf(selectionRaw)!==Object.prototype)return false;const selection=selectionRaw as SkillSelectionContext,role=value.role as TodoPlanRole;
 const allowed=["phase","defect","codeChange","behaviorChange","risk","filesTouched","verification"],selectionKeys=Object.keys(selectionRaw);
 if(selectionKeys.some(key=>!allowed.includes(key))||!Object.hasOwn(selection,"phase")||!(["status","context-init","explore","proposal","specification","design","tasks","apply","verify","archive","skill-registry","adversarial-review","skill-authoring","skill-audit","defect","go-testing","delivery-branch","delivery-chain","issue","docs","collaboration-message"] as unknown[]).includes(selection.phase))return false;
 for(const key of ["defect","codeChange","behaviorChange","verification"])if(key in selection&&typeof (selection as Record<string,unknown>)[key]!=="boolean")return false;
 if("risk" in selection&&!(["low","medium","high","unknown"] as unknown[]).includes((selection as Record<string,unknown>).risk))return false;
 if("filesTouched" in selection&&(!Number.isSafeInteger((selection as Record<string,unknown>).filesTouched)||Number((selection as Record<string,unknown>).filesTouched)<0))return false;
 const expectedPhase:Partial<Record<TodoPlanRole,SkillPhase>>={explorer:"explore",worker:"apply",reviewer:"adversarial-review",verifier:"verify"};
 if(role==="clarifier"||expectedPhase[role]!==undefined&&expectedPhase[role]!==selection.phase)return false;
 return true;
}
function validItem(value:unknown):value is TodoItem{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const optionalKeys=["requestId","dependsOn","description","plan"],keys=["taskId","title","events",...optionalKeys.filter(key=>Object.hasOwn(value,key))];
 if(!exact(value,keys)||!identity(value.taskId)||("requestId" in value&&!identity(value.requestId))||("plan" in value&&(!validPlan(value.plan)||typeof value.requestId!=="string"||!value.requestId.startsWith("asen-plan:")))||("dependsOn" in value&&(!Array.isArray(value.dependsOn)||value.dependsOn.some(id=>!identity(id))||new Set(value.dependsOn).size!==value.dependsOn.length||value.dependsOn.includes(value.taskId)))||("description" in value&&(typeof value.description!=="string"||!value.description.trim()||value.description.length>8192||value.description!==value.description.trim()||/[\u0000-\u001f\u007f-\u009f]/u.test(value.description)))||typeof value.title!=="string"||!value.title.trim()||value.title.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(value.title)||!Array.isArray(value.events)||value.events.length<1||value.events.length>MAX_EVENTS)return false;
 try{let state:TaskEvent|undefined;for(const event of value.events){if(event.taskId!==value.taskId) return false;state=applyTaskEvent(state,event);}return !!state;}catch{return false;}
}
export function parseTodoFile(raw:string):TodoFile{
 const value:unknown=JSON.parse(raw);if(!exact(value,["schema","revision","items"])||value.schema!==SCHEMA||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.items)||value.items.length>MAX_TASKS||!value.items.every(validItem))throw new Error("Invalid ASEN Todo store");
 const items=value.items as unknown as TodoItem[],ids=new Set<string>(),byId=new Map<string,TodoItem>();for(const item of items){if(ids.has(item.taskId))throw new Error("Duplicate ASEN Todo task id");ids.add(item.taskId);byId.set(item.taskId,item);}
 const visiting=new Set<string>(),visited=new Set<string>();const visit=(item:TodoItem)=>{if(visiting.has(item.taskId))throw new Error("Todo dependency cycle");if(visited.has(item.taskId))return;visiting.add(item.taskId);for(const id of item.dependsOn??[]){const dependency=byId.get(id);if(!dependency||dependency.events[0]?.sessionId!==item.events[0]?.sessionId||!sameWorkspaceIdentityPath(dependency.events[0]!.projectId,item.events[0]!.projectId))throw new Error("Todo dependency identity mismatch");visit(dependency);}visiting.delete(item.taskId);visited.add(item.taskId);};for(const item of items)visit(item);
 const count=items.reduce((total,item)=>total+item.events.length,0);if(count>MAX_EVENTS)throw new Error("ASEN Todo history exceeds its limit");
 return {schema:SCHEMA,revision:Number(value.revision),items:items.map(item=>structuredClone(item))};
}
async function read(file:string):Promise<TodoFile>{if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,items:[]};return parseTodoFile(await readFile(file,"utf8"));}
async function write(file:string,value:TodoFile){await preparePrivateFile(file,true);await atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}

function isCorruptTodoError(error:unknown):boolean{return error instanceof SyntaxError||error instanceof Error&&["Invalid ASEN Todo store","Duplicate ASEN Todo task id","ASEN Todo dependency cycle","Todo dependency identity mismatch","ASEN Todo history exceeds its limit"].includes(error.message);}

/** Private, revisioned per-session TODO projection; ODD task mirrors remain a separate store. */
export class SessionTodoStore{
 private constructor(readonly path:string,private readonly now:()=>string,private readonly quarantined?:string){}
 static async open(path:string,now:()=>string=()=>new Date().toISOString()):Promise<SessionTodoStore>{
  await preparePrivateFile(path,true);let quarantined:string|undefined;
  try{await read(path);}catch(error){
   if(!isCorruptTodoError(error))throw error;
   await withExclusiveFileLock(path,async()=>{
    // Another startup or writer may have already recovered the observed bad file.
    try{await read(path);}catch(currentError){
     if(!isCorruptTodoError(currentError))throw currentError;
     quarantined=`${path}.corrupt-${Date.now()}-${randomUUID()}`;await rename(path,quarantined);
    }
   });
  }
  return new SessionTodoStore(path,now,quarantined);
 }
 diagnostics(){return this.quarantined?{quarantined:this.quarantined}:undefined;}
 async add(title:string,context:TodoContext,signal?:AbortSignal,validateContext?:()=>void,requestId?:string,dependsOn:readonly string[]=[],description?:string,plan?:TodoPlanMetadata):Promise<TodoItem>{
  throwIfCancelled(signal);
  if(typeof title!=="string"||!title.trim()||title!==title.trim()||title.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(title)||!identity(context.sessionId)||!identity(context.projectId)||(requestId!==undefined&&!identity(requestId))||!Array.isArray(dependsOn)||dependsOn.some(id=>!identity(id))||new Set(dependsOn).size!==dependsOn.length||(description!==undefined&&(typeof description!=="string"||!description||description!==description.trim()||description.length>8192||/[\u0000-\u001f\u007f-\u009f]/u.test(description)))||(plan!==undefined&&!validPlan(plan))||(plan!==undefined&&(requestId===undefined||!requestId.startsWith("asen-plan:"))))throw new Error("Invalid ASEN Todo task");
  const taskId=`todo-${randomUUID()}`,event:TaskEvent={taskId,sessionId:context.sessionId,projectId:context.projectId,revision:1,state:"planned",at:this.now()},item:TodoItem={taskId,title,events:[event],...(requestId?{requestId}:{}),...(dependsOn.length?{dependsOn:[...dependsOn]}:{}),...(description?{description}:{}),...(plan?{plan:structuredClone(plan)}:{})};let result:TodoItem|undefined;
  await this.#mutate(data=>{validateContext?.();
   if(requestId){const existing=data.items.find(candidate=>candidate.requestId===requestId);if(existing){const owner=existing.events[0];if(owner?.sessionId!==context.sessionId||!sameWorkspaceIdentityPath(owner.projectId,context.projectId))throw new Error("Todo request id belongs to another session or project");if(existing.title!==title||JSON.stringify(existing.dependsOn??[])!==JSON.stringify(dependsOn)||existing.description!==description||JSON.stringify(existing.plan??null)!==JSON.stringify(plan??null))throw new Error("Todo request id conflicts with the existing task");result=structuredClone(existing);return false;}}
   for(const dependency of dependsOn){const prerequisite=data.items.find(candidate=>candidate.taskId===dependency&&candidate.events[0]?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(candidate.events[0]!.projectId,context.projectId));if(!prerequisite)throw new Error("Todo dependency must belong to the current session and project");if(dependency===taskId)throw new Error("Todo dependency cycle rejected");}
   data.items.push(item);result=item;return true;
  },signal);return structuredClone(result!);
 }
 async update(taskId:string,context:TodoContext,expectedRevision:number,state:TaskState,reason?:string,signal?:AbortSignal,validateContext?:()=>void):Promise<TodoItem>{
  if(!identity(taskId)||!identity(context.sessionId)||!identity(context.projectId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw new Error("Invalid ASEN Todo update");let updated:TodoItem|undefined;
  await this.#mutate(data=>{validateContext?.();const item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(x.events.at(-1)!.projectId,context.projectId));if(!item)throw new Error("Todo task is unavailable to this session or project");const current=replayTask(item.events);if(!current||current.revision!==expectedRevision)throw new Error("Todo revision conflict");if(state==="running")for(const dependency of item.dependsOn??[]){const prerequisite=data.items.find(candidate=>candidate.taskId===dependency&&candidate.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(candidate.events.at(-1)!.projectId,context.projectId)),prerequisiteState=prerequisite&&replayTask(prerequisite.events);if(prerequisiteState?.state!=="done")throw new Error("Todo dependencies must be verified done before this task can run");}const event:TaskEvent={taskId,sessionId:context.sessionId,projectId:current.projectId,revision:expectedRevision+1,state,at:this.now(),...(reason?{reason}:{})};const next=applyTaskEvent(current,event);item.events.push(next);updated=structuredClone(item);},signal);return updated!;
 }
 /** Serialize an agent launch claim with Todo updates. `launch` runs synchronously
  * after the durable running event and before the Todo lock is released. */
 async withAgentLaunch(taskId:string,context:TodoContext,prepare:()=>Promise<void>,launch:()=>void):Promise<void>{
  if(!identity(taskId)||!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN agent launch identity");
  await preparePrivateFile(this.path,true);
  await withExclusiveFileLock(this.path,async()=>{
   const data=await read(this.path),item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(x.events.at(-1)!.projectId,context.projectId));
   if(!item)throw new Error("Todo task is unavailable to this session or project");
   const current=replayTask(item.events);
   if(!current||!(current.state==="planned"||current.state==="running"))throw new Error("Todo must remain active before agent launch");
   for(const dependency of item.dependsOn??[]){const prerequisite=data.items.find(candidate=>candidate.taskId===dependency&&candidate.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(candidate.events.at(-1)!.projectId,context.projectId)),prerequisiteState=prerequisite&&replayTask(prerequisite.events);if(prerequisiteState?.state!=="done")throw new Error("Todo dependencies must be verified done before agent launch");}
   await prepare();
   const transitionedToRunning=current.state==="planned";
   if(transitionedToRunning){
    const event:TaskEvent={taskId,sessionId:context.sessionId,projectId:current.projectId,revision:current.revision+1,state:"running",at:this.now(),reason:"Agent launch claimed before dispatch"};
    item.events.push(applyTaskEvent(current,event));
    if(data.items.reduce((total,candidate)=>total+candidate.events.length,0)>MAX_EVENTS)throw new Error("ASEN Todo store has reached its history limit");
    const next=parseTodoFile(JSON.stringify({...data,revision:data.revision+1}));
    await write(this.path,next);
   }
   try{launch();}catch(error){
    if(transitionedToRunning){
     const running=item.events.at(-1)!;
     const blocked:TaskEvent={taskId,sessionId:context.sessionId,projectId:running.projectId,revision:running.revision+1,state:"blocked",at:this.now(),reason:"Agent launch was interrupted before dispatch"};
     item.events.push(applyTaskEvent(running,blocked));
     try{await write(this.path,parseTodoFile(JSON.stringify({...data,revision:data.revision+2})));}catch{/* Startup recovery will fail closed if the launch claim cannot be reconciled. */}
    }
    throw error;
   }
  },30000);
 }
 async list(context:TodoContext):Promise<readonly (TodoItem&{current:TaskEvent})[]>{if(!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN Todo session");const data=await read(this.path);return data.items.flatMap(item=>{const current=replayTask(item.events);return current&&current.sessionId===context.sessionId&&sameWorkspaceIdentityPath(current.projectId,context.projectId)?[{...structuredClone(item),current}]:[];});}
 async history(taskId:string,context:TodoContext):Promise<readonly TaskEvent[]>{const data=await read(this.path),item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&sameWorkspaceIdentityPath(x.events.at(-1)!.projectId,context.projectId));return item?item.events.map(event=>structuredClone(event)):[];}
 async recover(context:TodoContext,reason:"restart"|"shutdown"="restart"):Promise<void>{if(!identity(context.sessionId)||!identity(context.projectId)||!(reason==="restart"||reason==="shutdown"))throw new Error("Invalid ASEN Todo recovery session");await this.#mutate(data=>{for(const item of data.items){const current=replayTask(item.events);if(current?.state!=="running"||current.sessionId!==context.sessionId||!sameWorkspaceIdentityPath(current.projectId,context.projectId))continue;const blocked:TaskEvent={taskId:item.taskId,sessionId:current.sessionId,projectId:current.projectId,revision:current.revision+1,state:"blocked",at:this.now(),reason:reason==="shutdown"?"Pi session ended while this task was running; explicit review is required before continuing":"ASEN restarted while this task was running; explicit review is required before continuing"};item.events.push(applyTaskEvent(current,blocked));}});}
 async #mutate(change:(data:TodoFile)=>void|boolean,signal?:AbortSignal):Promise<void>{
  throwIfCancelled(signal);await preparePrivateFile(this.path,true);throwIfCancelled(signal);
  try{await withExclusiveFileLock(this.path,async()=>{throwIfCancelled(signal);const data=await read(this.path);throwIfCancelled(signal);if(change(data)===false)return;if(data.items.length>MAX_TASKS||data.items.reduce((total,item)=>total+item.events.length,0)>MAX_EVENTS)throw new Error("ASEN Todo store has reached its history limit");const next=parseTodoFile(JSON.stringify({...data,revision:data.revision+1}));throwIfCancelled(signal);
   // Cancellation is deferred once the atomic transaction starts, so it can commit at rename or fail without a partial destination.
   await write(this.path,next);
  },30000,signal);}
  catch(error){throwIfCancelled(signal);throw error;}
 }
}
