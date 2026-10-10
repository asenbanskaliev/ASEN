import {randomUUID} from "node:crypto";
import {readFile,rename} from "node:fs/promises";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {applyTaskEvent,replayTask,type TaskEvent,type TaskState} from "./task-replay.js";

const SCHEMA="asen.todo/v1" as const,MAX_TASKS=2000,MAX_EVENTS=20000;
export interface TodoItem{taskId:string;title:string;events:TaskEvent[];}
export interface TodoFile{schema:typeof SCHEMA;revision:number;items:TodoItem[];}
export interface TodoContext{sessionId:string;projectId:string;}
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const identity=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=1024&&v===v.trim()&&v===v.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
function validItem(value:unknown):value is TodoItem{
 if(!exact(value,["taskId","title","events"])||!identity(value.taskId)||typeof value.title!=="string"||!value.title.trim()||value.title.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(value.title)||!Array.isArray(value.events)||value.events.length<1||value.events.length>MAX_EVENTS)return false;
 try{let state:TaskEvent|undefined;for(const event of value.events){if(event.taskId!==value.taskId) return false;state=applyTaskEvent(state,event);}return !!state;}catch{return false;}
}
export function parseTodoFile(raw:string):TodoFile{
 const value:unknown=JSON.parse(raw);if(!exact(value,["schema","revision","items"])||value.schema!==SCHEMA||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.items)||value.items.length>MAX_TASKS||!value.items.every(validItem))throw new Error("Invalid ASEN Todo store");
 const items=value.items as unknown as TodoItem[],ids=new Set<string>();for(const item of items){if(ids.has(item.taskId))throw new Error("Duplicate ASEN Todo task id");ids.add(item.taskId);}
 const count=items.reduce((total,item)=>total+item.events.length,0);if(count>MAX_EVENTS)throw new Error("ASEN Todo history exceeds its limit");
 return {schema:SCHEMA,revision:Number(value.revision),items:items.map(item=>structuredClone(item))};
}
async function read(file:string):Promise<TodoFile>{if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,items:[]};return parseTodoFile(await readFile(file,"utf8"));}
async function write(file:string,value:TodoFile){await preparePrivateFile(file,true);await atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}

/** Private, revisioned per-session TODO projection; ODD task mirrors remain a separate store. */
export class SessionTodoStore{
 private constructor(readonly path:string,private readonly now:()=>string,private readonly quarantined?:string){}
 static async open(path:string,now:()=>string=()=>new Date().toISOString()):Promise<SessionTodoStore>{
  await preparePrivateFile(path,true);let quarantined:string|undefined;
  try{await read(path);}catch(error){if(!(error instanceof SyntaxError)&&!(error instanceof Error&&["Invalid ASEN Todo store","Duplicate ASEN Todo task id","ASEN Todo history exceeds its limit"].includes(error.message)))throw error;quarantined=`${path}.corrupt-${Date.now()}-${randomUUID()}`;await rename(path,quarantined);}
  return new SessionTodoStore(path,now,quarantined);
 }
 diagnostics(){return this.quarantined?{quarantined:this.quarantined}:undefined;}
 async add(title:string,context:TodoContext):Promise<TodoItem>{
  if(typeof title!=="string"||!title.trim()||title!==title.trim()||title.length>2048||/[\u0000-\u001f\u007f-\u009f]/u.test(title)||!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN Todo task");
  const taskId=`todo-${randomUUID()}`,event:TaskEvent={taskId,sessionId:context.sessionId,projectId:context.projectId,revision:1,state:"planned",at:this.now()},item={taskId,title,events:[event]};
  await this.#mutate(data=>{data.items.push(item);});return structuredClone(item);
 }
 async update(taskId:string,context:TodoContext,expectedRevision:number,state:TaskState,reason?:string):Promise<TodoItem>{
  if(!identity(taskId)||!identity(context.sessionId)||!identity(context.projectId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw new Error("Invalid ASEN Todo update");let updated:TodoItem|undefined;
  await this.#mutate(data=>{const item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&x.events.at(-1)?.projectId===context.projectId);if(!item)throw new Error("Todo task is unavailable to this session or project");const current=replayTask(item.events);if(!current||current.revision!==expectedRevision)throw new Error("Todo revision conflict");const event:TaskEvent={taskId,sessionId:context.sessionId,projectId:context.projectId,revision:expectedRevision+1,state,at:this.now(),...(reason?{reason}:{})};const next=applyTaskEvent(current,event);item.events.push(next);updated=structuredClone(item);});return updated!;
 }
 async list(context:TodoContext):Promise<readonly (TodoItem&{current:TaskEvent})[]>{if(!identity(context.sessionId)||!identity(context.projectId))throw new Error("Invalid ASEN Todo session");const data=await read(this.path);return data.items.flatMap(item=>{const current=replayTask(item.events);return current&&current.sessionId===context.sessionId&&current.projectId===context.projectId?[{...structuredClone(item),current}]:[];});}
 async history(taskId:string,context:TodoContext):Promise<readonly TaskEvent[]>{const data=await read(this.path),item=data.items.find(x=>x.taskId===taskId&&x.events.at(-1)?.sessionId===context.sessionId&&x.events.at(-1)?.projectId===context.projectId);return item?item.events.map(event=>structuredClone(event)):[];}
 async recover(context:TodoContext,reason:"restart"|"shutdown"="restart"):Promise<void>{if(!identity(context.sessionId)||!identity(context.projectId)||!(reason==="restart"||reason==="shutdown"))throw new Error("Invalid ASEN Todo recovery session");await this.#mutate(data=>{for(const item of data.items){const current=replayTask(item.events);if(current?.state!=="running"||current.sessionId!==context.sessionId||current.projectId!==context.projectId)continue;const blocked:TaskEvent={taskId:item.taskId,sessionId:current.sessionId,projectId:current.projectId,revision:current.revision+1,state:"blocked",at:this.now(),reason:reason==="shutdown"?"Pi session ended while this task was running; explicit review is required before continuing":"ASEN restarted while this task was running; explicit review is required before continuing"};item.events.push(applyTaskEvent(current,blocked));}});}
 async #mutate(change:(data:TodoFile)=>void):Promise<void>{await preparePrivateFile(this.path,true);await withExclusiveFileLock(this.path,async()=>{const data=await read(this.path);change(data);if(data.items.length>MAX_TASKS||data.items.reduce((total,item)=>total+item.events.length,0)>MAX_EVENTS)throw new Error("ASEN Todo store has reached its history limit");const next=parseTodoFile(JSON.stringify({...data,revision:data.revision+1}));await write(this.path,next);});}
}
