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
}):Promise<Readonly<{source:TodoContext;batchId:string;completed:number;failed:number;planningFileMissing:boolean;acceptance:"not-accepted"}>|undefined>{
 const {record,todos,agents,links,sourceJournal,sessionJournal,claims,observations}=input;
 if(record.role!=="worker"||!["completed","failed","interrupted","cancelled"].includes(record.state))return;
 const child={sessionId:record.sessionId,projectId:record.projectId};
 const linked=(await sessionJournal.listChild(child)).filter(link=>!!link.nativeSessionFile);
 if(linked.length!==1)return;
 const link=linked[0]!;
 // La sesión se verifica al admitir el Writer. Su pérdida posterior no invalida
 // los registros duraderos del agente y del vínculo. Conservamos la incidencia.
 let planningFileMissing=false;
 try{await assertNativeChildPlanningSession({...child,sessionFile:link.nativeSessionFile!});}catch{planningFileMissing=true;}
 const known=(await agents.list(child)).find(agent=>agent.id===record.id&&agent.state===record.state&&agent.updatedAt===record.updatedAt);
 if(!known)return;
 if(!(await links.list(child)).some(binding=>binding.agentId===record.id))return;
 await new TaskAgentTodoReconciler(todos,agents,links).reconcile(child);
 const source={sessionId:link.sourceSessionId,projectId:link.sourceProjectId};
 const owners=await sessionJournal.listSource(source);
 if((await observations.listSource(source,owners)).some(item=>item.batchId===link.batchId))return;
 // Reconciliar también al otro hijo terminal antes de guardar un recibo.
 for(const owner of owners.filter(row=>row.batchId===link.batchId)){
  const identity={sessionId:owner.childSessionId,projectId:owner.childProjectId};
  if((await agents.list(identity)).some(agent=>agent.role==="worker"&&["completed","failed","interrupted","cancelled"].includes(agent.state)))
   await new TaskAgentTodoReconciler(todos,agents,links).reconcile(identity);
 }
 const preview=await inspectParallelBatchWorkerOutcomes({identity:source,sourceJournal,sessionJournal,planClaims:claims,
  batchId:link.batchId,loadTodos:identity=>todos.list(identity),loadAgents:identity=>agents.list(identity),
  loadTaskAgentLinks:identity=>links.list(identity)});
 if(preview.status!=="ready-to-record"||preview.workers.some(({worker})=>!["succeeded","done","blocked","cancelled"].includes(worker.childTodoState)))return;
 try{
  const candidates=await Promise.all(preview.workers.map(async unit=>{
   if(unit.worker.agentState!=="completed"||unit.worker.childTodoState!=="succeeded"||unit.changes.status!=="scoped-changes")return unit;
   const owned={sessionId:unit.link.childSessionId,projectId:unit.link.childProjectId};
   const result=await agents.query(unit.worker.agentId,owned),completion=result?.nativeCompletion;
   if(result?.record.state!=="completed"||result.record.updatedAt!==unit.worker.agentUpdatedAt||
    !completion||completion.baseCommit!==unit.link.sourceHead||
    JSON.stringify([...completion.paths].sort())!==JSON.stringify([...unit.changes.changedPaths].sort()))return unit;
   return {...unit,nativeCompletion:completion};
  }));
  const saved=await observations.recordBatch(candidates);
  return Object.freeze({source,batchId:link.batchId,completed:saved.filter(row=>row.agentState==="completed").length,
   failed:saved.filter(row=>row.agentState!=="completed").length,planningFileMissing,acceptance:"not-accepted"});
 }catch(error){
  // Dos terminales pueden competir: el diario se escribe en una transacción.
  // Solo quien realmente lo guardó puede anunciar el nuevo resultado.
  if((await observations.listSource(source,owners)).filter(row=>row.batchId===link.batchId).length===preview.workers.length)return;
  throw error;
 }
}
