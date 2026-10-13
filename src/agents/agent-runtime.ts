import {randomUUID} from "node:crypto";
import type {AgentRequest,AgentRunner} from "./dispatcher.js";
import {Dispatcher} from "./dispatcher.js";
import {EvidenceStore} from "../evidence/store.js";
import type {PublicAgentRecord} from "../runtime/agent-lifecycle.js";
import {PersistentAgentStore} from "../runtime/agent-store.js";
import {issueSkillContext} from "../skills/context.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";

export interface AgentSessionIdentity{sessionId:string;projectId:string;}
/** Production coordinator using the existing Dispatcher, with session checks around every public action. */
export class AgentRuntime{
 readonly #terminalListeners=new Set<(record:PublicAgentRecord)=>void>();
 readonly #executions=new Map<string,Promise<unknown>>();
 private constructor(readonly store:PersistentAgentStore,private readonly dispatcher:Dispatcher,readonly quarantined?:string){}
 static async open(options:{storeFile:string;runner:AgentRunner;maxConcurrency?:number}):Promise<AgentRuntime>{
  const {store,quarantined}=await PersistentAgentStore.open(options.storeFile),dispatcher=new Dispatcher(options.runner,new EvidenceStore(),options.maxConcurrency??4,store);
  return new AgentRuntime(store,dispatcher,quarantined);
 }
 snapshot():readonly PublicAgentRecord[]{return this.store.snapshot();}
 async list(identity:AgentSessionIdentity):Promise<readonly PublicAgentRecord[]>{return this.store.list(identity.sessionId,identity.projectId);}
 async query(id:string,identity:AgentSessionIdentity){
  const entry=await this.store.get(id,identity.sessionId,identity.projectId);
  return entry?{record:entry.record,history:entry.events}:null;
 }
 /** Observers receive only persisted terminal outcomes; notification failures cannot alter execution. */
 subscribeTerminal(listener:(record:PublicAgentRecord)=>void):()=>void{
  this.#terminalListeners.add(listener);return ()=>{this.#terminalListeners.delete(listener);};
 }
 async #publishTerminal(request:AgentRequest):Promise<void>{
  try{
   const entry=await this.store.get(request.id,request.isolationKey??"default",request.repository);
   if(!entry||!["completed","failed","cancelled"].includes(entry.record.state))return;
   for(const listener of this.#terminalListeners)try{listener(structuredClone(entry.record));}catch{/* The durable result remains queryable. */}
  }catch{/* A failed storage read must never produce a success notification. */}
 }
 #dispatch(request:AgentRequest,signal?:AbortSignal):void{
  const sessionId=request.isolationKey??"default",projectId=request.repository;
  const onAbort=()=>{this.dispatcher.cancel(request.id,sessionId,projectId);};
  signal?.addEventListener("abort",onAbort,{once:true});
  const execution=this.dispatcher.dispatch(request);this.#executions.set(request.id,execution);
  void execution.then(()=>this.#publishTerminal(request),()=>this.#publishTerminal(request)).finally(()=>{signal?.removeEventListener("abort",onAbort);if(this.#executions.get(request.id)===execution)this.#executions.delete(request.id);});
 }
 async startExplorer(input:{prompt:string;session:AgentSessionIdentity;owner?:PublicAgentRecord["owner"];skillSelection?:SkillSelectionContext;onQueued?:(agentId:string,dispatch:()=>void)=>Promise<void>},signal?:AbortSignal):Promise<string>{
  if(!input.session.sessionId||!input.session.projectId)throw new Error("An active Pi session and project are required");
  if(input.skillSelection&&input.skillSelection.phase!=="explore")throw new Error("Explorer dispatch requires an explore-phase skill selection");
  const request:AgentRequest={id:`agent-${randomUUID()}`,role:"explorer",prompt:input.prompt,repository:input.session.projectId,isolationKey:input.session.sessionId,owner:input.owner??{kind:"user",id:`pi:${input.session.sessionId}`}};
  if(input.skillSelection){request.skillContext=issueSkillContext(request.id,request.repository,undefined,input.skillSelection);request.skillPaths=selectSkills(request.skillContext).map(skill=>skill.path);}
  await this.store.enqueue(request,request.owner!,signal);
  if(signal?.aborted){await this.store.cancelled(request.id,"Pi cancelled the launch after durable enqueue and before dispatch");throw Object.assign(new Error("Agent task cancelled before execution"),{name:"AbortError"});}
  let dispatched=false;
  const dispatch=()=>{if(dispatched)throw new Error("Agent launch may dispatch only once");if(signal?.aborted)throw Object.assign(new Error("Agent task cancelled before execution"),{name:"AbortError"});this.#dispatch(request,signal);dispatched=true;};
  try{
   if(input.onQueued){await input.onQueued(request.id,dispatch);if(!dispatched)throw new Error("Trusted Todo binding did not start the agent dispatch");}
   else dispatch();
  }catch(error){if(!dispatched)await this.store.cancelled(request.id,"Agent binding or launch was cancelled before dispatch").catch(()=>{});throw error;}
  return request.id;
 }
 async cancel(id:string,identity:AgentSessionIdentity):Promise<boolean>{
  const entry=await this.store.get(id,identity.sessionId,identity.projectId);if(!entry||!["queued","running","interrupted"].includes(entry.record.state))return false;
  if(this.dispatcher.cancel(id,identity.sessionId,identity.projectId)){await this.#executions.get(id)?.catch(()=>{});return true;}
  if(entry.record.state==="queued"||entry.record.state==="interrupted"){await this.store.cancelled(id,"Cancelled by the owning Pi session");return true;}
  return false;
 }
 async continue(id:string,identity:AgentSessionIdentity,signal?:AbortSignal):Promise<string>{
  const request=await this.store.enqueueContinuation(id,identity.sessionId,identity.projectId,{kind:"user",id:`pi:${identity.sessionId}`},signal);
  this.#dispatch(request);
  return request.id;
 }
 async cancelSessionProjects(sessionId:string):Promise<void>{
  const projects=new Set(this.store.snapshot().filter(record=>record.sessionId===sessionId&&this.#executions.has(record.id)).map(record=>record.projectId));
  await Promise.all([...projects].map(projectId=>this.cancelSession({sessionId,projectId})));
 }
 async cancelSession(identity:AgentSessionIdentity):Promise<void>{
  const entries=await this.store.list(identity.sessionId,identity.projectId);
  await Promise.all(entries.filter(x=>x.state==="queued"||x.state==="running").map(async record=>{
   const cancelled=this.dispatcher.cancel(record.id,identity.sessionId,identity.projectId),execution=this.#executions.get(record.id);
   if(execution)await execution.catch(()=>{});
   else if(!cancelled&&record.state==="queued")await this.store.cancelled(record.id,"Pi session ended before execution");
  }));
 }
}
