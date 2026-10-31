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
   const explicit=new Set(links.filter(link=>link.taskId===task.taskId&&link.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(link.projectId,identity.projectId)).map(link=>link.agentId));
   const correlated:AgentView[]=owned.filter(agent=>explicit.has(agent.id)||["explorer","worker","reviewer","verifier"].some(role=>agent.id===task.taskId+":"+role&&agent.role===role)).map(agent=>({id:agent.id,role:agent.role,state:agent.state,...(agent.summary?{summary:agent.summary}:{})}));
   const dependsOn=(task.dependsOn??[]).map(id=>byId.get(id)).filter((value):value is NonNullable<typeof value>=>!!value),blockedBy=dependsOn.filter(value=>value.current.state!=="done"&&value.current.state!=="succeeded").map(value=>({id:value.taskId,state:value.current.state}));
   return {id:task.taskId,title:task.title,state:task.current.state,revision:task.current.revision,dependsOn:dependsOn.map(value=>value.taskId),blockedBy,ready:task.current.state==="planned"&&blockedBy.length===0,agents:correlated};
  })};
 }
 async task(taskId:string,identity:AgentSessionIdentity){
  const view=await this.snapshot(identity),item=view.tasks.find(task=>task.id===taskId);
  if(!item)return null;
  return {...item,history:await this.todos.history(taskId,identity)};
 }
}
