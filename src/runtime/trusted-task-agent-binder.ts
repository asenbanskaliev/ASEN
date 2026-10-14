import type {AgentRuntime,AgentSessionIdentity} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore,TaskAgentLink} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

/** Trusted boundary that binds an already-persisted agent to an active owned Todo.
 * Launch and correlation are serialized with Todo transitions; the callback can
 * start only the exact queued request supplied by AgentRuntime. */
type TodoDispatchSnapshot=Awaited<ReturnType<SessionTodoStore["list"]>>[number];
export class TodoLaunchConflictError extends Error{}
const sameSnapshot=(left:TodoDispatchSnapshot,right:TodoDispatchSnapshot):boolean=>JSON.stringify(left)===JSON.stringify(right);

export class TrustedTaskAgentBinder{
 constructor(private readonly todos:Pick<SessionTodoStore,"list"|"withAgentLaunch">,private readonly agents:Pick<AgentRuntime,"query">,private readonly links:Pick<TaskAgentLinkStore,"bind"|"list">){}
 async #bindOwned(taskId:string,agentId:string,identity:AgentSessionIdentity):Promise<TaskAgentLink>{
  const [tasks,agent,links]=await Promise.all([this.todos.list(identity),this.agents.query(agentId,identity),this.links.list(identity)]);
  const task=tasks.find(item=>item.taskId===taskId);
  if(!task||!(task.current.state==="planned"||task.current.state==="running")||!agent||agent.record.id!==agentId||
    agent.record.sessionId!==identity.sessionId||!sameWorkspaceIdentityPath(agent.record.projectId,identity.projectId))
   throw new Error("ASEN task-agent correlation requires matching active durable ownership");
  for(const link of links.filter(item=>item.taskId===taskId&&item.agentId!==agentId&&item.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(item.projectId,identity.projectId))){
   const previous=await this.agents.query(link.agentId,identity);
   if(previous&&["queued","running"].includes(previous.record.state))throw new Error("ASEN Todo already has an active linked agent; duplicate launch rejected");
  }
  return this.links.bind({taskId,agentId,sessionId:identity.sessionId,projectId:identity.projectId,createdAt:new Date().toISOString()});
 }
 /** Persist an active Todo claim and immutable link before the synchronous dispatch starts. */
 async launch(taskId:string,agentId:string,identity:AgentSessionIdentity,dispatch:()=>void,validateIdentity?:()=>void|Promise<void>):Promise<void>{
  await this.todos.withAgentLaunch(taskId,identity,async()=>{await validateIdentity?.();await this.#bindOwned(taskId,agentId,identity);await validateIdentity?.();},dispatch,validateIdentity);
 }
 /** Under the Todo launch lock, admit only the exact confirmed planned snapshot before durable enqueue. */
 async launchExact(expected:TodoDispatchSnapshot,agentId:string,identity:AgentSessionIdentity,enqueue:()=>Promise<void>,dispatch:()=>void,validateIdentity?:()=>void|Promise<void>):Promise<void>{
  await this.todos.withAgentLaunch(expected.taskId,identity,async()=>{
   await validateIdentity?.();const current=(await this.todos.list(identity)).find(item=>item.taskId===expected.taskId);
   if(!current||current.current.state!=="planned"||!sameSnapshot(current,expected))throw new TodoLaunchConflictError("The confirmed Todo snapshot changed before durable dispatch");
   await enqueue();await this.#bindOwned(expected.taskId,agentId,identity);await validateIdentity?.();
  },dispatch,validateIdentity);
 }
}
