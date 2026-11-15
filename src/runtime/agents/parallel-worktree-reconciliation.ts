/** Read-only multi-worktree reconciliation preview. No status produced here
 * can grant Worker, accept code review, integrate a commit, or replay a task. */
import type {ParallelWorktreeChangeInspection} from "./parallel-worktree-change-inspection.js";
export interface ParallelWorktreeReviewUnit{
 readonly taskId:string;readonly sourceTodoUnchanged:boolean;
 readonly changes:ParallelWorktreeChangeInspection;
 readonly childSession?:Readonly<{
  id:string;agents:readonly Readonly<{id:string;role:string;state:string}>[];
 }>;
}
export interface ParallelBatchReconciliation{
 readonly disposition:"blocked"|"not-started"|"manual-review-required";
 readonly blockers:readonly string[];
 readonly evidence:readonly Readonly<{
  taskId:string;changedPaths:readonly string[];changeState:string;
  agentState:"not-observed"|"active"|"terminal"|"unresolved";
 }>[];
 readonly grantsAuthority:false;readonly autoMerge:false;
 readonly acceptance:"not-accepted";
}
export function reconcileParallelWorktreeBatch(input:{
 readonly batchState:"reserved"|"prepared";
 readonly units:readonly ParallelWorktreeReviewUnit[];
}):ParallelBatchReconciliation{
 if(!Array.isArray(input.units)||input.units.length<2||input.units.length>4||
  !["reserved","prepared"].includes(input.batchState)||
  new Set(input.units.map(u=>u?.taskId)).size!==input.units.length)
  throw new Error("Invalid bounded worktree reconciliation batch");
 const blockers:string[]=[],evidence:ParallelBatchReconciliation["evidence"][number][]=[];
 const observed=new Map<string,string>();
 let seenChanges=false,seenActive=false,seenAllCompleted=true;
 if(input.batchState!=="prepared")blockers.push("Batch creation incomplete; inspect reserved Git paths manually");
 for(const unit of input.units){
  if(!unit||typeof unit.taskId!=="string"||!unit.taskId||!unit.changes||
   !Array.isArray(unit.changes.changedPaths)||!Array.isArray(unit.changes.outOfScopePaths)||
   unit.changes.acceptance!=="not-accepted"||unit.changes.autoMerge!==false)
   throw new Error("Malformed or fabricated worktree change-inspection input");
  if(!unit.sourceTodoUnchanged)blockers.push(unit.taskId+": source ODD Todo changed or is missing");
  const changes=unit.changes;
  if(!changes.sourceVerified||changes.status==="unavailable")blockers.push(unit.taskId+": Git provenance unavailable");
  if(!changes.headMatchesBase||changes.status==="head-diverged")blockers.push(unit.taskId+": candidate HEAD drift");
  if(changes.status==="out-of-scope"||changes.outOfScopePaths.length)
   blockers.push(unit.taskId+": modifications outside authorized scope");
  if(changes.changedPaths.length)seenChanges=true;
  for(const path of changes.changedPaths){
   const key=path.toLocaleLowerCase("en-US"),existing=observed.get(key);
   if(existing&&existing!==unit.taskId)
    blockers.push(unit.taskId+": path also modified by "+existing);
   observed.set(key,unit.taskId);
  }
  const agentStates=unit.childSession?.agents.filter(a=>a.role==="worker").map(a=>a.state)??[];
  let agentState:ParallelBatchReconciliation["evidence"][number]["agentState"]="not-observed";
  if(agentStates.some(s=>["failed","interrupted","cancelled"].includes(s)))agentState="unresolved";
  else if(agentStates.some(s=>["queued","running"].includes(s)))agentState="active";
  else if(agentStates.includes("completed"))agentState="terminal";
  if(agentState!=="terminal")seenAllCompleted=false;
  if(agentState==="active")seenActive=true;
  if(agentState==="unresolved")blockers.push(unit.taskId+": Worker terminated unsuccessfully or ambiguously");
  evidence.push(Object.freeze({
   taskId:unit.taskId,changedPaths:Object.freeze([...changes.changedPaths]),
   changeState:changes.status,agentState
  }));
 }
 const disposition=blockers.length?"blocked":seenChanges&&seenAllCompleted?
  "manual-review-required":"not-started";
 return Object.freeze({
  disposition,blockers:Object.freeze(blockers),evidence:Object.freeze(evidence),
  grantsAuthority:false,autoMerge:false,acceptance:"not-accepted"
 });
}
