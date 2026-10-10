import {types} from "node:util";
import { validateWriteGrant, type WriteGrant } from "../policies/scopes.js";
import type {Candidate} from "../core/types.js";
import {EvidenceStore} from "../evidence/store.js";
import {selectSkills} from "../skills/registry.js";
import {consumeIssuedWorkerContext,isIssuedSkillContext,matchesIssuedSkillContext,type IssuedSkillContext} from "../skills/context.js";
import {verifySkillEvidence} from "../verify/verifier.js";
import {consumePhaseGrant,retirePhaseGrant,consumeWriterAdmission} from "../lifecycle/skill-lifecycle.js";
import type {AgentLifecycleSink} from "../runtime/agent-lifecycle.js";

export interface AgentRequest { id:string; role:"explorer"|"worker"|"reviewer"|"verifier"; expectedPhase?:string; phaseGrant?:object; prompt:string; repository:string; model?:string; thinking?:"off"|"minimal"|"low"|"medium"|"high"; writeSurfaces?:string[]; isolationKey?:string; candidate?:Candidate; skillContext?:IssuedSkillContext; skillPaths?:string[]; writerAdmission?:object; runnerWriteReceiver?:object; }
export interface AgentArtifactProof { readonly requestId:string; readonly role:AgentRequest["role"]; readonly repository:string; readonly candidateId?:string; readonly candidateRevision?:string; readonly skillPaths:readonly string[]; }
export interface AgentResult { id:string; ok:boolean; output:string; artifactProof?:AgentArtifactProof; }
export interface AgentRunner { run(request:AgentRequest,signal?:AbortSignal):Promise<AgentResult>; }
const validatedRunnerResults=new WeakMap<object,{lifecycle:AgentLifecycleSink|undefined;id:string;sessionId:string;projectId:string;consumed:boolean}>();
/** Lifecycle code consumes a dispatcher result once, bound to one sink and exact task identity. */
export function consumeValidatedAgentResult(value:unknown,lifecycle:unknown,id:string,sessionId:string,projectId:string):value is AgentResult{
 if(typeof value!=="object"||value===null)return false;
 const proof=validatedRunnerResults.get(value);
 if(!proof||proof.consumed||proof.lifecycle!==lifecycle||proof.id!==id||proof.sessionId!==sessionId||proof.projectId!==projectId)return false;
 proof.consumed=true;return true;
}

// Only successful Dispatcher gates register receivers; public admission consumption cannot mint one.
const runnerReceivers=new WeakMap<object,{request:AgentRequest;used:boolean}>();
export function consumeRunnerWriteReceiver(receiver:unknown,request:AgentRequest):boolean{
 const r=typeof receiver==="object"&&receiver!==null?runnerReceivers.get(receiver):undefined;
 if(!r||r.used)return false;
 r.used=true;return r.request===request&&Object.isFrozen(request);
}
function retireRunnerWriteReceiver(receiver:unknown):void{const r=typeof receiver==="object"&&receiver!==null?runnerReceivers.get(receiver):undefined;if(r)r.used=true;}

function plainData(value:unknown):Record<string,unknown>{
 if(typeof value!=="object"||value===null||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("Agent request requires plain data");
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).some(key=>typeof key!=="string"||!descriptors[key]?.enumerable||!("value" in descriptors[key]!)))throw new Error("Agent request requires plain data fields");
 return Object.fromEntries(Object.entries(descriptors).map(([key,d])=>[key,d.value]));
}
function requestArray(value:unknown):string[]{
 if(typeof value!=="object"||value===null||types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>256)throw new Error("Agent request requires bounded array data");
 const keys=Reflect.ownKeys(value);
 if(keys.length!==value.length+1)throw new Error("Agent request requires exact array data");
 return Array.from({length:value.length},(_,i)=>{
  const d=Object.getOwnPropertyDescriptor(value,String(i));
  if(!d?.enumerable||!("value" in d)||typeof d.value!=="string")throw new Error("Agent request requires exact string array data");
  return d.value;
 });
}

