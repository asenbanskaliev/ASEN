import type {BackgroundJobSnapshot,BackgroundJobState} from "./background-jobs.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";

export interface JobMetadata{
 readonly id:string;
 readonly mode:"background"|"monitor"|"unknown";
 readonly state:BackgroundJobState|"unknown";
 readonly createdAt:string;
 readonly updatedAt:string;
 readonly exitCode:number|null;
 readonly eventCount:number|null;
 readonly retainedLineCount:number;
 readonly tail:readonly string[];
 readonly provenance:"registry-observed"|"journal-historical";
}
const states=new Set(["queued","running","interrupted","completed","failed","stopped","timed_out","flooded"]);
const bounded=(value:string)=>truncateForTerminal(sanitizeTerminalText(value).replace(/\s+/gu," ").trim(),80);
const timestamp=(value:string)=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():"unknown";
const count=(value:number)=>Number.isSafeInteger(value)&&value>=0?value:null;
/** Explicit allowlist. Never spread or serialize a registry/journal snapshot. */
export function projectJobMetadata(job:BackgroundJobSnapshot):JobMetadata{
 return Object.freeze({id:bounded(job.id),mode:job.mode==="background"||job.mode==="monitor"?job.mode:"unknown",
  state:states.has(job.state)?job.state:"unknown",createdAt:timestamp(job.createdAt),updatedAt:timestamp(job.updatedAt),
  exitCode:Number.isSafeInteger(job.exitCode)?job.exitCode:null,eventCount:count(job.eventCount),retainedLineCount:job.tail.length,
  tail:Object.freeze(job.tail.slice(-40).map(line=>truncateForTerminal(sanitizeTerminalText(line).replace(/\s+/gu," ").trim(),240))),
  provenance:"recoveredAt" in job?"journal-historical":"registry-observed"});
}
export function isObservedActiveJob(job:BackgroundJobSnapshot):boolean{
 return !("recoveredAt" in job)&&(job.state==="running"||job.state==="queued");
}
export interface JobStopIdentity{readonly id:string;readonly sessionId:string;readonly projectId:string;}
export interface JobMetadataBindings{
 readonly metadata:readonly JobMetadata[];
 stopIdentity(metadata:JobMetadata,current:readonly BackgroundJobSnapshot[]):JobStopIdentity|undefined;
}
type JobFingerprint={readonly id:string;readonly sessionId:string;readonly projectId:string;readonly createdAt:string;readonly command:string;readonly mode:"background"|"monitor";readonly cwd?:string;readonly args?:readonly string[]};
const fingerprint=(job:BackgroundJobSnapshot):JobFingerprint|undefined=>isObservedActiveJob(job)?Object.freeze({id:job.id,sessionId:job.sessionId,projectId:job.projectId,createdAt:job.createdAt,command:job.command,mode:job.mode,...(job.cwd!==undefined?{cwd:job.cwd}:{}),...(job.args?{args:Object.freeze([...job.args])}:{})}):undefined;
const sameFingerprint=(left:JobFingerprint,job:BackgroundJobSnapshot):boolean=>{
 if(!isObservedActiveJob(job)||left.id!==job.id||left.sessionId!==job.sessionId||left.projectId!==job.projectId||left.createdAt!==job.createdAt||left.command!==job.command||left.mode!==job.mode||left.cwd!==job.cwd)return false;
 const args=job.args??[],expected=left.args??[];return args.length===expected.length&&args.every((value,index)=>value===expected[index]);
};
/** Ephemeral object-identity binding. Display metadata never becomes action authority. */
export function createJobMetadataBindings(rows:readonly BackgroundJobSnapshot[]):JobMetadataBindings{
 const associations=new WeakMap<JobMetadata,JobFingerprint>(),metadata=rows.slice(0,100).map(job=>{
  const projected=projectJobMetadata(job),bound=fingerprint(job);if(bound)associations.set(projected,bound);return projected;
 });
 return Object.freeze({metadata:Object.freeze(metadata),stopIdentity(projected:JobMetadata,current:readonly BackgroundJobSnapshot[]){
  const bound=associations.get(projected);if(!bound)return undefined;
  const exact=current.filter(job=>job.id===bound.id);if(exact.length!==1||!sameFingerprint(bound,exact[0]!))return undefined;
  return Object.freeze({id:bound.id,sessionId:bound.sessionId,projectId:bound.projectId});
 }});
}
export function jobInspectionLabel(job:JobMetadata):string{return `${job.id} · ${job.mode} · ${job.state}`;}
export function renderJobInspection(job:JobMetadata,width=72):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid job inspection width");
 const historical=job.provenance==="journal-historical",prefix=historical?"Historical":"Observed";
 const lines=[`Job: ${job.id}`,`Mode: ${job.mode}`,`State: ${job.state}`,
  historical?"Journal metadata: historical; current execution unknown":"Registry metadata: observed at inspection; tail is a read-only snapshot",
  ...(job.state==="interrupted"?["Interrupted: outcome uncertain; not resumed"]:[]),
  `Observed exit code: ${job.exitCode??"unknown"}`,`Created: ${job.createdAt}`,`Updated: ${job.updatedAt}`,
  `${prefix} events: ${job.eventCount??"unknown"}`,`${prefix} retained lines: ${job.retainedLineCount}`,
  `Log tail (read-only, last ${job.tail.length} of ${job.retainedLineCount} retained lines):`,
  ...(job.tail.length?job.tail.map(line=>"  "+line):["  No retained log lines in this snapshot."]),
  ...(job.retainedLineCount>job.tail.length?[`… ${job.retainedLineCount-job.tail.length} earlier retained lines omitted`]:[])];
 return Object.freeze(lines.map(line=>truncateForTerminal(sanitizeTerminalText(line),width)));
}
interface InspectionOptions{
 readonly id:string;
 readonly identity:{readonly sessionId:string;readonly projectId:string};
 readonly read:()=>readonly BackgroundJobSnapshot[]|Promise<readonly BackgroundJobSnapshot[]>;
 readonly assertCurrent:()=>Promise<void>;
 readonly select?:(title:string,options:string[],opts?:{signal?:AbortSignal})=>Promise<string|undefined>;
 readonly signal?:AbortSignal|undefined;
 readonly width:number;
}
/** Selection is advisory only. Read again and validate identity after every await. */
export async function inspectOwnedJob(options:InspectionOptions):Promise<readonly string[]>{
 const {identity,signal,width}=options;
 const message=(text:string)=>[truncateForTerminal(text,width)];
 const unavailable=()=>message("ASEN job unavailable for this session/project.");
 const closed=()=>message("ASEN job inspection closed.");
 const check=async()=>{await options.assertCurrent();};
 const read=async()=>{
  const rows=await options.read();await check();
  return rows.filter(row=>row.sessionId===identity.sessionId&&row.projectId===identity.projectId);
 };
 try{
  if(signal?.aborted)return closed();await check();
  let rows:readonly BackgroundJobSnapshot[];
  try{rows=await read();}catch{await check();return message("ASEN jobs reader unavailable.");}
  if(signal?.aborted)return closed();
  let id=options.id.trim();
  if(!id){
   if(!rows.length)return message("No owned jobs in this session/project.");
   if(!options.select)return message("Usage: /asen-job-inspect <id>; owned-job selection unavailable.");
   // Full IDs remain internal; never parse a sanitized/truncated display label as an ID.
   const candidates=rows.slice(0,100),labels=candidates.map(row=>jobInspectionLabel(projectJobMetadata(row)));
   const chosen=await options.select("ASEN jobs: metadata and bounded log tail (up to 100)",labels,signal?{signal}:undefined);
   await check();if(signal?.aborted||chosen===undefined)return closed();
   const index=labels.indexOf(chosen);
   if(index<0||labels.lastIndexOf(chosen)!==index)return unavailable();
   id=candidates[index]!.id;
   try{rows=await read();}catch{await check();return message("ASEN jobs reader unavailable.");}
  }
  await check();if(signal?.aborted)return closed();
  const found=rows.find(row=>row.id===id);
  if(!found)return unavailable();
  const result=renderJobInspection(projectJobMetadata(found),width);
  await check();if(signal?.aborted)return closed();
  return result;
 }catch{return unavailable();}
}
