/** T06 parent-driven, explicitly authorized multi-worktree supervisor.
 * Children MUST have previously been attached by real Pi TUI sessions and
 * planned with their own ODD, not names forged by this parent controller.
 * Only the existing trusted plan dispatcher may start a scoped Worker. */
import {realpathSync} from "node:fs";
import type {TodoContext} from "../lifecycle/todo-store.js";
import type {SourceTodoRow} from "./parallel-todo-bindings.js";
import type {PublicAgentRecord} from "./agent-lifecycle.js";
import type {TaskAgentLink} from "./task-agent-link-store.js";
import type {ParallelChildSessionLink} from "./parallel-todo-session-links.js";
import {ParallelTodoWorktreeJournal} from "./parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "./parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "./parallel-child-plan-claims.js";
import {ParentSupervisorClaimJournal} from "./parallel-parent-supervisor-claims.js";
import {inspectParallelWorktreeChanges} from "./parallel-worktree-change-inspection.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import {inspectPlannedWorkerModelRoute} from "./parallel-worker-model-route.js";

export interface ParentSupervisorReadyWorker{
 readonly sourceTodoId:string;
 readonly childTodoId:string;
 readonly childSessionId:string;
 readonly childProjectId:string;
 readonly batchId:string;
 readonly baseRevision:string;
 readonly writeSurfaces:readonly string[];
 readonly model:string;
 readonly modelActual:"unknown";readonly modelConsumedProven:false;
 readonly costVerified:false;
 readonly authorization:"fresh-per-worker-confirmation-required";
 readonly grantsAuthority:false;
}
export type ParentSupervisorPreview=Readonly<{
 status:"ready"|"blocked";
 batchId:string;
 tasks:readonly ParentSupervisorReadyWorker[];
 blockers:readonly string[];
 grantsAuthority:false;autoRetry:false;autoMerge:false;
}>;
export type ParentSupervisorResult=Readonly<{
 status:"started"|"partial-needs-review"|"blocked"|"declined";
 batchId:string;
 started:readonly Readonly<{sourceTodoId:string;childTodoId:string;agentId:string}>[];
 blockers:readonly string[];
 grantsAuthority:false;autoRetry:false;autoMerge:false;
 acceptance:"not-accepted";
}>;
export interface ParentSupervisorInput{
 readonly source:TodoContext;
 readonly batchId:string;
 readonly sourceJournal:ParallelTodoWorktreeJournal;
 readonly sessionJournal:ParallelChildSessionJournal;
 readonly claimJournal:ParallelChildPlanClaimJournal;
 readonly attemptJournal:ParentSupervisorClaimJournal;
 readonly loadTodos:(identity:TodoContext)=>Promise<readonly SourceTodoRow[]>;
 readonly loadAgents:(identity:TodoContext)=>Promise<readonly PublicAgentRecord[]>;
 readonly loadTaskAgentLinks:(identity:TodoContext)=>Promise<readonly TaskAgentLink[]>;
 readonly validateParent:()=>Promise<void>;
 readonly confirmBatch:(ready:ParentSupervisorPreview)=>Promise<boolean>;
 /** Must call the existing plan dispatcher (not AgentRuntime directly), and
  * request new Pi UI approval for this exact child Worker before writing. */
 readonly launchChild:(worker:ParentSupervisorReadyWorker,
   confirm:(task:Readonly<{id:string;title:string;role:string;instruction:string;
     writeSurfaces?:readonly string[];candidateRevision?:string}>)=>Promise<boolean>,
   validateExact:()=>Promise<void>
 )=>Promise<{status:"dispatched";todoId:string;agentId:string;role:string}|{status:"blocked";reason:string}>;
 readonly confirmWorker:(worker:ParentSupervisorReadyWorker,
   task:Readonly<{id:string;title:string;role:string;instruction:string;
     writeSurfaces?:readonly string[];candidateRevision?:string}>)=>Promise<boolean>;
}
const same=(a:string,b:string)=>sameWorkspaceIdentityPath(a,b);
/** El consentimiento se liga a la tarea ODD completa, no solo al modelo y al ámbito.
 * Incluye instrucción, revisiones y autorizaciones. No es una prueba de aceptación. */
