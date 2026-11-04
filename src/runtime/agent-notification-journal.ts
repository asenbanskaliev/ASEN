import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {sameWorkspaceIdentityPath,workspaceIdentityPathKey} from "./workspace-store.js";

/** A durable *enqueue* ledger, deliberately not a Pi-consumption receipt.
 * "attempted" is an uncertain crash or transport boundary: never auto-replay it.
 */
export type AgentNoticeDelivery="pending"|"attempted"|"enqueued"|"acknowledged";
export type AgentNoticeTerminalState="completed"|"failed"|"cancelled";
export interface AgentNoticeScope{sessionId:string;projectId:string;}
export interface AgentNoticeSubject extends AgentNoticeScope{id:string;state:string;}
export interface AgentNoticeRow extends AgentNoticeScope{
 readonly eventId:string;readonly agentId:string;readonly state:AgentNoticeTerminalState;
 readonly delivery:AgentNoticeDelivery;readonly createdAt:string;readonly updatedAt:string;
}
interface File{schema:"asen.agent-notices/v1";revision:number;entries:AgentNoticeRow[];}
const MAX_ENTRIES=20000;
const terminal=new Set(["completed","failed","cancelled"]);
const modes=new Set(["pending","attempted","enqueued","acknowledged"]);
const valid=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=1024&&s===s.trim()&&s===s.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s);
const validDate=(s:unknown):s is string=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const keys=(v:unknown,wanted:readonly string[])=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join("|")===([...wanted].sort().join("|"));
function validateSubject(value:AgentNoticeSubject):void{
 if(!value||!valid(value.id)||!valid(value.sessionId)||!valid(value.projectId)||!terminal.has(value.state))throw new Error("Invalid terminal agent notice identity");
}
export function agentNoticeEventId(value:AgentNoticeSubject):string{
 validateSubject(value);
 // Include the complete scope so identical task ids from two sessions cannot alias.
 const hash=createHash("sha256").update(JSON.stringify([value.id,value.sessionId,value.projectId,value.state])).digest("hex");
 return `asen:agent:${hash}:terminal`;
}
function parse(raw:string):File{
 const d:unknown=JSON.parse(raw);
 if(!keys(d,["schema","revision","entries"]))throw new Error("Invalid ASEN agent notice journal");
 const o=d as File;
 if(o.schema!=="asen.agent-notices/v1"||!Number.isSafeInteger(o.revision)||o.revision<0||!Array.isArray(o.entries)||o.entries.length>MAX_ENTRIES)throw new Error("Invalid ASEN agent notice journal");
 const seen=new Set<string>();
 // One terminal outcome per agent in an owned session/project. A different
 // terminal state must never create a second independent delivery identity.
 const terminalOwners=new Set<string>();
 for(const e of o.entries){
  if(!keys(e,["eventId","agentId","sessionId","projectId","state","delivery","createdAt","updatedAt"])||
     !valid(e.agentId)||!valid(e.sessionId)||!valid(e.projectId)||!terminal.has(e.state)||!modes.has(e.delivery)||
     !validDate(e.createdAt)||!validDate(e.updatedAt)||e.updatedAt<e.createdAt||e.eventId!==agentNoticeEventId({id:e.agentId,sessionId:e.sessionId,projectId:e.projectId,state:e.state})||seen.has(e.eventId))
   throw new Error("Invalid ASEN agent notice journal");
  const terminalOwner=JSON.stringify([e.agentId,e.sessionId,workspaceIdentityPathKey(e.projectId)]);
  if(terminalOwners.has(terminalOwner))throw new Error("Invalid ASEN agent notice journal: conflicting terminal outcomes");
  terminalOwners.add(terminalOwner);
  seen.add(e.eventId);
 }
 return structuredClone(o);
}
const empty=():File=>({schema:"asen.agent-notices/v1",revision:0,entries:[]});
async function read(path:string):Promise<File>{
 if(!await preparePrivateFile(path))return empty();
 return parse(await readFile(path,"utf8"));
}
async function write(path:string,data:File):Promise<void>{
 await preparePrivateFile(path,true);
 await atomicWriteText(path,JSON.stringify(data)+"\n");
}
function sameScope(row:AgentNoticeRow,scope:AgentNoticeScope):boolean{
 return row.sessionId===scope.sessionId&&sameWorkspaceIdentityPath(row.projectId,scope.projectId);
}
export class AgentNotificationJournal{
 constructor(readonly path:string){if(!isAbsolute(path))throw new Error("Agent notice journal path must be absolute");}
 async #change<T>(transaction:(file:File)=>{result:T;changed:boolean}):Promise<T>{
  // Lock across multiple independent Pi processes; never rewrite a newer row.
  await preparePrivateFile(this.path,true);
  return withExclusiveFileLock(this.path,async()=>{
   const file=await read(this.path),value=transaction(file);
   if(value.changed){file.revision++;await write(this.path,file);}
   return value.result;
  });
 }
 /** Record a verified terminal observation before trying the Pi transport. */
 async record(subject:AgentNoticeSubject):Promise<AgentNoticeRow>{
  const eventId=agentNoticeEventId(subject);
  return this.#change(file=>{
   // Existing versions keyed events to the literal project path. Reuse the
   // durable event for an equivalent owned workspace (notably Windows path
   // casing/8.3 aliases) without rewriting old event ids or replaying a send.
   const existing=file.entries.find(x=>x.eventId===eventId||
    (x.agentId===subject.id&&x.state===subject.state&&sameScope(x,subject)));
   if(existing)return{result:structuredClone(existing),changed:false};
   if(file.entries.some(x=>x.agentId===subject.id&&sameScope(x,subject)))
    throw new Error("Conflicting terminal outcome for owned agent; refusing duplicate notification");
   if(file.entries.length===MAX_ENTRIES)throw new Error("Agent notice journal capacity exceeded");
   const now=new Date().toISOString(),row:AgentNoticeRow={
    eventId,agentId:subject.id,sessionId:subject.sessionId,projectId:subject.projectId,
    state:subject.state as AgentNoticeTerminalState,delivery:"pending",createdAt:now,updatedAt:now,
   };
   file.entries.push(row);return{result:structuredClone(row),changed:true};
  });
 }
 /** Claim before sendMessage: a crash or a throw cannot trigger a silent replay. */
 async claim(eventId:string,scope:AgentNoticeScope):Promise<boolean>{
  if(!valid(eventId)||!valid(scope.sessionId)||!valid(scope.projectId))throw new Error("Invalid agent notice claim");
  return this.#change(file=>{
   const row=file.entries.find(x=>x.eventId===eventId);
   if(!row||!sameScope(row,scope))throw new Error("Agent notice is unavailable in this session and project");
   if(row.delivery!=="pending")return{result:false,changed:false};
   (row as {delivery:AgentNoticeDelivery}).delivery="attempted";
   (row as {updatedAt:string}).updatedAt=new Date().toISOString();
   return{result:true,changed:true};
  });
 }
 /** Pi accepted an enqueue call; NOT proof of display, reading or consumption. */
 async markEnqueued(eventId:string,scope:AgentNoticeScope):Promise<boolean>{
  if(!valid(eventId)||!valid(scope.sessionId)||!valid(scope.projectId))throw new Error("Invalid agent notice delivery");
  return this.#change(file=>{
   const row=file.entries.find(x=>x.eventId===eventId);
   if(!row||!sameScope(row,scope))throw new Error("Agent notice is unavailable in this session and project");
   if(row.delivery==="enqueued"||row.delivery==="acknowledged")return{result:false,changed:false};
   if(row.delivery!=="attempted")throw new Error("Agent notice must be claimed before enqueue");
   (row as {delivery:AgentNoticeDelivery}).delivery="enqueued";
   (row as {updatedAt:string}).updatedAt=new Date().toISOString();
   return{result:true,changed:true};
  });
 }
 /** Explicit Pi coordinator acknowledgement, not a human-read or UI-consumption proof.
  * Cannot replay an uncertain send or grant additional permissions. */
 async acknowledge(eventId:string,scope:AgentNoticeScope,agentId:string,state:AgentNoticeTerminalState):Promise<boolean>{
  if(!valid(eventId)||!valid(scope.sessionId)||!valid(scope.projectId)||!valid(agentId)||!terminal.has(state))
   throw new Error("Invalid agent notice acknowledgement");
  return this.#change(file=>{
   const row=file.entries.find(x=>x.eventId===eventId);
   if(!row||!sameScope(row,scope)||row.agentId!==agentId||row.state!==state)
    throw new Error("Agent notice acknowledgement does not match the owned terminal result");
   if(row.delivery==="acknowledged")return{result:false,changed:false};
   if(row.delivery!=="enqueued")throw new Error("Agent notice must be enqueued before coordinator acknowledgement");
   (row as {delivery:AgentNoticeDelivery}).delivery="acknowledged";
   (row as {updatedAt:string}).updatedAt=new Date().toISOString();
   return{result:true,changed:true};
  });
 }
 /** Only pending results may auto-enqueue after restart; attempted stays uncertain. */
 async list(scope:AgentNoticeScope):Promise<readonly AgentNoticeRow[]>{
  if(!valid(scope.sessionId)||!valid(scope.projectId))throw new Error("Invalid agent notice scope");
  return Object.freeze((await read(this.path)).entries.filter(row=>sameScope(row,scope)).map(row=>Object.freeze({...row})));
 }
}
