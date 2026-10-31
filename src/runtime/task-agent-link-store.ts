import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

const SCHEMA="asen.task-agent-links/v1" as const;
export interface TaskAgentLink{taskId:string;agentId:string;sessionId:string;projectId:string;createdAt:string;}
interface Journal{schema:typeof SCHEMA;revision:number;links:TaskAgentLink[];}
const valid=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=1024&&s===s.trim()&&s===s.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(s);
function parse(raw:string):Journal{
 const data:unknown=JSON.parse(raw);
 if(!data||typeof data!=="object"||Array.isArray(data)||Object.getPrototypeOf(data)!==Object.prototype)throw new Error("Invalid ASEN task-agent links");
 const d=data as Record<string,unknown>;
 if(Object.keys(d).sort().join(",")!=="links,revision,schema"||d.schema!==SCHEMA||!Number.isSafeInteger(d.revision)||Number(d.revision)<0||!Array.isArray(d.links)||d.links.length>20000||d.revision!==d.links.length)throw new Error("Invalid ASEN task-agent links");
 const seen=new Set<string>();
 for(const value of d.links){
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("Invalid ASEN task-agent link");
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(",")!=="agentId,createdAt,projectId,sessionId,taskId"||![v.taskId,v.agentId,v.sessionId,v.projectId].every(valid)||typeof v.createdAt!=="string"||!Number.isFinite(Date.parse(v.createdAt))||new Date(v.createdAt).toISOString()!==v.createdAt||seen.has(v.agentId as string))throw new Error("Invalid ASEN task-agent link");
  seen.add(v.agentId as string);
 }
 return structuredClone(d) as unknown as Journal;
}
async function load(file:string):Promise<Journal>{if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,links:[]};return parse(await readFile(file,"utf8"));}
/** An audit-only binding. Writing a link cannot start or authorize any agent. */
export class TaskAgentLinkStore{
 constructor(readonly file:string){if(!isAbsolute(file))throw new Error("ASEN task-agent link path must be absolute");}
 async bind(link:TaskAgentLink):Promise<TaskAgentLink>{
  return withExclusiveFileLock(this.file,async()=>{
   const journal=await load(this.file);
   if(!valid(link.taskId)||!valid(link.agentId)||!valid(link.sessionId)||!valid(link.projectId)||typeof link.createdAt!=="string"||!Number.isFinite(Date.parse(link.createdAt))||new Date(link.createdAt).toISOString()!==link.createdAt)throw new Error("Invalid ASEN task-agent link");
   const previous=journal.links.find(x=>x.agentId===link.agentId);
   if(previous){
    if(previous.taskId!==link.taskId||previous.sessionId!==link.sessionId||!sameWorkspaceIdentityPath(previous.projectId,link.projectId))throw new Error("Agent is already linked to another task or identity");
    return structuredClone(previous);
   }
   journal.links.push(structuredClone(link));journal.revision++;
   await preparePrivateFile(this.file,true);await atomicWriteText(this.file,JSON.stringify(journal));
   return structuredClone(link);
  });
 }
 async list(identity:{sessionId:string;projectId:string}):Promise<TaskAgentLink[]>{
  if(!valid(identity.sessionId)||!valid(identity.projectId))throw new Error("Invalid ASEN task-agent identity");
  const journal=await load(this.file);
  return journal.links.filter(x=>x.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(x.projectId,identity.projectId)).map(x=>structuredClone(x));
 }
}