export class Dispatcher {
 readonly #active:WriteGrant[]=[]; #running=0;
 readonly #waiters:Array<{resolve:()=>void;reject:(error:Error)=>void;signal:AbortSignal;onAbort:()=>void}>=[];
 readonly #controls=new Map<string,{controller:AbortController;sessionId:string;projectId:string}>();
 constructor(private readonly runner:AgentRunner,private readonly evidence:EvidenceStore,private readonly maxConcurrency=4,private readonly lifecycle?:AgentLifecycleSink){if(!Number.isInteger(maxConcurrency)||maxConcurrency<1)throw new Error("maxConcurrency must be a positive integer");}
 async #acquire(signal:AbortSignal):Promise<void>{
  if(signal.aborted)throw new Error("Agent dispatch cancelled before execution");
  if(this.#running<this.maxConcurrency){this.#running++;return;}
  await new Promise<void>((resolve,reject)=>{
   const waiter={resolve,reject,signal,onAbort:()=>{const index=this.#waiters.indexOf(waiter);if(index>=0)this.#waiters.splice(index,1);reject(new Error("Agent dispatch cancelled while queued"));}};
   this.#waiters.push(waiter);signal.addEventListener("abort",waiter.onAbort,{once:true});
   if(signal.aborted)waiter.onAbort();
  });
 }
 #release():void{
  while(this.#waiters.length){const next=this.#waiters.shift()!;next.signal.removeEventListener("abort",next.onAbort);if(next.signal.aborted){next.reject(new Error("Agent dispatch cancelled while queued"));continue;}next.resolve();return;}
  this.#running--;
 }
 /** Cancel a queued or running task. The runner receives the abort signal and must stop its owned work. */
 cancel(id:string,sessionId:string,projectId:string):boolean{const control=this.#controls.get(id);if(!control||control.sessionId!==sessionId||control.projectId!==projectId||control.controller.signal.aborted)return false;control.controller.abort();return true;}
 async dispatch(request:AgentRequest):Promise<AgentResult>{
  const token=typeof request==="object"&&request!==null&&!types.isProxy(request)?Object.getOwnPropertyDescriptor(request,"writerAdmission")?.value:undefined;
  let runnerRequest:AgentRequest;
  try{
   const data=plainData(request),{writerAdmission:_admission,runnerWriteReceiver:_receiver,...forwarded}=data;
   runnerRequest={...forwarded,
    ...(data.candidate?{candidate:Object.freeze(plainData(data.candidate))}:{}),
    ...(data.writeSurfaces?{writeSurfaces:Object.freeze(requestArray(data.writeSurfaces))}:{}),
    ...(data.skillPaths?{skillPaths:Object.freeze(requestArray(data.skillPaths))}:{}),
   } as unknown as AgentRequest;
  }catch(error){consumeWriterAdmission(token,{id:"",role:"worker",prompt:"",repository:""});throw error;}
  const admitted=consumeWriterAdmission(token,runnerRequest),receiver=admitted?Object.freeze({}):undefined;
  if(receiver)runnerRequest.runnerWriteReceiver=receiver;
  Object.freeze(runnerRequest);request=runnerRequest;
  if(this.#controls.has(request.id))throw new Error("Agent task is already queued or running");
  const controller=new AbortController();this.#controls.set(request.id,{controller,sessionId:request.isolationKey??"default",projectId:request.repository});
  const lifecycleInput={id:request.id,role:request.role,owner:{kind:"system" as const,id:"asen-dispatcher"},sessionId:request.isolationKey??"default",projectId:request.repository,createdAt:this.lifecycle?.createdAt()??new Date().toISOString()};
  try{this.lifecycle?.queued(lifecycleInput);}catch(error){this.#controls.delete(request.id);retireRunnerWriteReceiver(receiver);retirePhaseGrant(request);throw error;}
  let grant:WriteGrant|undefined,lifecycleRunning=false,acquired=false,terminalState=false;
  try{
   await this.#acquire(controller.signal);acquired=true;
   if(controller.signal.aborted)throw new Error("Agent dispatch cancelled before execution");
   this.lifecycle?.running(request.id);lifecycleRunning=true;
   if(request.writeSurfaces&&request.role!=="worker") throw new Error("Only worker agents may receive write authority");
   if(request.skillContext||request.skillPaths){
    if(!request.skillContext||!isIssuedSkillContext(request.skillContext)) throw new Error("Delegated skill paths require ASEN-issued skill selection context");
    const rolePhase=request.role==="explorer"?"explore":request.role==="reviewer"?"adversarial-review":request.role==="verifier"?"verify":undefined;
    if(request.expectedPhase&&rolePhase&&request.expectedPhase!==rolePhase)throw new Error("Delegated expected phase does not match agent role");
    const requiredPhase=rolePhase??request.expectedPhase;
    if(requiredPhase&&request.skillContext.phase!==requiredPhase) throw new Error("Delegated skill context does not match agent role");
    if(!matchesIssuedSkillContext(request.skillContext,request.id,request.repository,request.candidate)) throw new Error("Delegated skill context does not match task/candidate");
    const expectedPaths=selectSkills(request.skillContext).map(skill=>skill.path);
    if(!request.skillPaths||request.skillPaths.length!==expectedPaths.length||request.skillPaths.some((path,index)=>path!==expectedPaths[index])) throw new Error("Delegated skill paths do not match issued context");
   }
   if(request.writeSurfaces){
    if(!request.candidate) throw new Error("Write authority requires an exact candidate");
    if(request.candidate.repository!==request.repository) throw new Error("Write candidate repository mismatch");
    if(!request.skillContext) throw new Error("Write authority requires skill selection context");
    if(!isIssuedSkillContext(request.skillContext)) throw new Error("Write authority requires ASEN-issued skill selection context");
    if(!matchesIssuedSkillContext(request.skillContext,request.id,request.repository,request.candidate)) throw new Error("Write authority skill context does not match task/candidate");
    if(request.skillContext.phase!=="apply")throw new Error("Write authority requires an issued apply phase");
    const selectedSkills=selectSkills(request.skillContext);
    const skills=selectedSkills.map(skill=>skill.id);
    if(!skills.length) throw new Error("Write authority requires mandatory skills");
    const gate=verifySkillEvidence(request.candidate,skills,this.evidence,"mutation");
    if(!gate.ok) throw new Error(`Write authority blocked: ${gate.reason}`);
    if(!receiver)throw new Error("Write authority requires unused exact writer admission");
    grant={agentId:request.id,repository:request.repository,surfaces:request.writeSurfaces};
    if(request.isolationKey)grant.isolationKey=request.isolationKey;
    validateWriteGrant(grant,this.#active);this.#active.push(grant);
   }
   if(request.candidate&&(!request.skillContext||!request.skillPaths))throw new Error("Candidate-bound delegation requires issued skill context and exact paths");
   if(request.role==="worker"&&request.expectedPhase&&!consumePhaseGrant(request))throw new Error("Worker phase requires unused ASEN lifecycle grant");
   if(request.role==="worker"&&request.candidate&&!consumeIssuedWorkerContext(request.skillContext!))throw new Error("Candidate-bound worker requires unused worker context");
   if(receiver)runnerReceivers.set(receiver,{request:runnerRequest,used:false});
   const result=await this.runner.run(runnerRequest,controller.signal);
   if(!result||result.id!==request.id||typeof result.ok!=="boolean"||typeof result.output!=="string")throw new Error("Agent runner returned an invalid or mismatched result");
   const acceptedResult=Object.freeze({...result});validatedRunnerResults.set(acceptedResult,{lifecycle:this.lifecycle,id:request.id,sessionId:request.isolationKey??"default",projectId:request.repository,consumed:false});
   if(controller.signal.aborted){this.lifecycle?.cancelled(request.id,result.output);terminalState=true;lifecycleRunning=false;return {id:request.id,ok:false,output:"Cancellation requested; completion was not accepted"};}
   if(acceptedResult.ok)this.lifecycle?.completed(request.id,acceptedResult);else this.lifecycle?.failed(request.id,acceptedResult.output);
   terminalState=true;lifecycleRunning=false;return acceptedResult;
  } catch(error){if(!terminalState){try{if(controller.signal.aborted)this.lifecycle?.cancelled(request.id,error instanceof Error?error.message:String(error));else this.lifecycle?.failed(request.id,error instanceof Error?error.message:String(error));}catch{}}throw error;
  } finally {this.#controls.delete(request.id);retireRunnerWriteReceiver(receiver);retirePhaseGrant(request);if(grant){const i=this.#active.indexOf(grant);if(i>=0)this.#active.splice(i,1);}if(acquired)this.#release();}
 }
}
