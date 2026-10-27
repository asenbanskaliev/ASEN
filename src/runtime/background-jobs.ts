import {randomUUID} from "node:crypto";
import {spawnContained} from "../evidence/spawn-contained.js";
import type {ChildProcessWithoutNullStreams} from "node:child_process";

export type BackgroundJobState="queued"|"running"|"completed"|"failed"|"stopped"|"timed_out"|"flooded";
export interface BackgroundJobEvent{readonly id:string;readonly jobId:string;readonly sessionId:string;readonly kind:"started"|"line"|"completed"|"stopped"|"failed"|"timed_out"|"flooded";readonly line?:string;readonly exitCode?:number|null;readonly at:string;}
export interface BackgroundJobSnapshot{readonly id:string;readonly sessionId:string;readonly command:string;readonly mode:"background"|"monitor";readonly state:BackgroundJobState;readonly createdAt:string;readonly updatedAt:string;readonly exitCode:number|null;readonly eventCount:number;readonly tail:readonly string[];}
export interface BackgroundJobOptions{readonly sessionId:string;readonly command:string;readonly mode?:"background"|"monitor";readonly maxTailLines?:number;readonly maxLineChars?:number;readonly maxEventsPerMinute?:number;readonly timeoutMs?:number;}
export interface BackgroundProcessOptions extends BackgroundJobOptions{readonly args?:readonly string[];readonly cwd?:string;readonly env?:NodeJS.ProcessEnv;}
type Listener=(event:BackgroundJobEvent)=>void;
interface Mutable{readonly options:Required<Pick<BackgroundJobOptions,"sessionId"|"command"|"mode">>&{maxTailLines:number;maxLineChars:number;maxEventsPerMinute:number;timeoutMs:number};state:BackgroundJobState;createdAt:string;updatedAt:string;exitCode:number|null;tail:string[];eventCount:number;windowStart:number;windowEvents:number;listeners:Set<Listener>;timer?:ReturnType<typeof setTimeout>;child?:ChildProcessWithoutNullStreams;}
const limit=(value:unknown,fallback:number,min:number,max:number):number=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;
export class BackgroundJobRegistry{
 readonly #jobs=new Map<string,Mutable>();
 start(options:BackgroundJobOptions):BackgroundJobSnapshot{
  if(!options||typeof options.sessionId!=="string"||!options.sessionId||typeof options.command!=="string"||!options.command)throw new Error("Background job identity is invalid");
  const now=new Date().toISOString(),job:Mutable={options:{sessionId:options.sessionId,command:options.command,mode:options.mode??"background",maxTailLines:limit(options.maxTailLines,20,1,200),maxLineChars:limit(options.maxLineChars,2000,1,10000),maxEventsPerMinute:limit(options.maxEventsPerMinute,120,1,10000),timeoutMs:limit(options.timeoutMs,0,0,1_800_000)},state:"running",createdAt:now,updatedAt:now,exitCode:null,tail:[],eventCount:0,windowStart:Date.now(),windowEvents:0,listeners:new Set()};
  const id=randomUUID();this.#jobs.set(id,job);if(job.options.timeoutMs)job.timer=setTimeout(()=>this.finish(id,"timed_out",null),job.options.timeoutMs);this.emit(id,"started");return this.snapshot(id);
 }
 run(options:BackgroundProcessOptions):{readonly job:BackgroundJobSnapshot;readonly done:Promise<BackgroundJobSnapshot>}{
  const job=this.start(options),child=spawnContained(options.command,options.args??[],{cwd:options.cwd,env:options.env,stdio:["ignore","pipe","pipe"],windowsHide:true,detached:process.platform!=="win32"}) as ChildProcessWithoutNullStreams;this.require(job.id).child=child;
  const consume=(chunk:Buffer|string)=>{try{this.append(job.id,Buffer.isBuffer(chunk)?chunk.toString("utf8"):chunk);}catch{/* A terminal job cannot emit after stop/timeout. */}};
  child.stdout.on("data",consume);child.stderr.on("data",consume);
  const done=new Promise<BackgroundJobSnapshot>(resolve=>{child.once("error",error=>{this.finish(job.id,"failed",null);resolve(this.snapshot(job.id));void error;});child.once("close",code=>{const current=this.snapshot(job.id);if(current.state==="running")this.finish(job.id,code===0?"completed":"failed",code);resolve(this.snapshot(job.id));});});
  return {job,done};
 }
 subscribe(id:string,listener:Listener):()=>void{const job=this.require(id);if(typeof listener!=="function")throw new TypeError("Job listener is invalid");job.listeners.add(listener);return()=>job.listeners.delete(listener);}
 append(id:string,chunk:string):void{const job=this.require(id);if(job.state!=="running")throw new Error("Background job is not running");if(typeof chunk!=="string")throw new TypeError("Job output must be text");for(const line of chunk.split(/\r?\n/u).filter(Boolean)){const now=Date.now();if(now-job.windowStart>=60_000){job.windowStart=now;job.windowEvents=0;}if(++job.windowEvents>job.options.maxEventsPerMinute){this.finish(id,"flooded",null);return;}const bounded=line.slice(-job.options.maxLineChars);job.tail.push(bounded);if(job.tail.length>job.options.maxTailLines)job.tail.splice(0,job.tail.length-job.options.maxTailLines);job.eventCount++;this.emit(id,"line",bounded);}}
 finish(id:string,state:"completed"|"failed"|"stopped"|"timed_out"|"flooded",exitCode:number|null):void{const job=this.require(id);if(job.state!=="running")return;job.state=state;job.exitCode=exitCode;job.updatedAt=new Date().toISOString();if(job.timer)clearTimeout(job.timer);if(state!=="completed"&&job.child&&!job.child.killed){try{if(process.platform!="win32"&&job.child.pid)process.kill(-job.child.pid,"SIGTERM");else job.child.kill();}catch{try{job.child.kill("SIGKILL");}catch{/* Best effort after terminal state is durable. */}}}this.emit(id,state);}
 stop(id:string):void{this.finish(id,"stopped",null);}
 snapshot(id:string):BackgroundJobSnapshot{const job=this.require(id);return Object.freeze({id,sessionId:job.options.sessionId,command:job.options.command,mode:job.options.mode,state:job.state,createdAt:job.createdAt,updatedAt:job.updatedAt,exitCode:job.exitCode,eventCount:job.eventCount,tail:Object.freeze([...job.tail])});}
 list(sessionId:string):readonly BackgroundJobSnapshot[]{return Object.freeze([...this.#jobs].filter(([,job])=>job.options.sessionId===sessionId).map(([id])=>this.snapshot(id)).reverse());}
 disposeSession(sessionId:string):void{for(const [id,job] of this.#jobs)if(job.options.sessionId===sessionId){if(job.state==="running")this.finish(id,"stopped",null);this.#jobs.delete(id);}}
 private require(id:string):Mutable{const job=this.#jobs.get(id);if(!job)throw new Error("Unknown background job");return job;}
 private emit(id:string,kind:BackgroundJobEvent["kind"],line?:string):void{const job=this.require(id),event:BackgroundJobEvent={id:randomUUID(),jobId:id,sessionId:job.options.sessionId,kind,at:new Date().toISOString(),...(line!==undefined?{line}:{}) ,...(job.exitCode!==undefined?{exitCode:job.exitCode}:{})};for(const listener of [...job.listeners]){try{listener(Object.freeze(event));}catch{/* Observers cannot alter job lifecycle. */}}}
}

