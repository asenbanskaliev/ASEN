/** Explicitly consented worktree preparation for parallel Workers.
 *
 * Does NOT mint a Writer admission, phase grant, Pi receiver or release authority.
 * Every delegated Worker MUST be planned and freshly authorized in its own root.
 * Existing Dispatcher, workspace writer lease and ODD controls remain decisive.
 */
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {existsSync,lstatSync,realpathSync} from "node:fs";
import {basename,isAbsolute,relative,resolve,sep} from "node:path";
import {parseWorktreeListOutput} from "../workspace-snapshot.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import {validateWriteGrant} from "../../policies/scopes.js";
import type {AgentRequest,AgentResult,Dispatcher} from "../../agents/dispatcher.js";

const revisionPattern=/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const taskPattern=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u;
const scoped=(path:unknown):path is string=>typeof path==="string"&&path.length>0&&path.length<=1024&&
 path===path.trim()&&path===path.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(path)&&
 !path.startsWith("/")&&!path.includes("\\")&&!path.includes(":")&&!path.includes("*")&&
 path.split("/").every(part=>!!part&&part!=="."&&part!==".."&&part!==".git");
function git(root:string,...args:string[]):string{
 return execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:15000,windowsHide:true,maxBuffer:2_000_000});
}
function gitHead(root:string):string{return git(root,"rev-parse","HEAD").trim();}
function commonDirectory(root:string):string{return realpathSync(resolve(root,git(root,"rev-parse","--git-common-dir").trim()));}
function worktreeRoots(root:string):readonly string[]{
 return parseWorktreeListOutput(git(root,"worktree","list","--porcelain","-z"));
}
function isInside(child:string,parent:string):boolean{
 const remainder=relative(parent,child);
 return remainder===""||(!remainder.startsWith(".."+sep)&&remainder!==".."&&!isAbsolute(remainder));
}
function clean(root:string):boolean{return git(root,"status","--porcelain=v1","--untracked-files=all").trim()==="";}
function canonicalRoot(root:string):string{
 if(!isAbsolute(root))throw new Error("A worktree root must be absolute");
 const stat=lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("Worktree root must be a real directory");
 const real=realpathSync(root),top=resolve(git(real,"rev-parse","--show-toplevel").trim());
 if(!sameWorkspaceIdentityPath(real,top))throw new Error("Worktree must own its exact Git root");
 return real;
}
export interface ParallelWorkerUnit {readonly taskId:string;readonly writeSurfaces:readonly string[];}
export interface ParallelWorktreeAllocation{
 readonly taskId:string;readonly root:string;readonly sourceRoot:string;
 readonly baseRevision:string;readonly writeSurfaces:readonly string[];
 readonly grantsAuthority:false;readonly autoMerge:false;
}
export interface PreparedParallelWorktrees{
 readonly status:"prepared";readonly allocations:readonly ParallelWorktreeAllocation[];
 readonly grantsAuthority:false;readonly autoMerge:false;readonly cleanup:"manual-after-review";
}
export type ParallelWorktreeProposal={
 readonly sourceRoot:string;readonly parentDir:string;readonly expectedHead:string;
 readonly units:readonly ParallelWorkerUnit[];
 readonly confirm:(summary:Readonly<{sourceRoot:string;revision:string;taskIds:readonly string[];
  scopes:readonly Readonly<{taskId:string;writeSurfaces:readonly string[]}>[];creates:number;grantsAuthority:false}>)=>Promise<boolean>;
 readonly signal?:AbortSignal;
};
const genuineAllocations=new WeakSet<object>();
const dispatchedAllocations=new WeakSet<object>();
function validateProposal(input:ParallelWorktreeProposal){
 if(!input||!revisionPattern.test(input.expectedHead)||!Array.isArray(input.units)||input.units.length<2||input.units.length>4||
  typeof input.confirm!=="function")throw new Error("Parallel Worker request must contain 2 to 4 bounded units");
 const source=canonicalRoot(input.sourceRoot),parent=resolve(input.parentDir);
 if(!isAbsolute(input.parentDir))throw new Error("Worktree parent must be absolute");
 const stat=lstatSync(parent);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("Worktree parent must be a real directory");
 const realParent=realpathSync(parent),common=commonDirectory(source);
 if(isInside(realParent,source)||isInside(source,realParent)||isInside(realParent,common))
  throw new Error("Worktree parent overlaps source root or Git metadata");
 const known=worktreeRoots(source).map(path=>realpathSync(path));
 if(known.some(root=>isInside(realParent,root)||isInside(root,realParent)))
  throw new Error("Worktree parent overlaps an existing worktree");
 const ids=new Set<string>(),grants: {agentId:string;repository:string;surfaces:string[]}[]=[];
 const units=input.units.map(unit=>{
  if(!unit||!taskPattern.test(unit.taskId)||unit.taskId==="."||unit.taskId===".."||
   ids.has(unit.taskId.toLowerCase())||!Array.isArray(unit.writeSurfaces)||unit.writeSurfaces.length<1||
   unit.writeSurfaces.length>256||unit.writeSurfaces.some((path:unknown)=>!scoped(path))||
   new Set(unit.writeSurfaces.map((p:string)=>p.toLowerCase())).size!==unit.writeSurfaces.length)
   throw new Error("Invalid or repeated parallel Worker unit/scope");
  ids.add(unit.taskId.toLowerCase());
  const grant={agentId:unit.taskId,repository:source,surfaces:[...unit.writeSurfaces]};
  // Different worktrees do not excuse overlapping integration surfaces.
  const reduced={...grant,surfaces:grant.surfaces.map(surface=>surface.toLowerCase())};
  validateWriteGrant(reduced,grants);grants.push(reduced);
  return Object.freeze({taskId:unit.taskId,writeSurfaces:Object.freeze([...unit.writeSurfaces])});
 });
 if(gitHead(source)!==input.expectedHead||!clean(source))throw new Error("Parallel Workers require a clean exact pinned source candidate");
 return {source,parent:realParent,common,units};
}
function verifyAllocation(allocation:ParallelWorktreeAllocation,expectedCommon:string,requireClean:boolean):void{
 if(!genuineAllocations.has(allocation))throw new Error("Forged or stale worktree allocation");
 const real=canonicalRoot(allocation.root);
 if(!sameWorkspaceIdentityPath(real,allocation.root)||gitHead(real)!==allocation.baseRevision||
  !sameWorkspaceIdentityPath(commonDirectory(real),expectedCommon)||
  !worktreeRoots(allocation.sourceRoot).some(root=>sameWorkspaceIdentityPath(root,real)))
  throw new Error("Parallel Worker worktree identity or pinned revision changed");
 if(requireClean&&!clean(real))throw new Error("Prepared Worker worktree contains unreviewed modifications");
}
export function assertPreparedParallelWorktree(allocation:ParallelWorktreeAllocation):void{
 if(!genuineAllocations.has(allocation))throw new Error("Forged or stale worktree allocation");
 verifyAllocation(allocation,commonDirectory(allocation.sourceRoot),true);
}
/** Staging has a separate host confirmation, not permission for any Worker model call.
 * On partial staging failure, keep artifacts for manual inspection: no force cleanup.
 */
