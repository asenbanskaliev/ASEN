/** Durable cross-session T06 Worker observation. A receipt records a native,
 * scoped ASEN agent lifecycle and Git inspection, not a model-consumption
 * proof, test pass, review acceptance, merge grant or replay authorization. */
import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {atomicWriteText} from "../../io/atomic-write.js";
import {withExclusiveFileLock} from "../../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import type {ParallelChildSessionLink} from "./parallel-todo-session-links.js";
import type {AttributedParallelWorker} from "./parallel-worker-attribution.js";
import type {ParallelWorktreeChangeInspection} from "./parallel-worktree-change-inspection.js";
import {validNativeWriterCompletion,type NativeWriterCompletion} from "./native-writer-completion.js";

const SCHEMA="asen.parallel-worker-observations/v1" as const;
const allowed=new Set(["completed","failed","cancelled","interrupted"]);
const portablePath=(value:unknown):value is string=>
 typeof value==="string"&&value.length>0&&value.length<=1024&&
 value===value.normalize("NFC")&&
 !/[\\:\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(value)&&
 !value.startsWith("/")&&
 value.split("/").every(part=>part!==""&&part!=="."&&part!==".."&&part.toLowerCase()!==".git");

/** La inspección Git no admite estados incompatibles ni rutas sin normalizar.
 * Un recibo incoherente debe fallar antes de persistir el lote completo. */
function validChanges(changes:ParallelWorktreeChangeInspection):boolean{
 if(!changes||changes.acceptance!=="not-accepted"||changes.autoMerge!==false||
  !Array.isArray(changes.changedPaths)||!Array.isArray(changes.outOfScopePaths)||
  typeof changes.sourceVerified!=="boolean"||typeof changes.headMatchesBase!=="boolean"||
  changes.changedPaths.length>512||changes.outOfScopePaths.length>512)return false;
 const changed=changes.changedPaths,out=changes.outOfScopePaths;
 if(changed.some(item=>!portablePath(item))||out.some(item=>!portablePath(item))||
  new Set(changed).size!==changed.length||new Set(out).size!==out.length||
  out.some(item=>!changed.includes(item)))return false;
 switch(changes.status){
  case "unavailable":return !changes.sourceVerified&&!changes.headMatchesBase&&changed.length===0&&out.length===0;
  case "clean":return changes.sourceVerified&&changes.headMatchesBase&&changed.length===0&&out.length===0;
  case "scoped-changes":return changes.sourceVerified&&changes.headMatchesBase&&changed.length>0&&out.length===0;
  case "head-diverged":return changes.sourceVerified&&!changes.headMatchesBase&&out.length===0;
  case "out-of-scope":return changes.sourceVerified&&out.length>0;
  default:return false;
 }
}
const safe=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=1024&&
 s===s.trim()&&s===s.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s);
const validTime=(s:unknown):s is string=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
export interface ParallelWorkerObservation{
 readonly batchId:string;readonly sourceSessionId:string;readonly sourceProjectId:string;
 readonly sourceTodoId:string;readonly sourceTodoRevision:number;
 readonly childSessionId:string;readonly childProjectId:string;
 readonly childTodoId:string;readonly agentId:string;
 readonly agentState:"completed"|"failed"|"cancelled"|"interrupted";
 readonly agentUpdatedAt:string;readonly childTodoState:string;
 readonly worktreeChangeState:ParallelWorktreeChangeInspection["status"];
 readonly changedPaths:readonly string[];
 readonly candidateTree?:string;
 readonly authorModelsObserved?:readonly string[];
 readonly recordedAt:string;
 readonly modelActual:"unknown";readonly modelConsumedProven:false;
 readonly acceptance:"not-accepted";readonly grantsAuthority:false;readonly autoRetry:false;readonly autoMerge:false;
}
interface Journal{schema:typeof SCHEMA;revision:number;receipts:ParallelWorkerObservation[];}
const keys=["batchId","sourceSessionId","sourceProjectId","sourceTodoId","sourceTodoRevision",
 "childSessionId","childProjectId","childTodoId","agentId","agentState","agentUpdatedAt",
 "childTodoState","worktreeChangeState","changedPaths","recordedAt",
 "modelActual","modelConsumedProven","acceptance","grantsAuthority","autoRetry","autoMerge"] as const;
