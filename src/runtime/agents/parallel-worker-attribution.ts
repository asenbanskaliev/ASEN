/** T06: Bind an observed child Worker to its own ODD Todo and the persisted
 * task-agent link. Merely seeing a Worker in a Pi session is not attribution.
 * No result is a model-consumption proof or integration approval. */
import type {SourceTodoRow} from "./parallel-todo-bindings.js";
import type {ParallelChildSessionLink} from "./parallel-todo-session-links.js";
import type {TaskAgentLink} from "./task-agent-link-store.js";
import type {PublicAgentRecord} from "./agent-lifecycle.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";

export interface AttributedParallelWorker{
 readonly sourceTodoId:string;
 readonly childTodoId:string;
 readonly agentId:string;
 readonly agentState:PublicAgentRecord["state"];
 readonly agentUpdatedAt:string;
 readonly childTodoState:string;
 readonly modelActual:"unknown";
 readonly modelConsumedProven:false;
 readonly acceptance:"not-accepted";
 readonly autoMerge:false;
}
export function attributeParallelChildWorker(input:{
 readonly owner:ParallelChildSessionLink;
 readonly writeSurfaces:readonly string[];
 readonly todos:readonly SourceTodoRow[];
 readonly agents:readonly PublicAgentRecord[];
 readonly taskAgentLinks:readonly TaskAgentLink[];
}):AttributedParallelWorker|undefined{
 const {owner,todos,agents,taskAgentLinks,writeSurfaces}=input;
 if(!owner||owner.authority!=="none"||owner.autoDispatch!==false||owner.autoMerge!==false||
  !Array.isArray(writeSurfaces)||writeSurfaces.length<1||writeSurfaces.length>256||
  !Array.isArray(todos)||!Array.isArray(agents)||!Array.isArray(taskAgentLinks))
  throw new Error("Child Worker attribution requires an exact non-authorizing source link");
 const matching=todos.filter(todo=>
  todo.current?.sessionId===owner.childSessionId&&
  sameWorkspaceIdentityPath(todo.current?.projectId??"",owner.childProjectId)&&
  todo.plan?.role==="worker"&&todo.plan.skillSelection?.phase==="apply"&&
  todo.plan.candidate?.revision===owner.sourceHead&&
  sameWorkspaceIdentityPath(todo.plan.candidate.repository,owner.childProjectId)&&
  todo.plan.writeSurfaces?.length===writeSurfaces.length&&
  todo.plan.writeSurfaces.every((scope:string,i:number)=>scope===writeSurfaces[i])&&
  typeof todo.requestId==="string"&&todo.requestId.startsWith("asen-plan:")&&
  todo.requestId.endsWith(":worker")
 );
 if(matching.length>1)throw new Error("Ambiguous independently planned child Worker Todos");
 if(matching.length===0)return undefined;
 const todo=matching[0]!;
 const links=taskAgentLinks.filter(link=>link.taskId===todo.taskId&&
  link.sessionId===owner.childSessionId&&
  sameWorkspaceIdentityPath(link.projectId,owner.childProjectId));
 if(links.length>1)throw new Error("Ambiguous child task-agent assignments");
 if(links.length===0)return undefined;
 const linked=links[0]!;
 if(linked.agentId!==todo.requestId)throw new Error("Child Worker agent ID does not match the issued ODD request");
 const found=agents.filter(agent=>agent.id===linked.agentId&&agent.role==="worker"&&
  agent.sessionId===owner.childSessionId&&sameWorkspaceIdentityPath(agent.projectId,owner.childProjectId));
 if(found.length!==1)throw new Error("Linked child Worker lifecycle evidence is absent or ambiguous");
 const agent=found[0]!;
 if(!["queued","running","interrupted","cancelled","failed","completed"].includes(agent.state)||
  !Number.isFinite(Date.parse(agent.updatedAt)))throw new Error("Invalid child Worker lifecycle state");
 return Object.freeze({
  sourceTodoId:owner.sourceTodoId,childTodoId:todo.taskId,
  agentId:agent.id,agentState:agent.state,agentUpdatedAt:agent.updatedAt,
  childTodoState:todo.current.state,
  modelActual:"unknown" as const,modelConsumedProven:false as const,
  acceptance:"not-accepted" as const,autoMerge:false as const
 });
}
