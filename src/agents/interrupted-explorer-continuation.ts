import type {AgentRuntime,AgentSessionIdentity} from "./agent-runtime.js";
import type {TrustedTaskAgentBinder} from "../runtime/trusted-task-agent-binder.js";
import type {TaskAgentLinkStore} from "../runtime/task-agent-link-store.js";
import type {SessionTodoStore} from "../runtime/todo-store.js";

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
 const resumed=link&&linkedTodo&&todos?await todos.update(linkedTodo.taskId,identity,linkedTodo.current.revision,"running","User asked ASEN to continue this persisted read-only task in the same session and project",signal):undefined;
 try{
  const next=await runtime.continue(agentId,identity,signal,link&&coordination?async(childId,dispatch)=>{
   const validate=async()=>{
    if(!input.resolveCurrentIdentity)return;
    const current=await input.resolveCurrentIdentity();
    if(current.sessionId!==identity.sessionId||current.projectId!==identity.projectId)
     throw new Error("Pi session or project changed before agent continuation dispatch");
   };
   await validate();
   await (await coordination.binder()).launch(link.taskId,childId,identity,dispatch,validate);
  }:undefined);
  return {id:next,state:"queued",continuedFrom:agentId,role:"explorer",...(link?{todoId:link.taskId}:{})};
 }catch(error){
  if(resumed&&todos){
   const current=(await todos.list(identity)).find(item=>item.taskId===resumed.taskId);
   if(current?.current.state==="running")await todos.update(current.taskId,identity,current.current.revision,"blocked","Linked agent continuation was not dispatched; review is required",undefined).catch(()=>{});
  }
  throw error;
 }
}
