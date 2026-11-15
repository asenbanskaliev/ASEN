/** Durable attribution between a prepared source Todo and a separate Pi
 * session opened inside its Git worktree. Read-only evidence: never grants
 * Writer authority, never starts an agent, and never implies completion. */
import {execFileSync} from "node:child_process";
import {realpathSync,lstatSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {isAbsolute,resolve} from "node:path";
import {atomicWriteText} from "../../io/atomic-write.js";
import {withExclusiveFileLock} from "../../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import {ParallelTodoWorktreeJournal} from "./parallel-todo-journal.js";

const SCHEMA="asen.parallel-worktree-sessions/v1" as const;
const stringIdentity=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=1024&&
 s===s.trim()&&s===s.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s);
const sha=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const exact=(v:unknown,k:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&
 !Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
export interface ParallelChildSessionLink{
 readonly batchId:string;readonly sourceSessionId:string;readonly sourceProjectId:string;
 readonly sourceTodoId:string;readonly sourceRequestId:string;readonly sourceTodoRevision:number;
 readonly childSessionId:string;readonly childProjectId:string;readonly sourceHead:string;
 readonly attachedAt:string;readonly authority:"none";readonly autoDispatch:false;readonly autoMerge:false;
}
interface Journal{schema:typeof SCHEMA;revision:number;links:ParallelChildSessionLink[];}
const keys=["batchId","sourceSessionId","sourceProjectId","sourceTodoId","sourceRequestId","sourceTodoRevision",
 "childSessionId","childProjectId","sourceHead","attachedAt","authority","autoDispatch","autoMerge"] as const;
function parse(raw:string):Journal{
 const x:unknown=JSON.parse(raw);
 if(!exact(x,["schema","revision","links"])||x.schema!==SCHEMA||!Number.isSafeInteger(x.revision)||
  Number(x.revision)<0||!Array.isArray(x.links)||x.links.length>512||x.links.length!==x.revision)
  throw new Error("Invalid parallel child session journal");
 const seenRoots=new Set<string>(),seenSessions=new Set<string>();
 for(const row of x.links){
  if(!exact(row,keys)||![
   row.batchId,row.sourceSessionId,row.sourceProjectId,row.sourceTodoId,row.sourceRequestId,
   row.childSessionId,row.childProjectId
  ].every(stringIdentity)||!sha.test(String(row.sourceHead))||
   !isAbsolute(row.sourceProjectId as string)||!isAbsolute(row.childProjectId as string)||
   !Number.isSafeInteger(row.sourceTodoRevision)||Number(row.sourceTodoRevision)<1||
   typeof row.attachedAt!=="string"||!Number.isFinite(Date.parse(row.attachedAt))||
   new Date(row.attachedAt as string).toISOString()!==row.attachedAt||
   row.authority!=="none"||row.autoDispatch!==false||row.autoMerge!==false)
   throw new Error("Invalid parallel child session attribution");
  const root=resolve(row.childProjectId as string).toLowerCase(),
   session=(row.childSessionId as string).toLowerCase();
  if(seenRoots.has(root)||seenSessions.has(session))
   throw new Error("Duplicate parallel child session attribution");
  seenRoots.add(root);seenSessions.add(session);
 }
 return structuredClone(x) as Journal;
}
async function load(file:string):Promise<Journal>{
 if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,links:[]};
 return parse(await readFile(file,"utf8"));
}
function git(root:string,...args:string[]):string{
 return execFileSync("git",["-C",root,...args],{
  encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000,windowsHide:true,maxBuffer:300_000
 }).trim();
}
function verifyChildRoot(childRoot:string,sourceRoot:string,revision:string):string{
 if(!isAbsolute(childRoot)||!isAbsolute(sourceRoot))throw new Error("Child session requires absolute Git project roots");
 const stat=lstatSync(childRoot);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error("Child worktree root must be a real directory");
 const root=realpathSync(childRoot),source=realpathSync(sourceRoot);
 if(!sameWorkspaceIdentityPath(root,resolve(git(root,"rev-parse","--show-toplevel")))||
  !sameWorkspaceIdentityPath(source,resolve(git(source,"rev-parse","--show-toplevel")))||
  !sameWorkspaceIdentityPath(resolve(root,git(root,"rev-parse","--git-common-dir")),
                            resolve(source,git(source,"rev-parse","--git-common-dir")))||
  git(root,"rev-parse","HEAD")!==revision)
  throw new Error("Child session worktree is not the exact linked Git candidate");
 return root;
}
export class ParallelChildSessionJournal{
 constructor(readonly file:string,readonly sourceJournal:ParallelTodoWorktreeJournal){
  if(!isAbsolute(file))throw new Error("Child session journal path must be absolute");
 }
 async attach(input:{childSessionId:string;childProjectId:string;
  confirm:(owner:Readonly<{sourceTodoId:string;sourceHead:string;worktreeRoot:string;
   sourceProjectId:string;writeSurfaces:readonly string[];grantsAuthority:false}>)=>Promise<boolean>;
  validateSession?:()=>void|Promise<void>}):Promise<Readonly<{status:"attached"|"declined";link?:ParallelChildSessionLink;grantsAuthority:false}>>{
  if(!stringIdentity(input.childSessionId)||!isAbsolute(input.childProjectId)||typeof input.confirm!=="function")
   throw new Error("Invalid Pi child session attachment");
  await input.validateSession?.();
  const canonical=realpathSync(input.childProjectId),owner=await this.sourceJournal.findPreparedWorktree(canonical);
  if(!owner)throw new Error("Worktree has no prepared source ODD Todo; manual reconciliation required");
  verifyChildRoot(canonical,owner.sourceProjectId,owner.sourceHead);
  const approved=await input.confirm(Object.freeze({
   sourceTodoId:owner.taskId,sourceHead:owner.sourceHead,sourceProjectId:owner.sourceProjectId,
   worktreeRoot:canonical,writeSurfaces:owner.writeSurfaces,grantsAuthority:false as const
  }));
  if(approved!==true)return Object.freeze({status:"declined" as const,grantsAuthority:false as const});
  await input.validateSession?.();
  const fresh=await this.sourceJournal.findPreparedWorktree(canonical);
  if(!fresh||JSON.stringify(fresh)!==JSON.stringify(owner))
   throw new Error("Source Todo worktree reservation changed during child attachment");
  verifyChildRoot(canonical,fresh.sourceProjectId,fresh.sourceHead);
  const link:ParallelChildSessionLink={
   batchId:fresh.batchId,sourceSessionId:fresh.sourceSessionId,sourceProjectId:fresh.sourceProjectId,
   sourceTodoId:fresh.taskId,sourceRequestId:fresh.requestId,sourceTodoRevision:fresh.taskRevision,
   childSessionId:input.childSessionId,childProjectId:canonical,sourceHead:fresh.sourceHead,
   attachedAt:new Date().toISOString(),authority:"none",autoDispatch:false,autoMerge:false
  };
  await preparePrivateFile(this.file,true);
  return withExclusiveFileLock(this.file,async()=>{
   await input.validateSession?.();
   const persisted=await load(this.file),prior=persisted.links.find(existing=>
    sameWorkspaceIdentityPath(existing.childProjectId,canonical)||
    existing.childSessionId===input.childSessionId);
   if(prior)throw new Error("Child Pi session or worktree already linked; inspect prior attempts");
   if(persisted.links.length>=512)throw new Error("Child Pi session journal capacity exhausted");
   const current=await this.sourceJournal.findPreparedWorktree(canonical);
   if(!current||JSON.stringify(current)!==JSON.stringify(fresh))
    throw new Error("Prepared source Todo link changed before durable session attribution");
   verifyChildRoot(canonical,current.sourceProjectId,current.sourceHead);
   persisted.links.push(link);persisted.revision++;
   await atomicWriteText(this.file,JSON.stringify(parse(JSON.stringify(persisted)))+"\n");
   return Object.freeze({status:"attached" as const,link:structuredClone(link),grantsAuthority:false as const});
  });
 }
 async listSource(identity:{sessionId:string;projectId:string}):Promise<readonly ParallelChildSessionLink[]>{
  if(!stringIdentity(identity.sessionId)||!isAbsolute(identity.projectId))
   throw new Error("Invalid source Pi identity");
  const rows=await load(this.file);
  return rows.links.filter(row=>row.sourceSessionId===identity.sessionId&&
   sameWorkspaceIdentityPath(row.sourceProjectId,identity.projectId)).map(row=>structuredClone(row));
 }
 async listChild(identity:{sessionId:string;projectId:string}):Promise<readonly ParallelChildSessionLink[]>{
  if(!stringIdentity(identity.sessionId)||!isAbsolute(identity.projectId))
   throw new Error("Invalid child Pi identity");
  const rows=await load(this.file);
  return rows.links.filter(row=>row.childSessionId===identity.sessionId&&
   sameWorkspaceIdentityPath(row.childProjectId,identity.projectId)).map(row=>structuredClone(row));
 }
}
