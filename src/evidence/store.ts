import {createHash,createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {open,readFile,rename,unlink} from "node:fs/promises";
import {basename,dirname,join} from "node:path";
import type { Candidate, Evidence } from "../core/types.js";
import {isExecutedEvidence,type ExecutedEvidence} from "./execution.js";
import {isExecutedReview,type ExecutedReview} from "./review-execution.js";
import {isIssuedTddStage,type IssuedTddStage} from "../test/tdd-cycle.js";
import {assertDirectGitParent,assertGitAncestor} from "./git-lineage.js";
import {claimOrchestrationRouteEvidence,type OrchestrationRouteEvidence} from "../orchestration/orchestrator.js";
import {claimLifecycleCompletionAdmission} from "../lifecycle/skill-lifecycle.js";
import {validateTddCompletionRecord} from "../test/tdd-completion-record.js";
interface EnvelopeV1{version:1;candidate:Candidate;items:Evidence[];}
interface EnvelopeV2{version:2;candidate:Candidate;items:Evidence[];}
export interface RouteDecisionMetadata{readonly id:string;readonly summary:string;readonly createdAt:string;}
function routeMetadata(value:RouteDecisionMetadata):RouteDecisionMetadata{
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("Route evidence metadata must be exact plain data");
 const keys=["id","summary","createdAt"] as const,own=Reflect.ownKeys(value);
 if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key as typeof keys[number]))||keys.some(key=>!Object.hasOwn(value,key)))throw new Error("Route evidence metadata shape is invalid");
 const text=(key:typeof keys[number]):string=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor?.enumerable||!("value" in descriptor))throw new Error("Route evidence metadata shape is invalid");
  const item=descriptor.value;
  if(typeof item!=="string"||!item.trim()||item!==item.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(item))throw new Error(`Route evidence metadata ${key} is malformed`);
  return item;
 };
 return {id:text("id"),summary:text("summary"),createdAt:text("createdAt")};
}
const legacyKinds=new Set(["test","review","command","audit","tdd","route-decision","work-unit","scope","rollback"]),kinds=new Set([...legacyKinds,"lifecycle-completion"]);
const statuses=new Set(["pass","fail","expected-fail"]);
function sign(value:EnvelopeV1|EnvelopeV2,key:Buffer,domain=""):string{
 if(key.length<32)throw new Error("Evidence recovery requires a 32-byte secret");
 return createHmac("sha256",key).update(domain).update(JSON.stringify(value)).digest("hex");
}
function exact(value:unknown,keys:readonly string[],noun:string):Record<string,unknown>{
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${noun} must be exact plain data`);
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw new Error(`${noun} shape is invalid`);
 return Object.fromEntries(keys.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} shape is invalid`);return [key,descriptor.value];}));
}
function array(value:unknown,noun:string):unknown[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new Error(`${noun} must be an exact array`);const indexes=Array.from({length:value.length},(_,i)=>String(i)),own=Reflect.ownKeys(value);if(own.some(key=>typeof key!=="string"||key!=="length"&&!indexes.includes(key))||indexes.some(key=>!Object.hasOwn(value,key)))throw new Error(`${noun} must be an exact array`);return indexes.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${noun} must be an exact array`);return descriptor.value;});}
function candidateData(value:unknown):Candidate{const raw=exact(value,["id","repository","revision","createdAt"],"evidence candidate");for(const key of ["id","repository","revision","createdAt"] as const)if(typeof raw[key]!=="string"||!raw[key])throw new Error("Evidence recovery candidate mismatch");/* SAFETY: exact() and the loop prove the complete Candidate data shape. */return raw as unknown as Candidate;}
function completionId(record:unknown):string{return `lifecycle-completion:${createHash("sha256").update("asen.evidence.lifecycle-completion.v1\0").update(JSON.stringify(record)).digest("hex")}`;}
function validateItem(value:unknown,candidate:Candidate,allowLifecycle:boolean):Evidence{
 const possible=["execution","review","tdd","completion"].filter(key=>typeof value==="object"&&value!==null&&Object.hasOwn(value,key)),raw=exact(value,["id","candidateRepository","candidateId","candidateRevision","kind","status","summary","createdAt",...possible],"evidence item");
 if(typeof raw.id!=="string"||!raw.id||typeof raw.summary!=="string"||typeof raw.createdAt!=="string"||typeof raw.kind!=="string"||!kinds.has(raw.kind)||typeof raw.status!=="string"||!statuses.has(raw.status)||raw.candidateRepository!==candidate.repository||raw.candidateId!==candidate.id)throw new Error("Evidence recovery item mismatch");
 if(raw.kind!=="tdd"&&raw.candidateRevision!==candidate.revision||typeof raw.candidateRevision!=="string")throw new Error("Evidence recovery item mismatch");
 if(raw.completion!==undefined&&raw.kind!=="lifecycle-completion"||raw.kind==="lifecycle-completion"&&!allowLifecycle)throw new Error("Lifecycle completion is unavailable in legacy evidence");
 if(raw.execution!==undefined){const x=exact(raw.execution,["command","cwd","exitCode","startedAt","finishedAt"],"evidence execution"),command=array(x.command,"evidence command");if(!command.length||command.some(item=>typeof item!=="string"||!item)||typeof x.cwd!=="string"||!x.cwd||!Number.isInteger(x.exitCode)||typeof x.startedAt!=="string"||!x.startedAt||typeof x.finishedAt!=="string"||!x.finishedAt)throw new Error("Evidence execution semantics are invalid");}
 if(raw.review!==undefined){if(raw.kind!=="review")throw new Error("Only review evidence may carry review metadata");const review=exact(raw.review,["taskId","reviewerId","authorId"],"evidence review");if(Object.values(review).some(item=>typeof item!=="string"||!item))throw new Error("Evidence review semantics are invalid");}
 if(raw.tdd!==undefined){const t=raw.tdd as Record<string,unknown>,keys=["cycleId","stage",...(Object.hasOwn(t,"previousRevision")?["previousRevision"]:[])];exact(t,keys,"TDD metadata");}
 if(raw.kind==="lifecycle-completion"){
  if(raw.status!=="pass"||raw.execution!==undefined||raw.review!==undefined||raw.tdd!==undefined||raw.completion===undefined)throw new Error("Lifecycle completion evidence semantics are invalid");
  const record=validateTddCompletionRecord(raw.completion),final=record.revisions.final;if(record.obligation.repositoryIdentity!==candidate.repository||record.obligation.candidate.id!==candidate.id||final!==candidate.revision||raw.id!==completionId(record))throw new Error("Lifecycle completion evidence binding mismatch");
  raw.completion=record;
 }else if(raw.completion!==undefined)throw new Error("Only lifecycle completion evidence may carry completion metadata");
 /* SAFETY: exact() proves the complete Evidence keys and all discriminated metadata is validated above. */
 return raw as unknown as Evidence;
}
function validateTddHistory(candidate:Candidate,items:Evidence[]):void{
 const stages=new Map<string,Evidence>();
 for(const item of items){
  if(item.kind!=="tdd"){
   if(item.tdd!==undefined)throw new Error("Non-TDD evidence cannot carry TDD metadata");
   continue;
  }
  const meta=item.tdd;
  if(!meta||typeof meta.cycleId!=="string"||!meta.cycleId.trim()||meta.cycleId.includes(":")||
   !(["RED","GREEN","REFACTOR"] as unknown[]).includes(meta.stage)||
   Object.keys(meta).some(key=>!["cycleId","stage","previousRevision"].includes(key))||
   item.id!==`${meta.cycleId}:${meta.stage.toLowerCase()}`||
   (meta.stage==="RED"?meta.previousRevision!==undefined:typeof meta.previousRevision!=="string")||
   (meta.stage==="RED"?item.status!=="expected-fail"||!item.execution||item.execution.exitCode===0:item.status!=="pass"||item.execution?.exitCode!==0))
   throw new Error("Recovered TDD stage structure invalid");
  assertGitAncestor(candidate.repository,item.candidateRevision,candidate.revision);
  const key=`${meta.cycleId}:${meta.stage}`;
  if(stages.has(key))throw new Error("Recovered TDD cycle has duplicate stage");
  stages.set(key,item);
 }
 for(const item of stages.values()){
  const meta=item.tdd!;
  if(meta.stage==="RED")continue;
  const previous=stages.get(`${meta.cycleId}:${meta.stage==="GREEN"?"RED":"GREEN"}`);
  if(!previous||previous.candidateRevision!==meta.previousRevision)throw new Error("Recovered TDD previousRevision does not match its cycle");
  assertDirectGitParent(candidate.repository,previous.candidateRevision,item.candidateRevision);
 }
}
export class EvidenceStore {
 readonly #items=new Map<string,Evidence>();
 add(candidate:Candidate,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(evidence.kind==="lifecycle-completion")throw new Error("Lifecycle-completion evidence requires genuine lifecycle admission");
  if(evidence.kind==="route-decision")throw new Error("Route-decision evidence requires genuine orchestration proof");
  if(evidence.status==="pass"&&(evidence.kind==="test"||evidence.kind==="tdd"))throw new Error(`Passing ${evidence.kind} evidence requires executed proof`);
  if(evidence.status==="pass"&&evidence.kind==="review")throw new Error("Passing review evidence requires authenticated reviewer proof");
  return this.#insert(candidate,evidence);
 }
 addRouteDecision(candidate:Candidate,proof:OrchestrationRouteEvidence,metadata:RouteDecisionMetadata):Evidence{
  claimOrchestrationRouteEvidence(candidate,proof);
  const exact=routeMetadata(metadata);
  return this.#insert(candidate,{...exact,kind:"route-decision",status:"pass"});
 }
 consumeLifecycleCompletion(candidate:Candidate,claim:Readonly<Record<string,never>>):Evidence{
  const record=claimLifecycleCompletionAdmission(claim,candidate),id=completionId(record),existing=this.#items.get(id);
  if(existing){if(existing.kind!=="lifecycle-completion"||JSON.stringify(existing.completion)!==JSON.stringify(record)||existing.candidateRepository!==candidate.repository||existing.candidateId!==candidate.id||existing.candidateRevision!==candidate.revision)throw new Error("Conflicting lifecycle completion evidence id");return existing;}
  return this.#insert(candidate,{id,kind:"lifecycle-completion",status:"pass",summary:record.promotionMethod==="strict-completion"?"Strict lifecycle completion":"Verified non-TDD lifecycle alternative",createdAt:candidate.createdAt,completion:record});
 }
 addExecuted(candidate:Candidate,proof:ExecutedEvidence,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(!isExecutedEvidence(proof))throw new Error("Executed evidence requires ASEN-issued execution proof");
  if(proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision)throw new Error("Executed evidence candidate mismatch");
  if(evidence.kind!=="test")throw new Error("TDD evidence requires an ordered TddCycle");
  if(evidence.status==="pass"&&proof.exitCode!==0)throw new Error("Passing executed evidence requires exit code 0");
  if(evidence.status==="expected-fail"&&proof.exitCode===0)throw new Error("Expected failing evidence requires a failing execution");
  const execution={command:[...proof.command],cwd:proof.cwd,exitCode:proof.exitCode,startedAt:proof.startedAt,finishedAt:proof.finishedAt};
  return this.#insert(candidate,{...evidence,execution});
 }
 addTddStage(candidate:Candidate,token:IssuedTddStage,evidence:{id:string;summary:string}):Evidence{
  if(!isIssuedTddStage(token)||!isExecutedEvidence(token.proof))throw new Error("TDD stage requires ASEN-issued cycle and execution");
  if(token.candidateRepository!==candidate.repository||token.candidateId!==candidate.id||token.candidateRevision!==candidate.revision||
   token.proof.candidateRepository!==candidate.repository||token.proof.candidateId!==candidate.id||token.proof.candidateRevision!==candidate.revision)throw new Error("TDD stage candidate mismatch");
  const {cycleId,stage,proof}=token;
  if(evidence.id!==`${cycleId}:${stage.toLowerCase()}`)throw new Error("TDD stage id mismatch");
  const prior=[...this.#items.values()].filter(x=>x.candidateRepository===candidate.repository&&x.candidateId===candidate.id);
  if(stage==="GREEN"&&!prior.some(x=>x.id===`${cycleId}:red`&&x.status==="expected-fail"&&x.execution?.exitCode!==0))throw new Error("TDD GREEN requires executed RED");
  if(stage==="REFACTOR"&&!prior.some(x=>x.id===`${cycleId}:green`&&x.status==="pass"&&x.execution?.exitCode===0))throw new Error("TDD REFACTOR requires executed GREEN");
  if(stage==="RED"?proof.exitCode===0:proof.exitCode!==0)throw new Error("TDD stage command exit code mismatch");
  return this.#insert(candidate,{id:evidence.id,kind:"tdd",status:stage==="RED"?"expected-fail":"pass",summary:evidence.summary,createdAt:proof.finishedAt,tdd:{cycleId,stage,...(token.previousRevision?{previousRevision:token.previousRevision}:{})},
   execution:{command:[...proof.command],cwd:proof.cwd,exitCode:proof.exitCode,startedAt:proof.startedAt,finishedAt:proof.finishedAt}});
 }
 addReviewed(candidate:Candidate,proof:ExecutedReview):Evidence{
  if(!isExecutedReview(proof)||proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision)throw new Error("Review proof candidate mismatch or not ASEN-issued");
  return this.#insert(candidate,{id:`review:${proof.reviewerId}:${candidate.id}:${candidate.revision}`,kind:"review",status:"pass",summary:"Independent reviewer process completed",createdAt:proof.finishedAt,review:{taskId:proof.taskId,reviewerId:proof.reviewerId,authorId:proof.authorId},execution:{command:[...proof.command],cwd:candidate.repository,exitCode:0,startedAt:proof.startedAt,finishedAt:proof.finishedAt}});
 }
 #restoreVerified(candidate:Candidate,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(evidence.status==="pass"&&(evidence.kind==="test"||evidence.kind==="tdd")){
   const x=evidence.execution;if(!x||x.exitCode!==0||!Array.isArray(x.command)||x.command.length===0||!x.cwd||!x.startedAt||!x.finishedAt)throw new Error("Recovered passing execution evidence lacks provenance");
  }
  if(evidence.kind==="tdd"&&evidence.status==="expected-fail"){
   const x=evidence.execution;
   if(!x||x.exitCode===0||!Array.isArray(x.command)||x.command.length===0||!x.cwd||!x.startedAt||!x.finishedAt)throw new Error("Recovered TDD RED lacks executed failing command");
  }
  if(evidence.status==="pass"&&evidence.kind==="review"){
   const x=evidence.execution,r=evidence.review;
   if(!x||x.exitCode!==0||x.cwd!==candidate.repository||!Array.isArray(x.command)||x.command.length===0||!x.startedAt||!x.finishedAt||!r||!r.taskId||!r.reviewerId||!r.authorId||r.taskId!==r.reviewerId||r.authorId===r.reviewerId)throw new Error("Recovered passing review evidence lacks authenticated provenance");
  }
  return this.#insert(candidate,evidence);
 }
 static async loadVerified(path:string,candidate:Candidate,key:Buffer):Promise<EvidenceStore>{
  let parsed:unknown;try{parsed=JSON.parse(await readFile(path,"utf8"));}catch(error){throw error;}
  const outer=exact(parsed,["value","mac"],"evidence envelope"),mac=outer.mac;if(typeof mac!=="string"||!/^[0-9a-f]{64}$/iu.test(mac))throw new Error("Evidence recovery signature missing");
  const version=typeof outer.value==="object"&&outer.value!==null?Object.getOwnPropertyDescriptor(outer.value,"version")?.value:undefined,domain=version===2?"asen.evidence.v2\0":"",expected=Buffer.from(sign(outer.value as EnvelopeV1|EnvelopeV2,key,domain),"hex"),actual=Buffer.from(mac,"hex");
  if(!timingSafeEqual(expected,actual))throw new Error("Evidence recovery integrity mismatch");
  const value=exact(outer.value,["version","candidate","items"],"evidence value");if(version!==1&&version!==2)throw new Error("Evidence recovery schema mismatch");
  const bound=candidateData(value.candidate),caller=candidateData(candidate);if(bound.repository!==caller.repository||bound.id!==caller.id||bound.revision!==caller.revision||version===2&&bound.createdAt!==caller.createdAt)throw new Error("Evidence recovery candidate mismatch");
  const items=array(value.items,"evidence items").map(item=>validateItem(item,bound,version===2));validateTddHistory(bound,items);
  const store=new EvidenceStore();for(const item of items){
   if(version===1&&!legacyKinds.has(item.kind))throw new Error("Lifecycle completion is unavailable in legacy evidence");
   const itemCandidate={...bound,revision:item.candidateRevision},metadata={id:item.id,kind:item.kind,status:item.status,summary:item.summary,createdAt:item.createdAt,...(item.execution?{execution:item.execution}:{}),...(item.review?{review:item.review}:{}),...(item.tdd?{tdd:item.tdd}:{}),...(item.completion?{completion:item.completion}:{})};
   if(item.kind==="lifecycle-completion")store.#insert(itemCandidate,metadata);else store.#restoreVerified(itemCandidate,metadata);
  }
  return store;
 }
 #insert(candidate:Candidate,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(this.#items.has(evidence.id)) throw new Error(`Evidence id already exists: ${evidence.id}`);
  const item:Evidence={...evidence,candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision};
  this.#items.set(item.id,Object.freeze(item)); return item;
 }
 forCandidate(candidate:Candidate):Evidence[]{return [...this.#items.values()].filter(i=>i.candidateRepository===candidate.repository&&i.candidateId===candidate.id&&i.candidateRevision===candidate.revision);}
 forLogicalCandidate(candidate:Candidate):Evidence[]{return [...this.#items.values()].filter(i=>i.candidateRepository===candidate.repository&&i.candidateId===candidate.id&&(i.candidateRevision===candidate.revision||i.kind==="tdd"));}
 hasPassing(candidate:Candidate,kind:Evidence["kind"]):boolean{
  const items=this.forCandidate(candidate);
  if(kind==="tdd"){
   return items.some(item=>{
    if(item.kind!=="tdd"||item.status!=="pass"||item.tdd?.stage!=="REFACTOR"||item.execution?.exitCode!==0)return false;
    const all=[...this.#items.values()].filter(x=>x.candidateRepository===candidate.repository&&x.candidateId===candidate.id&&x.kind==="tdd"&&x.tdd?.cycleId===item.tdd?.cycleId);
    const green=all.find(x=>x.tdd?.stage==="GREEN"&&x.candidateRevision===item.tdd?.previousRevision&&x.status==="pass"&&x.execution?.exitCode===0);
    const red=green&&all.find(x=>x.tdd?.stage==="RED"&&x.candidateRevision===green.tdd?.previousRevision&&x.status==="expected-fail"&&!!x.execution&&x.execution.exitCode!==0);
    return !!red;
   });
  }
  return items.some(i=>i.kind===kind&&i.status==="pass");
 }
}

export async function saveEvidence(path:string,candidate:Candidate,store:EvidenceStore,key:Buffer):Promise<void>{
 const bound=candidateData(candidate),value:EnvelopeV2={version:2,candidate:structuredClone(bound),items:store.forLogicalCandidate(bound)};
 value.items=value.items.map(item=>validateItem(item,bound,true));validateTddHistory(bound,value.items);
 const temp=join(dirname(path),`.${basename(path)}.${randomUUID()}.tmp`);let handle;
 try{handle=await open(temp,"wx",0o600);await handle.writeFile(JSON.stringify({value,mac:sign(value,key,"asen.evidence.v2\0")}),"utf8");await handle.sync();await handle.close();handle=undefined;await rename(temp,path);}
 finally{if(handle)await handle.close();await unlink(temp).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});}
}

export async function loadEvidence(path:string,candidate:Candidate,key:Buffer):Promise<EvidenceStore>{
 return EvidenceStore.loadVerified(path,candidate,key);
}
