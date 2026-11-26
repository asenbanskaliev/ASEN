/** Parent-owned read-only T06 coordinator over existing Pi child sessions.
 * Does not start children, borrow grants, pick models, declare verified output,
 * or recover interrupted agents. It prepares exact observations for an
 * explicit one-time durable audit collection. */
import type {PublicAgentRecord} from "./agent-lifecycle.js";
import type {TaskAgentLink} from "./task-agent-link-store.js";
import type {SourceTodoRow} from "./parallel-todo-bindings.js";
import type {ParallelChildSessionLink} from "./parallel-todo-session-links.js";
import {ParallelTodoWorktreeJournal} from "./parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "./parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "./parallel-child-plan-claims.js";
import {attributeParallelChildWorker,type AttributedParallelWorker} from "./parallel-worker-attribution.js";
import {inspectParallelWorktreeChanges,type ParallelWorktreeChangeInspection} from "./parallel-worktree-change-inspection.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import type {TodoContext} from "../lifecycle/todo-store.js";

export interface ParallelBatchWorkerObservation{
 readonly link:ParallelChildSessionLink;
 readonly worker:AttributedParallelWorker;
 readonly sourceTodoRevision:number;
 readonly changes:ParallelWorktreeChangeInspection;
}
export type ParallelBatchObservationPreview={
 readonly status:"ready-to-record"|"blocked";
 readonly batchId:string;
 readonly workers:readonly ParallelBatchWorkerObservation[];
 readonly blockers:readonly string[];
 readonly grantsAuthority:false;
 readonly autoDispatch:false;
 readonly autoMerge:false;
 readonly acceptance:"not-accepted";
};
export async function inspectParallelBatchWorkerOutcomes(input:{
 readonly identity:TodoContext;
 readonly sourceJournal:ParallelTodoWorktreeJournal;
 readonly sessionJournal:ParallelChildSessionJournal;
 readonly planClaims:ParallelChildPlanClaimJournal;
 readonly batchId:string;
 readonly loadTodos:(identity:TodoContext)=>Promise<readonly SourceTodoRow[]>;
 readonly loadAgents:(identity:TodoContext)=>Promise<readonly PublicAgentRecord[]>;
 readonly loadTaskAgentLinks:(identity:TodoContext)=>Promise<readonly TaskAgentLink[]>;
}):Promise<ParallelBatchObservationPreview>{
 const {identity,batchId}=input;
 if(!identity?.sessionId||!identity.projectId||!batchId||
  ![input.loadTodos,input.loadAgents,input.loadTaskAgentLinks].every(x=>typeof x==="function"))
  throw new Error("Batch coordination requires a known source Pi session and real runtime readers");
 const batch=(await input.sourceJournal.list(identity)).find(row=>row.id===batchId);
 if(!batch)throw new Error("Parent batch does not belong to this Pi session or project");
 const blockers:string[]=[],workers:ParallelBatchWorkerObservation[]=[];
 if(batch.state!=="prepared")blockers.push("Batch is only reserved; manual Git reconciliation required");
 const [sourceTodos,links]=await Promise.all([
  input.loadTodos(identity),input.sessionJournal.listSource(identity)
 ]);
 const claims=await input.planClaims.listSource(identity,links);
 for(const task of batch.tasks){
  const prefix=task.taskId+": ";
  const row=sourceTodos.find(todo=>todo.taskId===task.taskId);
  if(!row||row.requestId!==task.requestId||row.current.state!=="planned"||
   row.current.revision!==task.taskRevision||row.current.sessionId!==identity.sessionId||
   !sameWorkspaceIdentityPath(row.current.projectId,identity.projectId)){
   blockers.push(prefix+"Source ODD Todo changed, is missing or is no longer planned");continue;
  }
  const owner=links.filter(link=>link.batchId===batch.id&&link.sourceTodoId===task.taskId&&
   link.sourceTodoRevision===task.taskRevision&&link.sourceRequestId===task.requestId&&
   link.sourceHead===batch.sourceHead&&
   sameWorkspaceIdentityPath(link.childProjectId,task.worktreeRoot));
  if(owner.length!==1){blockers.push(prefix+"No unique attached child Pi session");continue;}
  const link=owner[0]!;
  if(!claims.some(claim=>claim.batchId===batch.id&&claim.sourceTodoId===task.taskId&&
   claim.childSessionId===link.childSessionId&&
   sameWorkspaceIdentityPath(claim.childProjectId,task.worktreeRoot))){
   blockers.push(prefix+"Child ODD handoff was not claimed");continue;
  }
  const child={sessionId:link.childSessionId,projectId:link.childProjectId};
  const [todos,agents,bindings]=await Promise.all([
   input.loadTodos(child),input.loadAgents(child),input.loadTaskAgentLinks(child)
  ]);
  const worker=attributeParallelChildWorker({
   owner:link,writeSurfaces:task.writeSurfaces,todos,agents,taskAgentLinks:bindings
  });
  if(!worker){blockers.push(prefix+"No independently attributed Worker was observed");continue;}
  if(!["completed","failed","cancelled","interrupted"].includes(worker.agentState)){
   blockers.push(prefix+"Worker still queued or running");continue;
  }
  const changes=inspectParallelWorktreeChanges({
   sourceRoot:batch.projectId,worktreeRoot:task.worktreeRoot,
   baseRevision:batch.sourceHead,writeSurfaces:task.writeSurfaces
  });
  workers.push(Object.freeze({link,worker,sourceTodoRevision:task.taskRevision,changes}));
 }
 return Object.freeze({
  status:!blockers.length&&batch.state==="prepared"&&workers.length===batch.tasks.length?
   "ready-to-record" as const:"blocked" as const,
  batchId,workers:Object.freeze(workers),blockers:Object.freeze(blockers),
  grantsAuthority:false as const,autoDispatch:false as const,
  autoMerge:false as const,acceptance:"not-accepted" as const
 });
}
