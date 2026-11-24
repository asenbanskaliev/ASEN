import type {AgentRuntime} from "../../agents/agent-runtime.js";
import type {SessionTodoStore,TodoContext} from "../lifecycle/todo-store.js";
import type {PublicAgentRecord} from "./agent-lifecycle.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {TaskAgentTodoReconciler} from "./task-agent-reconciler.js";
import {ParallelTodoWorktreeJournal} from "./parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "./parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "./parallel-child-plan-claims.js";
import {ParallelWorkerObservationJournal} from "./parallel-worker-observation-journal.js";
import {inspectParallelBatchWorkerOutcomes} from "./parallel-batch-coordinator.js";
import {assertNativeChildPlanningSession} from "./pi-native-child-session.js";

/** Recoge una finalización real de un hijo nativo aunque el padre tenga otra
 * tarea activa. El recibo de lote es único y nunca supone aceptación ni merge. */
export async function reconcileNativeChildTerminal(input:{
 record:PublicAgentRecord;todos:SessionTodoStore;agents:AgentRuntime;links:TaskAgentLinkStore;
 sourceJournal:ParallelTodoWorktreeJournal;sessionJournal:ParallelChildSessionJournal;
 claims:ParallelChildPlanClaimJournal;observations:ParallelWorkerObservationJournal;
}):Promise<Readonly<{source:TodoContext;batchId:string;completed:number;failed:number;acceptance:"not-accepted"}>|undefined>{
 const {record,todos,agents,links,sourceJournal,sessionJournal,claims,observations}=input;
 if(record.role!=="worker"||!["completed","failed","interrupted","cancelled"].includes(record.state))return;
 const child={sessionId:record.sessionId,projectId:record.projectId};
 const linked=(await sessionJournal.listChild(child)).filter(link=>!!link.nativeSessionFile);
 if(linked.length!==1)return;
 const link=linked[0]!;
 await assertNativeChildPlanningSession({...child,sessionFile:link.nativeSessionFile!});
 const known=(await agents.list(child)).find(agent=>agent.id===record.id&&agent.state===record.state&&agent.updatedAt===record.updatedAt);
 if(!known)return;
 if(!(await links.list(child)).some(binding=>binding.agentId===record.id))return;
 await new TaskAgentTodoReconciler(todos,agents,links).reconcile(child);
 const source={sessionId:link.sourceSessionId,projectId:link.sourceProjectId};
 const owners=await sessionJournal.listSource(source);
 if((await observations.listSource(source,owners)).some(item=>item.batchId===link.batchId))return;
 const preview=await inspectParallelBatchWorkerOutcomes({identity:source,sourceJournal,sessionJournal,planClaims:claims,
  batchId:link.batchId,loadTodos:identity=>todos.list(identity),loadAgents:identity=>agents.list(identity),
  loadTaskAgentLinks:identity=>links.list(identity)});
 if(preview.status!=="ready-to-record")return;
 try{
  const saved=await observations.recordBatch(preview.workers);
  return Object.freeze({source,batchId:link.batchId,completed:saved.filter(row=>row.agentState==="completed").length,
   failed:saved.filter(row=>row.agentState!=="completed").length,acceptance:"not-accepted"});
 }catch(error){
  // Dos terminales pueden competir: el diario se escribe en una transacción.
  // Solo quien realmente lo guardó puede anunciar el nuevo resultado.
  if((await observations.listSource(source,owners)).filter(row=>row.batchId===link.batchId).length===preview.workers.length)return;
  throw error;
 }
}
