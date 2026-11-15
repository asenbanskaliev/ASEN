/** Audit-only durable reservation for T06. No startup may resume it and no
 * record can mint an agent grant. A crash between reserve and commit leaves
 * an explicit requires-reconciliation record with deterministic expected paths. */
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {isAbsolute,join,resolve} from "node:path";
import {atomicWriteText} from "../../io/atomic-write.js";
import {withExclusiveFileLock} from "../../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import type {TodoContext} from "../lifecycle/todo-store.js";
import type {BoundParallelTodo} from "./parallel-todo-bindings.js";
import {assertPreparedParallelWorktree,type ParallelWorktreeAllocation} from "./parallel-worktrees.js";

const SCHEMA="asen.parallel-todo-worktrees/v1" as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const valid=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=1024&&
 s===s.trim()&&s===s.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&
 !Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export interface ParallelTodoWorktreeRecord{
 readonly id:string;readonly sessionId:string;readonly projectId:string;
 readonly sourceHead:string;readonly parentDir:string;readonly createdAt:string;
 readonly state:"reserved"|"prepared";
 readonly tasks:readonly Readonly<{
  taskId:string;requestId:string;taskRevision:number;
  writeSurfaces:readonly string[];worktreeRoot:string;
 }>[];
 readonly grantsAuthority:false;readonly autoMerge:false;
}
interface Journal{schema:typeof SCHEMA;revision:number;records:ParallelTodoWorktreeRecord[];}
function parse(raw:string):Journal{
 const x:unknown=JSON.parse(raw);
 if(!exact(x,["schema","revision","records"])||x.schema!==SCHEMA||
  !Number.isSafeInteger(x.revision)||Number(x.revision)<0||!Array.isArray(x.records)||
  x.records.length>256||Number(x.revision)<x.records.length)
  throw new Error("Invalid parallel Todo worktree journal");
 const seen=new Set<string>();
 for(const value of x.records){
  if(!exact(value,["id","sessionId","projectId","sourceHead","parentDir","createdAt","state","tasks","grantsAuthority","autoMerge"])||
   !uuid.test(String(value.id))||seen.has(String(value.id))||
   !valid(value.sessionId)||!valid(value.projectId)||!sha.test(String(value.sourceHead))||
   typeof value.parentDir!=="string"||!isAbsolute(value.parentDir)||
   !Number.isFinite(Date.parse(String(value.createdAt)))||
   !["reserved","prepared"].includes(String(value.state))||value.grantsAuthority!==false||value.autoMerge!==false||
   !Array.isArray(value.tasks)||value.tasks.length<2||value.tasks.length>4)
   throw new Error("Invalid parallel Todo worktree reservation");
  seen.add(String(value.id));
  const tasks=new Set<string>(),paths=new Set<string>();
  for(const task of value.tasks){
   if(!exact(task,["taskId","requestId","taskRevision","writeSurfaces","worktreeRoot"])||
    !valid(task.taskId)||!valid(task.requestId)||!task.requestId.startsWith("asen-plan:")||
    !Number.isSafeInteger(task.taskRevision)||Number(task.taskRevision)<1||
    !Array.isArray(task.writeSurfaces)||task.writeSurfaces.length<1||task.writeSurfaces.length>256||
    task.writeSurfaces.some(scope=>!valid(scope))||typeof task.worktreeRoot!=="string"||
    !isAbsolute(task.worktreeRoot)||tasks.has(task.taskId)||paths.has(task.worktreeRoot)||
    resolve(value.parentDir as string,"asen-worker-"+task.taskId+"-"+value.id)!==task.worktreeRoot)
    throw new Error("Invalid parallel Todo worktree reservation task");
   tasks.add(task.taskId);paths.add(task.worktreeRoot);
  }
 }
 return structuredClone(x) as unknown as Journal;
}
async function load(file:string):Promise<Journal>{
 if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,records:[]};
 return parse(await readFile(file,"utf8"));
}
export class ParallelTodoWorktreeJournal{
 constructor(readonly file:string){if(!isAbsolute(file))throw new Error("Parallel worktree journal must use an absolute private file");}
 async reserve(input:{identity:TodoContext;id:string;head:string;parentDir:string;bindings:readonly BoundParallelTodo[]}):Promise<ParallelTodoWorktreeRecord>{
  const {identity,id,head,parentDir,bindings}=input;
  if(!uuid.test(id)||!valid(identity?.sessionId)||!valid(identity?.projectId)||!sha.test(head)||
   !isAbsolute(parentDir)||!Array.isArray(bindings)||bindings.length<2||bindings.length>4||
   bindings.some(b=>!valid(b.taskId)||!valid(b.requestId)||b.baseRevision!==head||
    b.authority!=="none"||b.needsNewWorktreePlan!==true))
   throw new Error("Invalid parallel Todo worktree reservation identity or scopes");
  const record:ParallelTodoWorktreeRecord={
   id,sessionId:identity.sessionId,projectId:identity.projectId,sourceHead:head,
   parentDir:resolve(parentDir),createdAt:new Date().toISOString(),state:"reserved",
   tasks:bindings.map(b=>({
    taskId:b.taskId,requestId:b.requestId,taskRevision:b.taskRevision,
    writeSurfaces:[...b.writeSurfaces],worktreeRoot:resolve(parentDir,"asen-worker-"+b.taskId+"-"+id)
   })),grantsAuthority:false,autoMerge:false
  };
  parse(JSON.stringify({schema:SCHEMA,revision:1,records:[record]}));
  await preparePrivateFile(this.file,true);
  await withExclusiveFileLock(this.file,async()=>{
   const journal=await load(this.file);
   if(journal.records.length>=256||journal.records.some(old=>
    old.id===id||(old.sessionId===identity.sessionId&&
     sameWorkspaceIdentityPath(old.projectId,identity.projectId)&&
     old.tasks.some(task=>record.tasks.some(next=>next.taskId===task.taskId)))))
    throw new Error("Parallel source Todo already reserved: inspect prior worktrees before planning another batch");
   journal.records.push(structuredClone(record));journal.revision++;
   await atomicWriteText(this.file,JSON.stringify(parse(JSON.stringify(journal)))+"\n");
  });
  return structuredClone(record);
 }
 async markPrepared(input:{identity:TodoContext;id:string;allocations:readonly ParallelWorktreeAllocation[]}):Promise<ParallelTodoWorktreeRecord>{
  await preparePrivateFile(this.file,true);
  return await withExclusiveFileLock(this.file,async()=>{
   const journal=await load(this.file),record=journal.records.find(row=>row.id===input.id&&
    row.sessionId===input.identity.sessionId&&sameWorkspaceIdentityPath(row.projectId,input.identity.projectId));
   if(!record||record.state!=="reserved"||!Array.isArray(input.allocations)||
    input.allocations.length!==record.tasks.length)
    throw new Error("Parallel worktree reservation is absent, stale or already settled");
   for(let i=0;i<record.tasks.length;i++){
    const task=record.tasks[i]!,allocation=input.allocations[i]!;
    if(!allocation||task.taskId!==allocation.taskId||task.worktreeRoot!==allocation.root||
     record.sourceHead!==allocation.baseRevision||!sameWorkspaceIdentityPath(record.projectId,allocation.sourceRoot)||
     task.writeSurfaces.length!==allocation.writeSurfaces.length||
     task.writeSurfaces.some((s,j)=>s!==allocation.writeSurfaces[j])||
     allocation.grantsAuthority!==false||allocation.autoMerge!==false)
     throw new Error("Parallel worktree result differs from reserved exact Todo mapping");
    assertPreparedParallelWorktree(allocation);
   }
   const next={...record,state:"prepared" as const};journal.records[journal.records.indexOf(record)]=next;journal.revision++;
   await atomicWriteText(this.file,JSON.stringify(parse(JSON.stringify(journal)))+"\n");
   return structuredClone(next);
  });
 }
 async list(identity:TodoContext):Promise<readonly ParallelTodoWorktreeRecord[]>{
  if(!valid(identity?.sessionId)||!valid(identity?.projectId))throw new Error("Invalid worktree inspection identity");
  const journal=await load(this.file);
  return journal.records.filter(r=>r.sessionId===identity.sessionId&&
   sameWorkspaceIdentityPath(r.projectId,identity.projectId)).map(r=>structuredClone(r));
 }
}
export function newParallelTodoWorktreeBatchId():string{return randomUUID();}
