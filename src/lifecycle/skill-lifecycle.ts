import {open,readFile,rename,unlink} from "node:fs/promises";
import {dirname,basename,join} from "node:path";
import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import type {Candidate,Risk} from "../core/types.js";
import {matchesIssuedSkillContext,type IssuedSkillContext} from "../skills/context.js";
import {selectSkills} from "../skills/registry.js";
import type {Dispatcher,AgentRequest} from "../agents/dispatcher.js";
import {EvidenceStore} from "../evidence/store.js";
import {authorizeRelease,authorizeVerified} from "../verify/verifier.js";

export const lifecyclePhases=["context-init","explore","proposal","specification","design","tasks","apply","verify","archive"] as const;
export type LifecyclePhase=typeof lifecyclePhases[number];
export type LifecycleRole="explorer"|"worker"|"verifier";
const requiredArtifact:Record<LifecyclePhase,string>={
 "context-init":"project-context",explore:"exploration",proposal:"proposal",specification:"specification",
 design:"design",tasks:"task-plan",apply:"apply-result",verify:"verification-report",archive:"archive-report"
};
const roleFor:Record<LifecyclePhase,LifecycleRole>={
 "context-init":"worker",explore:"explorer",proposal:"worker",specification:"worker",design:"worker",
 tasks:"worker",apply:"worker",verify:"verifier",archive:"worker"
};
export interface LifecycleArtifact{kind:string;content:string;repository:string;candidateId:string;revision:string;}
export interface LifecycleRecord{phase:LifecyclePhase;role:LifecycleRole;artifact:LifecycleArtifact;skillPaths:string[];}
export interface LifecycleSnapshot{version:1;taskId:string;candidate:Candidate;nextPhase:LifecyclePhase|null;records:LifecycleRecord[];}
const isPhase=(value:unknown):value is LifecyclePhase=>typeof value==="string"&&lifecyclePhases.includes(value as LifecyclePhase);
const copy=(snapshot:LifecycleSnapshot):LifecycleSnapshot=>structuredClone(snapshot);

