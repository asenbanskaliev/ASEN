import type {AgentRuntime,AgentSessionIdentity} from "./agent-runtime.js";
import type {TrustedTaskAgentBinder} from "../runtime/agents/trusted-task-agent-binder.js";
import type {TaskAgentLinkStore} from "../runtime/agents/task-agent-link-store.js";
import type {SessionTodoStore} from "../runtime/lifecycle/todo-store.js";
import type {AgentModelFallback} from "./dispatcher.js";
import {assertPlannedExplorerFallbackCurrent,currentRevision,type ExplorerFallbackConfig} from "../runtime/lifecycle/plan-dispatcher.js";

const cancelled=():Error=>Object.assign(new Error("Agent task cancelled"),{name:"AbortError"});
const throwIfCancelled=(signal?:AbortSignal):void=>{if(signal?.aborted)throw cancelled();};

export interface InterruptedExplorerTodoCoordination{
 links:()=>Promise<Pick<TaskAgentLinkStore,"list">>;
 todos:()=>Promise<Pick<SessionTodoStore,"list"|"update">>;
 binder:()=>Promise<Pick<TrustedTaskAgentBinder,"launch">>;
}

export interface InterruptedExplorerContinuationInput{
 runtime:Pick<AgentRuntime,"query"|"continue">;
 agentId:string;
 identity:AgentSessionIdentity;
 signal?:AbortSignal;
 todo?:InterruptedExplorerTodoCoordination;
 resolveCurrentIdentity?:()=>Promise<AgentSessionIdentity>;
 readCurrentExplorerFallbackConfig?:()=>Promise<ExplorerFallbackConfig>;
 readCurrentDirectFallback?:()=>Promise<AgentModelFallback|undefined>;
}

export interface InterruptedExplorerContinuationResult{
 id:string;
 state:"queued";
 continuedFrom:string;
 role:"explorer";
 todoId?:string;
}

/** Continues the existing single-use interrupted Explorer flow without adding UI authority. */
export async function continueInterruptedExplorer(input:InterruptedExplorerContinuationInput):Promise<InterruptedExplorerContinuationResult>{
 const {runtime,agentId,identity,signal,todo:coordination}=input;
 throwIfCancelled(signal);
 const prior=await runtime.query(agentId,identity);
 if(!prior)throw new Error("Agent task is unavailable to this session or project");
 if(prior.record.state!=="interrupted"||prior.record.role!=="explorer"||prior.record.sessionId!==identity.sessionId||prior.record.projectId!==identity.projectId)
  throw new Error("Only an interrupted read-only explorer in the current session and project can continue automatically");
 const link=coordination?(await (await coordination.links()).list(identity)).find(item=>item.agentId===agentId):undefined;
 const todos=link&&coordination?await coordination.todos():undefined;
 const linkedTodo=link&&todos?(await todos.list(identity)).find(item=>item.taskId===link.taskId):undefined;
 if(link&&(!linkedTodo||linkedTodo.current.state!=="blocked"||!/(?:restarted|session ended|interrupted)/iu.test(linkedTodo.current.reason??"")||linkedTodo.plan&&linkedTodo.plan.role!=="explorer"))
  throw new Error("A linked Todo must match this interrupted read-only explorer before it can continue");
 throwIfCancelled(signal);
 if(input.resolveCurrentIdentity){
  const current=await input.resolveCurrentIdentity();
  if(current.sessionId!==identity.sessionId||current.projectId!==identity.projectId)
   throw new Error("Pi session or project changed before agent continuation");
 }
 // No restaurar una alternativa retirada durante la interrupción, ni
 // incorporar opciones nuevas a un intento ya persistido.
 const savedFallback=prior.spec?.modelFallback;
 let continuationEnqueued=false,validationRejectedBeforeEnqueue=false;
 const validateStart=savedFallback?async()=>{try{
  throwIfCancelled(signal);
  if(input.resolveCurrentIdentity){
   const current=await input.resolveCurrentIdentity();
   if(current.sessionId!==identity.sessionId||current.projectId!==identity.projectId)throw Error("Pi session or project changed before agent continuation dispatch");
  }
  if(linkedTodo?.plan){
   const plan=linkedTodo.plan;
   if(!input.readCurrentExplorerFallbackConfig||!plan.explorerProfileOrigin||!plan.model||prior.spec?.model!==plan.model)throw Error("No se puede comprobar la vigencia de las alternativas del perfil");
   if(plan.candidateRevision&&currentRevision(identity.projectId)!==plan.candidateRevision)throw Error("El candidato de exploración cambió; actualizar el plan");
   await assertPlannedExplorerFallbackCurrent(savedFallback,{role:"explorer",model:plan.model,origin:plan.explorerProfileOrigin},input.readCurrentExplorerFallbackConfig);
  }else{
   if(link||!input.readCurrentDirectFallback||JSON.stringify(await input.readCurrentDirectFallback())!==JSON.stringify(savedFallback))throw Error("Las alternativas del perfil cambiaron antes de ejecutar la exploración; actualizar el plan");
  }
  if(input.resolveCurrentIdentity){
   const current=await input.resolveCurrentIdentity();
   if(current.sessionId!==identity.sessionId||current.projectId!==identity.projectId)throw Error("Pi session or project changed before agent continuation dispatch");
  }
  throwIfCancelled(signal);
 }catch(error){if(!continuationEnqueued)validationRejectedBeforeEnqueue=true;throw error;}}:undefined;
 await validateStart?.();
 const resumed=link&&linkedTodo&&todos?await todos.update(linkedTodo.taskId,identity,linkedTodo.current.revision,"running","User asked ASEN to continue this persisted read-only task in the same session and project",signal):undefined;
 try{
  const next=await runtime.continue(agentId,identity,signal,link&&coordination?async(childId,dispatch)=>{
   continuationEnqueued=true;
   const validate=async()=>{
    if(!input.resolveCurrentIdentity)return;
    const current=await input.resolveCurrentIdentity();
    if(current.sessionId!==identity.sessionId||current.projectId!==identity.projectId)
     throw new Error("Pi session or project changed before agent continuation dispatch");
   };
   await validate();
   await (await coordination.binder()).launch(link.taskId,childId,identity,dispatch,validate);
  }:undefined,validateStart);
  return {id:next,state:"queued",continuedFrom:agentId,role:"explorer",...(link?{todoId:link.taskId}:{})};
 }catch(error){
  if(resumed&&todos){
   const current=(await todos.list(identity)).find(item=>item.taskId===resumed.taskId);
   if(current?.current.state==="running"&&current.current.revision===linkedTodo!.current.revision+1){
    const reason=validationRejectedBeforeEnqueue&&!continuationEnqueued?linkedTodo?.current.reason:"Linked agent continuation was not dispatched; review is required";
    await todos.update(current.taskId,identity,current.current.revision,"blocked",reason,undefined).catch(()=>{});
   }
  }
  throw error;
 }
}
