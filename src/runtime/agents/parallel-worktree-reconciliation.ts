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
 readonly disposition:"blocked"|"not-started"|"observed-active"|"manual-review-required";
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
 // Una tarea no puede acreditar la ejecución de otra reutilizando su sesión o agente.
 const seenChildSessions=new Map<string,string>(),seenWorkerIds=new Map<string,string>();
 const knownWorkerStates=new Set(["queued","running","completed","failed","cancelled","interrupted"]);
 let seenActive=false,seenAllCompleted=true;
 if(input.batchState!=="prepared")blockers.push("Batch creation incomplete; inspect reserved Git paths manually");
 const units:readonly ParallelWorktreeReviewUnit[]=input.units;
 for(const unit of units){
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
  for(const path of changes.changedPaths){
   const key=path.toLocaleLowerCase("en-US"),existing=observed.get(key);
   if(existing&&existing!==unit.taskId)
    blockers.push(unit.taskId+": path also modified by "+existing);
   observed.set(key,unit.taskId);
  }
  const childSession=unit.childSession;
  if(childSession){
   if(typeof childSession.id!=="string"||!childSession.id||
    !Array.isArray(childSession.agents))
    throw new Error("Malformed child Pi session evidence");
   const previous=seenChildSessions.get(childSession.id);
   if(previous)blockers.push(unit.taskId+": Pi child session also attributed to "+previous);
   else seenChildSessions.set(childSession.id,unit.taskId);
  }
  const workers=childSession?.agents.filter(a=>a.role==="worker")??[];
  if(workers.length>1)blockers.push(unit.taskId+": multiple Worker agents in one child session");
  for(const worker of workers){
   if(typeof worker.id!=="string"||!worker.id||typeof worker.state!=="string")
    throw new Error("Malformed Pi Worker evidence");
   const previous=seenWorkerIds.get(worker.id);
   if(previous)blockers.push(unit.taskId+": Worker agent also attributed to "+previous);
   else seenWorkerIds.set(worker.id,unit.taskId);
  }
  const agentStates=workers.map(a=>a.state);
  let agentState:ParallelBatchReconciliation["evidence"][number]["agentState"]="not-observed";
  if(agentStates.some(s=>!knownWorkerStates.has(s)||["failed","interrupted","cancelled"].includes(s)))
   agentState="unresolved";
  else if(agentStates.some(s=>["queued","running"].includes(s)))agentState="active";
  else if(agentStates.length===1&&agentStates[0]==="completed")agentState="terminal";
  if(agentState!=="terminal")seenAllCompleted=false;
  if(agentState==="active")seenActive=true;
  if(agentState==="unresolved")blockers.push(unit.taskId+": Worker terminated unsuccessfully or ambiguously");
  evidence.push(Object.freeze({
   taskId:unit.taskId,changedPaths:Object.freeze([...changes.changedPaths]),
   changeState:changes.status,agentState
  }));
 }
 const disposition=blockers.length?"blocked":seenActive?"observed-active":
  seenAllCompleted?"manual-review-required":"not-started";
 return Object.freeze({
  disposition,blockers:Object.freeze(blockers),evidence:Object.freeze(evidence),
  grantsAuthority:false,autoMerge:false,acceptance:"not-accepted"
 });
}
