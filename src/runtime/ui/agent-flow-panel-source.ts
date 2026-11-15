/** Bounded read-only bridge from the existing durable ODD journals to the
 * existing Pi work panel. No dispatcher, writer grant, model call or merge. */
import {existsSync} from "node:fs";
import type {TodoContext} from "../lifecycle/todo-store.js";
import {ParallelTodoWorktreeJournal} from "../agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../agents/parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "../agents/parallel-child-plan-claims.js";
import type {SourceTodoRow} from "../agents/parallel-todo-bindings.js";
import type {PublicAgentRecord} from "../agents/agent-lifecycle.js";
import type {TaskAgentLink} from "../agents/task-agent-link-store.js";
import {attributeParallelChildWorker} from "../agents/parallel-worker-attribution.js";
import {inspectParallelWorktreeChanges} from "../agents/parallel-worktree-change-inspection.js";
import {projectParallelAgentFlow,type AgentFlowSourceBatch,type AgentFlowProjection} from "./agent-flow-overview.js";

const MAX_VISIBLE_BATCHES=3;
export interface AgentFlowPanelObservation{
 readonly state:"observed"|"absent";
 readonly totalRecordedBatches:number;
 readonly limited:boolean;
 readonly overview:AgentFlowProjection;
}
export async function readAgentFlowPanelObservation(input:{
 readonly identity:TodoContext;
 readonly journalFile:string;readonly sessionLinksFile:string;readonly planClaimsFile:string;
 readonly loadTodos:(identity:TodoContext)=>Promise<readonly SourceTodoRow[]>;
 /** Only exact ODD Todo -> TaskAgentLink -> AgentRuntime evidence is attributed. */
 readonly loadChildAgentRecords?:(identity:TodoContext)=>Promise<readonly PublicAgentRecord[]>;
 readonly loadChildTaskAgentLinks?:(identity:TodoContext)=>Promise<readonly TaskAgentLink[]>;
}):Promise<AgentFlowPanelObservation>{
 const {identity}=input;
 if(!identity?.sessionId||!identity.projectId||
  ![input.journalFile,input.sessionLinksFile,input.planClaimsFile].every(p=>typeof p==="string"&&p.length>0))
  throw new Error("Agent-flow panel requires an owned Pi session and exact private journal paths");
 if(!existsSync(input.journalFile))return Object.freeze({
  state:"absent" as const,totalRecordedBatches:0,limited:false,
  overview:projectParallelAgentFlow([])
 });
 const sourceJournal=new ParallelTodoWorktreeJournal(input.journalFile);
 const records=await sourceJournal.list(identity);
 if(records.length===0)return Object.freeze({
  state:"observed" as const,totalRecordedBatches:0,limited:false,
  overview:projectParallelAgentFlow([])
 });
 const selected=records.slice(-MAX_VISIBLE_BATCHES),visibleIds=new Set(selected.flatMap(r=>r.tasks.map(t=>t.taskId)));
 const [sourceTodos,allLinks]=await Promise.all([
  input.loadTodos(identity),
  new ParallelChildSessionJournal(input.sessionLinksFile,sourceJournal).listSource(identity)
 ]);
 const links=allLinks.filter(l=>visibleIds.has(l.sourceTodoId));
 const claims=await new ParallelChildPlanClaimJournal(input.planClaimsFile).listSource(identity,links);
 const claimTasks=new Set(claims.map(c=>c.sourceTodoId));
 const byTodo=new Map(sourceTodos.map(t=>[t.taskId,t]));
 const childStates=new Map<string,{id:string;agents:readonly {id:string;role:string;state:string}[]}>();
 for(const link of links){
  const childIdentity={sessionId:link.childSessionId,projectId:link.childProjectId};
  const task=selected.find(record=>record.id===link.batchId)?.tasks.find(row=>row.taskId===link.sourceTodoId);
  if(!task)throw new Error("Missing source scope for a supposedly linked child worktree");
  let agents:readonly {id:string;role:string;state:string}[]=[];
  if(claimTasks.has(link.sourceTodoId)&&input.loadChildAgentRecords&&input.loadChildTaskAgentLinks){
   const [todos,records,taskLinks]=await Promise.all([
    input.loadTodos(childIdentity),
    input.loadChildAgentRecords(childIdentity),
    input.loadChildTaskAgentLinks(childIdentity)
   ]);
   const actual=attributeParallelChildWorker({
    owner:link,writeSurfaces:task.writeSurfaces,todos,agents:records,taskAgentLinks:taskLinks
   });
   if(actual)agents=[{id:actual.agentId,role:"worker",state:actual.agentState}];
  }
  childStates.set(link.sourceTodoId,{id:link.childSessionId,agents});
 }
 const batches:AgentFlowSourceBatch[]=selected.map(record=>({
  batchId:record.id,state:record.state,
  tasks:record.tasks.map(task=>{
   const todo=byTodo.get(task.taskId),childSession=childStates.get(task.taskId);
   const changes=record.state==="prepared"?inspectParallelWorktreeChanges({
    sourceRoot:record.projectId,worktreeRoot:task.worktreeRoot,
    baseRevision:record.sourceHead,writeSurfaces:task.writeSurfaces
   }):{
    status:"unavailable" as const,changedPaths:[] as string[],outOfScopePaths:[] as string[],
    headMatchesBase:false as const,sourceVerified:false as const,
    acceptance:"not-accepted" as const,autoMerge:false as const
   };
   return {
    sourceTodoId:task.taskId,
    sourceTodoUnchanged:todo?.current.state==="planned"&&
     todo.current.revision===task.taskRevision&&todo.requestId===task.requestId,
    worktreePresent:existsSync(task.worktreeRoot),
    handoffClaimed:claimTasks.has(task.taskId),
    changes,...(childSession?{childSession}:{})
   };
  })
 }));
 return Object.freeze({
  state:"observed" as const,totalRecordedBatches:records.length,
  limited:records.length>selected.length,overview:projectParallelAgentFlow(batches)
 });
}
