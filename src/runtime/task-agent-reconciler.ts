import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import type {SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

const terminal=new Set(["completed","failed","cancelled","interrupted"]);
function independentVerdict(summary:string|undefined):boolean{
 if(!summary||summary.length>4096)return false;
 try{const value=JSON.parse(summary);return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")==="evidence,verdict"&&value.verdict==="pass"&&Array.isArray(value.evidence)&&value.evidence.length>0&&value.evidence.length<=32&&value.evidence.every((item:unknown)=>typeof item==="string"&&item.trim().length>0&&item.length<=1000);}catch{return false;}
}
/** Closes read-only plan steps automatically, while requiring an independent verifier before a writer is complete. */
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
   const positiveReview=succeeded&&(task.plan?.role==="reviewer"||task.plan?.role==="verifier")&&independentVerdict(agent?.summary);
   const acceptedExplorer=succeeded&&task.plan?.role==="explorer"&&hasSavedResult;
   const accepted=succeeded&&(task.plan?.role==="worker"||acceptedExplorer||positiveReview);
   const nextState=accepted?(task.plan?.role==="worker"?"succeeded":"done"):"blocked";
   const reason=accepted?(task.plan?.role==="worker"?"Worker execution succeeded; downstream independent review is still required":task.plan?.role==="explorer"?"Read-only exploration completed with a saved result":task.plan?.role==="reviewer"?"Independent reviewer returned a structured passing result":"Independent verifier returned a structured passing result"):task.plan?"Linked agent did not return a valid successful result; review before continuing":"Linked agent finished; independent verification is required before completing this Todo";
   try{await this.todos.update(task.taskId,identity,task.current.revision,nextState,reason);if(nextState==="blocked")blocked.push(task.taskId);}catch(error){
    if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;
   }
  }
  // Once a passing verifier has finished, close its successfully executed upstream
  // writer too. This removes a second human acceptance step without weakening the
  // explicit one-run write admission or the independent verification gate.
  const refreshed=await this.todos.list(identity),byTask=new Map(refreshed.map(task=>[task.taskId,task]));
  const dependsOn=(taskId:string,ancestorId:string,seen=new Set<string>()):boolean=>{
   if(seen.has(taskId))return false;seen.add(taskId);
   const task=byTask.get(taskId);if(!task)return false;
   for(const dependencyId of task.dependsOn??[]){if(dependencyId===ancestorId||dependsOn(dependencyId,ancestorId,seen))return true;}
   return false;
  };
  for(const verifier of refreshed){
   if(verifier.plan?.role!=="verifier"||verifier.current.state!=="done")continue;
   const verifierLinks=links.filter(link=>link.taskId===verifier.taskId&&link.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(link.projectId,identity.projectId));
   if(verifierLinks.length!==1)continue;
   const verifierAgent=ownedAgents.get(verifierLinks[0]!.agentId);
   if(!verifierAgent||verifierAgent.role!=="verifier"||verifierAgent.state!=="completed"||!independentVerdict(verifierAgent.summary))continue;
   for(const worker of refreshed){
    if(worker.plan?.role!=="worker"||worker.current.state!=="succeeded"||!dependsOn(verifier.taskId,worker.taskId))continue;
    const plan=worker.plan;
    if(!plan.candidate||plan.candidate.repository!==identity.projectId||!plan.writeSurfaces?.length||!plan.writerAuthorizationBasis||plan.skillSelection?.phase!=="apply")continue;
    const workerLinks=links.filter(link=>link.taskId===worker.taskId&&link.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(link.projectId,identity.projectId));
    if(workerLinks.length!==1)continue;
    const workerAgent=ownedAgents.get(workerLinks[0]!.agentId);
    if(!workerAgent||workerAgent.role!=="worker"||workerAgent.state!=="completed"||!workerAgent.summary?.trim())continue;
    try{await this.todos.update(worker.taskId,identity,worker.current.revision,"done",`Independent verifier ${verifierAgent.id} returned a structured passing result`);}catch(error){
     if(!(error instanceof Error)||!(/revision conflict|Invalid task transition/u.test(error.message)))throw error;
    }
   }
  }
  return blocked;
 }
}
