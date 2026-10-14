import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

const terminal=new Set(["completed","failed","cancelled","interrupted"]);
function independentVerdict(summary:string|undefined):boolean{
 if(!summary||summary.length>4096)return false;
 try{const value=JSON.parse(summary);return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")==="evidence,verdict"&&value.verdict==="pass"&&Array.isArray(value.evidence)&&value.evidence.length>0&&value.evidence.length<=32&&value.evidence.every((item:unknown)=>typeof item==="string"&&item.trim().length>0&&item.length<=1000);}catch{return false;}
}
/** Records successful execution separately from independent verification; only a passing verifier can finish the final Todo automatically. */
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
   const positiveReview=succeeded&&(task.plan?.role==="reviewer"||task.plan?.role==="verifier")&&independentVerdict(agent?.summary);
   const accepted=succeeded&&(task.plan?.role==="explorer"||task.plan?.role==="worker"||positiveReview);
   const nextState=accepted?(task.plan?.role==="verifier"?"done":"succeeded"):"blocked";
   const reason=accepted?(task.plan?.role==="verifier"?"Independent verifier returned a structured passing result":task.plan?.role==="reviewer"?"Independent reviewer returned a structured passing result":`${task.plan?.role} execution succeeded; downstream independent review is still required`):task.plan?"Linked agent did not return a valid successful result; review before continuing":"Linked agent finished; independent verification is required before completing this Todo";
   try{await this.todos.update(task.taskId,identity,task.current.revision,nextState,reason);if(nextState==="blocked")blocked.push(task.taskId);}catch(error){
    if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;
   }
  }
  return blocked;
 }
}