export async function prepareParallelWorkerWorktrees(input:ParallelWorktreeProposal):Promise<PreparedParallelWorktrees|Readonly<{status:"declined";grantsAuthority:false}>>{
 const {source,parent,common,units}=validateProposal(input);
 if(input.signal?.aborted)throw new Error("Parallel Worker preparation cancelled");
 const summary=Object.freeze({
  sourceRoot:source,revision:input.expectedHead,taskIds:Object.freeze(units.map(u=>u.taskId)),
  scopes:Object.freeze(units.map(u=>Object.freeze({taskId:u.taskId,writeSurfaces:u.writeSurfaces}))),
  creates:units.length,grantsAuthority:false as const
 });
 if(await input.confirm(summary)!==true)return Object.freeze({status:"declined" as const,grantsAuthority:false as const});
 if(input.signal?.aborted)throw new Error("Parallel Worker preparation cancelled");
 const after=validateProposal(input);
 if(!sameWorkspaceIdentityPath(source,after.source)||!sameWorkspaceIdentityPath(parent,after.parent)||
  !sameWorkspaceIdentityPath(common,after.common))throw new Error("Parallel Worker source changed after confirmation");
 const allocations:ParallelWorktreeAllocation[]=[];
 for(const unit of units){
  if(input.signal?.aborted)throw new Error("Parallel Worker preparation cancelled; inspect already created worktrees");
  if(gitHead(source)!==input.expectedHead||!clean(source))throw new Error("Pinned source changed during worktree preparation");
  const target=resolve(parent,"asen-worker-"+unit.taskId+"-"+randomUUID());
  if(existsSync(target))throw new Error("New worktree location unexpectedly exists");
  git(source,"worktree","add","--detach","--",target,input.expectedHead);
  const allocation=Object.freeze({taskId:unit.taskId,root:target,sourceRoot:source,
   baseRevision:input.expectedHead,writeSurfaces:unit.writeSurfaces,
   grantsAuthority:false as const,autoMerge:false as const});
  genuineAllocations.add(allocation);
  verifyAllocation(allocation,common,true);
  allocations.push(allocation);
 }
 return Object.freeze({status:"prepared" as const,allocations:Object.freeze(allocations),
  grantsAuthority:false as const,autoMerge:false as const,cleanup:"manual-after-review" as const});
}
/** Uses existing Dispatcher authorization. Never converts a worktree allocation
 * into a Writer grant; each request must bring fresh ASEN-approved one-use tokens.
 * Caller inspects results and reconciles them manually. No automatic merge/retry.
 */
