import type {AgentSessionIdentity,AgentRuntime} from "../agents/agent-runtime.js";
import {equivalentPlannedExplorer,type SessionTodoStore} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

type AgentView={id:string;role:string;state:string;summary?:string};
type TaskView=Awaited<ReturnType<SessionTodoStore["list"]>>[number];
type AgentRecord=Awaited<ReturnType<AgentRuntime["list"]>>[number];
type Link=Awaited<ReturnType<TaskAgentLinkStore["list"]>>[number];
const recoveryActions={
 unknown:"inspect-task-and-links",
 reconciliation:"reconcile-linked-evidence",
 active:"observe",
 "manual-continuation":"request-explicit-continuation",
 "fresh-confirmation":"request-fresh-read-only-confirmation",
 "manual-worker-reconciliation":"reconcile-worker-manually",
 "inspect-result":"inspect-result-and-acceptance",
} as const;
function advisory(status:keyof typeof recoveryActions){
 return {advisory:true as const,automaticDispatch:false as const,grantsAuthority:false as const,
  status,nextAction:recoveryActions[status]};
}
const validIdentity=(value:unknown):value is string=>typeof value==="string"&&value.length>0&&value.length<=1024&&
 value===value.trim()&&value===value.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
function matchesIdentity(value:AgentSessionIdentity,identity:AgentSessionIdentity){
 return validIdentity(value.sessionId)&&validIdentity(value.projectId)&&
  value.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(value.projectId,identity.projectId);
}
/** Observations only. A snapshot cannot validate consent, retry eligibility or acceptance. */
function recoveryDisposition(task:TaskView,identity:AgentSessionIdentity,agents:readonly AgentRecord[],links:readonly Link[]){
 if(!validIdentity(identity.sessionId)||!validIdentity(identity.projectId)||!validIdentity(task.taskId)||
    task.current.taskId!==task.taskId||!matchesIdentity(task.current,identity)||
    !["planned","running","blocked","succeeded","done","cancelled"].includes(task.current.state)||!links.length)return advisory("unknown");
 const attempts:AgentRecord[]=[];
 for(const link of links){
  const records=agents.filter(agent=>agent.id===link.agentId);
  const agent=records[0];
  if(!validIdentity(link.agentId)||!matchesIdentity(link,identity)||link.taskId!==task.taskId||
     records.length!==1||!agent||!matchesIdentity(agent,identity)||
     !["explorer","worker","reviewer","verifier","clarifier"].includes(agent.role)||
     (task.plan?agent.role!==task.plan.role:agent.role!=="explorer")||
     !["queued","running","interrupted","failed","completed","cancelled"].includes(agent.state)||
     attempts.some(previous=>previous.id===agent.id))return advisory("reconciliation");
  attempts.push(agent);
 }
 // An absent, live or contradictory predecessor must not be hidden by the latest attempt.
 // Failed-predecessor retry consent is not in these public records: do not infer it.
 if(attempts.slice(0,-1).some(agent=>agent.state!=="interrupted"))return advisory("reconciliation");
 const latest=attempts.at(-1)!;
 if(task.current.state==="planned")return advisory(latest.role==="worker"?"manual-worker-reconciliation":"reconciliation");
 if(["succeeded","done","cancelled"].includes(task.current.state))return advisory(
  ["queued","running","interrupted"].includes(latest.state)?"reconciliation":"inspect-result");
 if(latest.state==="queued"||latest.state==="running")return advisory("active");
 if(latest.state==="completed"||latest.state==="cancelled")return advisory("inspect-result");
 if(latest.role==="worker")return advisory("manual-worker-reconciliation");
 if(latest.state==="interrupted"&&latest.role==="explorer")return advisory("manual-continuation");
 if(latest.state==="failed"&&["explorer","reviewer","verifier"].includes(latest.role))return advisory("fresh-confirmation");
 return advisory("unknown");
}
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
   // Mirror the exact launch-time semantic fingerprint, not a UI heuristic.
   // This is an advisory snapshot: the Todo lock still decides dispatch.
   const equivalentRunningExplorerId=task.current.state==="planned"&&task.plan?.role==="explorer"?
    tasks.find(other=>other.current.state==="running"&&
     equivalentPlannedExplorer(task,other))?.taskId??null:null;
   const launchRequiresReconciliation=task.current.state==="planned"&&linked.length>0;
   return {id:task.taskId,title:task.title,state:task.current.state,revision:task.current.revision,
    dependsOn:[...dependsOn],blockedBy,linkedAttempts:linked.length,latestLinkedAgentId,
    launchRequiresReconciliation,equivalentRunningExplorerId,
    ready:task.current.state==="planned"&&blockedBy.length===0&&!launchRequiresReconciliation&&
     equivalentRunningExplorerId===null,agents:correlated,
    recoveryDisposition:recoveryDisposition(task,identity,agents,linked)};
  })};
 }
 async task(taskId:string,identity:AgentSessionIdentity){
  const view=await this.snapshot(identity),item=view.tasks.find(task=>task.id===taskId);
  if(!item)return null;
  return {...item,history:await this.todos.history(taskId,identity)};
 }
}
