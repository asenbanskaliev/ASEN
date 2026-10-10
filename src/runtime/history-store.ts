import {readFile,rm} from "node:fs/promises";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import type {HistoryEntry,HistoryPolicy} from "./history.js";
import {redactHistoryText,trimHistory} from "./history.js";

export interface HistoryFile{schema:"asen.history/v1";revision:number;policy:HistoryPolicy;entries:HistoryEntry[];tombstones:string[]}
const SCHEMA="asen.history/v1" as const,DEFAULT_POLICY:HistoryPolicy={enabled:false,maxEntries:500};
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const identifier=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=256&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
const policyValue=(v:unknown):v is HistoryPolicy=>exact(v,["enabled","maxEntries"])&&typeof v.enabled==="boolean"&&Number.isSafeInteger(v.maxEntries)&&Number(v.maxEntries)>=1&&Number(v.maxEntries)<=10000;
function entryValue(v:unknown):v is HistoryEntry{return exact(v,["id","sessionId","projectId","text","createdAt","redacted"])&&identifier(v.id)&&identifier(v.sessionId)&&identifier(v.projectId)&&typeof v.text==="string"&&v.text.length<=12000&&typeof v.createdAt==="string"&&Number.isFinite(Date.parse(v.createdAt))&&typeof v.redacted==="boolean";}
export function emptyHistoryStore():HistoryFile{return {schema:SCHEMA,revision:0,policy:{...DEFAULT_POLICY},entries:[],tombstones:[]};}
export function parseHistoryStore(raw:string):HistoryFile{
 const value:unknown=JSON.parse(raw);if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid history store");const v=value as Record<string,unknown>;
 const legacy=exact(v,["schema","revision","entries","tombstones"]),current=exact(v,["schema","revision","policy","entries","tombstones"]);
 if((!legacy&&!current)||v.schema!==SCHEMA||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||!Array.isArray(v.entries)||!Array.isArray(v.tombstones))throw new Error("Invalid history store");
 const entries=v.entries;if(entries.length>10000||!entries.every(entryValue))throw new Error("Invalid history entries");
 const ids=new Set<string>();for(const entry of entries){if(ids.has(entry.id))throw new Error("Duplicate history entry");ids.add(entry.id);}
 const tombstones=v.tombstones;if(tombstones.length>100000||!tombstones.every(identifier)||new Set(tombstones).size!==tombstones.length||tombstones.some(id=>ids.has(id)))throw new Error("Invalid history tombstones");
 const rawPolicy:unknown=Object.hasOwn(v,"policy")?v.policy:DEFAULT_POLICY;if(!policyValue(rawPolicy))throw new Error("Invalid history policy");const policy:HistoryPolicy=rawPolicy;
 return {schema:SCHEMA,revision:Number(v.revision),policy:{...policy},entries:entries.map(e=>({...e})),tombstones:[...tombstones]};
}
export async function readHistoryStore(file:string):Promise<HistoryFile>{if(!await preparePrivateFile(file))return emptyHistoryStore();return parseHistoryStore(await readFile(file,"utf8"));}
async function write(file:string,value:HistoryFile):Promise<void>{await preparePrivateFile(file,true);await atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}
export async function commitHistory(file:string,expectedRevision:number,change:(value:HistoryFile)=>HistoryFile):Promise<HistoryFile>{
 await preparePrivateFile(file,true);return withExclusiveFileLock(file,async()=>{
  const current=await readHistoryStore(file);if(current.revision!==expectedRevision)throw new Error("History revision conflict");
  const next=change(structuredClone(current));if(!next||next.revision!==expectedRevision+1)throw new Error("History revision must advance once");
  const checked=parseHistoryStore(JSON.stringify(next));await write(file,checked);return checked;
 });
}
export async function appendHistoryEntry(file:string,entry:HistoryEntry):Promise<HistoryFile>{
 await preparePrivateFile(file,true);return withExclusiveFileLock(file,async()=>{
  const current=await readHistoryStore(file);if(!current.policy.enabled)return current;
  if(current.tombstones.includes(entry.id))throw new Error("History entry id is tombstoned");
  const redacted=redactHistoryText(entry.text),safeEntry={...entry,text:redacted.text,redacted:entry.redacted||redacted.redacted};
  const next:HistoryFile={...current,revision:current.revision+1,entries:trimHistory(current.policy,[...current.entries,safeEntry])};
  const keep=new Set(next.entries.map(item=>item.id));next.tombstones=[...new Set([...current.tombstones,...current.entries.filter(item=>!keep.has(item.id)).map(item=>item.id)])];
  const checked=parseHistoryStore(JSON.stringify(next));await write(file,checked);return checked;
 });
}
export function deleteHistoryEntry(value:HistoryFile,id:string):HistoryFile{
 if(!value.entries.some(entry=>entry.id===id))throw new Error("History entry does not exist");
 return {...value,revision:value.revision+1,entries:value.entries.filter(entry=>entry.id!==id),tombstones:[...value.tombstones,id]};
}
export function deleteProjectHistory(value:HistoryFile,projectId:string):HistoryFile{
 const removed=value.entries.filter(entry=>entry.projectId===projectId).map(entry=>entry.id);
 return {...value,revision:value.revision+1,entries:value.entries.filter(entry=>entry.projectId!==projectId),tombstones:[...new Set([...value.tombstones,...removed])]};
}
export function applyHistoryRetention(value:HistoryFile,policy:HistoryPolicy):HistoryFile{
 if(!policyValue(policy))throw new Error("Invalid history retention");
 const entries=policy.enabled?trimHistory(policy,value.entries):value.entries.map(entry=>structuredClone(entry)),keep=new Set(entries.map(entry=>entry.id)),removed=value.entries.filter(entry=>!keep.has(entry.id)).map(entry=>entry.id);
 return {...value,revision:value.revision+1,policy:{...policy},entries,tombstones:[...new Set([...value.tombstones,...removed])]};
}
export async function resetHistoryStore(file:string):Promise<void>{await preparePrivateFile(file,true);await withExclusiveFileLock(file,()=>rm(file,{force:true}));}
