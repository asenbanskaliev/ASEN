/** Read-only flow overview of source ODD/Todo -> worktree -> Pi child ->
 * scoped changes -> human review. It derives a UX stage from observed data,
 * never from a user-supplied plan or a claimed model selection. */
import type {ParallelWorktreeChangeInspection} from "../agents/parallel-worktree-change-inspection.js";
import {inspectPlannedWorkerModelRoute} from "../agents/parallel-worker-model-route.js";

export type AgentFlowStage=
 "blocked"|"reserved-needs-inspection"|"attach-required"|"child-plan-required"|
 "handoff-unverified"|"running-observed"|"manual-review-required"|"not-started";
export type AgentFlowAction=
 "inspect-blocker"|"inspect-reservation"|"attach-child-session"|
 "request-fresh-child-odd"|"inspect-handoff"|"observe-agent"|"review-changes";
export interface AgentFlowSourceBatch{
 readonly batchId:string;
 readonly state:"reserved"|"prepared";
 /** Un intento persistido no equivale a una ejecución completada. */
 readonly supervisorClaimed?:boolean;
 readonly tasks:readonly Readonly<{
  sourceTodoId:string;
  sourceTodoUnchanged:boolean;
  worktreePresent:boolean;
  handoffClaimed:boolean;
  /** Recibo de recopilación: no es aceptación de los cambios. */
  receiptRecorded?:boolean;
  changes:ParallelWorktreeChangeInspection;
  childSession?:Readonly<{
   id:string;
   /** Modelo solicitado en el Todo Writer genuinamente atribuido. */
   modelRequested?:string;
   agents:readonly Readonly<{id:string;role:string;state:string}>[];
   todos?:readonly Readonly<{taskId:string;state:string}>[];
  }>;
 }>[];
}
export interface AgentFlowProjection{
 readonly kind:"read-only-flow-overview";
 readonly source:"persisted-todos-plus-worktree-git-plus-child-observation";
 readonly totalBatches:number;
 readonly totalTasks:number;
 readonly stages:Readonly<Record<AgentFlowStage,number>>;
 readonly tasks:readonly Readonly<{
  batchId:string;taskId:string;stage:AgentFlowStage;nextAction:AgentFlowAction;
  workerObserved:"not-observed"|"active"|"terminal-unverified"|"failure-or-interruption";
  changeEvidence:"unavailable"|"clean"|"scoped-changes"|"out-of-scope"|"head-diverged";
  supervisorClaimed:boolean|null;receiptRecorded:boolean|null;
  modelRequested:string;modelResolved:"unknown";modelActual:"unknown";
  modelConsumedProven:false;
  acceptance:"not-accepted";
 }>[];
 readonly grantsAuthority:false;readonly autoLaunch:false;readonly autoRetry:false;readonly autoMerge:false;
 readonly acceptance:"not-accepted";
}
const safeId=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=1024&&
 v===v.trim()&&v===v.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(v);
