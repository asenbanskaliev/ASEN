import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

const terminal=new Set(["completed","failed","cancelled","interrupted"]);
/** Moves linked active Todos to blocked review after every linked agent is terminal.
 * Agent completion alone never marks a Todo done. */
export class TaskAgentTodoReconciler{
 constructor(private readonly todos:Pick<SessionTodoStore,"list"|"update">,private readonly agents:Pick<AgentRuntime,"list">,private readonly links:Pick<TaskAgentLinkStore,"list">){}
 async reconcile(identity:AgentSessionIdentity):Promise<string[]>{
  const [tasks,agents,links]=await Promise.all([this.todos.list(identity),this.agents.list(identity),this.links.list(identity)]);
  const ownedAgents=new Map(agents.filter(agent=>agent.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(agent.projectId,identity.projectId)).map(agent=>[agent.id,agent]));
  const blocked:string[]=[];
  for(const task of tasks){
   if(task.current.state!=="running")continue;
   const related=links.filter(link=>link.taskId===task.taskId&&link.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(link.projectId,identity.projectId)).map(link=>ownedAgents.get(link.agentId));
   if(!related.length||related.some(agent=>!agent||!terminal.has(agent.state)))continue;
   const allSucceeded=related.every(agent=>agent?.state==="completed");
   const reason=allSucceeded?"All linked agents finished; independent verification is required before completing this Todo":"Linked agent execution ended without verified completion; review the result before continuing";
   try{await this.todos.update(task.taskId,identity,task.current.revision,"blocked",reason);blocked.push(task.taskId);}catch(error){
    if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;
   }
  }
  return blocked;
 }
}
