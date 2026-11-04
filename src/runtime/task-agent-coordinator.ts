import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

type AgentView={id:string;role:string;state:string;summary?:string};
/** Read-only coordination. Correlation never conveys execution authority. */
export class TaskAgentCoordinator {
 constructor(private readonly todos:Pick<SessionTodoStore,"list"|"history">,private readonly agents:Pick<AgentRuntime,"list">,private readonly links?:Pick<TaskAgentLinkStore,"list">){}
 async snapshot(identity:AgentSessionIdentity){
  const [tasks,agents,links]=await Promise.all([this.todos.list(identity),this.agents.list(identity),this.links?.list(identity)??Promise.resolve([])]);
  const owned=agents.filter(agent=>agent.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(agent.projectId,identity.projectId));
  const byId=new Map(tasks.map(task=>[task.taskId,task]));
  return {tasks:tasks.map(task=>{
   const linked=links.filter(link=>link.taskId===task.taskId&&link.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(link.projectId,identity.projectId));
   const explicit=new Set(linked.map(link=>link.agentId));
   // The most recent link is only a persisted attempt identity; this is not
   // proof that its Pi request executed or that a provider was contacted.
   const latestLinkedAgentId=linked.at(-1)?.agentId??null;
   // With an explicit journal, legacy taskId:role coincidence is not evidence
   // of ownership. Keep that fallback only for callers without a link store.
   const correlated:AgentView[]=owned.filter(agent=>explicit.has(agent.id)||(!this.links&&["explorer","worker","reviewer","verifier"].some(role=>agent.id===task.taskId+":"+role&&agent.role===role))).map(agent=>({id:agent.id,role:agent.role,state:agent.state,...(agent.summary?{summary:agent.summary}:{})}));
   // A missing dependency cannot be silently removed from a recovered plan.
   // The projection must fail closed just like the durable launch transaction.
   const dependsOn=task.dependsOn??[],blockedBy=dependsOn.flatMap<{id:string;state:string}>(id=>{
    const prerequisite=byId.get(id);
    if(!prerequisite)return [{id,state:"missing" as const}];
    return ["succeeded","done"].includes(prerequisite.current.state)?[]:
     [{id,state:prerequisite.current.state}];
   });
   const launchRequiresReconciliation=task.current.state==="planned"&&linked.length>0;
   return {id:task.taskId,title:task.title,state:task.current.state,revision:task.current.revision,
    dependsOn:[...dependsOn],blockedBy,linkedAttempts:linked.length,latestLinkedAgentId,
    launchRequiresReconciliation,
    ready:task.current.state==="planned"&&blockedBy.length===0&&!launchRequiresReconciliation,agents:correlated};
  })};
 }
 async task(taskId:string,identity:AgentSessionIdentity){
  const view=await this.snapshot(identity),item=view.tasks.find(task=>task.id===taskId);
  if(!item)return null;
  return {...item,history:await this.todos.history(taskId,identity)};
 }
}
