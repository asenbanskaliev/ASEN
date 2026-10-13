import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {applyTaskEvent,recoverInterruptedTask,replayTask,type TaskEvent} from "./task-replay.js";

const SCHEMA="asen.tasks/v1" as const;
interface TaskJournal {schema:typeof SCHEMA;revision:number;events:TaskEvent[]}
function parse(raw:string):TaskJournal{
 const data:unknown=JSON.parse(raw);
 if(!data||typeof data!=="object"||Array.isArray(data)||Object.getPrototypeOf(data)!==Object.prototype)throw new Error("Invalid ASEN task journal");
 const value=data as Record<string,unknown>;
 if(Object.keys(value).sort().join(",")!=="events,revision,schema"||value.schema!==SCHEMA||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.events)||value.events.length>20000)throw new Error("Invalid ASEN task journal");
 const events=value.events as TaskEvent[];
 const states=new Map<string,TaskEvent>();
 const identities=new Map<string,string>();
 for(const event of events){
  const key=JSON.stringify([event.taskId,event.sessionId,event.projectId]);
  const existing=identities.get(event.taskId);
  if(existing!==undefined&&existing!==key)throw new Error("Task identity belongs to multiple sessions or projects");
  identities.set(event.taskId,key);
  const state=applyTaskEvent(states.get(key),event);
  states.set(key,state);
 }
 if(value.revision!==events.length)throw new Error("ASEN task journal revision mismatch");
 return {schema:SCHEMA,revision:events.length,events:structuredClone(events)};
}
const empty=():TaskJournal=>({schema:SCHEMA,revision:0,events:[]});
async function load(file:string):Promise<TaskJournal>{
 try{return parse(await readFile(file,"utf8"));}
 catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return empty();throw error;}
}
export class PersistentTaskStore{
 constructor(private readonly file:string){if(typeof file!=="string"||!isAbsolute(file))throw new Error("ASEN task journal requires an absolute file path");}
 async append(event:TaskEvent):Promise<TaskEvent>{
  return withExclusiveFileLock(this.file,async()=>{
   const journal=await load(this.file);
   const matching=journal.events.filter(e=>e.taskId===event.taskId&&e.sessionId===event.sessionId&&e.projectId===event.projectId);
   if(matching.length===0&&journal.events.some(e=>e.taskId===event.taskId))throw new Error("Task identity already belongs to another session or project");
   const next=applyTaskEvent(replayTask(matching),event);
   journal.events.push(next);journal.revision++;
   await atomicWriteText(this.file,JSON.stringify(journal));
   return next;
  });
 }
 async history(taskId:string,sessionId:string,projectId:string):Promise<TaskEvent[]>{
  const journal=await load(this.file);
  return journal.events.filter(e=>e.taskId===taskId&&e.sessionId===sessionId&&e.projectId===projectId).map(e=>structuredClone(e));
 }
 async recover(taskId:string,sessionId:string,projectId:string,at:string):Promise<TaskEvent|undefined>{
  return withExclusiveFileLock(this.file,async()=>{
   const journal=await load(this.file);
   const events=journal.events.filter(e=>e.taskId===taskId&&e.sessionId===sessionId&&e.projectId===projectId);
   if(events.length===0&&journal.events.some(e=>e.taskId===taskId))return undefined;
   const result=recoverInterruptedTask(events,at);
   if(!result.recoveryEvent)return result.state;
   journal.events.push(result.recoveryEvent);journal.revision++;
   await atomicWriteText(this.file,JSON.stringify(journal));
   return result.state;
  });
 }
}