export async function dispatchApprovedParallelWorkers(input:{
 readonly dispatcher:Pick<Dispatcher,"dispatch">;
 readonly allocations:readonly ParallelWorktreeAllocation[];
 readonly requests:readonly AgentRequest[];
}):Promise<Readonly<{status:"finished-needs-review";results:readonly Readonly<{taskId:string;ok:boolean;result?:AgentResult;reason?:string}>[];autoMerge:false}>>{
 const {allocations,requests}=input;
 if(!Array.isArray(allocations)||allocations.length<2||allocations.length>4||
  !Array.isArray(requests)||requests.length!==allocations.length)throw new Error("Parallel dispatch requires a matching bounded batch");
 const used=new Set<string>();
 for(let i=0;i<allocations.length;i++){
  const allocation=allocations[i]!,request=requests[i]!;
  if(!genuineAllocations.has(allocation)||dispatchedAllocations.has(allocation)||
   used.has(allocation.root)||request.role!=="worker"||
   request.repository!==allocation.root||request.candidate?.repository!==allocation.root||
   request.candidate.revision!==allocation.baseRevision||!request.isolationKey||
   !request.writerAdmission||typeof request.writerAdmission!=="object"||!request.skillContext||
   request.writeSurfaces?.length!==allocation.writeSurfaces.length||
   !request.writeSurfaces.every((scope:string,j:number)=>scope===allocation.writeSurfaces[j]))
   throw new Error("Parallel dispatch requires separate freshly authorized exact worktree Workers");
  used.add(allocation.root);
  assertPreparedParallelWorktree(allocation);
  if(gitHead(allocation.sourceRoot)!==allocation.baseRevision||!clean(allocation.sourceRoot))
   throw new Error("Original candidate changed since parallel Worktree preparation; create a fresh plan");
 }
 // Burn batch allocations before starting any runner. An interrupted outcome
 // is never automatically re-dispatched; original tokens are consumed by Dispatcher.
 for(const allocation of allocations)dispatchedAllocations.add(allocation);
 const settled=await Promise.allSettled(requests.map(request=>input.dispatcher.dispatch(request)));
 const results=settled.map((outcome,i)=>Object.freeze(outcome.status==="fulfilled"?
  {taskId:allocations[i]!.taskId,ok:outcome.value.ok,result:outcome.value}:
  {taskId:allocations[i]!.taskId,ok:false,reason:"Worker dispatch failed; inspect task and worktree manually"}));
 return Object.freeze({status:"finished-needs-review" as const,results:Object.freeze(results),autoMerge:false as const});
}
