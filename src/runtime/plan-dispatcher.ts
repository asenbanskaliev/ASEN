import type {AgentRuntime,AgentSessionIdentity} from "../agents/agent-runtime.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";
import type {SessionTodoStore,TodoContext} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {TrustedTaskAgentBinder} from "./trusted-task-agent-binder.js";

const readOnlyRoles=["explorer","reviewer","verifier"] as const;
type ReadOnlyRole=typeof readOnlyRoles[number];
const MAX_VISIBLE_PLAN_INSTRUCTION=4096;
const phaseFor:Readonly<Record<ReadOnlyRole,SkillSelectionContext["phase"]>>={explorer:"explore",reviewer:"adversarial-review",verifier:"verify"};

/** Explicitly dispatches one dependency-ready, persisted read-only plan task.
 * It never dispatches workers, grants write authority, or treats agent completion as verification. */
export async function dispatchNextReadOnlyPlanTask(input:{todos:SessionTodoStore;agents:AgentRuntime;links:TaskAgentLinkStore;identity:AgentSessionIdentity;validateIdentity:()=>Promise<void>;confirm:(task:{id:string;title:string;role:string;instruction:string})=>Promise<boolean>}):Promise<{status:"dispatched";todoId:string;agentId:string;role:ReadOnlyRole}|{status:"blocked";reason:string}>{
 const context:TodoContext={sessionId:input.identity.sessionId,projectId:input.identity.projectId};
 const rows=await input.todos.list(context),byId=new Map(rows.map(row=>[row.taskId,row]));
 const ready=rows.filter(row=>row.requestId?.startsWith("asen-plan:")&&row.current.state==="planned"&&(row.dependsOn??[]).every(id=>byId.get(id)?.current.state==="done"));
 if(!ready.length)return {status:"blocked",reason:"No persisted plan task is dependency-ready; complete independent verification or resolve the plan clarification first."};
 ready.sort((a,b)=>(a.plan?.priority??Number.MAX_SAFE_INTEGER)-(b.plan?.priority??Number.MAX_SAFE_INTEGER));
 const task=ready[0]!;
 if(!task.plan||!readOnlyRoles.includes(task.plan.role as ReadOnlyRole))return {status:"blocked",reason:`The next ready plan task requires a controlled ${task.plan?.role??"primary"} lifecycle dispatcher; no agent was launched.`};
 const role=task.plan.role as ReadOnlyRole,selection=task.plan.skillSelection;
 if(!selection||selection.phase!==phaseFor[role])return {status:"blocked",reason:`The planned ${role} task lacks its exact read-only skill selection; rebuild the plan.`};
 const currentPaths=selectSkills(selection).map(skill=>skill.path);
 if(currentPaths.length!==task.plan.skillPaths.length||currentPaths.some((value,index)=>value!==task.plan!.skillPaths[index]))return {status:"blocked",reason:"The persisted skill registry selection changed; rebuild the plan before dispatch."};
 if(!task.description)return {status:"blocked",reason:"The persisted plan task has no exact instruction; no agent was launched."};
 if(task.description.length>MAX_VISIBLE_PLAN_INSTRUCTION)return {status:"blocked",reason:"The complete plan instruction exceeds the safe Pi confirmation size; split the task before dispatch."};
 if(!await input.confirm({id:task.taskId,title:task.title,role,instruction:task.description}))return {status:"blocked",reason:"Pi user declined dispatch; the plan was not changed."};
 await input.validateIdentity();
 const fresh=(await input.todos.list(context)).find(row=>row.taskId===task.taskId);
 if(!fresh||fresh.current.state!=="planned"||fresh.current.revision!==task.current.revision)return {status:"blocked",reason:"The plan task changed while awaiting confirmation; refresh the plan before dispatch."};
 await input.validateIdentity();
 const binder=new TrustedTaskAgentBinder(input.todos,input.agents,input.links);
 const agentId=await input.agents.startReadOnly({role,prompt:fresh.description!,session:input.identity,skillSelection:selection,onQueued:async(id,dispatch)=>{await input.validateIdentity();await binder.launch(fresh.taskId,id,input.identity,dispatch,input.validateIdentity);}});
 return {status:"dispatched",todoId:task.taskId,agentId,role};
}
