import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

const terminal=new Set(["completed","failed","cancelled","interrupted"]);
/** Closes read-only exploration automatically; review results require explicit user acceptance. */
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
   const exactSingleAgent=related.length===1&&!!related[0],agent=related[0],succeeded=exactSingleAgent&&!!task.plan&&agent?.state==="completed"&&agent.role===task.plan.role&&agent.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(agent.projectId,identity.projectId);
   const hasSavedResult=typeof agent?.summary==="string"&&!!agent.summary.trim();
   const acceptedExplorer=succeeded&&task.plan?.role==="explorer"&&hasSavedResult;
   const accepted=succeeded&&(task.plan?.role==="worker"||acceptedExplorer);
   const nextState=accepted?(task.plan?.role==="worker"?"succeeded":"done"):"blocked";
   const reason=accepted?(task.plan?.role==="worker"?"Worker execution succeeded; downstream independent review is still required":"Read-only exploration completed with a saved result"):succeeded&&(task.plan?.role==="reviewer"||task.plan?.role==="verifier")?"Linked review result requires explicit user acceptance":task.plan?"Linked agent did not return a valid successful result; review before continuing":"Linked agent finished; independent verification is required before completing this Todo";
   try{await this.todos.update(task.taskId,identity,task.current.revision,nextState,reason);if(nextState==="blocked")blocked.push(task.taskId);}catch(error){
    if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;
   }
  }
  return blocked;
 }
}