const validStates=new Set(["queued","running","waiting","completed","failed","interrupted","cancelled"]);
const initialized=():Record<AgentFlowStage,number>=>({
 "blocked":0,"reserved-needs-inspection":0,"attach-required":0,
 "child-plan-required":0,"handoff-unverified":0,"running-observed":0,
 "manual-review-required":0,"not-started":0
});
export function projectParallelAgentFlow(batches:readonly AgentFlowSourceBatch[]):AgentFlowProjection{
 if(!Array.isArray(batches)||batches.length>256)throw new Error("Invalid bounded agent-flow projection");
 const tasks:AgentFlowProjection["tasks"][number][]=[],stages=initialized(),ids=new Set<string>();
 for(const batch of batches){
  if(!batch||!safeId(batch.batchId)||!["reserved","prepared"].includes(batch.state)||
   !Array.isArray(batch.tasks)||batch.tasks.length<2||batch.tasks.length>4||
   (batch.supervisorClaimed!==undefined&&typeof batch.supervisorClaimed!=="boolean"))
   throw new Error("Invalid persisted agent-flow batch");
  for(const task of batch.tasks){
   if(!task||!safeId(task.sourceTodoId)||ids.has(task.sourceTodoId)||typeof task.sourceTodoUnchanged!=="boolean"||
    typeof task.worktreePresent!=="boolean"||typeof task.handoffClaimed!=="boolean"||
    (task.receiptRecorded!==undefined&&typeof task.receiptRecorded!=="boolean")||
    !task.changes||!["clean","scoped-changes","out-of-scope","head-diverged","unavailable"].includes(task.changes.status)||
    typeof task.changes.sourceVerified!=="boolean"||typeof task.changes.headMatchesBase!=="boolean"||
    !Array.isArray(task.changes.outOfScopePaths)||!Array.isArray(task.changes.changedPaths)||
    task.changes.acceptance!=="not-accepted"||task.changes.autoMerge!==false||
    (task.childSession!==undefined&&(!safeId(task.childSession.id)||
     !Array.isArray(task.childSession.agents)||task.childSession.agents.length>128||
     (task.childSession.modelRequested!==undefined&&
      (inspectPlannedWorkerModelRoute(task.childSession.modelRequested).status!=="pinned"||
       !task.handoffClaimed||!task.childSession.agents.some((a:Readonly<{id:string;role:string;state:string}>)=>a.role==="worker")))||
     task.childSession.agents.some((agent:Readonly<{id:string;role:string;state:string}>)=>!safeId(agent.id)||!validStates.has(agent.state)))))
    throw new Error("Invalid or duplicate agent-flow evidence");
   ids.add(task.sourceTodoId);
   const workerStates=task.childSession?.agents.filter((a:Readonly<{id:string;role:string;state:string}>)=>a.role==="worker").map((a:Readonly<{id:string;role:string;state:string}>)=>a.state)??[];
   const workerObserved:AgentFlowProjection["tasks"][number]["workerObserved"]=
    workerStates.some((s:string)=>["failed","interrupted","cancelled"].includes(s))?"failure-or-interruption":
    workerStates.some((s:string)=>["queued","running","waiting"].includes(s))?"active":
    workerStates.some((s:string)=>s==="completed")?"terminal-unverified":"not-observed";
   const invalidSource=!task.sourceTodoUnchanged;
   const invalidDiff=task.changes.status==="out-of-scope"||
    task.changes.status==="head-diverged"||task.changes.outOfScopePaths.length>0||
    batch.state==="prepared"&&(!task.changes.sourceVerified||!task.changes.headMatchesBase);
   const failedWorker=workerObserved==="failure-or-interruption";
   let stage:AgentFlowStage, nextAction:AgentFlowAction;
   if(invalidSource||invalidDiff||failedWorker||batch.state==="prepared"&&!task.worktreePresent){
    stage="blocked";nextAction="inspect-blocker";
   }else if(batch.state==="reserved"){
    stage="reserved-needs-inspection";nextAction="inspect-reservation";
   }else if(workerObserved==="active"){
    stage="running-observed";nextAction="observe-agent";
   }else if(workerObserved==="terminal-unverified"){
    stage="manual-review-required";nextAction="review-changes";
   }else if(!task.childSession){
    stage="attach-required";nextAction="attach-child-session";
   }else if(!task.handoffClaimed){
    stage="child-plan-required";nextAction="request-fresh-child-odd";
   }else{
    stage="handoff-unverified";nextAction="inspect-handoff";
   }
   stages[stage]++;
   tasks.push(Object.freeze({
    batchId:batch.batchId,taskId:task.sourceTodoId,stage,nextAction,workerObserved,
    supervisorClaimed:batch.supervisorClaimed??null,
    receiptRecorded:task.receiptRecorded??null,
    changeEvidence:task.changes.status,
    modelRequested:task.childSession?.modelRequested??"unknown",
    modelResolved:"unknown" as const,modelActual:"unknown" as const,
    modelConsumedProven:false as const,acceptance:"not-accepted" as const
   }));
  }
 }
 return Object.freeze({
  kind:"read-only-flow-overview" as const,
  source:"persisted-todos-plus-worktree-git-plus-child-observation" as const,
  totalBatches:batches.length,totalTasks:tasks.length,stages:Object.freeze(stages),
  tasks:Object.freeze(tasks),
  grantsAuthority:false as const,autoLaunch:false as const,autoRetry:false as const,
  autoMerge:false as const,acceptance:"not-accepted" as const
 });
}
