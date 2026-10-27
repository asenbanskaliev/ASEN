import {randomUUID} from "node:crypto";
import {spawnContained} from "../evidence/spawn-contained.js";
import type {ChildProcessWithoutNullStreams} from "node:child_process";
import type {BackgroundJobJournal} from "./background-job-journal.js";

export type BackgroundJobState="queued"|"running"|"interrupted"|"completed"|"failed"|"stopped"|"timed_out"|"flooded";
export interface BackgroundJobEvent{readonly id:string;readonly jobId:string;readonly sessionId:string;readonly projectId:string;readonly mode:"background"|"monitor";readonly kind:"started"|"line"|"completed"|"stopped"|"failed"|"timed_out"|"flooded";readonly line?:string;readonly exitCode?:number|null;readonly at:string;}
export interface BackgroundJobSnapshot{readonly id:string;readonly sessionId:string;readonly projectId:string;readonly command:string;readonly mode:"background"|"monitor";readonly state:BackgroundJobState;readonly createdAt:string;readonly updatedAt:string;readonly exitCode:number|null;readonly eventCount:number;readonly tail:readonly string[];readonly persistenceError?:string;readonly deliveryState?:"pending"|"enqueued";readonly deliveryError?:string;}
export interface BackgroundJobOptions{readonly sessionId:string;readonly projectId?:string;readonly command:string;readonly mode?:"background"|"monitor";readonly maxTailLines?:number;readonly maxLineChars?:number;readonly maxEventsPerMinute?:number;readonly timeoutMs?:number;}
export interface BackgroundProcessOptions extends BackgroundJobOptions{readonly args?:readonly string[];readonly cwd?:string;readonly env?:NodeJS.ProcessEnv;}
export interface BackgroundExecutionOptions{readonly onData:(chunk:Buffer)=>void;readonly signal:AbortSignal;readonly timeoutMs?:number;readonly env?:NodeJS.ProcessEnv;}
export type BackgroundJobExecutor=(command:string,cwd:string,options:BackgroundExecutionOptions)=>Promise<{readonly exitCode:number|null}>;
export type BackgroundJobListener=(event:BackgroundJobEvent)=>void;
interface Mutable{readonly options:Required<Pick<BackgroundJobOptions,"sessionId"|"command"|"mode">>&{projectId:string;maxTailLines:number;maxLineChars:number;maxEventsPerMinute:number;timeoutMs:number};state:BackgroundJobState;createdAt:string;updatedAt:string;exitCode:number|null;tail:string[];eventCount:number;windowStart:number;windowEvents:number;listeners:Set<BackgroundJobListener>;timer?:ReturnType<typeof setTimeout>;child?:ChildProcessWithoutNullStreams;abort?:AbortController;done?:Promise<BackgroundJobSnapshot>;disposeRequested?:boolean;settled?:boolean;persistenceError?:string;deliveryState?:"pending"|"enqueued";deliveryError?:string;}
const limit=(value:unknown,fallback:number,min:number,max:number):number=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;
export class BackgroundJobRegistry{
 readonly #jobs=new Map<string,Mutable>();
 static readonly maxRunningJobs=32;
 static readonly maxRunningJobsPerSession=8;
 static readonly maxRetainedJobs=500;
 static readonly maxRetainedJobsPerSession=100;
 static readonly shutdownWaitMs=5_000;
 constructor(private readonly journal?:BackgroundJobJournal,private readonly executor?:BackgroundJobExecutor,private readonly shutdownTimeoutMs=BackgroundJobRegistry.shutdownWaitMs){if(!Number.isSafeInteger(shutdownTimeoutMs)||shutdownTimeoutMs<1||shutdownTimeoutMs>30_000)throw new Error("Background shutdown timeout is invalid");}
 start(options:BackgroundJobOptions):BackgroundJobSnapshot{
  if(!options||typeof options.sessionId!=="string"||!options.sessionId||typeof options.command!=="string"||!options.command)throw new Error("Background job identity is invalid");
  const active=[...this.#jobs.values()].filter(job=>job.state==="running");
  if(active.length>=BackgroundJobRegistry.maxRunningJobs||active.filter(job=>job.options.sessionId===options.sessionId).length>=BackgroundJobRegistry.maxRunningJobsPerSession)throw new Error("ASEN background job concurrency limit reached");
  const projectId=options.projectId??process.cwd();if(typeof projectId!=="string"||!projectId||projectId.length>4096)throw new Error("Background job project is invalid");
  const now=new Date().toISOString(),job:Mutable={options:{sessionId:options.sessionId,projectId,command:options.command,mode:options.mode??"background",maxTailLines:limit(options.maxTailLines,20,1,200),maxLineChars:limit(options.maxLineChars,2000,1,10000),maxEventsPerMinute:limit(options.maxEventsPerMinute,120,1,10000),timeoutMs:limit(options.timeoutMs,0,0,1_800_000)},state:"running",createdAt:now,updatedAt:now,exitCode:null,tail:[],eventCount:0,windowStart:Date.now(),windowEvents:0,listeners:new Set()};
  const id=randomUUID();this.#jobs.set(id,job);try{this.journal?.record(this.snapshot(id));}catch{this.#jobs.delete(id);throw new Error("Background job was not started because its private journal could not be written");}if(job.options.timeoutMs)job.timer=setTimeout(()=>this.finish(id,"timed_out",null),job.options.timeoutMs);this.emit(id,"started");this.prune();return this.snapshot(id);
 }
 run(options:BackgroundProcessOptions,listener?:BackgroundJobListener):{readonly job:BackgroundJobSnapshot;readonly done:Promise<BackgroundJobSnapshot>}{
  if(this.executor&&options.args?.length)throw new Error("Pi shell executor accepts a single policy-checked command string");
  const job=this.start(options),mutable=this.require(job.id);if(listener)mutable.listeners.add(listener);const consume=(chunk:Buffer|string)=>{try{this.append(job.id,Buffer.isBuffer(chunk)?chunk.toString("utf8"):chunk);}catch{/* A terminal job cannot emit after stop/timeout. */}};
  let done:Promise<BackgroundJobSnapshot>;
  if(this.executor){
   const abort=new AbortController();mutable.abort=abort;
   let execution:Promise<{readonly exitCode:number|null}>;
   try{execution=Promise.resolve(this.executor(options.command,options.cwd??process.cwd(),{onData:chunk=>consume(chunk),signal:abort.signal,...(options.timeoutMs!==undefined?{timeoutMs:options.timeoutMs}:{})}));}
   catch{this.finish(job.id,"failed",null);done=Promise.resolve(this.snapshot(job.id));this.observeDone(job.id,mutable,done);return {job,done};}
   done=execution.then(result=>{if(this.snapshot(job.id).state==="running")this.finish(job.id,result.exitCode===0?"completed":"failed",result.exitCode);return this.snapshot(job.id);},()=>{if(this.snapshot(job.id).state==="running")this.finish(job.id,"failed",null);return this.snapshot(job.id);});
  }else{
   let child:ChildProcessWithoutNullStreams;
   try{child=spawnContained(options.command,options.args??[],{cwd:options.cwd,env:options.env,stdio:["ignore","pipe","pipe"],windowsHide:true,detached:process.platform!=="win32"}) as ChildProcessWithoutNullStreams;}
   catch{this.finish(job.id,"failed",null);done=Promise.resolve(this.snapshot(job.id));this.observeDone(job.id,mutable,done);return {job,done};}
   mutable.child=child;child.stdout.on("data",consume);child.stderr.on("data",consume);
   done=new Promise<BackgroundJobSnapshot>(resolve=>{child.once("error",()=>{if(!this.#jobs.has(job.id))return;this.finish(job.id,"failed",null);resolve(this.snapshot(job.id));});child.once("close",code=>{if(!this.#jobs.has(job.id))return;const current=this.snapshot(job.id);if(current.state==="running")this.finish(job.id,code===0?"completed":"failed",code);resolve(this.snapshot(job.id));});});
  }
  this.observeDone(job.id,mutable,done);
  return {job,done};
 }
 subscribe(id:string,listener:BackgroundJobListener):()=>void{const job=this.require(id);if(typeof listener!=="function")throw new TypeError("Job listener is invalid");job.listeners.add(listener);return()=>job.listeners.delete(listener);}
 append(id:string,chunk:string):void{const job=this.require(id);if(job.state!=="running")throw new Error("Background job is not running");if(typeof chunk!=="string")throw new TypeError("Job output must be text");for(const line of chunk.split(/\r?\n/u).filter(Boolean)){const now=Date.now();if(now-job.windowStart>=60_000){job.windowStart=now;job.windowEvents=0;}if(++job.windowEvents>job.options.maxEventsPerMinute){this.finish(id,"flooded",null);return;}const bounded=line.slice(-job.options.maxLineChars);job.tail.push(bounded);if(job.tail.length>job.options.maxTailLines)job.tail.splice(0,job.tail.length-job.options.maxTailLines);job.eventCount++;this.emit(id,"line",bounded);}}
 finish(id:string,state:"completed"|"failed"|"stopped"|"timed_out"|"flooded",exitCode:number|null):void{const job=this.require(id);if(job.state!=="running")return;job.state=state;job.exitCode=exitCode;job.updatedAt=new Date().toISOString();if(job.timer)clearTimeout(job.timer);if(state!=="completed"){job.abort?.abort();if(job.child&&!job.child.killed){try{if(process.platform!=="win32"&&job.child.pid)process.kill(-job.child.pid,"SIGTERM");else job.child.kill();}catch{try{job.child.kill("SIGKILL");}catch{/* Best effort after terminal state is durable. */}}}}try{this.journal?.record(this.snapshot(id));delete job.persistenceError;}catch{job.persistenceError="Background journal could not persist the terminal result";}this.emit(id,state);this.prune();}
 stop(id:string):void{this.finish(id,"stopped",null);}
 setDeliveryState(id:string,state:"pending"|"enqueued",error?:string):BackgroundJobSnapshot{const job=this.require(id);if(job.state==="running")throw new Error("Cannot deliver a running job result");job.deliveryState=state;if(state==="pending"&&error)job.deliveryError=error;else delete job.deliveryError;try{this.journal?.record(this.snapshot(id));delete job.persistenceError;}catch{job.persistenceError="Background journal could not persist delivery state";}return this.snapshot(id);}
 snapshot(id:string):BackgroundJobSnapshot{const job=this.require(id);return Object.freeze({id,sessionId:job.options.sessionId,projectId:job.options.projectId,command:job.options.command,mode:job.options.mode,state:job.state,createdAt:job.createdAt,updatedAt:job.updatedAt,exitCode:job.exitCode,eventCount:job.eventCount,tail:Object.freeze([...job.tail]),...(job.persistenceError?{persistenceError:job.persistenceError}:{}),...(job.deliveryState?{deliveryState:job.deliveryState}:{}),...(job.deliveryError?{deliveryError:job.deliveryError}:{})});}
 list(sessionId:string,projectId?:string):readonly BackgroundJobSnapshot[]{const active=[...this.#jobs.keys()].map(id=>this.snapshot(id)).filter(job=>job.sessionId===sessionId&&(projectId===undefined||job.projectId===projectId)),known=new Set(active.map(job=>job.id)),recovered=this.journal?.load(sessionId,projectId).filter(job=>!known.has(job.id))??[];return Object.freeze([...active,...recovered].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));}
 async disposeSession(sessionId:string):Promise<void>{const owned=[...this.#jobs].filter(([,job])=>job.options.sessionId===sessionId);for(const [id,job] of owned){job.disposeRequested=true;if(job.state==="running")this.finish(id,"stopped",null);if(!job.done)this.#jobs.delete(id);}
  const pending=owned.map(([,job])=>job.done).filter((done):done is Promise<BackgroundJobSnapshot>=>done!==undefined);if(!pending.length)return;
  let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([Promise.all(pending),new Promise<void>(resolve=>{timer=setTimeout(resolve,this.shutdownTimeoutMs);})]);}finally{if(timer)clearTimeout(timer);}
  for(const [id,job] of owned)if((!job.done||job.settled)&&this.#jobs.get(id)===job)this.#jobs.delete(id);
 }
 private require(id:string):Mutable{const job=this.#jobs.get(id);if(!job)throw new Error("Unknown background job");return job;}
 private observeDone(id:string,job:Mutable,done:Promise<BackgroundJobSnapshot>):void{job.done=done;void done.then(()=>{job.settled=true;if(job.disposeRequested&&this.#jobs.get(id)===job)this.#jobs.delete(id);},()=>{job.settled=true;if(job.disposeRequested&&this.#jobs.get(id)===job)this.#jobs.delete(id);});}
 private prune():void{
  const terminal=[...this.#jobs].filter(([,job])=>job.state!=="running").sort((a,b)=>a[1].updatedAt.localeCompare(b[1].updatedAt));
  const remove=new Set<string>();
  const bySession=new Map<string,string[]>();for(const [id,job] of terminal){const rows=bySession.get(job.options.sessionId)??[];rows.push(id);bySession.set(job.options.sessionId,rows);}
  for(const rows of bySession.values())for(const id of rows.slice(0,Math.max(0,rows.length-BackgroundJobRegistry.maxRetainedJobsPerSession)))remove.add(id);
  const remaining=terminal.filter(([id])=>!remove.has(id)),activeCount=this.#jobs.size-terminal.length;for(const [id] of remaining.slice(0,Math.max(0,remaining.length+activeCount-BackgroundJobRegistry.maxRetainedJobs)))remove.add(id);
  for(const id of remove)this.#jobs.delete(id);
 }
 private emit(id:string,kind:BackgroundJobEvent["kind"],line?:string):void{const job=this.require(id),eventId=kind==="line"?`${id}:line:${job.eventCount}`:`${id}:${kind}`,event:BackgroundJobEvent={id:eventId,jobId:id,sessionId:job.options.sessionId,projectId:job.options.projectId,mode:job.options.mode,kind,at:new Date().toISOString(),...(line!==undefined?{line}:{}) ,...(job.exitCode!==undefined?{exitCode:job.exitCode}:{})};for(const listener of [...job.listeners]){try{listener(Object.freeze(event));}catch{/* Observers cannot alter job lifecycle. */}}}
}

