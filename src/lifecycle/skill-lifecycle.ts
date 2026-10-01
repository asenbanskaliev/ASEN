import {open,readFile,rename,unlink} from "node:fs/promises";
import {dirname,basename,join} from "node:path";
import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import type {Candidate,Risk} from "../core/types.js";
import {issueSkillContext,matchesIssuedSkillContext,type IssuedSkillContext} from "../skills/context.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";
import type {Dispatcher,AgentRequest} from "../agents/dispatcher.js";
import {isIssuedAgentArtifactProof} from "../agents/pi-artifact-runner.js";
import {EvidenceStore} from "../evidence/store.js";
import {authorizeRelease,authorizeVerified} from "../verify/verifier.js";
import {assertDirectGitParent} from "../evidence/git-lineage.js";
import {claimLifecycleApplicability,tddObligationFor,type LifecycleApplicability,type TddObligation} from "./applicability.js";
import {claimStrictTddCompletion,type StrictTddCompletion} from "../test/strict-tdd-cycle.js";
import {claimNonTddAlternativeResult,type NonTddAlternativeResult} from "../test/non-tdd-alternative.js";

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
export interface LifecycleSnapshot{version:1;taskId:string;candidate:Candidate;nextPhase:LifecyclePhase|null;records:LifecycleRecord[];revisions?:string[];tddPromotion?:"strict-pending-persistence"|"alternative-pending-persistence";pendingAuthority?:{phase:LifecyclePhase;role:LifecycleRole;selection:SkillSelectionContext;skillPaths:string[]};}
const copy=(snapshot:LifecycleSnapshot):LifecycleSnapshot=>structuredClone(snapshot);
const sameStrings=(left:readonly string[],right:readonly string[])=>left.length===right.length&&left.every((item,index)=>item===right[index]);
function honestRevisionChain(repository:string,revisions:readonly string[]):string[]{
 const collapsed=revisions.filter((revision,index)=>index===0||revision!==revisions[index-1]);
 if(!collapsed.length||collapsed.length>5||new Set(collapsed).size!==collapsed.length)throw new Error("TDD revision chain must contain at most five honest unique revisions");
 for(let index=1;index<collapsed.length;index++)assertDirectGitParent(repository,collapsed[index-1]!,collapsed[index]!);
 return collapsed;
}
const verifiedRecovery=new WeakSet<SkillLifecycle>();
const liveObligations=new WeakMap<SkillLifecycle,TddObligation>();
class LifecycleConstructionRequest{
 readonly #brand=true;
 constructor(readonly taskId:string,readonly candidate:Candidate,readonly snapshot?:LifecycleSnapshot){}
 isValid():boolean{return this.#brand;}
}
const lifecycleConstructionRequests=new WeakSet<LifecycleConstructionRequest>();
function constructLifecycle(taskId:string,candidate:Candidate,snapshot?:LifecycleSnapshot,obligation?:TddObligation):SkillLifecycle{
 const request=new LifecycleConstructionRequest(taskId,candidate,snapshot);
 lifecycleConstructionRequests.add(request);
 const lifecycle=new SkillLifecycle(request);
 if(obligation)liveObligations.set(lifecycle,obligation);
 return lifecycle;
}
const phaseGrants=new WeakMap<object,{requestId:string;repository:string;candidateId:string;revision:string;phase:LifecyclePhase;used:boolean;active:boolean;piUsed:boolean}>();
function issuePhaseGrant(requestId:string,candidate:Candidate,phase:LifecyclePhase):object{
 const grant=Object.freeze({});phaseGrants.set(grant,{requestId,repository:candidate.repository,candidateId:candidate.id,revision:candidate.revision,phase,used:false,active:false,piUsed:false});return grant;
}
export function consumePhaseGrant(request:AgentRequest):boolean{
 const grant=request.phaseGrant&&phaseGrants.get(request.phaseGrant);
 if(!grant||grant.used||!request.candidate||grant.requestId!==request.id||grant.repository!==request.repository||grant.candidateId!==request.candidate.id||grant.revision!==request.candidate.revision||grant.phase!==request.expectedPhase)return false;
 grant.used=true;grant.active=true;return true;
}
export function authorizePiWriteGrant(request:AgentRequest):boolean{
 const grant=request.phaseGrant&&phaseGrants.get(request.phaseGrant);
 if(!grant||!grant.active||grant.piUsed||!grant.used||!request.candidate||grant.phase!=="apply"||request.expectedPhase!=="apply"||request.skillContext?.phase!=="apply"||grant.requestId!==request.id||grant.repository!==request.repository||grant.candidateId!==request.candidate.id||grant.revision!==request.candidate.revision)return false;
 grant.piUsed=true;return true;
}
export function retirePhaseGrant(request:AgentRequest):void{
 const grant=request.phaseGrant&&phaseGrants.get(request.phaseGrant);
 if(grant)grant.active=false;
}

export class SkillLifecycle{
 #snapshot:LifecycleSnapshot;
 constructor(request:LifecycleConstructionRequest){
  if(typeof request!=="object"||request===null||!lifecycleConstructionRequests.has(request))throw new Error("SkillLifecycle construction requires genuine applicability or verified recovery");
  lifecycleConstructionRequests.delete(request);
  if(!request.isValid())throw new Error("SkillLifecycle construction request is invalid");
  const {taskId,candidate,snapshot}=request;
  if(!taskId||!candidate.id||!candidate.repository||!candidate.revision)throw new Error("Lifecycle requires task and exact candidate");
  this.#snapshot=snapshot?copy(snapshot):{version:1,taskId,candidate:structuredClone(candidate),nextPhase:"context-init",records:[]};
  if(snapshot) validateSnapshot(this.#snapshot,taskId,candidate);
 }
 get state():LifecycleSnapshot{return copy(this.#snapshot);}
 promoteCandidateRevision(revision:string):void{
  const s=this.#snapshot,obligation=liveObligations.get(this);
  if(!obligation)throw new Error("Raw revision promotion is unavailable for recovery-unknown TDD obligations");
  if(obligation.mode!=="not-applicable")throw new Error("Raw revision promotion is unavailable when TDD is required");
  if(s.nextPhase!=="verify"||s.records.length!==7||s.pendingAuthority)throw new Error("Lifecycle revision can advance only after apply and before verify");
  const revisions=s.revisions??[s.candidate.revision];
  if(revisions.length>=3)throw new Error("Lifecycle apply supports at most two direct Git transitions");
  assertDirectGitParent(s.candidate.repository,s.candidate.revision,revision);
  this.#snapshot={...s,candidate:{...s.candidate,revision},revisions:[...revisions,revision]};
 }
 promoteCandidateFromTdd(completionOrAlternative:StrictTddCompletion|NonTddAlternativeResult):void{
  const strict=completionOrAlternative?.state==="strict-completion";
  const facts=strict?claimStrictTddCompletion(completionOrAlternative):claimNonTddAlternativeResult(completionOrAlternative);
  const s=this.#snapshot,obligation=liveObligations.get(this);
  if(!obligation||obligation.mode!=="required")throw new Error("TDD promotion requires the exact live required obligation");
  if(s.nextPhase!=="verify"||s.records.length!==7||s.pendingAuthority||s.tddPromotion)throw new Error("TDD promotion requires completed apply with no pending authority");
  if(facts.requirementId!==obligation.requirementId||("taskIdentity" in facts&&facts.taskIdentity!==s.taskId)||facts.repositoryIdentity!==s.candidate.repository||facts.candidateId!==s.candidate.id||facts.baselineRevision!==s.candidate.revision||!sameStrings(facts.behaviorPaths,obligation.behaviorPaths))throw new Error("TDD result does not bind the lifecycle task, repository, candidate, baseline, behavior, and requirement");
  const revisions="redRevision" in facts?[facts.baselineRevision,facts.redRevision,facts.greenRevision,facts.terminalRevision,facts.finalRevision]:[facts.baselineRevision,facts.finalRevision];
  const honest=honestRevisionChain(s.candidate.repository,revisions),final=honest.at(-1)!;
  this.#snapshot={...s,candidate:{...s.candidate,revision:final},revisions:honest,tddPromotion:strict?"strict-pending-persistence":"alternative-pending-persistence"};
 }
 preparePhase(context:IssuedSkillContext,skillPaths:string[]):void{
  const s=this.#snapshot,phase=s.nextPhase;
  if(!phase)throw new Error("Completed lifecycle cannot prepare another phase");
  this.#assertAuthority(phase,roleFor[phase],context,skillPaths);
  const selection:SkillSelectionContext={phase,
   ...(context.risk===undefined?{}:{risk:context.risk}),
   ...(context.codeChange===undefined?{}:{codeChange:context.codeChange}),
   ...(context.behaviorChange===undefined?{}:{behaviorChange:context.behaviorChange}),
   ...(context.filesTouched===undefined?{}:{filesTouched:context.filesTouched}),
   ...(context.verification===undefined?{}:{verification:context.verification})};
  this.#snapshot={...s,pendingAuthority:{phase,role:roleFor[phase],selection,skillPaths:[...skillPaths]}};
 }
 reissuePendingAuthority():{context:IssuedSkillContext;skillPaths:string[]}{
  if(!verifiedRecovery.has(this))throw new Error("Reissuing phase authority requires cryptographically verified recovery");
  const s=this.#snapshot,pending=s.pendingAuthority;
  if(!pending)throw new Error("Recovery has no signed pending phase authority");
  const context=issueSkillContext(`${s.taskId}:${pending.role}`,s.candidate.repository,s.candidate,pending.selection);
  this.#assertAuthority(pending.phase,pending.role,context,pending.skillPaths);
  return {context,skillPaths:[...pending.skillPaths]};
 }
 async runPhase(dispatcher:Dispatcher,input:{phase:LifecyclePhase;context:IssuedSkillContext;skillPaths:string[];prompt:string;evidence:EvidenceStore;risk:Risk;writeSurfaces?:string[]}):Promise<LifecycleSnapshot>{
  const role=roleFor[input.phase],s=this.#snapshot;
  if(input.phase!==s.nextPhase)throw new Error("Lifecycle phase out of order");
  if(input.phase==="apply"&&(!input.writeSurfaces||!input.writeSurfaces.length))throw new Error("Lifecycle apply requires bounded write surfaces");
  if(input.phase!=="apply"&&input.writeSurfaces?.length)throw new Error("Lifecycle write authority only available in apply");
  const request:AgentRequest={id:`${s.taskId}:${role}`,role,expectedPhase:input.phase,prompt:input.prompt,repository:s.candidate.repository,candidate:s.candidate,skillContext:input.context,skillPaths:input.skillPaths,
   ...(input.phase==="apply"?{writeSurfaces:input.writeSurfaces!}:{})};
  // Validate authority before invoking the agent, then validate its result before advancing.
  this.#assertAuthority(input.phase,role,input.context,input.skillPaths);
  request.phaseGrant=issuePhaseGrant(request.id,s.candidate,input.phase);
  if(input.phase==="verify")authorizeVerified(s.candidate,input.risk,input.context,input.evidence);
  if(input.phase==="archive"){
   const release=authorizeRelease(s.candidate,input.risk,input.evidence,input.context);
   if(!release.ok)throw new Error(`Lifecycle archive blocked: ${release.reason}`);
  }
  const response=await dispatcher.dispatch(request);
  if(!response.ok||response.id!==request.id)throw new Error(`Lifecycle agent result failed or belongs to another task: ${String(response.output).slice(0,1000)}`);
  const proof=response.artifactProof;
  if(!isIssuedAgentArtifactProof(proof)||proof.requestId!==request.id||proof.role!==role||proof.repository!==s.candidate.repository||proof.candidateId!==s.candidate.id||proof.candidateRevision!==s.candidate.revision||proof.skillPaths.length!==input.skillPaths.length||proof.skillPaths.some((path,index)=>path!==input.skillPaths[index]))throw new Error("Lifecycle artifact lacks exact ASEN-issued Pi provenance");
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
  const {pendingAuthority:_pending,...rest}=s;
  this.#snapshot={...rest,nextPhase:next,records:[...s.records,{phase:input.phase,role:input.role,artifact:structuredClone(a),skillPaths:[...input.skillPaths]}]};
  return this.state;
 }
}
export function createSkillLifecycle(applicability:LifecycleApplicability):SkillLifecycle{
 let obligation:TddObligation;
 try{obligation=tddObligationFor(applicability);}catch{throw new Error("Lifecycle applicability was not issued here");}
 claimLifecycleApplicability(applicability);
 if(applicability.outcome!=="structured")throw new Error("SkillLifecycle requires structured applicability");
 const candidate:Candidate={...applicability.candidate,createdAt:"lifecycle-applicability"};
 return constructLifecycle(applicability.taskIdentity,candidate,undefined,obligation);
}
function validateSnapshot(s:LifecycleSnapshot,taskId:string,candidate:Candidate):void{
 if(s.tddPromotion!==undefined)throw new Error("TDD-promoted lifecycle persistence is unavailable until C5");
 if(s.version!==1||s.taskId!==taskId||s.candidate.id!==candidate.id||s.candidate.repository!==candidate.repository||s.candidate.revision!==candidate.revision)throw new Error("Lifecycle recovery identity mismatch");
 if(!Array.isArray(s.records)||s.records.length>lifecyclePhases.length)throw new Error("Lifecycle recovery records invalid");
 if(s.revisions!==undefined){
  if(!Array.isArray(s.revisions)||s.revisions.length<2||s.revisions.length>3||s.revisions.at(-1)!==candidate.revision||s.records.length<7)throw new Error("Lifecycle recovery Git revisions invalid");
  for(let i=1;i<s.revisions.length;i++)assertDirectGitParent(candidate.repository,s.revisions[i-1]!,s.revisions[i]!);
 }
 for(let i=0;i<s.records.length;i++){
  const record=s.records[i],phase=lifecyclePhases[i];
  if(!record||!phase||record.phase!==phase||record.role!==roleFor[phase])throw new Error("Lifecycle recovery phase gap");
  const a=record.artifact;
  const revision=s.revisions&&i<=6?s.revisions[0]:candidate.revision;
  if(!a||a.kind!==requiredArtifact[phase]||typeof a.content!=="string"||!a.content.trim()||a.repository!==candidate.repository||a.candidateId!==candidate.id||a.revision!==revision)throw new Error("Lifecycle recovery artifact mismatch");
  if(!Array.isArray(record.skillPaths)||record.skillPaths.some(path=>typeof path!=="string"||!/^skills\/asen-[a-z-]+\/SKILL\.md$/.test(path)))throw new Error("Lifecycle recovery skill routes invalid");
 }
 if(s.nextPhase!==(lifecyclePhases[s.records.length]??null))throw new Error("Lifecycle recovery next phase mismatch");
 if(s.pendingAuthority){
  const p=s.pendingAuthority,x=p.selection;
  if(!s.nextPhase||p.phase!==s.nextPhase||p.role!==roleFor[p.phase]||!x||x.phase!==p.phase||!Array.isArray(p.skillPaths)||
   x.risk!==undefined&&!(["low","medium","high","unknown"] as unknown[]).includes(x.risk)||
   x.codeChange!==undefined&&typeof x.codeChange!=="boolean"||x.behaviorChange!==undefined&&typeof x.behaviorChange!=="boolean"||
   x.verification!==undefined&&typeof x.verification!=="boolean"||x.filesTouched!==undefined&&(!Number.isInteger(x.filesTouched)||x.filesTouched<0))throw new Error("Lifecycle recovery pending authority invalid");
  const expected=selectSkills(x).map(skill=>skill.path);
  if(expected.length!==p.skillPaths.length||expected.some((path,index)=>path!==p.skillPaths[index]))throw new Error("Lifecycle recovery pending Skill routes mismatch");
 }
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
 let parsed:{snapshot:LifecycleSnapshot;mac:string};
 try{parsed=JSON.parse(await readFile(path,"utf8")) as {snapshot:LifecycleSnapshot;mac:string};}
 catch{throw new Error("Lifecycle recovery data is malformed");}
 if(!parsed?.snapshot||typeof parsed.mac!=="string"||!/^[0-9a-f]{64}$/i.test(parsed.mac))throw new Error("Lifecycle recovery signature missing");
 const expected=Buffer.from(signature(parsed.snapshot,key),"hex"),actual=Buffer.from(parsed.mac,"hex");
 if(!timingSafeEqual(expected,actual))throw new Error("Lifecycle recovery integrity mismatch");
 const flow=constructLifecycle(taskId,candidate,parsed.snapshot);
 verifiedRecovery.add(flow);
 return flow;
}