function parse(raw:string):Journal{
 const x:unknown=JSON.parse(raw);
 if(!exact(x,["schema","revision","receipts"])||x.schema!==SCHEMA||
  !Number.isSafeInteger(x.revision)||Number(x.revision)<0||
  !Array.isArray(x.receipts)||x.receipts.length>512||Number(x.revision)!==x.receipts.length)
  throw new Error("Invalid parallel Worker observation journal");
 const seen=new Set<string>();
 for(const row of x.receipts){
  const withTree=!!row&&typeof row==="object"&&Object.hasOwn(row,"candidateTree");
  const withModels=!!row&&typeof row==="object"&&Object.hasOwn(row,"authorModelsObserved");
  if(!exact(row,[...keys,...(withTree?["candidateTree"]:[]),...(withModels?["authorModelsObserved"]:[])])||
   (withModels&&(!withTree||!validAuthorModels(row.authorModelsObserved)))||
   (withTree&&(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(String(row.candidateTree))||row.agentState!=="completed"||row.childTodoState!=="succeeded"||row.worktreeChangeState!=="scoped-changes"))||![
   row.batchId,row.sourceSessionId,row.sourceProjectId,row.sourceTodoId,
   row.childSessionId,row.childProjectId,row.childTodoId,row.agentId,row.childTodoState
  ].every(safe)||!isAbsolute(row.sourceProjectId as string)||!isAbsolute(row.childProjectId as string)||
   !Number.isSafeInteger(row.sourceTodoRevision)||Number(row.sourceTodoRevision)<1||
   !allowed.has(String(row.agentState))||!validTime(row.agentUpdatedAt)||!validTime(row.recordedAt)||
   !["clean","scoped-changes","out-of-scope","head-diverged","unavailable"].includes(String(row.worktreeChangeState))||
   !Array.isArray(row.changedPaths)||row.changedPaths.length>512||
   row.changedPaths.some(path=>!portablePath(path))||
   new Set(row.changedPaths).size!==row.changedPaths.length||
   (row.worktreeChangeState==="clean"&&row.changedPaths.length>0)||
   (row.worktreeChangeState==="unavailable"&&row.changedPaths.length>0)||
   (row.worktreeChangeState==="scoped-changes"&&row.changedPaths.length===0)||
   (row.worktreeChangeState==="out-of-scope"&&row.changedPaths.length===0)||
   row.modelActual!=="unknown"||
   row.modelConsumedProven!==false||row.acceptance!=="not-accepted"||
   row.grantsAuthority!==false||row.autoRetry!==false||row.autoMerge!==false)
   throw new Error("Invalid parallel Worker observation");
  const id=[row.batchId,row.sourceTodoId].join("::");
  if(seen.has(id))throw new Error("Duplicated parallel Worker observation");
  seen.add(id);
 }
 return structuredClone(x) as unknown as Journal;
}
async function load(file:string):Promise<Journal>{
 if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,receipts:[]};
 return parse(await readFile(file,"utf8"));
}
function validAuthorModels(value:unknown):value is readonly string[]{
 return Array.isArray(value)&&value.length>=1&&value.length<=9&&new Set(value).size===value.length&&value.every(model=>typeof model==="string"&&/^[a-z0-9][a-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9_./:@-]{0,190}$/u.test(model));
}
export interface ParallelWorkerObservationInput{
 readonly link:ParallelChildSessionLink;
 readonly worker:AttributedParallelWorker;
 readonly sourceTodoRevision:number;
 readonly changes:ParallelWorktreeChangeInspection;
 readonly nativeCompletion?:NativeWriterCompletion;
}
function createObservationReceipt(input:ParallelWorkerObservationInput):ParallelWorkerObservation{
  const {link,worker,sourceTodoRevision,changes}=input;
  if(!link||link.authority!=="none"||link.autoDispatch!==false||link.autoMerge!==false||
   !worker||worker.sourceTodoId!==link.sourceTodoId||!allowed.has(worker.agentState)||
   worker.acceptance!=="not-accepted"||worker.autoMerge!==false||worker.modelConsumedProven!==false||
   !Number.isSafeInteger(sourceTodoRevision)||sourceTodoRevision!==link.sourceTodoRevision||
   !changes||changes.acceptance!=="not-accepted"||changes.autoMerge!==false||
   !validChanges(changes))
   throw new Error("Only a terminal exact native child Worker observation may be recorded");
  const completion=input.nativeCompletion;
  if(completion&&(!validNativeWriterCompletion(completion)||
   completion.baseCommit!==link.sourceHead||
   worker.agentState!=="completed"||worker.childTodoState!=="succeeded"||changes.status!=="scoped-changes"||
   JSON.stringify([...completion.paths].sort())!==JSON.stringify([...changes.changedPaths].sort())))
   throw new Error("Invalid native Worker completion evidence");
  const receipt:ParallelWorkerObservation={
   batchId:link.batchId,sourceSessionId:link.sourceSessionId,sourceProjectId:link.sourceProjectId,
   sourceTodoId:link.sourceTodoId,sourceTodoRevision,
   childSessionId:link.childSessionId,childProjectId:link.childProjectId,
   childTodoId:worker.childTodoId,agentId:worker.agentId,
   agentState:worker.agentState as ParallelWorkerObservation["agentState"],
   agentUpdatedAt:worker.agentUpdatedAt,childTodoState:worker.childTodoState,
   worktreeChangeState:changes.status,changedPaths:[...changes.changedPaths],
   ...(completion?{candidateTree:completion.candidateTree}:{}),
   ...(completion&&validAuthorModels(completion.authorModelsObserved)?{authorModelsObserved:[...completion.authorModelsObserved]}:{}),
   recordedAt:new Date().toISOString(),
   modelActual:"unknown",modelConsumedProven:false,acceptance:"not-accepted",
   grantsAuthority:false,autoRetry:false,autoMerge:false
  };
  parse(JSON.stringify({schema:SCHEMA,revision:1,receipts:[receipt]}));
  return receipt;
}
export class ParallelWorkerObservationJournal{
 constructor(readonly file:string){if(!isAbsolute(file))throw new Error("Worker observation journal requires an absolute private file");}
 /** A durable receipt is not acceptance: no Writer, model, retry or merge rights. */
 async record(input:ParallelWorkerObservationInput):Promise<ParallelWorkerObservation>{
  const receipts=await this.recordBatch([input],true);
  return receipts[0]!;
 }
 /** Record a complete bounded batch in one atomic commit. A partial write must
  * never leave a misleading subset of child Workers marked as observed.
  * Existing receipts are not overwritten or silently replayed. */
 async recordBatch(inputs:readonly ParallelWorkerObservationInput[],allowSingle=false):Promise<readonly ParallelWorkerObservation[]>{
  if(!Array.isArray(inputs)||inputs.length<(allowSingle?1:2)||inputs.length>4)
   throw new Error("An observation batch must contain two to four terminal Workers");
  const receipts=inputs.map(createObservationReceipt),first=receipts[0]!;
  const seenTasks=new Set<string>(),seenAgents=new Set<string>(),seenRoots=new Set<string>(),seenSessions=new Set<string>();
  for(const r of receipts){
   const root=r.childProjectId.toLocaleLowerCase("en-US");
   if(r.batchId!==first.batchId||r.sourceSessionId!==first.sourceSessionId||
    !sameWorkspaceIdentityPath(r.sourceProjectId,first.sourceProjectId)||
    seenTasks.has(r.sourceTodoId)||seenAgents.has(r.agentId)||seenRoots.has(root)||
    seenSessions.has(r.childSessionId))
    throw new Error("Observation batch has mixed owners, duplicated tasks, agents or worktrees");
   seenTasks.add(r.sourceTodoId);seenAgents.add(r.agentId);seenRoots.add(root);
   seenSessions.add(r.childSessionId);
  }
  await preparePrivateFile(this.file,true);
  return withExclusiveFileLock(this.file,async()=>{
   const journal=await load(this.file);
   if(journal.receipts.length+receipts.length>512)throw new Error("Worker observation journal is full");
   for(const fresh of receipts){
    if(journal.receipts.some(row=>row.batchId===fresh.batchId&&row.sourceTodoId===fresh.sourceTodoId||
     row.agentId===fresh.agentId||
     row.childSessionId===fresh.childSessionId))
     throw new Error("Worker observation already recorded; inspect the original receipt, no replay or replacement");
   }
   journal.receipts.push(...receipts);journal.revision+=receipts.length;
   await atomicWriteText(this.file,JSON.stringify(parse(JSON.stringify(journal)))+"\n");
   return Object.freeze(receipts.map(receipt=>structuredClone(receipt)));
  });
 }
 async listSource(identity:{sessionId:string;projectId:string},links:readonly ParallelChildSessionLink[]):Promise<readonly ParallelWorkerObservation[]>{
  if(!safe(identity.sessionId)||!isAbsolute(identity.projectId)||!Array.isArray(links))
   throw new Error("Invalid Worker observation source identity");
  const journal=await load(this.file);
  return journal.receipts.filter(row=>row.sourceSessionId===identity.sessionId&&
   sameWorkspaceIdentityPath(row.sourceProjectId,identity.projectId)&&
   links.some(link=>link.batchId===row.batchId&&link.sourceTodoId===row.sourceTodoId&&
    link.childSessionId===row.childSessionId&&sameWorkspaceIdentityPath(link.childProjectId,row.childProjectId)))
   .map(row=>structuredClone(row));
 }
}
