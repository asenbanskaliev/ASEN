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
}):Promise<Readonly<{source:TodoContext;batchId:string;completed:number;failed:number;planningFileMissing:boolean;partial:boolean;observed:number;expected:number;acceptance:"not-accepted"}>|undefined>{
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
 const batch=(await sourceJournal.list(source)).find(row=>row.id===link.batchId);
 if(!batch||batch.state!=="prepared")return;
 const existing=(await observations.listSource(source,owners)).filter(item=>item.batchId===link.batchId);
 if(existing.length===batch.tasks.length)return;
 // Reconciliar también al otro hijo terminal antes de guardar un recibo.
 for(const owner of owners.filter(row=>row.batchId===link.batchId)){
  const identity={sessionId:owner.childSessionId,projectId:owner.childProjectId};
  if((await agents.list(identity)).some(agent=>agent.role==="worker"&&["completed","failed","interrupted","cancelled"].includes(agent.state)))
   await new TaskAgentTodoReconciler(todos,agents,links).reconcile(identity);
 }
 const preview=await inspectParallelBatchWorkerOutcomes({identity:source,sourceJournal,sessionJournal,planClaims:claims,
  batchId:link.batchId,loadTodos:identity=>todos.list(identity),loadAgents:identity=>agents.list(identity),
  loadTaskAgentLinks:identity=>links.list(identity)});
 // Guardar cada terminal atribuible aun si otro hijo nunca fue lanzado.
 // El candidato integrado sigue exigiendo TODOS los recibos auténticos.
 const pending=preview.workers.filter(({worker})=>["succeeded","done","blocked","cancelled"].includes(worker.childTodoState)&&!existing.some(row=>row.sourceTodoId===worker.sourceTodoId));
 if(!pending.length)return;
 try{
  const saved=[],failures:unknown[]=[];
  for(const unit of pending){
   try{
    const candidate=await (async()=>{
     if(unit.worker.agentState!=="completed"||unit.worker.childTodoState!=="succeeded")return unit;
     const owned={sessionId:unit.link.childSessionId,projectId:unit.link.childProjectId};
     const result=await agents.query(unit.worker.agentId,owned),completion=result?.nativeCompletion;
     if(result?.record.state!=="completed"||result.record.updatedAt!==unit.worker.agentUpdatedAt||
      !completion||completion.baseCommit!==unit.link.sourceHead)
      throw Error("No se dispone de la finalización nativa exacta; conservar el hueco para reconciliar.");
     const task=batch.tasks.find(row=>row.taskId===unit.link.sourceTodoId);
     if(!task||completion.paths.some(path=>!task.writeSurfaces.includes(path)))
      throw Error("La finalización nativa no coincide con el ámbito original.");
     return {...unit,nativeCompletion:completion};
    })();
    try{saved.push(await observations.record(candidate));}
    catch(error){
     // Otro terminal puede haber registrado la misma unidad.
     const prior=(await observations.listSource(source,owners)).find(row=>row.batchId===link.batchId&&row.sourceTodoId===candidate.link.sourceTodoId);
     if(!prior||prior.agentId!==candidate.worker.agentId||prior.agentUpdatedAt!==candidate.worker.agentUpdatedAt||
       prior.candidateTree!==("nativeCompletion" in candidate?candidate.nativeCompletion?.candidateTree:undefined))throw error;
    }
   }catch(error){
    // Una lectura o escritura fallida no invalida los otros recibos.
    // Dejar la unidad sin registrar para recuperarla después, sin lanzar agentes.
    failures.push(error);
   }
  }
  if(failures.length)throw new AggregateError(failures,"No se pudieron recuperar todos los recibos nativos");
  if(!saved.length)return;
  const total=(await observations.listSource(source,owners)).filter(row=>row.batchId===link.batchId);
  return Object.freeze({source,batchId:link.batchId,completed:total.filter(row=>row.agentState==="completed").length,
   failed:total.filter(row=>row.agentState!=="completed").length,planningFileMissing,
   partial:total.length!==batch.tasks.length,observed:total.length,expected:batch.tasks.length,acceptance:"not-accepted"});
 }catch(error){
  // Dos terminales pueden competir: el diario se escribe en una transacción.
  // Solo quien realmente lo guardó puede anunciar el nuevo resultado.
  if((await observations.listSource(source,owners)).filter(row=>row.batchId===link.batchId).length===batch.tasks.length)return;
  throw error;
 }
}
