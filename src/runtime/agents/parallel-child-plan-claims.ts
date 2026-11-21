/** One-shot persisted handoff claim for a child worktree's independent ODD
 * planning. A claim is NOT proof that a child plan or agent started.
 * A crash after claiming never authorizes a silent retry or a Writer. */
import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {atomicWriteText} from "../../io/atomic-write.js";
import {withExclusiveFileLock} from "../../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import type {ParallelChildSessionLink} from "./parallel-todo-session-links.js";

const SCHEMA="asen.parallel-child-plan-claims/v1" as const;
const safe=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=1024&&
 s===s.trim()&&s===s.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&
 !Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export interface ParallelChildPlanClaim{
 readonly sourceTodoId:string;readonly sourceProjectId:string;readonly childSessionId:string;
 readonly childProjectId:string;readonly batchId:string;readonly claimedAt:string;
 readonly status:"claimed-not-verified";readonly grantsAuthority:false;readonly autoRetry:false;
}
interface Journal{schema:typeof SCHEMA;revision:number;claims:ParallelChildPlanClaim[];}
const keys=["sourceTodoId","sourceProjectId","childSessionId","childProjectId","batchId","claimedAt","status","grantsAuthority","autoRetry"] as const;
function parse(raw:string):Journal{
 const parsed:unknown=JSON.parse(raw);
 if(!exact(parsed,["schema","revision","claims"])||parsed.schema!==SCHEMA||
  !Number.isSafeInteger(parsed.revision)||Number(parsed.revision)<0||!Array.isArray(parsed.claims)||
  parsed.claims.length>512||Number(parsed.revision)!==parsed.claims.length)
  throw new Error("Invalid child ODD handoff claim journal");
 const seen:string[]=[];
 for(const item of parsed.claims){
  if(!exact(item,keys)||![item.sourceTodoId,item.sourceProjectId,item.childSessionId,
   item.childProjectId,item.batchId].every(safe)||
   !isAbsolute(item.sourceProjectId as string)||!isAbsolute(item.childProjectId as string)||
   typeof item.claimedAt!=="string"||!Number.isFinite(Date.parse(item.claimedAt))||
   new Date(item.claimedAt as string).toISOString()!==item.claimedAt||
   item.status!=="claimed-not-verified"||item.grantsAuthority!==false||item.autoRetry!==false)
   throw new Error("Invalid child ODD handoff claim");
  const root=item.childProjectId as string;
  if(seen.some(previous=>sameWorkspaceIdentityPath(previous,root)))
   throw new Error("Duplicated child ODD handoff claim");
  seen.push(root);
 }
 return structuredClone(parsed) as unknown as Journal;
}
async function load(file:string):Promise<Journal>{
 if(!await preparePrivateFile(file))return {schema:SCHEMA,revision:0,claims:[]};
 return parse(await readFile(file,"utf8"));
}
export class ParallelChildPlanClaimJournal{
 constructor(readonly file:string){if(!isAbsolute(file))throw new Error("Child ODD handoff journal path must be absolute");}
 async claim(link:ParallelChildSessionLink):Promise<ParallelChildPlanClaim>{
  if(!link||!safe(link.childSessionId)||!safe(link.sourceTodoId)||
   !isAbsolute(link.childProjectId)||!isAbsolute(link.sourceProjectId)||
   link.authority!=="none"||link.autoDispatch!==false||link.autoMerge!==false)
   throw new Error("A child ODD handoff requires a non-authorizing session link");
  const value:ParallelChildPlanClaim={
   sourceTodoId:link.sourceTodoId,sourceProjectId:link.sourceProjectId,
   childSessionId:link.childSessionId,childProjectId:link.childProjectId,
   batchId:link.batchId,claimedAt:new Date().toISOString(),
   status:"claimed-not-verified",grantsAuthority:false,autoRetry:false
  };
  await preparePrivateFile(this.file,true);
  return withExclusiveFileLock(this.file,async()=>{
   const current=await load(this.file);
   if(current.claims.length>=512||current.claims.some(old=>
    sameWorkspaceIdentityPath(old.childProjectId,link.childProjectId)||
    old.childSessionId===link.childSessionId||
    (old.sourceTodoId===link.sourceTodoId&&
     sameWorkspaceIdentityPath(old.sourceProjectId,link.sourceProjectId))))
    throw new Error("Child ODD handoff previously claimed; manual inspection required, no automatic retry");
   current.claims.push(value);current.revision++;
   await atomicWriteText(this.file,JSON.stringify(parse(JSON.stringify(current)))+"\n");
   return structuredClone(value);
  });
 }
 async listSource(identity:{sessionId:string;projectId:string},links:readonly ParallelChildSessionLink[]):Promise<readonly ParallelChildPlanClaim[]>{
  if(!safe(identity.sessionId)||!isAbsolute(identity.projectId))throw new Error("Invalid source handoff identity");
  const linked=links.filter(link=>link.sourceSessionId===identity.sessionId&&
   sameWorkspaceIdentityPath(link.sourceProjectId,identity.projectId));
  const journal=await load(this.file);
  return journal.claims.filter(claim=>linked.some(link=>link.sourceTodoId===claim.sourceTodoId&&
   link.childSessionId===claim.childSessionId&&
   sameWorkspaceIdentityPath(link.childProjectId,claim.childProjectId))).map(claim=>structuredClone(claim));
 }
}
