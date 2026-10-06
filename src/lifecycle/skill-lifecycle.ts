import {open,readFile,rename,unlink} from "node:fs/promises";
import {dirname,basename,join} from "node:path";
import {createHash,createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import type {Candidate,Risk} from "../core/types.js";
import {issueSkillContext,matchesIssuedSkillContext,type IssuedSkillContext} from "../skills/context.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";
import type {Dispatcher,AgentRequest} from "../agents/dispatcher.js";
import {isIssuedAgentArtifactProof} from "../agents/pi-artifact-runner.js";
import {EvidenceStore} from "../evidence/store.js";
import {authorizeRelease,authorizeVerified} from "../verify/verifier.js";
import {assertDirectGitParent} from "../evidence/git-lineage.js";
import {claimLifecycleApplicability,tddObligationFor,hasOriginalDefectIntent,workflowSelectionDescriptionForApplicability,type LifecycleApplicability,type TddObligation} from "./applicability.js";
import type {WorkflowSelectionDescription} from "./workflow-selection.js";
import {claimStrictTddCompletion,type StrictTddCompletion} from "../test/strict-tdd-cycle.js";
import {claimNonTddAlternativeResult,type NonTddAlternativeResult} from "../test/non-tdd-alternative.js";
import {validateTddCompletionRecord,type TddCompletionRecord} from "../test/tdd-completion-record.js";

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
interface LifecycleBase{taskId:string;candidate:Candidate;nextPhase:LifecyclePhase|null;records:LifecycleRecord[];revisions?:string[];pendingAuthority?:{phase:LifecyclePhase;role:LifecycleRole;selection:SkillSelectionContext;skillPaths:string[]};}
export type LifecycleSnapshot=(LifecycleBase&{version:1})|(LifecycleBase&{version:2;baselineRevision:string;tddPromotion:{method:TddCompletionRecord["promotionMethod"];record:TddCompletionRecord}});
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
const recoveredObligations=new WeakMap<SkillLifecycle,TddObligation>();
const lifecycleDescriptions=new WeakMap<SkillLifecycle,WorkflowSelectionDescription>();
const snapshotDescriptions=new WeakMap<object,WorkflowSelectionDescription>();
const snapshotObligations=new WeakMap<object,TddObligation>();
const lifecycleDefects=new WeakSet<SkillLifecycle>(),snapshotDefects=new WeakSet<object>();
const writerAdmissions=new WeakMap<object,{task:string;repository:string;candidateId:string;revision:string;surfaces:readonly string[];used:boolean}>(),runnerReceivers=new WeakMap<object,{requestId:string;used:boolean}>();
function writerAdmission(task:string,candidate:Candidate,surfaces:readonly string[]):object{const exact=(value:unknown,label:string)=>{if(typeof value!=="string"||!value||value!==value.trim()||value!==value.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(value))throw new Error(`Invalid ${label}`);return value;};if(!Array.isArray(surfaces))throw new Error("Writer admission requires bounded surfaces");const bounded=surfaces.map(value=>exact(value,"writer surface"));if(!bounded.length||new Set(bounded).size!==bounded.length)throw new Error("Writer admission requires unique bounded surfaces");const token=Object.freeze({});writerAdmissions.set(token,{task:exact(task,"writer task"),repository:exact(candidate.repository,"writer repository"),candidateId:exact(candidate.id,"writer candidate id"),revision:exact(candidate.revision,"writer revision"),surfaces:Object.freeze(bounded),used:false});return token;}
export function issueOrganicWriterAdmission(applicability:LifecycleApplicability,surfaces:readonly string[]):object{if(applicability.outcome!=="organic")throw new Error("Organic writer admission requires organic applicability");claimLifecycleApplicability(applicability);return writerAdmission(applicability.taskIdentity,{...applicability.candidate,createdAt:"organic-applicability"},surfaces);}
export function consumeWriterAdmission(token:unknown,request:AgentRequest):object|undefined{const a=typeof token==="object"&&token!==null?writerAdmissions.get(token):undefined;if(!a||a.used)return undefined;a.used=true;if(!request.candidate||!request.writeSurfaces)return undefined;const task=request.id.replace(/:worker$/u,"");if(a.task!==task&&a.task!==request.id||a.repository!==request.repository||a.candidateId!==request.candidate.id||a.revision!==request.candidate.revision||a.surfaces.length!==request.writeSurfaces.length||a.surfaces.some((v,i)=>v!==request.writeSurfaces![i]))return undefined;const receiver=Object.freeze({});runnerReceivers.set(receiver,{requestId:request.id,used:false});return receiver;}
export function consumeRunnerWriteReceiver(receiver:unknown,requestId:string):boolean{const r=typeof receiver==="object"&&receiver!==null?runnerReceivers.get(receiver):undefined;if(!r||r.used)return false;r.used=true;return r.requestId===requestId;}
type CompletionAdmission={lifecycle:SkillLifecycle;repository:string;candidateId:string;revision:string;record:TddCompletionRecord;used:boolean};
const completionAdmissions=new WeakMap<object,CompletionAdmission>();
function issueCompletionAdmission(lifecycle:SkillLifecycle,snapshot:LifecycleSnapshot):Readonly<Record<string,never>>{
 if(snapshot.version!==2||snapshot.nextPhase!=="verify"||(!liveObligations.has(lifecycle)&&!verifiedRecovery.has(lifecycle)))throw new Error("Lifecycle completion admission requires a genuine v2 lifecycle at verify");
 const claim=Object.freeze({}),record=validateTddCompletionRecord(snapshot.tddPromotion.record);
 completionAdmissions.set(claim,{lifecycle,repository:snapshot.candidate.repository,candidateId:snapshot.candidate.id,revision:snapshot.candidate.revision,record,used:false});return claim;
}
export function claimLifecycleCompletionAdmission(claim:Readonly<Record<string,never>>,candidate:Candidate):TddCompletionRecord{
 const admission=completionAdmissions.get(claim);
 if(!admission)throw new Error("Lifecycle completion admission was not issued here");
 if(admission.repository!==candidate.repository||admission.candidateId!==candidate.id||admission.revision!==candidate.revision)throw new Error("Lifecycle completion admission candidate mismatch");
 if(admission.used)throw new Error("Lifecycle completion admission was already consumed");
 admission.used=true;return admission.record;
}
class LifecycleConstructionRequest{
 readonly #brand=true;
 constructor(readonly taskId:string,readonly candidate:Candidate,readonly snapshot?:LifecycleSnapshot){}
 isValid():boolean{return this.#brand;}
}
const lifecycleConstructionRequests=new WeakSet<LifecycleConstructionRequest>();
function constructLifecycle(taskId:string,candidate:Candidate,snapshot?:LifecycleSnapshot,obligation?:TddObligation,description?:WorkflowSelectionDescription,defect=false):SkillLifecycle{
 const request=new LifecycleConstructionRequest(taskId,candidate,snapshot);
 lifecycleConstructionRequests.add(request);
 const lifecycle=new SkillLifecycle(request);
 if(obligation)liveObligations.set(lifecycle,obligation);
 if(description)lifecycleDescriptions.set(lifecycle,description);
 if(defect)lifecycleDefects.add(lifecycle);
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
 get state():LifecycleSnapshot{const snapshot=copy(this.#snapshot),description=lifecycleDescriptions.get(this),obligation=liveObligations.get(this)??recoveredObligations.get(this);if(description)snapshotDescriptions.set(snapshot,description);if(obligation)snapshotObligations.set(snapshot,obligation);if(lifecycleDefects.has(this))snapshotDefects.add(snapshot);return snapshot;}
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
  if(s.nextPhase!=="verify"||s.records.length!==7||s.pendingAuthority||s.version===2)throw new Error("TDD promotion requires completed apply with no pending authority");
  if(facts.requirementId!==obligation.requirementId||("taskIdentity" in facts&&facts.taskIdentity!==s.taskId)||facts.repositoryIdentity!==s.candidate.repository||facts.candidateId!==s.candidate.id||facts.baselineRevision!==s.candidate.revision||!sameStrings(facts.behaviorPaths,obligation.behaviorPaths))throw new Error("TDD result does not bind the lifecycle task, repository, candidate, baseline, behavior, and requirement");
  const record=validateTddCompletionRecord(facts.record),revisions="redRevision" in facts?[facts.baselineRevision,facts.redRevision,facts.greenRevision,facts.terminalRevision,facts.finalRevision]:[facts.baselineRevision,facts.finalRevision];
  const honest=honestRevisionChain(s.candidate.repository,revisions),final=honest.at(-1)!;
  this.#snapshot={...s,version:2,baselineRevision:s.candidate.revision,candidate:{...s.candidate,revision:final},revisions:honest,tddPromotion:{method:record.promotionMethod,record}};
 }
 preparePhase(context:IssuedSkillContext,skillPaths:string[]):void{
  const s=this.#snapshot,phase=s.nextPhase;
  if(!phase)throw new Error("Completed lifecycle cannot prepare another phase");
  this.#assertAuthority(phase,roleFor[phase],context,skillPaths);
  const selection:SkillSelectionContext={phase,
   ...(context.risk===undefined?{}:{risk:context.risk}),
   ...(context.codeChange===undefined?{}:{codeChange:context.codeChange}),
   ...(context.defect===undefined?{}:{defect:context.defect}),
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
   ...(input.phase==="apply"?{writeSurfaces:input.writeSurfaces!,writerAdmission:writerAdmission(s.taskId,s.candidate,input.writeSurfaces!)}:{})};
  // Validate authority before invoking the agent, then validate its result before advancing.
  this.#assertAuthority(input.phase,role,input.context,input.skillPaths);
  request.phaseGrant=issuePhaseGrant(request.id,s.candidate,input.phase);
  if(input.phase==="verify"){
   const obligation=liveObligations.get(this)??recoveredObligations.get(this);
   if(obligation?.mode==="required"&&s.version!==2)throw new Error("Required TDD lifecycle needs exact TDD completion promotion before verify");
   if(s.version===2)input.evidence.consumeLifecycleCompletion(s.candidate,issueCompletionAdmission(this,s));
   authorizeVerified(s.candidate,input.risk,input.context,input.evidence);
  }
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
  if(lifecycleDefects.has(this)&&context.defect!==true)throw new Error("El contexto no puede omitir la intención original de defecto");
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
 const description=workflowSelectionDescriptionForApplicability(applicability);
 const candidate:Candidate={...applicability.candidate,createdAt:"lifecycle-applicability"};
 return constructLifecycle(applicability.taskIdentity,candidate,undefined,obligation,description,hasOriginalDefectIntent(applicability));
}
/** Reads private command provenance by exact snapshot identity without inspecting caller data. */
export function workflowSelectionDescriptionForSnapshot(value:unknown):WorkflowSelectionDescription|undefined{return typeof value==="object"&&value!==null?snapshotDescriptions.get(value):undefined;}
function exact(value:unknown,keys:readonly string[],noun:string):Record<string,unknown>{
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${noun} must be exact plain data`);
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw new Error(`${noun} shape is invalid`);
 return Object.fromEntries(keys.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} shape is invalid`);return [key,descriptor.value];}));
}
function exactArray(value:unknown,noun:string):unknown[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new Error(`${noun} must be an exact array`);const indexes=Array.from({length:value.length},(_,i)=>String(i)),own=Reflect.ownKeys(value);if(own.some(key=>typeof key!=="string"||key!=="length"&&!indexes.includes(key))||indexes.some(key=>!Object.hasOwn(value,key)))throw new Error(`${noun} must be an exact array`);return indexes.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} must be an exact array`);return descriptor.value;});}
function validateSnapshot(value:unknown,taskId:string,caller:Candidate):LifecycleSnapshot{
 const version=typeof value==="object"&&value!==null?Object.getOwnPropertyDescriptor(value,"version")?.value:undefined,optional=(key:string)=>typeof value==="object"&&value!==null&&Object.hasOwn(value,key),keys=version===2?["version","taskId","candidate","baselineRevision","nextPhase","records","revisions","tddPromotion"]:["version","taskId","candidate","nextPhase","records",...(optional("revisions")?["revisions"]:[]),...(optional("pendingAuthority")?["pendingAuthority"]:[])];
 // SAFETY: exact() just proved the complete Candidate own-data shape; scalar fields are checked below.
 const raw=exact(value,keys,"lifecycle snapshot"),candidateRaw=exact(raw.candidate,["id","repository","revision","createdAt"],"lifecycle candidate"),candidate=candidateRaw as unknown as Candidate;
 if((version!==1&&version!==2)||raw.taskId!==taskId||candidate.id!==caller.id||candidate.repository!==caller.repository||candidate.revision!==caller.revision||typeof candidate.createdAt!=="string"||!candidate.createdAt)throw new Error("Lifecycle recovery identity mismatch");
 const records=exactArray(raw.records,"lifecycle records");if(records.length>lifecyclePhases.length)throw new Error("Lifecycle recovery records invalid");
 const revisions=raw.revisions===undefined?undefined:exactArray(raw.revisions,"lifecycle revisions");if(revisions&&(!revisions.length||revisions.some(item=>typeof item!=="string")||revisions.at(-1)!==candidate.revision||records.length<7))throw new Error("Lifecycle recovery Git revisions invalid");
 for(let i=0;i<records.length;i++){const phase=lifecyclePhases[i],record=exact(records[i],["phase","role","artifact","skillPaths"],"lifecycle record"),artifact=exact(record.artifact,["kind","content","repository","candidateId","revision"],"lifecycle artifact"),paths=exactArray(record.skillPaths,"lifecycle skill routes"),revision=revisions&&i<=6?revisions[0]:candidate.revision;if(!phase||record.phase!==phase||record.role!==roleFor[phase])throw new Error("Lifecycle recovery phase gap");if(artifact.kind!==requiredArtifact[phase]||typeof artifact.content!=="string"||!artifact.content.trim()||artifact.repository!==candidate.repository||artifact.candidateId!==candidate.id||artifact.revision!==revision)throw new Error("Lifecycle recovery artifact mismatch");if(paths.some(path=>typeof path!=="string"||!/^skills\/asen-[a-z-]+\/SKILL\.md$/.test(path)))throw new Error("Lifecycle recovery skill routes invalid");}
 if(raw.nextPhase!==(lifecyclePhases[records.length]??null))throw new Error("Lifecycle recovery next phase mismatch");
 if(version===2){const promotion=exact(raw.tddPromotion,["method","record"],"TDD promotion"),record=validateTddCompletionRecord(promotion.record),recordRevisions=record.promotionMethod==="strict-completion"?[record.revisions.baseline,record.revisions.red,record.revisions.green,record.revisions.terminal,record.revisions.final]:[record.revisions.baseline,record.revisions.final],honest=honestRevisionChain(candidate.repository,recordRevisions);if(raw.baselineRevision!==record.obligation.candidate.revision||promotion.method!==record.promotionMethod||raw.taskId!==record.obligation.taskIdentity||candidate.repository!==record.obligation.repositoryIdentity||candidate.id!==record.obligation.candidate.id||candidate.revision!==record.revisions.final||!revisions||!sameStrings(revisions as string[],honest)||raw.nextPhase!=="verify"&&raw.nextPhase!=="archive"&&raw.nextPhase!==null)throw new Error("Lifecycle TDD completion binding mismatch");}
 else if(raw.pendingAuthority){const pending=exact(raw.pendingAuthority,["phase","role","selection","skillPaths"],"pending authority"),selectionValue=pending.selection,hasSelection=(key:string)=>typeof selectionValue==="object"&&selectionValue!==null&&Object.hasOwn(selectionValue,key),selectionKeys=["phase",...(["risk","codeChange","behaviorChange","defect","filesTouched","verification"] as const).filter(hasSelection)];
  // SAFETY: exact() proved every allowed SkillSelectionContext own field; the branch below validates each value.
  const selection=exact(selectionValue,selectionKeys,"pending selection") as unknown as SkillSelectionContext,paths=exactArray(pending.skillPaths,"pending skill routes") as string[];if(!raw.nextPhase||pending.phase!==raw.nextPhase||pending.role!==roleFor[pending.phase as LifecyclePhase]||selection.phase!==pending.phase||selection.risk!==undefined&&!(["low","medium","high","unknown"] as unknown[]).includes(selection.risk)||selection.codeChange!==undefined&&typeof selection.codeChange!=="boolean"||selection.behaviorChange!==undefined&&typeof selection.behaviorChange!=="boolean"||selection.defect!==undefined&&typeof selection.defect!=="boolean"||selection.verification!==undefined&&typeof selection.verification!=="boolean"||selection.filesTouched!==undefined&&(!Number.isInteger(selection.filesTouched)||selection.filesTouched<0))throw new Error("Lifecycle recovery pending authority invalid");const expected=selectSkills(selection).map(skill=>skill.path);if(!sameStrings(expected,paths))throw new Error("Lifecycle recovery pending Skill routes mismatch");}
 return value as LifecycleSnapshot;
}
function keyCheck(key:Buffer):void{if(key.length<32)throw new Error("Lifecycle recovery requires a 32-byte secret");}
function signature(value:unknown,key:Buffer,domain=""):string{keyCheck(key);return createHmac("sha256",key).update(domain).update(JSON.stringify(value)).digest("hex");}
function validMac(mac:unknown,expected:string):boolean{return typeof mac==="string"&&/^[0-9a-f]{64}$/.test(mac)&&timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(mac,"hex"));}
function candidateBinding(value:unknown):Candidate{const raw=exact(value,["id","repository","revision","createdAt"],"lifecycle candidate binding");if(typeof raw.id!=="string"||!raw.id||typeof raw.repository!=="string"||!raw.repository||typeof raw.revision!=="string"||!raw.revision||typeof raw.createdAt!=="string"||!raw.createdAt)throw new Error("Lifecycle recovery identity mismatch");
 // SAFETY: exact() proved the full Candidate own-data shape and the branch above proved all scalar fields.
 return raw as unknown as Candidate;}
function selectionBinding(value:unknown,taskId:string,repository:string):WorkflowSelectionDescription{
 const raw=exact(value,["schemaVersion","workflow","source","taskIdentity","repositoryIdentity"],"workflow selection");
 if(raw.schemaVersion!==1||raw.workflow!=="sdd"||raw.source!=="pi-command"||raw.taskIdentity!==taskId||raw.repositoryIdentity!==repository)throw new Error("Lifecycle workflow selection binding mismatch");
 // SAFETY: exact() and the literal checks above prove the complete immutable description schema.
 return Object.freeze(raw) as unknown as WorkflowSelectionDescription;
}
function obligationBinding(value:unknown,snapshot:LifecycleSnapshot,description:WorkflowSelectionDescription):TddObligation{
 const raw=exact(value,["requirementId","applicabilityId","taskIdentity","repositoryIdentity","candidate","behaviorPaths","mode","reason"],"TDD obligation binding"),candidate=exact(raw.candidate,["id","repository","revision"],"TDD obligation candidate"),paths=exactArray(raw.behaviorPaths,"TDD obligation behavior paths"),baseline=snapshot.version===2?snapshot.baselineRevision:snapshot.revisions?.[0]??snapshot.candidate.revision;
 if(typeof raw.requirementId!=="string"||!/^[0-9a-f]{64}$/.test(raw.requirementId)||typeof raw.applicabilityId!=="string"||!/^[0-9a-f]{64}$/.test(raw.applicabilityId)||raw.taskIdentity!==snapshot.taskId||raw.taskIdentity!==description.taskIdentity||raw.repositoryIdentity!==snapshot.candidate.repository||raw.repositoryIdentity!==description.repositoryIdentity||candidate.id!==snapshot.candidate.id||candidate.repository!==snapshot.candidate.repository||candidate.revision!==baseline||paths.some(path=>typeof path!=="string"||!path)||raw.mode!=="required"&&raw.mode!=="not-applicable"||raw.mode==="required"&&(raw.reason!=="behavior-testing-required"||!paths.length)||raw.mode==="not-applicable"&&(raw.reason!=="no-behavior-writes"||paths.length!==0))throw new Error("Lifecycle TDD obligation binding mismatch");
 const payload={applicabilityId:raw.applicabilityId,taskIdentity:raw.taskIdentity,repositoryIdentity:raw.repositoryIdentity,candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},behaviorPaths:paths,mode:raw.mode,reason:raw.reason},requirementId=createHash("sha256").update(JSON.stringify(payload)).digest("hex");if(raw.requirementId!==requirementId)throw new Error("Lifecycle TDD requirement hash mismatch");
 const obligation={requirementId,...payload} as TddObligation;if(snapshot.version===2&&JSON.stringify(snapshot.tddPromotion.record.obligation)!==JSON.stringify(obligation))throw new Error("Lifecycle TDD completion obligation mismatch");return Object.freeze(obligation);
}
function v2Envelope(snapshot:Extract<LifecycleSnapshot,{version:2}>){return {version:2 as const,taskIdentity:snapshot.taskId,repositoryIdentity:snapshot.candidate.repository,candidateId:snapshot.candidate.id,baselineRevision:snapshot.baselineRevision,currentRevision:snapshot.candidate.revision,nextPhase:snapshot.nextPhase,snapshot};}
function v3Envelope(snapshot:LifecycleSnapshot,description:WorkflowSelectionDescription,obligation:TddObligation,defect=false){return {version:3 as const,taskIdentity:snapshot.taskId,repositoryIdentity:snapshot.candidate.repository,candidateId:snapshot.candidate.id,currentRevision:snapshot.candidate.revision,nextPhase:snapshot.nextPhase,workflowSelection:{schemaVersion:description.schemaVersion,workflow:description.workflow,source:description.source,taskIdentity:description.taskIdentity,repositoryIdentity:description.repositoryIdentity},testingBinding:structuredClone(obligation),...(defect?{defectIntent:true}:{}),snapshot};}
export async function saveLifecycle(path:string,snapshot:LifecycleSnapshot,key:Buffer):Promise<void>{
 const task=Object.getOwnPropertyDescriptor(snapshot,"taskId")?.value,candidate=candidateBinding(Object.getOwnPropertyDescriptor(snapshot,"candidate")?.value),checked=validateSnapshot(snapshot,task,candidate),description=snapshotDescriptions.get(snapshot);let outer:unknown;
 if(description){const selected=selectionBinding(description,checked.taskId,checked.candidate.repository),obligation=snapshotObligations.get(snapshot);if(!obligation)throw new Error("Lifecycle v3 persistence requires original testing binding");const testing=obligationBinding(obligation,checked,selected),payload=v3Envelope(checked,selected,testing,snapshotDefects.has(snapshot));outer={...payload,mac:signature(payload,key,"asen.lifecycle.explicit-selection.v3\0")};}
 else if(checked.version===2){const payload=v2Envelope(checked);outer={...payload,mac:signature(payload,key,"asen.lifecycle.v2\0")};}
 else{if(checked.nextPhase!==null)throw new Error("migration required; restart exact applicability");outer={snapshot:checked,mac:signature(checked,key)};}
 const temp=join(dirname(path),`.${basename(path)}.${randomUUID()}.tmp`);let handle;try{handle=await open(temp,"wx",0o600);await handle.writeFile(JSON.stringify(outer),"utf8");await handle.sync();await handle.close();handle=undefined;await rename(temp,path);}finally{if(handle)await handle.close();await unlink(temp).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});}
}
export async function loadLifecycle(path:string,taskId:string,candidate:Candidate,key:Buffer):Promise<SkillLifecycle>{
 let parsed:unknown;try{parsed=JSON.parse(await readFile(path,"utf8"));}catch{throw new Error("Lifecycle recovery data is malformed");}
 const caller=candidateBinding(candidate),version=typeof parsed==="object"&&parsed!==null?Object.getOwnPropertyDescriptor(parsed,"version")?.value:undefined;let snapshot:LifecycleSnapshot,description:WorkflowSelectionDescription|undefined,obligation:TddObligation|undefined,mac:unknown,expected:string,defect=false;
 if(version===3){const hasDefect=Object.hasOwn(parsed as object,"defectIntent"),raw=exact(parsed,["version","taskIdentity","repositoryIdentity","candidateId","currentRevision","nextPhase","workflowSelection","testingBinding","snapshot","mac",...(hasDefect?["defectIntent"]:[])],"lifecycle v3 envelope"),payload={version:raw.version,taskIdentity:raw.taskIdentity,repositoryIdentity:raw.repositoryIdentity,candidateId:raw.candidateId,currentRevision:raw.currentRevision,nextPhase:raw.nextPhase,workflowSelection:raw.workflowSelection,testingBinding:raw.testingBinding,...(hasDefect?{defectIntent:raw.defectIntent}:{}),snapshot:raw.snapshot};mac=raw.mac;expected=signature(payload,key,"asen.lifecycle.explicit-selection.v3\0");if(!validMac(mac,expected))throw new Error("Lifecycle recovery integrity mismatch");if(hasDefect&&raw.defectIntent!==true)throw new Error("La intención firmada de defecto no es válida");defect=hasDefect;const selection=selectionBinding(raw.workflowSelection,taskId,caller.repository);snapshot=validateSnapshot(raw.snapshot,taskId,caller);if(raw.taskIdentity!==taskId||raw.repositoryIdentity!==caller.repository||raw.candidateId!==caller.id||raw.currentRevision!==caller.revision||raw.nextPhase!==snapshot.nextPhase||selection.taskIdentity!==snapshot.taskId||selection.repositoryIdentity!==snapshot.candidate.repository)throw new Error("Lifecycle recovery identity mismatch");description=selection;obligation=obligationBinding(raw.testingBinding,snapshot,selection);}
 else if(version===2){const raw=exact(parsed,["version","taskIdentity","repositoryIdentity","candidateId","baselineRevision","currentRevision","nextPhase","snapshot","mac"],"lifecycle v2 envelope"),payload={version:raw.version,taskIdentity:raw.taskIdentity,repositoryIdentity:raw.repositoryIdentity,candidateId:raw.candidateId,baselineRevision:raw.baselineRevision,currentRevision:raw.currentRevision,nextPhase:raw.nextPhase,snapshot:raw.snapshot};mac=raw.mac;expected=signature(payload,key,"asen.lifecycle.v2\0");if(!validMac(mac,expected))throw new Error("Lifecycle recovery integrity mismatch");snapshot=validateSnapshot(raw.snapshot,taskId,caller);if(raw.taskIdentity!==taskId||raw.repositoryIdentity!==caller.repository||raw.candidateId!==caller.id||raw.currentRevision!==caller.revision||raw.baselineRevision!==(snapshot.version===2?snapshot.baselineRevision:undefined)||raw.nextPhase!==snapshot.nextPhase)throw new Error("Lifecycle recovery identity mismatch");}
 else if(version===undefined){const raw=exact(parsed,["snapshot","mac"],"lifecycle v1 envelope");mac=raw.mac;expected=signature(raw.snapshot,key);if(!validMac(mac,expected))throw new Error("Lifecycle recovery integrity mismatch");snapshot=validateSnapshot(raw.snapshot,taskId,caller);if(snapshot.version!==1)throw new Error("Lifecycle recovery schema mismatch");if(snapshot.nextPhase!==null)throw new Error("migration required; restart exact applicability");}
 else throw new Error("Lifecycle recovery schema mismatch");
 const flow=constructLifecycle(taskId,caller,snapshot,undefined,description,defect);if(obligation)recoveredObligations.set(flow,obligation);verifiedRecovery.add(flow);return flow;
}
