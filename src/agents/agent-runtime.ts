import {randomUUID} from "node:crypto";
import type {AgentRequest,AgentRunner} from "./dispatcher.js";
import {Dispatcher} from "./dispatcher.js";
import {EvidenceStore} from "../evidence/store.js";
import type {Candidate} from "../core/types.js";
import type {OrchestrationRouteEvidence} from "../orchestration/orchestrator.js";
import {issueSkillContext} from "../skills/context.js";
import type {PublicAgentRecord} from "../runtime/agent-lifecycle.js";
import {PersistentAgentStore} from "../runtime/agent-store.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";

export interface AgentSessionIdentity{sessionId:string;projectId:string;}
/** Production coordinator using the existing Dispatcher, with session checks around every public action. */
export class AgentRuntime{
 readonly #terminalListeners=new Set<(record:PublicAgentRecord)=>void>();
 readonly #executions=new Map<string,Promise<unknown>>();
 private constructor(readonly store:PersistentAgentStore,private readonly dispatcher:Dispatcher,private readonly evidence:EvidenceStore,readonly quarantined?:string){}
 static async open(options:{storeFile:string;runner:AgentRunner;maxConcurrency?:number}):Promise<AgentRuntime>{
  const {store,quarantined}=await PersistentAgentStore.open(options.storeFile),evidence=new EvidenceStore(),dispatcher=new Dispatcher(options.runner,evidence,options.maxConcurrency??4,store);
  return new AgentRuntime(store,dispatcher,evidence,quarantined);
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
 async startReadOnly(input:{role:"clarifier"|"explorer"|"reviewer"|"verifier";prompt:string;session:AgentSessionIdentity;owner?:PublicAgentRecord["owner"];skillSelection?:SkillSelectionContext;onPrepared?:(agentId:string,enqueue:()=>Promise<void>,dispatch:()=>void)=>Promise<void>;onQueued?:(agentId:string,dispatch:()=>void)=>Promise<void>},signal?:AbortSignal):Promise<string>{
  if(!input.session.sessionId||!input.session.projectId||input.onPrepared&&input.onQueued)throw new Error("An active Pi session and project with one launch boundary is required");
  const requiredPhase={explorer:"explore",reviewer:"adversarial-review",verifier:"verify"}[input.role as Exclude<typeof input.role,"clarifier">];
  if(input.role==="clarifier"&&input.skillSelection)throw new Error("clarifier dispatch cannot receive a skill phase");
  if(input.skillSelection&&input.skillSelection.phase!==requiredPhase)throw new Error(`${input.role} dispatch requires a ${requiredPhase}-phase skill selection`);
  const request:AgentRequest={id:`agent-${randomUUID()}`,role:input.role,prompt:input.prompt,repository:input.session.projectId,isolationKey:input.session.sessionId,owner:input.owner??{kind:"user",id:`pi:${input.session.sessionId}`}};
  if(input.skillSelection){request.skillContext=issueSkillContext(request.id,request.repository,undefined,input.skillSelection);request.skillPaths=selectSkills(request.skillContext).map(skill=>skill.path);}
  let enqueued=false,dispatched=false;
  const enqueue=async()=>{if(enqueued)throw new Error("Agent launch may enqueue only once");await this.store.enqueue(request,request.owner!,signal);enqueued=true;};
  const dispatch=()=>{if(!enqueued)throw new Error("Agent launch must be durably enqueued before dispatch");if(dispatched)throw new Error("Agent launch may dispatch only once");if(signal?.aborted)throw Object.assign(new Error("Agent task cancelled before execution"),{name:"AbortError"});this.#dispatch(request,signal);dispatched=true;};
  try{
   if(input.onPrepared)await input.onPrepared(request.id,enqueue,dispatch);
   else{await enqueue();if(signal?.aborted)throw Object.assign(new Error("Agent task cancelled before execution"),{name:"AbortError"});if(input.onQueued)await input.onQueued(request.id,dispatch);else dispatch();}
   if(!enqueued||!dispatched)throw new Error("Trusted Todo binding did not durably enqueue and start the agent dispatch");
  }catch(error){if(enqueued&&!dispatched)await this.store.cancelled(request.id,"Agent binding or launch was cancelled before dispatch").catch(()=>{});throw error;}
  return request.id;
 }
 /** Starts one user-approved worker bound to an exact persisted plan, candidate and file scope. */
 async startControlledWorker(input:{taskIdentity:string;prompt:string;session:AgentSessionIdentity;candidate:Candidate;writeSurfaces:readonly string[];skillSelection:SkillSelectionContext;writerAdmission:object;routeEvidence:OrchestrationRouteEvidence;onQueued?:(agentId:string,dispatch:()=>void)=>Promise<void>},signal?:AbortSignal):Promise<string>{
  if(!input.taskIdentity||!input.prompt||input.prompt!==input.prompt.trim()||input.prompt.length>32_000||!input.session.sessionId||!input.session.projectId)throw new Error("A controlled worker requires an exact task, prompt, session and project");
  if(input.candidate.repository!==input.session.projectId||input.skillSelection.phase!=="apply"||!Array.isArray(input.writeSurfaces)||!input.writeSurfaces.length||input.writeSurfaces.length>256||input.writeSurfaces.some(surface=>typeof surface!=="string"||!surface))throw new Error("A controlled worker requires the exact candidate, apply phase and bounded write scope");
  const request:AgentRequest={id:`${input.taskIdentity}:worker`,role:"worker",prompt:input.prompt,repository:input.session.projectId,isolationKey:input.session.sessionId,owner:{kind:"user",id:`pi:${input.session.sessionId}`},candidate:structuredClone(input.candidate),writeSurfaces:[...input.writeSurfaces],writerAdmission:input.writerAdmission};
  const context=issueSkillContext(request.id,request.repository,request.candidate,input.skillSelection);
  request.skillContext=context;request.skillPaths=selectSkills(context).map(skill=>skill.path);
  const authorizedAt=new Date().toISOString(),scope=input.writeSurfaces.join(", ");
  this.evidence.addRouteDecision(input.candidate,input.routeEvidence,{id:`plan-route:${request.id}`,summary:`Explicit Pi authorization for ${request.id}`,createdAt:authorizedAt});
  this.evidence.add(input.candidate,{id:`plan-work-unit:${request.id}`,kind:"work-unit",status:"pass",summary:`User approved the exact persisted task: ${request.id}`,createdAt:authorizedAt});
  this.evidence.add(input.candidate,{id:`plan-scope:${request.id}`,kind:"scope",status:"pass",summary:`User approved only these write surfaces: ${scope}`,createdAt:authorizedAt});
  this.evidence.add(input.candidate,{id:`plan-rollback:${request.id}`,kind:"rollback",status:"pass",summary:"On failure, stop; do not commit or merge; leave the scoped changes for review.",createdAt:authorizedAt});
  await this.store.enqueueControlledWorker(request,request.owner!,signal);
  if(signal?.aborted){await this.store.cancelled(request.id,"Pi cancelled the authorized worker before dispatch");throw Object.assign(new Error("Worker cancelled before execution"),{name:"AbortError"});}
  let dispatched=false;
  const dispatch=()=>{if(dispatched)throw new Error("Controlled worker may dispatch only once");if(signal?.aborted)throw Object.assign(new Error("Worker cancelled before execution"),{name:"AbortError"});this.#dispatch(request,signal);dispatched=true;};
  try{if(input.onQueued){await input.onQueued(request.id,dispatch);if(!dispatched)throw new Error("Trusted Todo binding did not start the worker");}else dispatch();}
  catch(error){if(!dispatched)await this.store.cancelled(request.id,"Worker authorization or binding was cancelled before dispatch").catch(()=>{});throw error;}
  return request.id;
 }
 async startExplorer(input:{prompt:string;session:AgentSessionIdentity;owner?:PublicAgentRecord["owner"];skillSelection?:SkillSelectionContext;onQueued?:(agentId:string,dispatch:()=>void)=>Promise<void>},signal?:AbortSignal):Promise<string>{return this.startReadOnly({role:"explorer",...input},signal);}
 async cancel(id:string,identity:AgentSessionIdentity):Promise<boolean>{
  const entry=await this.store.get(id,identity.sessionId,identity.projectId);if(!entry||!["queued","running","interrupted"].includes(entry.record.state))return false;
  if(this.dispatcher.cancel(id,identity.sessionId,identity.projectId)){await this.#executions.get(id)?.catch(()=>{});return true;}
  if(entry.record.state==="queued"||entry.record.state==="interrupted"){await this.store.cancelled(id,"Cancelled by the owning Pi session");return true;}
  return false;
 }
 async continue(id:string,identity:AgentSessionIdentity,signal?:AbortSignal,onQueued?:(agentId:string,dispatch:()=>void)=>Promise<void>):Promise<string>{
  const request=await this.store.enqueueContinuation(id,identity.sessionId,identity.projectId,{kind:"user",id:`pi:${identity.sessionId}`},signal);
  if(signal?.aborted){await this.store.cancelled(request.id,"Pi cancelled the continuation after durable enqueue and before dispatch");throw Object.assign(new Error("Agent task cancelled before execution"),{name:"AbortError"});}
  let dispatched=false;
  const dispatch=()=>{if(dispatched)throw new Error("Agent continuation may dispatch only once");if(signal?.aborted)throw Object.assign(new Error("Agent task cancelled before execution"),{name:"AbortError"});this.#dispatch(request,signal);dispatched=true;};
  try{if(onQueued){await onQueued(request.id,dispatch);if(!dispatched)throw new Error("Trusted Todo binding did not start the continuation");}else dispatch();}
  catch(error){if(!dispatched)await this.store.cancelled(request.id,"Agent binding or continuation was cancelled before dispatch").catch(()=>{});throw error;}
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
   return undefined;
  }));
 }
}
