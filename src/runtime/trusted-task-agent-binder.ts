import type {AgentRuntime,AgentSessionIdentity} from "../agents/agent-runtime.js";
import {TodoAlreadyRunningError,type SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore,TaskAgentLink} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

/** Durable, explicit UI-confirmed retry reason; never a standalone authorization. */
export const CONFIRMED_FAILED_READ_ONLY_RETRY_REASON="User confirmed a new read-only retry in Pi UI";
type FailedReadOnlyRetry={originalAgentId:string;expectedRunningRevision:number};

/** Trusted boundary that binds an already-persisted agent to an active owned Todo.
 * Launch and correlation are serialized with Todo transitions; the callback can
 * start only the exact queued request supplied by AgentRuntime. */
type TodoDispatchSnapshot=Awaited<ReturnType<SessionTodoStore["list"]>>[number];
export class TodoLaunchConflictError extends Error{}
const sameSnapshot=(left:TodoDispatchSnapshot,right:TodoDispatchSnapshot):boolean=>JSON.stringify(left)===JSON.stringify(right);

export class TrustedTaskAgentBinder{
 constructor(private readonly todos:Pick<SessionTodoStore,"list"|"withAgentLaunch">,private readonly agents:Pick<AgentRuntime,"query">,private readonly links:Pick<TaskAgentLinkStore,"bind"|"list">){}
 async #bindOwned(taskId:string,agentId:string,identity:AgentSessionIdentity,retry?:FailedReadOnlyRetry):Promise<TaskAgentLink>{
  const [tasks,agent,links]=await Promise.all([this.todos.list(identity),this.agents.query(agentId,identity),this.links.list(identity)]);
  const task=tasks.find(item=>item.taskId===taskId);
  if(!task||!(task.current.state==="planned"||task.current.state==="running")||!agent||agent.record.id!==agentId||
    agent.record.sessionId!==identity.sessionId||!sameWorkspaceIdentityPath(agent.record.projectId,identity.projectId))
   throw new Error("ASEN task-agent correlation requires matching active durable ownership");
  const previousLinks=links.filter(item=>item.taskId===taskId&&item.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(item.projectId,identity.projectId));
  // A confirmation-bound retry is distinct from an interrupted-process recovery.
  // The original failed attempt, one-time link, role and running revision must
  // all match; a Todo reason alone never creates a reusable launch permit.
  const confirmedRetry=retry!==undefined&&task.current.state==="running"&&
   task.current.revision===retry.expectedRunningRevision&&
   task.current.reason===CONFIRMED_FAILED_READ_ONLY_RETRY_REASON&&
   previousLinks.length===1&&previousLinks[0]?.agentId===retry.originalAgentId&&
   ["explorer","reviewer","verifier"].includes(agent.record.role)&&
   (!task.plan||task.plan.role===agent.record.role)&&!!task.description;
  if(retry&&!confirmedRetry)
   throw new Error("Confirmed failed-agent retry snapshot or linked scope changed; review before dispatch");
  // A task-agent link is an audit record, not a renewable launch permit.
  // Reusing its agent ID (even after interruption) must never invoke Pi twice.
  if(previousLinks.some(link=>link.agentId===agentId))
   throw new Error("ASEN Todo agent ID already linked; duplicate launch rejected");
  // An already completed, cancelled, failed, running or interrupted agent must
  // never be dispatched again under another Todo or a newly invented link.
  if(agent.record.state!=="queued")
   throw new Error("ASEN dispatch requires a fresh queued agent identity");
  if(task.plan&&agent.record.role!==task.plan.role)
   throw new Error("ASEN agent role does not match the confirmed Todo role");
  // A previously linked but still-planned Todo is an uncertain pre-dispatch
  // window. Only explicit reconciliation may decide the next transition.
  if(task.current.state==="planned"&&previousLinks.length)
   throw new Error("Previously linked planned Todo requires explicit reconciliation before another launch");
  if(task.current.state==="running"&&!previousLinks.length)
   throw new Error("Running Todo requires an interrupted linked agent for explicit recovery");
  for(const link of previousLinks){
   const previous=await this.agents.query(link.agentId,identity);
   if(previous&&["queued","running"].includes(previous.record.state))
    throw new Error("ASEN Todo already has an active linked agent; duplicate launch rejected");
   const confirmedFailedPredecessor=confirmedRetry&&link.agentId===retry!.originalAgentId&&
    previous?.record.state==="failed"&&previous.record.role===agent.record.role&&
    previous.record.id===link.agentId&&previous.record.sessionId===identity.sessionId&&
    sameWorkspaceIdentityPath(previous.record.projectId,identity.projectId);
   if(confirmedRetry&&!confirmedFailedPredecessor)
    throw new Error("Confirmed failed retry requires the exact failed read-only predecessor");
   if(task.current.state==="running"&&previous?.record.state!=="interrupted"&&!confirmedFailedPredecessor)
    throw new Error("Running Todo requires an interrupted linked agent for explicit recovery");
   // A prior interruption from another session, project, role or agent ID
   // cannot authorize replacing this Todo's execution. Reconcile first.
   if(task.current.state==="running"&&(!previous||
      previous.record.id!==link.agentId||
      previous.record.sessionId!==identity.sessionId||
      !sameWorkspaceIdentityPath(previous.record.projectId,identity.projectId)||
      (task.plan!==undefined&&previous.record.role!==task.plan.role)))
    throw new Error("Interrupted prior agent identity or role mismatch; explicit recovery review required");
  }
  return this.links.bind({taskId,agentId,sessionId:identity.sessionId,projectId:identity.projectId,createdAt:new Date().toISOString()});
 }
 /** Persist an active Todo claim and immutable link before the synchronous dispatch starts. */
 async launch(taskId:string,agentId:string,identity:AgentSessionIdentity,dispatch:()=>void,validateIdentity?:()=>void|Promise<void>):Promise<void>{
  await this.todos.withAgentLaunch(taskId,identity,async()=>{await validateIdentity?.();await this.#bindOwned(taskId,agentId,identity);await validateIdentity?.();},dispatch,validateIdentity,true);
 }
 /** Only the UI-confirmed failed-agent retry tool may use this bounded route.
  * It cannot retry Writer, reuse a prior agent ID, or exceed one failed predecessor. */
 async launchConfirmedFailedRetry(taskId:string,agentId:string,identity:AgentSessionIdentity,originalAgentId:string,expectedRunningRevision:number,dispatch:()=>void,validateIdentity?:()=>void|Promise<void>):Promise<void>{
  await this.todos.withAgentLaunch(taskId,identity,async()=>{
   await validateIdentity?.();
   await this.#bindOwned(taskId,agentId,identity,{originalAgentId,expectedRunningRevision});
   await validateIdentity?.();
  },dispatch,validateIdentity,true);
 }
 /** Under the Todo launch lock, admit only the exact confirmed planned snapshot before durable enqueue. */
 async launchExact(expected:TodoDispatchSnapshot,agentId:string,identity:AgentSessionIdentity,enqueue:()=>Promise<void>,dispatch:()=>void,validateIdentity?:()=>void|Promise<void>):Promise<void>{
  try{
   await this.todos.withAgentLaunch(expected.taskId,identity,async()=>{
    await validateIdentity?.();const current=(await this.todos.list(identity)).find(item=>item.taskId===expected.taskId);
    if(!current||current.current.state!=="planned"||!sameSnapshot(current,expected))throw new TodoLaunchConflictError("The confirmed Todo snapshot changed before durable dispatch");
    await enqueue();await this.#bindOwned(expected.taskId,agentId,identity);await validateIdentity?.();
   },dispatch,validateIdentity);
  }catch(error){
   // Preserve the plan dispatcher's typed refresh path, even when the Todo
   // lock rejects the stale running state before the snapshot callback runs.
   if(error instanceof TodoAlreadyRunningError)throw new TodoLaunchConflictError("The confirmed Todo snapshot changed before durable dispatch");
   throw error;
  }
 }
}