export class SkillLifecycle{
 #snapshot:LifecycleSnapshot;
 constructor(taskId:string,candidate:Candidate,snapshot?:LifecycleSnapshot){
  if(!taskId||!candidate.id||!candidate.repository||!candidate.revision)throw new Error("Lifecycle requires task and exact candidate");
  this.#snapshot=snapshot?copy(snapshot):{version:1,taskId,candidate:structuredClone(candidate),nextPhase:"context-init",records:[]};
  if(snapshot) validateSnapshot(this.#snapshot,taskId,candidate);
 }
 get state():LifecycleSnapshot{return copy(this.#snapshot);}
 async runPhase(dispatcher:Dispatcher,input:{phase:LifecyclePhase;context:IssuedSkillContext;skillPaths:string[];prompt:string;evidence:EvidenceStore;risk:Risk;writeSurfaces?:string[]}):Promise<LifecycleSnapshot>{
  const role=roleFor[input.phase],s=this.#snapshot;
  if(input.phase!==s.nextPhase)throw new Error("Lifecycle phase out of order");
  if(input.phase==="apply"&&(!input.writeSurfaces||!input.writeSurfaces.length))throw new Error("Lifecycle apply requires bounded write surfaces");
  if(input.phase!=="apply"&&input.writeSurfaces?.length)throw new Error("Lifecycle write authority only available in apply");
  const request:AgentRequest={id:`${s.taskId}:${role}`,role,prompt:input.prompt,repository:s.candidate.repository,skillContext:input.context,skillPaths:input.skillPaths,
   ...(input.phase==="apply"?{candidate:s.candidate,writeSurfaces:input.writeSurfaces!}:{})};
  // Validate authority before invoking the agent, then validate its result before advancing.
  this.#assertAuthority(input.phase,role,input.context,input.skillPaths);
  if(input.phase==="verify")authorizeVerified(s.candidate,input.risk,input.context,input.evidence);
  if(input.phase==="archive"){
   const release=authorizeRelease(s.candidate,input.risk,input.evidence,input.context);
   if(!release.ok)throw new Error(`Lifecycle archive blocked: ${release.reason}`);
  }
  const response=await dispatcher.dispatch(request);
  if(!response.ok||response.id!==request.id)throw new Error("Lifecycle agent result failed or belongs to another task");
  let artifact:LifecycleArtifact;
  try{artifact=JSON.parse(response.output) as LifecycleArtifact;}catch{throw new Error("Lifecycle agent artifact is not structured JSON");}
  return this.#complete({phase:input.phase,role,context:input.context,skillPaths:input.skillPaths,artifact});
 }
 #assertAuthority(phase:LifecyclePhase,role:LifecycleRole,context:IssuedSkillContext,paths:string[]):void{
  const s=this.#snapshot;
  if(role!==roleFor[phase])throw new Error("Lifecycle role lacks authority");
  if(!matchesIssuedSkillContext(context,`${s.taskId}:${role}`,s.candidate.repository,s.candidate)||context.phase!==phase)throw new Error("Lifecycle context lacks phase/task/candidate authority");
  const expected=selectSkills(context).map(skill=>skill.path);
  if(expected.length!==paths.length||expected.some((path,index)=>path!==paths[index]))throw new Error("Lifecycle skill routes mismatch");
 }
 #complete(input:{phase:LifecyclePhase;role:LifecycleRole;context:IssuedSkillContext;skillPaths:string[];artifact:LifecycleArtifact}):LifecycleSnapshot{
  const s=this.#snapshot;
  if(!s.nextPhase||input.phase!==s.nextPhase)throw new Error("Lifecycle phase out of order");
  this.#assertAuthority(input.phase,input.role,input.context,input.skillPaths);
  const a=input.artifact;
  if(a.kind!==requiredArtifact[input.phase]||!a.content.trim()||a.repository!==s.candidate.repository||a.candidateId!==s.candidate.id||a.revision!==s.candidate.revision)throw new Error("Lifecycle required artifact missing or stale");
  const index=lifecyclePhases.indexOf(input.phase);
  const next=lifecyclePhases[index+1]??null;
  this.#snapshot={...s,nextPhase:next,records:[...s.records,{phase:input.phase,role:input.role,artifact:structuredClone(a),skillPaths:[...input.skillPaths]}]};
  return this.state;
 }
}
function validateSnapshot(s:LifecycleSnapshot,taskId:string,candidate:Candidate):void{
 if(s.version!==1||s.taskId!==taskId||s.candidate.id!==candidate.id||s.candidate.repository!==candidate.repository||s.candidate.revision!==candidate.revision)throw new Error("Lifecycle recovery identity mismatch");
 if(!Array.isArray(s.records)||s.records.length>lifecyclePhases.length)throw new Error("Lifecycle recovery records invalid");
 for(let i=0;i<s.records.length;i++){
  const record=s.records[i],phase=lifecyclePhases[i];
  if(!record||!phase||record.phase!==phase||record.role!==roleFor[phase])throw new Error("Lifecycle recovery phase gap");
  const a=record.artifact;
  if(!a||a.kind!==requiredArtifact[phase]||typeof a.content!=="string"||!a.content.trim()||a.repository!==candidate.repository||a.candidateId!==candidate.id||a.revision!==candidate.revision)throw new Error("Lifecycle recovery artifact mismatch");
  if(!Array.isArray(record.skillPaths)||record.skillPaths.some(path=>typeof path!=="string"||!/^skills\/asen-[a-z-]+\/SKILL\.md$/.test(path)))throw new Error("Lifecycle recovery skill routes invalid");
 }
 if(s.nextPhase!==(lifecyclePhases[s.records.length]??null))throw new Error("Lifecycle recovery next phase mismatch");
}
function signature(snapshot:LifecycleSnapshot,key:Buffer):string{
 if(key.length<32)throw new Error("Lifecycle recovery requires a 32-byte secret");
 return createHmac("sha256",key).update(JSON.stringify(snapshot)).digest("hex");
}
export async function saveLifecycle(path:string,snapshot:LifecycleSnapshot,key:Buffer):Promise<void>{
 validateSnapshot(snapshot,snapshot.taskId,snapshot.candidate);
 const temp=join(dirname(path),`.${basename(path)}.${randomUUID()}.tmp`);
 let handle;
 try{handle=await open(temp,"wx",0o600);await handle.writeFile(JSON.stringify({snapshot,mac:signature(snapshot,key)}),"utf8");await handle.sync();await handle.close();handle=undefined;await rename(temp,path);}
 finally{if(handle)await handle.close();await unlink(temp).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});}
}
export async function loadLifecycle(path:string,taskId:string,candidate:Candidate,key:Buffer):Promise<SkillLifecycle>{
 const parsed=JSON.parse(await readFile(path,"utf8")) as {snapshot:LifecycleSnapshot;mac:string};
 if(!parsed?.snapshot||typeof parsed.mac!=="string"||!/^[0-9a-f]{64}$/i.test(parsed.mac))throw new Error("Lifecycle recovery signature missing");
 const expected=Buffer.from(signature(parsed.snapshot,key),"hex"),actual=Buffer.from(parsed.mac,"hex");
 if(!timingSafeEqual(expected,actual))throw new Error("Lifecycle recovery integrity mismatch");
 return new SkillLifecycle(taskId,candidate,parsed.snapshot);
}