function childTodoSnapshot(todo:SourceTodoRow):string{
 return JSON.stringify({
  taskId:todo.taskId,requestId:todo.requestId,title:todo.title,
  description:todo.description,dependsOn:todo.dependsOn,
  plan:todo.plan
 });
}
/** El binder puede añadir exactamente un evento de inicio antes de despachar.
 * La transición se admite solo con toda la tarea e historial previos intactos. */
function sameAuthorizedChildTodo(before:SourceTodoRow|undefined,after:SourceTodoRow|undefined):boolean{
 if(!before||!after||childTodoSnapshot(before)!==childTodoSnapshot(after))return false;
 if(JSON.stringify(before)===JSON.stringify(after)&&after.current.state==="planned")return true;
 const event=after.events.at(-1);
 return before.current.state==="planned"&&after.current.state==="running"&&
  after.current.revision===before.current.revision+1&&
  after.current.reason==="Agent launch claimed before dispatch"&&
  after.current.sessionId===before.current.sessionId&&
  same(after.current.projectId,before.current.projectId)&&
  after.events.length===before.events.length+1&&
  JSON.stringify(after.events.slice(0,-1))===JSON.stringify(before.events)&&
  JSON.stringify(event)===JSON.stringify(after.current);
}
function nonAuthorizing(status:ParentSupervisorResult["status"],batchId:string,
 started:ParentSupervisorResult["started"],blockers:ParentSupervisorResult["blockers"]):ParentSupervisorResult{
 return Object.freeze({status,batchId,started:Object.freeze([...started]),
  blockers:Object.freeze([...blockers]),grantsAuthority:false as const,
  autoRetry:false as const,autoMerge:false as const,acceptance:"not-accepted" as const});
}
async function prepare(input:ParentSupervisorInput):Promise<ParentSupervisorPreview>{
 await input.validateParent();
 const batch=(await input.sourceJournal.list(input.source)).find(b=>b.id===input.batchId);
 if(!batch)throw new Error("Supervisor batch does not belong to active source Pi session");
 const blockers:string[]=[],tasks:ParentSupervisorReadyWorker[]=[],childSessions=new Set<string>();
 if(batch.state!=="prepared")blockers.push("Batch is not fully prepared");
 // A consumed batch must not prompt for fresh approvals: it cannot be replayed.
 // The one-shot claim() below remains the atomic guard for concurrent previews.
 if((await input.attemptJournal.listSource(input.source)).some(row=>row.batchId===batch.id)){
  await input.validateParent();
  return Object.freeze({
   status:"blocked" as const,batchId:batch.id,tasks:Object.freeze([]),
   blockers:Object.freeze(["Supervisor batch already claimed: inspect durable child Todos and Agents; never retry"]),
   grantsAuthority:false as const,autoRetry:false as const,autoMerge:false as const
  });
 }
 const [sourceTodos,allLinks]=await Promise.all([
  input.loadTodos(input.source),input.sessionJournal.listSource(input.source)
 ]);
 const claims=await input.claimJournal.listSource(input.source,allLinks);
 for(const task of batch.tasks){
  const label=task.taskId+": ";
  const source=sourceTodos.find(t=>t.taskId===task.taskId);
  if(!source||source.current.state!=="planned"||source.current.revision!==task.taskRevision||
    source.current.sessionId!==input.source.sessionId||
    !same(source.current.projectId,input.source.projectId)||source.requestId!==task.requestId){
   blockers.push(label+"Source ODD snapshot is missing, no longer planned or changed");continue;
  }
  const links=allLinks.filter(link=>link.batchId===batch.id&&
   link.sourceTodoId===task.taskId&&link.sourceRequestId===task.requestId&&
   link.sourceTodoRevision===task.taskRevision&&link.sourceHead===batch.sourceHead&&
   link.sourceSessionId===input.source.sessionId&&same(link.sourceProjectId,input.source.projectId)&&
   same(link.childProjectId,task.worktreeRoot)&&link.authority==="none"&&
   link.autoDispatch===false&&link.autoMerge===false);
  if(links.length!==1){blockers.push(label+"Child Pi session is not uniquely attached");continue;}
  const link=links[0]!;
  if(link.childSessionId===input.source.sessionId||childSessions.has(link.childSessionId)){
   blockers.push(label+"Child Pi session is reused or equals the parent session");continue;
  }
  childSessions.add(link.childSessionId);
  if(claims.filter(c=>c.batchId===batch.id&&c.sourceTodoId===task.taskId&&
   c.childSessionId===link.childSessionId&&same(c.childProjectId,link.childProjectId)).length!==1){
   blockers.push(label+"Independent child ODD plan is not claimed");continue;
  }
  let canonical:string;
  try{canonical=realpathSync(task.worktreeRoot);}catch{
   blockers.push(label+"Child worktree missing");continue;
  }
  if(!same(canonical,link.childProjectId)){
   blockers.push(label+"Child root differs from authorized Git worktree");continue;
  }
  const git=inspectParallelWorktreeChanges({
   sourceRoot:batch.projectId,worktreeRoot:canonical,baseRevision:batch.sourceHead,
   writeSurfaces:task.writeSurfaces
  });
  if(git.status!=="clean"||git.sourceVerified!==true||git.headMatchesBase!==true){
   blockers.push(label+"Git worktree is dirty, changed or unverifiable; inspect manually");continue;
  }
  const child:TodoContext={sessionId:link.childSessionId,projectId:canonical};
  const [todos,agents,agentLinks]=await Promise.all([
   input.loadTodos(child),input.loadAgents(child),input.loadTaskAgentLinks(child)
  ]);
  if(agents.some(a=>a.role==="worker")||agentLinks.some(a=>todos.some(t=>t.taskId===a.taskId&&t.plan?.role==="worker"))){
   blockers.push(label+"Child Worker was already attempted; no duplicate or automatic resume");continue;
  }
  const byId=new Map(todos.map(row=>[row.taskId,row]));
  const ready=todos.filter(row=>row.requestId?.startsWith("asen-plan:")&&
   row.current.state==="planned"&&
   (row.dependsOn??[]).every(id=>["succeeded","done"].includes(byId.get(id)?.current.state??"")));
  ready.sort((a,b)=>(a.plan?.priority??Number.MAX_SAFE_INTEGER)-
   (b.plan?.priority??Number.MAX_SAFE_INTEGER));
  const next=ready[0],candidate=next?.plan?.candidate;
  if(!next||next.plan?.role!=="worker"||!next.requestId?.endsWith(":worker")||
   !next.description||!next.plan?.writerAuthorizationBasis||!candidate||
   candidate.revision!==batch.sourceHead||!same(candidate.repository,canonical)||
   next.current.sessionId!==child.sessionId||!same(next.current.projectId,canonical)||
   !next.plan.writeSurfaces||next.plan.writeSurfaces.length!==task.writeSurfaces.length||
   next.plan.writeSurfaces.some((v,i)=>v!==task.writeSurfaces[i])){
   blockers.push(label+"Child ODD has no exact dependency-ready scoped Worker; continue its ODD first");continue;
  }
  const route=inspectPlannedWorkerModelRoute(next.plan.model);
  if(route.status!=="pinned"){
   blockers.push(label+"Worker model is unspecified or not pinned to a concrete provider; no launch");continue;
  }
  tasks.push(Object.freeze({
   batchId:batch.id,sourceTodoId:task.taskId,childTodoId:next.taskId,
   childSessionId:link.childSessionId,childProjectId:canonical,
   baseRevision:batch.sourceHead,writeSurfaces:Object.freeze([...task.writeSurfaces]),
   model:route.requested,modelActual:"unknown" as const,
   modelConsumedProven:false as const,costVerified:false as const,
   authorization:"fresh-per-worker-confirmation-required" as const,grantsAuthority:false as const
  }));
 }
 await input.validateParent();
 return Object.freeze({
  status:batch.state==="prepared"&&blockers.length===0&&tasks.length===batch.tasks.length?
   "ready" as const:"blocked" as const,
  batchId:batch.id,tasks:Object.freeze(tasks),blockers:Object.freeze(blockers),
  grantsAuthority:false as const,autoRetry:false as const,autoMerge:false as const
 });
}
export async function previewParentSupervisor(input:ParentSupervisorInput):Promise<ParentSupervisorPreview>{
 return prepare(input);
}
export async function launchParentApprovedWorkers(input:ParentSupervisorInput):Promise<ParentSupervisorResult>{
 const initial=await prepare(input),started:ParentSupervisorResult["started"][number][]=[];
 if(initial.status!=="ready")return nonAuthorizing("blocked",initial.batchId,started,initial.blockers);
 if(await input.confirmBatch(initial)!==true)return nonAuthorizing("declined",initial.batchId,started,[]);
 await input.validateParent();
 const fresh=await prepare(input);
 if(JSON.stringify(fresh)!==JSON.stringify(initial))
  return nonAuthorizing("blocked",initial.batchId,started,["Source or child ODD changed during batch confirmation"]);
 // Commit this batch's irreversible intent BEFORE calling any Pi dispatcher.
 // Two concurrent supervisors cannot both launch or borrow the same consent.
 try{
  await input.attemptJournal.claim({
   source:input.source,batchId:initial.batchId,
   children:initial.tasks.map(unit=>({
    sourceTodoId:unit.sourceTodoId,childTodoId:unit.childTodoId,
    childSessionId:unit.childSessionId,childProjectId:unit.childProjectId
   }))
  });
 }catch{
  return nonAuthorizing("blocked",initial.batchId,started,
   ["Supervisor intent already claimed or journal unavailable; inspect child Todos and agents, no replay"]);
 }
 for(const unit of initial.tasks){
  try{await input.validateParent();}
  catch{
   // A prior Worker may already be running. Never convert parent cancellation
   // into a retry or erase the exact started IDs from the visible result.
   return nonAuthorizing("partial-needs-review",initial.batchId,started,[
    unit.sourceTodoId+": Parent Pi session cancelled or changed; inspect durable child Todo/Agent records before any further dispatch"
   ]);
  }
  // After earlier Workers start the full batch is no longer 'ready'.
  // Recheck ONLY this candidate: do not retarget or replan another unit.
  const child:TodoContext={sessionId:unit.childSessionId,projectId:unit.childProjectId};
  let expectedChildTodo:SourceTodoRow|undefined;
  try{
  const link=(await input.sessionJournal.listSource(input.source)).find(l=>
   l.batchId===unit.batchId&&l.sourceTodoId===unit.sourceTodoId&&
   l.childSessionId===unit.childSessionId&&same(l.childProjectId,unit.childProjectId));

  const [rows,agents,links]=await Promise.all([
   input.loadTodos(child),input.loadAgents(child),input.loadTaskAgentLinks(child)
  ]);
  const todo=rows.find(t=>t.taskId===unit.childTodoId);
  const git=inspectParallelWorktreeChanges({
   sourceRoot:input.source.projectId,worktreeRoot:unit.childProjectId,
   baseRevision:unit.baseRevision,writeSurfaces:unit.writeSurfaces
  });
  if(!link||!todo||todo.current.state!=="planned"||todo.plan?.role!=="worker"||
   todo.plan.candidate?.revision!==unit.baseRevision||
   (todo.plan.model??"unknown")!==unit.model||
   !same(todo.plan.candidate.repository,unit.childProjectId)||
   todo.plan.writeSurfaces?.length!==unit.writeSurfaces.length||
   todo.plan.writeSurfaces.some((v,i)=>v!==unit.writeSurfaces[i])||
   agents.some(a=>a.role==="worker")||
   links.some(a=>a.taskId===unit.childTodoId)||
   git.status!=="clean"||!git.sourceVerified||!git.headMatchesBase)
   return nonAuthorizing("partial-needs-review",initial.batchId,started,
    [unit.sourceTodoId+": Child identity, worker or Git candidate changed; inspect before any new launch"]);
  expectedChildTodo=structuredClone(todo);
  }catch{
   // Tras consumir el intento único, toda lectura fallida requiere revisión.
   return nonAuthorizing("partial-needs-review",initial.batchId,started,
    [unit.sourceTodoId+": Child records or Git verification could not be read; inspect durable evidence, do not retry"]);
  }
  // The parent can only dispatch into its previously attached, independently
  // planned child. This exact provenance must remain true before AND after Pi
  // user consent, including while TrustedTaskAgentBinder performs its CAS.
  const validateExact=async()=>{
   await input.validateParent();
   const batches=await input.sourceJournal.list(input.source),
    currentBatch=batches.find(b=>b.id===unit.batchId),
    sourceTask=currentBatch?.tasks.find(t=>t.taskId===unit.sourceTodoId);
   const linksNow=await input.sessionJournal.listSource(input.source);
   const owners=linksNow.filter(l=>l.batchId===unit.batchId&&
    l.sourceTodoId===unit.sourceTodoId&&l.childSessionId===unit.childSessionId&&
    same(l.childProjectId,unit.childProjectId));
   const currentSource=(await input.loadTodos(input.source)).find(t=>t.taskId===unit.sourceTodoId);
   const claims=await input.claimJournal.listSource(input.source,linksNow);
   const childRows=await input.loadTodos(child),
    childTodo=childRows.find(t=>t.taskId===unit.childTodoId);
   const currentGit=inspectParallelWorktreeChanges({
    sourceRoot:input.source.projectId,worktreeRoot:unit.childProjectId,
    baseRevision:unit.baseRevision,writeSurfaces:unit.writeSurfaces
   });
   if(!currentBatch||currentBatch.state!=="prepared"||
    currentBatch.sourceHead!==unit.baseRevision||
    !sourceTask||!currentSource||
    sourceTask.taskRevision!==currentSource.current.revision||
    currentSource.current.state!=="planned"||
    sourceTask.requestId!==currentSource.requestId||
    sourceTask.writeSurfaces.length!==unit.writeSurfaces.length||
    sourceTask.writeSurfaces.some((v,i)=>v!==unit.writeSurfaces[i])||
    owners.length!==1||
    claims.filter(claim=>claim.batchId===unit.batchId&&
     claim.sourceTodoId===unit.sourceTodoId&&
     claim.childSessionId===unit.childSessionId).length!==1||
    !sameAuthorizedChildTodo(expectedChildTodo,childTodo)||
    childTodo.plan?.role!=="worker"||
    childTodo.plan.candidate?.revision!==unit.baseRevision||
    (childTodo.plan.model??"unknown")!==unit.model||
    !same(childTodo.plan.candidate.repository,unit.childProjectId)||
    childTodo.plan.writeSurfaces?.length!==unit.writeSurfaces.length||
    childTodo.plan.writeSurfaces.some((v,i)=>v!==unit.writeSurfaces[i])||
    currentGit.status!=="clean"||!currentGit.sourceVerified||
    !currentGit.headMatchesBase)
    throw new Error("Child Pi provenance changed after parent Worker authorization; no new launch");
   await input.validateParent();
  };
  try{await validateExact();}
  catch{
   return nonAuthorizing("partial-needs-review",initial.batchId,started,[
    unit.sourceTodoId+": Child Pi identity changed before consent; inspect durable child Todo/Agent records and do not retry"
   ]);
  }
  let wasApproved=false;
  let outcome:Awaited<ReturnType<ParentSupervisorInput["launchChild"]>>;
  try{
   outcome=await input.launchChild(unit,async task=>{
    await input.validateParent();
    if(task.id!==unit.childTodoId||task.role!=="worker"||
     task.candidateRevision!==unit.baseRevision||
     task.writeSurfaces?.length!==unit.writeSurfaces.length||
     task.writeSurfaces.some((v,i)=>v!==unit.writeSurfaces[i]))
     return false;
    wasApproved=await input.confirmWorker(unit,task)===true;
    await validateExact();
    return wasApproved;
   },validateExact);
   await input.validateParent();
  }catch{
   // The existing Todo/Agent stores own the truthful launch state. The
   // parent MUST NOT assume this failed before Pi began or auto-retry it.
   return nonAuthorizing("partial-needs-review",initial.batchId,started,
    [unit.sourceTodoId+": Child Pi dispatch or identity validation failed ambiguously; inspect its durable Todo/Agent records before any further action"]);
  }
  if(outcome.status!=="dispatched"||outcome.role!=="worker"||
   outcome.todoId!==unit.childTodoId||!wasApproved)
   return nonAuthorizing("partial-needs-review",initial.batchId,started,
    [unit.sourceTodoId+": Worker dispatch blocked or declined; inspect persisted Todo/Agent records"]);
  started.push(Object.freeze({sourceTodoId:unit.sourceTodoId,
   childTodoId:unit.childTodoId,agentId:outcome.agentId}));
 }
 return nonAuthorizing("started",initial.batchId,started,[]);
}
