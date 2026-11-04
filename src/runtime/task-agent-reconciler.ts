import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";
import {CONFIRMED_FAILED_READ_ONLY_RETRY_REASON} from "./trusted-task-agent-binder.js";

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
   const taskLinks=links.filter(link=>link.taskId===task.taskId&&link.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(link.projectId,identity.projectId));
   const related=taskLinks.map(link=>ownedAgents.get(link.agentId));
   // An already-running Todo with no durable link, or an unresolvable linked
   // identity, has an unknown outcome. It must not remain apparently active
   // forever or be promoted to success by some other agent.
   if(!related.length||related.some(agent=>!agent)){
    const reason=!related.length?
     "Running Todo has no durable agent link; execution outcome unknown; explicit review required":
     "Linked agent record is missing; execution outcome unknown; explicit review required";
    try{await this.todos.update(task.taskId,identity,task.current.revision,"blocked",reason);blocked.push(task.taskId);}
    catch(error){if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;}
    continue;
   }
   // A live latest attempt may legitimately continue, but an earlier live
   // attempt means two launches overlap. Never leave this contradictory
   // history running indefinitely, even if the replacement is still queued.
   const predecessors=related.slice(0,-1);
   const latest=related[related.length-1]!;
   const confirmedFailedReadOnlyRetry=related.length===2&&
    task.current.reason===CONFIRMED_FAILED_READ_ONLY_RETRY_REASON&&
    predecessors[0]?.state==="failed"&&
    predecessors[0]?.role===latest.role&&
    ["explorer","reviewer","verifier"].includes(latest.role)&&
    (!task.plan||latest.role===task.plan.role);
   const validRecoveryChain=confirmedFailedReadOnlyRetry||predecessors.every(previous=>
    previous?.state==="interrupted"&&(!task.plan||previous.role===task.plan.role));
   if(!validRecoveryChain){
    try{await this.todos.update(task.taskId,identity,task.current.revision,"blocked",
     "Linked agent recovery history is inconsistent; previous attempts must be interrupted; explicit review required");
     blocked.push(task.taskId);
    }catch(error){if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;}
    continue;
   }
   if(!terminal.has(latest.state))continue;
   // The immutable link journal is ordered by launch attempts. An interrupted
   // predecessor is not a second active agent and must not prevent a valid
   // replacement from completing. Conversely, an earlier completed/failed
   // agent can never be rewritten as an interrupted predecessor to certify
   // the last attempt. This evaluates the entire chain before any Todo move.
   const succeeded=validRecoveryChain&&!!task.plan&&latest.state==="completed"&&
    latest.role===task.plan.role&&latest.sessionId===identity.sessionId&&
    sameWorkspaceIdentityPath(latest.projectId,identity.projectId);
   const hasSavedResult=typeof latest.summary==="string"&&!!latest.summary.trim();
   // Both Explorer and Writer outcomes must carry a durable non-empty summary.
   // A recorded terminal flag alone is not an observed successful result.
   const accepted=succeeded&&hasSavedResult&&
    (task.plan?.role==="explorer"||task.plan?.role==="worker");
   const nextState=accepted?(task.plan?.role==="worker"?"succeeded":"done"):"blocked";
   const reason=!validRecoveryChain?
    "Linked agent recovery history is inconsistent; previous attempts must be interrupted; explicit review required":
    accepted?(task.plan?.role==="worker"?
     "Worker execution succeeded; downstream independent review is still required":
     "Read-only exploration completed with a saved result"):
    succeeded&&(task.plan?.role==="reviewer"||task.plan?.role==="verifier")?
     "Linked review result requires explicit user acceptance":
    task.plan?"Linked agent did not return a valid successful result; review before continuing":
     "Linked agent finished; independent verification is required before completing this Todo";
   try{await this.todos.update(task.taskId,identity,task.current.revision,nextState,reason);if(nextState==="blocked")blocked.push(task.taskId);}catch(error){
    if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;
   }
  }
  return blocked;
 }
}
