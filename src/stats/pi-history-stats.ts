import {createReadStream} from "node:fs";
import {opendir,lstat,realpath,stat} from "node:fs/promises";
import path from "node:path";

export interface PiHistoryRange{from?:string;to?:string}
export interface PiHistoryMeasurementCounts{inputTokens:number;outputTokens:number;totalTokens:number;costUsd:number}
export interface PiHistoryStats{
 schema:"asen.pi-history-stats/v1";
 range:PiHistoryRange;
 state:"available"|"unavailable";
 roots:number;
 outOfScopeFiles:number;
 sessions:number;
 entries:number;
 userMessages:number;
 assistantMessages:number;
 toolCalls:number;
 inputTokens:number;
 outputTokens:number;
 totalTokens:number;
 costUsd:number;
 measurementCounts?:PiHistoryMeasurementCounts;
 corruptFiles:number;
 duplicateFiles:number;
 oversizedFiles:number;
 unreadableFiles:number;
 truncated:boolean;
 byDay?:DayStats;
}

export const PI_HISTORY_STATS_LIMITS=Object.freeze({maxRoots:16,maxDirectories:10_000,maxFiles:10_000,maxFileBytes:16*1024*1024,maxTotalBytes:128*1024*1024,maxLineBytes:1024*1024,maxEntriesPerFile:100_000,maxDirectoryEntries:2_000,maxDepth:12,maxDays:3_660});
const SCHEMA="asen.pi-history-stats/v1" as const;
const EMPTY_USAGE=()=>({inputTokens:0,outputTokens:0,totalTokens:0,costUsd:0,measurementCounts:{inputTokens:0,outputTokens:0,totalTokens:0,costUsd:0}});
const EMPTY=()=>({roots:0,outOfScopeFiles:0,sessions:0,entries:0,userMessages:0,assistantMessages:0,toolCalls:0,...EMPTY_USAGE(),corruptFiles:0,duplicateFiles:0,oversizedFiles:0,unreadableFiles:0,truncated:false});
type Counters=ReturnType<typeof EMPTY>;
type UsageCounters=ReturnType<typeof EMPTY_USAGE>&{truncated:boolean};
type DayStats={timezone:"UTC";unbucketedUsageEntries:number;truncated:boolean;days:Array<{day:string}&UsageCounters>};
type DayTotals=Map<string,UsageCounters>;
const USAGE_KEYS=["inputTokens","outputTokens","totalTokens","costUsd"] as const;
type ObservedUsage=Partial<Record<(typeof USAGE_KEYS)[number],number>>;
class OversizedHistoryError extends Error{}
class DuplicateHistoryError extends Error{}
class CorruptHistoryError extends Error{}
class TotalBudgetHistoryError extends Error{}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function within(root:string,candidate:string):boolean{const rel=path.relative(root,candidate);return rel===""||(!path.isAbsolute(rel)&&rel!==".."&&!rel.startsWith(`..${path.sep}`));}
async function workspaceKey(value:string):Promise<string>{let canonical=path.resolve(value);try{canonical=await realpath(canonical);}catch{/* A removed project still compares by its normalized lexical path. */}const normalized=path.normalize(canonical).normalize("NFC");return process.platform==="win32"||process.platform==="darwin"?normalized.toLowerCase():normalized;}
function validDate(value:string):boolean{if(!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;const date=new Date(`${value}T00:00:00.000Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function parsePiHistoryRange(input:string):PiHistoryRange{
 const range:PiHistoryRange={};if(!input.trim())return range;
 const parts=input.trim().split(/\s+/u);if(parts.length>2)throw new Error("Usage: /asen-stats [from=YYYY-MM-DD] [to=YYYY-MM-DD]");
 for(const part of parts){const match=/^(from|to)=(\d{4}-\d{2}-\d{2})$/u.exec(part);if(!match||!validDate(match[2]!))throw new Error("Usage: /asen-stats [from=YYYY-MM-DD] [to=YYYY-MM-DD]");const key=match[1] as "from"|"to";if(range[key])throw new Error("Usage: /asen-stats [from=YYYY-MM-DD] [to=YYYY-MM-DD]");range[key]=match[2]!;}
 if(range.from&&range.to&&range.from>range.to)throw new Error("Stats range starts after it ends");return range;
}
function included(timestamp:string,range:PiHistoryRange):boolean{const day=timestamp.slice(0,10);return (!range.from||day>=range.from)&&(!range.to||day<=range.to);}
function observedCount(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;}
function addCount<K extends "entries"|"userMessages"|"assistantMessages"|"toolCalls"|"inputTokens"|"outputTokens"|"totalTokens">(target:Record<K,number>&{truncated:boolean},key:K,value:number):void{
 const counts:Record<K,number>=target,next=counts[key]+value;
 if(!Number.isSafeInteger(next)||next>Number.MAX_SAFE_INTEGER){counts[key]=Number.MAX_SAFE_INTEGER;target.truncated=true;}else counts[key]=next;
}
function addCost(target:UsageCounters,value:number):void{const next=target.costUsd+value;if(!Number.isFinite(next)||next>Number.MAX_SAFE_INTEGER){target.costUsd=Number.MAX_SAFE_INTEGER;target.truncated=true;}else target.costUsd=next;}
function readUsage(usage:unknown):ObservedUsage|undefined{
 if(!isRecord(usage))return;
 let measured:ObservedUsage|undefined;
 for(const [source,key] of [["input","inputTokens"],["output","outputTokens"],["totalTokens","totalTokens"]] as const){const value=usage[source];if(observedCount(value))(measured??={})[key]=value;}
 const cost=isRecord(usage.cost)?usage.cost.total:undefined;
 if(typeof cost==="number"&&Number.isFinite(cost)&&cost>=0)(measured??={}).costUsd=cost;
 return measured;
}
function add(target:UsageCounters,usage:ObservedUsage):void{
 for(const key of USAGE_KEYS){const value=usage[key];if(value===undefined)continue;if(key==="costUsd")addCost(target,value);else addCount(target,key,value);target.measurementCounts[key]++;}
}
function mergeUsage(target:UsageCounters,source:UsageCounters):void{
 for(const key of USAGE_KEYS){if(key==="costUsd")addCost(target,source[key]);else addCount(target,key,source[key]);target.measurementCounts[key]+=source.measurementCounts[key];}
 target.truncated||=source.truncated;
}
function validTimestamp(value:unknown):value is string{return typeof value==="string"&&value.length<=64&&Number.isFinite(Date.parse(value));}
function utcEventDay(timestamp:string):string|undefined{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/u.test(timestamp)||!validDate(timestamp.slice(0,10)))return;
 const iso=new Date(timestamp).toISOString();
 if(/^\d{4}-/u.test(iso))return iso.slice(0,10);
}
function addDayUsage(days:DayTotals,timestamp:string,usage:ObservedUsage):boolean{
 const day=utcEventDay(timestamp);if(!day)return false;
 let measurements=days.get(day);
 if(!measurements){measurements={...EMPTY_USAGE(),truncated:false};days.set(day,measurements);}
 add(measurements,usage);return true;
}
function mergeDays(target:DayTotals,source:DayTotals,report:DayStats):void{
 for(const [day,measurements] of source){
  const previous=target.get(day);
  if(previous)mergeUsage(previous,measurements);
  else if(target.size<PI_HISTORY_STATS_LIMITS.maxDays)target.set(day,measurements);
  else report.truncated=true;
 }
}
function finishDays(totals:DayTotals,report:DayStats):void{
 for(const day of [...totals.keys()].sort()){
  const measurements=totals.get(day)!;report.truncated||=measurements.truncated;
  report.days.push({day,...measurements,costUsd:Number(measurements.costUsd.toFixed(8))});
 }
}
function decodeLine(bytes:Buffer):string{const line=bytes.at(-1)===13?bytes.subarray(0,-1):bytes;try{return new TextDecoder("utf-8",{fatal:true}).decode(line);}catch{throw new CorruptHistoryError();}}
async function* lines(file:string,byteLimit:number,totalBudgetLimit:boolean):AsyncGenerator<string>{
 let pending=Buffer.alloc(0),bytesSeen=0;const stream=createReadStream(file,{highWaterMark:64*1024});
 try{for await(const value of stream){const chunk=Buffer.isBuffer(value)?value:Buffer.from(value);bytesSeen+=chunk.length;if(bytesSeen>byteLimit){if(totalBudgetLimit)throw new TotalBudgetHistoryError();throw new OversizedHistoryError();}let start=0;while(true){const end=chunk.indexOf(10,start);if(end<0)break;const segment=chunk.subarray(start,end);if(pending.length+segment.length>PI_HISTORY_STATS_LIMITS.maxLineBytes)throw new OversizedHistoryError();const complete=pending.length?Buffer.concat([pending,segment]):segment;pending=Buffer.alloc(0);const decoded=decodeLine(complete);if(decoded.trim())yield decoded;start=end+1;}const tail=chunk.subarray(start);if(pending.length+tail.length>PI_HISTORY_STATS_LIMITS.maxLineBytes)throw new OversizedHistoryError();pending=pending.length?Buffer.concat([pending,tail]):Buffer.from(tail);}
  if(pending.length){const decoded=decodeLine(pending);if(decoded.trim())yield decoded;}
 }finally{stream.destroy();}
}
function parseObject(line:string):Record<string,unknown>{let value:unknown;try{value=JSON.parse(line);}catch{throw new CorruptHistoryError();}if(!isRecord(value))throw new CorruptHistoryError();return value;}
function countEntryAndReadUsage(target:Counters,entry:Record<string,unknown>):ObservedUsage|undefined{
 if(entry.type==="message"&&isRecord(entry.message)){
  const message=entry.message;if(message.role==="user")addCount(target,"userMessages",1);
  if(message.role==="assistant"){addCount(target,"assistantMessages",1);if(Array.isArray(message.content))addCount(target,"toolCalls",message.content.reduce((n,block)=>n+(isRecord(block)&&block.type==="toolCall"?1:0),0));return readUsage(message.usage);}
 }
 if(entry.type==="usage"||entry.type==="compaction")return readUsage(entry.usage);
}
async function parseFile(file:string,byteLimit:number,totalBudgetLimit:boolean,byDay:boolean){
 // Hold day totals per file until the entire file is validated and accepted.
 const stats=EMPTY(),ids=new Set<string>(),days=byDay?new Map<string,UsageCounters>():undefined;
 let header:Record<string,unknown>|undefined,unbucketedUsageEntries=0;
 for await(const line of lines(file,byteLimit,totalBudgetLimit)){
  const value=parseObject(line);
  if(!header){if(value.type!=="session"||typeof value.id!=="string"||!value.id||value.id.length>256||!validTimestamp(value.timestamp)||typeof value.cwd!=="string"||value.cwd.length>4096||!path.isAbsolute(value.cwd))throw new CorruptHistoryError();header=value;continue;}
  if(typeof value.type!=="string"||!value.type||value.type.length>64||typeof value.id!=="string"||!value.id||value.id.length>256||!(value.parentId===null||typeof value.parentId==="string"&&value.parentId.length<=256)||!validTimestamp(value.timestamp))throw new CorruptHistoryError();
  if(ids.has(value.id))throw new DuplicateHistoryError();ids.add(value.id);stats.entries++;if(stats.entries>PI_HISTORY_STATS_LIMITS.maxEntriesPerFile)throw new OversizedHistoryError();
  const usage=countEntryAndReadUsage(stats,value);if(!usage)continue;add(stats,usage);
  if(days&&!addDayUsage(days,value.timestamp,usage))unbucketedUsageEntries++;
 }
 if(!header)throw new CorruptHistoryError();return {sessionId:header.id as string,timestamp:header.timestamp as string,cwd:header.cwd as string,stats,days,unbucketedUsageEntries};
}
async function filesUnder(root:string,counters:Counters,seenFiles:Set<string>,remaining:number):Promise<string[]>{
 const files:string[]=[],queue:[string,number][]=[[root,0]],seenDirs=new Set<string>();
 while(queue.length){const [directory,depth]=queue.shift()!;let canonical:string;try{canonical=await realpath(directory);}catch{counters.unreadableFiles++;continue;}if(!within(root,canonical)||seenDirs.has(canonical))continue;seenDirs.add(canonical);if(seenDirs.size>PI_HISTORY_STATS_LIMITS.maxDirectories){counters.truncated=true;break;}if(depth>PI_HISTORY_STATS_LIMITS.maxDepth){counters.truncated=true;continue;}
  let handle;try{handle=await opendir(canonical);}catch{counters.unreadableFiles++;continue;}const entries:Array<{name:string;directory:boolean;file:boolean}>=[];let overflow=false;
  try{for await(const entry of handle){if(entry.isSymbolicLink())continue;if(!entry.isDirectory()&&!entry.isFile())continue;if(entries.length>=PI_HISTORY_STATS_LIMITS.maxDirectoryEntries){overflow=true;break;}entries.push({name:entry.name,directory:entry.isDirectory(),file:entry.isFile()});}}catch{counters.unreadableFiles++;continue;}
  if(overflow){counters.truncated=true;continue;}entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  for(const entry of entries){const candidate=path.join(canonical,entry.name);if(entry.directory){if(queue.length+seenDirs.size>=PI_HISTORY_STATS_LIMITS.maxDirectories){counters.truncated=true;continue;}queue.push([candidate,depth+1]);continue;}if(entry.file&&entry.name.toLowerCase().endsWith(".jsonl")){let filePath:string;try{filePath=await realpath(candidate);const info=await lstat(candidate);if(!info.isFile()||info.isSymbolicLink()||!within(root,filePath))continue;}catch{counters.unreadableFiles++;continue;}if(!seenFiles.has(filePath)){if(files.length>=remaining){counters.truncated=true;return files;}seenFiles.add(filePath);files.push(filePath);}}}
 }
 return files;
}
export async function collectPiHistoryStats(roots:readonly string[],range:PiHistoryRange={},projectRoot?:string,{byDay=false}:{byDay?:boolean}={}):Promise<PiHistoryStats>{
 if(!Array.isArray(roots)||roots.length>PI_HISTORY_STATS_LIMITS.maxRoots)throw new Error("Invalid Pi history roots");
 if(range.from!==undefined&&!validDate(range.from)||range.to!==undefined&&!validDate(range.to)||range.from&&range.to&&range.from>range.to||byDay&&(range.from!==undefined||range.to!==undefined))throw new Error("Invalid Pi history range");
 if(projectRoot!==undefined&&(typeof projectRoot!=="string"||!path.isAbsolute(projectRoot)||/[\u0000-\u001f\u007f]/u.test(projectRoot)))throw new Error("Invalid Pi history project");
 const result:PiHistoryStats&{measurementCounts:PiHistoryMeasurementCounts}={schema:SCHEMA,range:{...range},state:"available",...EMPTY()},canonicalRoots:string[]=[],seenRoots=new Set<string>();
 const dayTotals=byDay?new Map<string,UsageCounters>():undefined;
 if(byDay)result.byDay={timezone:"UTC",unbucketedUsageEntries:0,truncated:false,days:[]};
 for(const root of roots){if(typeof root!=="string"||!path.isAbsolute(root)||/[\u0000-\u001f\u007f]/u.test(root))throw new Error("Invalid Pi history root");try{const canonical=await realpath(root),info=await stat(canonical);if(!info.isDirectory()||seenRoots.has(canonical))continue;seenRoots.add(canonical);canonicalRoots.push(canonical);}catch{result.unreadableFiles++;}}
 result.roots=canonicalRoots.length;if(!canonicalRoots.length){result.state="unavailable";return result;}
 canonicalRoots.sort((a,b)=>a<b?-1:a>b?1:0);const seenFiles=new Set<string>(),allFiles:string[]=[];for(const root of canonicalRoots){if(allFiles.length>=PI_HISTORY_STATS_LIMITS.maxFiles){result.truncated=true;break;}const found=await filesUnder(root,result,seenFiles,PI_HISTORY_STATS_LIMITS.maxFiles-allFiles.length);allFiles.push(...found);}allFiles.sort((a,b)=>a<b?-1:a>b?1:0);
 const projectKey=projectRoot===undefined?undefined:await workspaceKey(projectRoot);let bytesRead=0;const seenSessionIds=new Set<string>();
 for(const file of allFiles){let size:number;try{size=(await stat(file)).size;}catch{result.unreadableFiles++;continue;}if(size>PI_HISTORY_STATS_LIMITS.maxFileBytes){result.oversizedFiles++;continue;}const remaining=PI_HISTORY_STATS_LIMITS.maxTotalBytes-bytesRead;if(size>remaining){result.truncated=true;break;}bytesRead+=size;const totalBudgetLimit=remaining<PI_HISTORY_STATS_LIMITS.maxFileBytes;
  try{const parsed=await parseFile(file,Math.min(PI_HISTORY_STATS_LIMITS.maxFileBytes,remaining),totalBudgetLimit,byDay);if(seenSessionIds.has(parsed.sessionId)){result.duplicateFiles++;continue;}seenSessionIds.add(parsed.sessionId);if(projectKey!==undefined&&await workspaceKey(parsed.cwd)!==projectKey){result.outOfScopeFiles++;continue;}if(!included(parsed.timestamp,result.range))continue;result.sessions++;addCount(result,"entries",parsed.stats.entries);addCount(result,"userMessages",parsed.stats.userMessages);addCount(result,"assistantMessages",parsed.stats.assistantMessages);addCount(result,"toolCalls",parsed.stats.toolCalls);mergeUsage(result,parsed.stats);
   if(dayTotals&&result.byDay&&parsed.days){
    result.byDay.unbucketedUsageEntries+=parsed.unbucketedUsageEntries;
    mergeDays(dayTotals,parsed.days,result.byDay);
   }
  }
  catch(error){if(error instanceof TotalBudgetHistoryError){result.truncated=true;break;}if(error instanceof DuplicateHistoryError)result.duplicateFiles++;else if(error instanceof OversizedHistoryError)result.oversizedFiles++;else if(error instanceof CorruptHistoryError)result.corruptFiles++;else result.unreadableFiles++;}
 }
 if(dayTotals&&result.byDay)finishDays(dayTotals,result.byDay);
 result.costUsd=Number(result.costUsd.toFixed(8));return result;
}
