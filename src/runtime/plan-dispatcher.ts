import {execFileSync} from "node:child_process";
import type {AgentRuntime,AgentSessionIdentity} from "../agents/agent-runtime.js";
import type {Candidate} from "../core/types.js";
import {deriveOddFacts,planOddRoute,type OddRoutingRequest} from "../flow/odd-routing.js";
import {decideLifecycleApplicability} from "../lifecycle/applicability.js";
import {issueOrganicWriterAdmission} from "../lifecycle/skill-lifecycle.js";
import {buildOrchestrationPlan} from "../orchestration/orchestrator.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";
import type {SessionTodoStore,TodoContext,TodoItem} from "./todo-store.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import {TrustedTaskAgentBinder} from "./trusted-task-agent-binder.js";

const readOnlyRoles=["explorer","reviewer","verifier"] as const;
type ReadOnlyRole=typeof readOnlyRoles[number];
const MAX_VISIBLE_PLAN_INSTRUCTION=4096;
const phaseFor:Readonly<Record<ReadOnlyRole,SkillSelectionContext["phase"]>>={explorer:"explore",reviewer:"adversarial-review",verifier:"verify"};
const basisKeys=["instruction","taskIdentity","intent","scope","writes","riskOperations","session","testing","review","unresolvedDecisions"] as const;
const skillSelectionKeys=["behaviorChange","codeChange","defect","filesTouched","phase","risk","verification"] as const;
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function sameSkillSelection(left:SkillSelectionContext,right:SkillSelectionContext):boolean{
 return skillSelectionKeys.every(key=>left[key]===right[key]);
}

type PlanDispatchTask={id:string;title:string;role:string;instruction:string;writeSurfaces?:readonly string[];candidateRevision?:string};
type DispatchInput={todos:SessionTodoStore;agents:AgentRuntime;links:TaskAgentLinkStore;identity:AgentSessionIdentity;validateIdentity:()=>Promise<void>;confirm:(task:PlanDispatchTask)=>Promise<boolean>};
type DispatchResult={status:"dispatched";todoId:string;agentId:string;role:string}|{status:"blocked";reason:string};

function currentRevision(repository:string):string{
 try{return execFileSync("git",["rev-parse","HEAD"],{cwd:repository,encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2000,windowsHide:true}).trim();}
 catch(error){const revision=error&&typeof error==="object"&&"status" in error&&error.status===0&&"stdout" in error?String(error.stdout).trim():"";if(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(revision))throw error;return revision;}
}
function workerAuthorization(task:TodoItem,identity:AgentSessionIdentity):{candidate:Candidate;writeSurfaces:string[];instruction:string;taskIdentity:string;routeEvidence:NonNullable<ReturnType<typeof buildOrchestrationPlan>["routeEvidence"]>;workerSelection:SkillSelectionContext;admission:object}|{reason:string}{
 const metadata=task.plan,basisText=metadata?.writerAuthorizationBasis,candidate=metadata?.candidate,surfaces=metadata?.writeSurfaces;
 if(!metadata||metadata.role!=="worker"||!metadata.skillSelection||metadata.skillSelection.phase!=="apply"||!basisText||!candidate||!surfaces?.length)return {reason:"The worker plan lacks a persisted candidate, exact file scope or original ODD authorization facts; rebuild the plan in a Git project."};
 if(candidate.repository!==identity.projectId)return {reason:"The persisted worker candidate belongs to another project; rebuild the plan."};
 let parsed:unknown;try{parsed=JSON.parse(basisText);}catch{return {reason:"The worker ODD authorization facts are malformed; rebuild the plan."};}
 if(!exact(parsed,basisKeys)||typeof parsed.instruction!=="string"||!parsed.instruction.trim()||parsed.instruction!==parsed.instruction.trim())return {reason:"The worker ODD authorization facts are incomplete; rebuild the plan."};
 const {instruction,...rawFacts}=parsed;
 let facts:ReturnType<typeof deriveOddFacts>,revision:string;
 try{facts=deriveOddFacts({...rawFacts,repositoryIdentity:identity.projectId} as unknown as OddRoutingRequest);revision=currentRevision(identity.projectId);}catch{return {reason:"The current project is not a readable Git candidate; no writer was launched."};}
 if(revision!==candidate.revision)return {reason:"The project changed after planning; rebuild the plan against the current candidate before authorizing writes."};
 if(facts.taskIdentity!==task.requestId?.slice("asen-plan:".length,-":worker".length)||facts.scope.kind!=="known"||!facts.writes.length)return {reason:"The persisted worker does not match a bounded original write request."};
 const originalScope=facts.scope;
 const exactSurfaces=facts.writes.map(write=>write.path);
 if(exactSurfaces.length!==surfaces.length||exactSurfaces.some((surface,index)=>surface!==surfaces[index])||exactSurfaces.some(surface=>!originalScope.expectedPaths.includes(surface)))return {reason:"The persisted worker write scope differs from the exact ODD request."};
 const candidateBound={id:candidate.id,repository:candidate.repository,revision:candidate.revision,createdAt:candidate.createdAt},decision=planOddRoute(facts);
 let plan:ReturnType<typeof buildOrchestrationPlan>;
 try{plan=buildOrchestrationPlan({taskId:facts.taskIdentity,repository:identity.projectId,prompt:instruction,candidate:candidateBound,writeSurfaces:exactSurfaces},decision);}catch{return {reason:"The original ODD route no longer authorizes this worker plan."};}
 if(decision.route!=="orchestrate")return {reason:"The original ODD route does not authorize delegated worker execution."};
 const worker=plan.agents.find(agent=>agent.role==="worker");
 if(!worker?.skillContext||!worker.skillPaths||!worker.writeSurfaces||worker.writeSurfaces.length!==exactSurfaces.length||worker.writeSurfaces.some((surface,index)=>surface!==exactSurfaces[index]))return {reason:"The current ODD plan does not produce the exact persisted worker scope."};
 const expectedPaths=selectSkills(metadata.skillSelection).map(skill=>skill.path);
 if(expectedPaths.length!==metadata.skillPaths.length||expectedPaths.some((value,index)=>value!==metadata.skillPaths[index])||worker.skillPaths.length!==metadata.skillPaths.length||worker.skillPaths.some((value,index)=>value!==metadata.skillPaths[index])||!sameSkillSelection(metadata.skillSelection,worker.skillContext))return {reason:"The saved worker skill selection changed; rebuild the plan before dispatch."};
 const expectedInstruction=`Perform only the authorized, scoped work for: ${instruction}`;
 if(task.description!==expectedInstruction||task.description.length>MAX_VISIBLE_PLAN_INSTRUCTION)return {reason:"The complete original worker instruction must match and fit in the Pi authorization dialog; split or rebuild the task."};
 const subsystems=[...new Set(exactSurfaces.map(surface=>surface.split("/")[0]||"repository-root"))];
 const applicability=decideLifecycleApplicability(decision,{taskIdentity:facts.taskIdentity,repositoryIdentity:identity.projectId,candidate:{id:candidateBound.id,repository:candidateBound.repository,revision:candidateBound.revision},explicitMode:"unspecified",affectedSubsystems:subsystems,expectedPaths:[...originalScope.expectedPaths],requiredArtifacts:[]});
 if(applicability.outcome!=="organic")return {reason:`The controlled worker requires an organic, bounded lifecycle; applicability is ${applicability.outcome}.`};
 if(!plan.routeEvidence)return {reason:"The writer route lacks candidate-bound ODD evidence."};
 const admission=issueOrganicWriterAdmission(applicability,exactSurfaces);
 return {candidate:candidateBound,writeSurfaces:exactSurfaces,instruction:task.description,taskIdentity:facts.taskIdentity,routeEvidence:plan.routeEvidence,workerSelection:metadata.skillSelection,admission};
}

/** Dispatches one dependency-ready plan task. Writes require a fresh exact candidate, ODD scope, and one-use user approval. */
export async function dispatchNextPlanTask(input:DispatchInput):Promise<DispatchResult>{
 const context:TodoContext={sessionId:input.identity.sessionId,projectId:input.identity.projectId};
 const rows=await input.todos.list(context),byId=new Map(rows.map(row=>[row.taskId,row]));
 const ready=rows.filter(row=>row.requestId?.startsWith("asen-plan:")&&row.current.state==="planned"&&(row.dependsOn??[]).every(id=>byId.get(id)?.current.state==="done"));
 if(!ready.length)return {status:"blocked",reason:"No persisted plan task is dependency-ready; complete independent verification or resolve the plan clarification first."};
 ready.sort((a,b)=>(a.plan?.priority??Number.MAX_SAFE_INTEGER)-(b.plan?.priority??Number.MAX_SAFE_INTEGER));
 const task=ready[0]!;
 if(!task.plan)return {status:"blocked",reason:"The next plan task has no persisted role or skill selection."};
 const role=task.plan.role;
 if(!readOnlyRoles.includes(role as ReadOnlyRole)&&role!=="worker")return {status:"blocked",reason:`The next ready plan task requires a controlled ${role} lifecycle dispatcher; no agent was launched.`};
 if(!task.description)return {status:"blocked",reason:"The persisted plan task has no exact instruction; no agent was launched."};
 if(task.description.length>MAX_VISIBLE_PLAN_INSTRUCTION)return {status:"blocked",reason:"The complete plan instruction exceeds the safe Pi confirmation size; split the task before dispatch."};

 if(role==="worker"){
  const prepared=workerAuthorization(task,input.identity);if("reason" in prepared)return {status:"blocked",reason:prepared.reason};
  const approved=await input.confirm({id:task.taskId,title:task.title,role,instruction:prepared.instruction,writeSurfaces:prepared.writeSurfaces,candidateRevision:prepared.candidate.revision});
  if(!approved)return {status:"blocked",reason:"Pi user declined the exact scoped write authorization; the plan was not changed."};
  await input.validateIdentity();
  const fresh=(await input.todos.list(context)).find(row=>row.taskId===task.taskId);
  if(!fresh||fresh.current.state!=="planned"||fresh.current.revision!==task.current.revision||JSON.stringify(fresh.plan)!==JSON.stringify(task.plan)||fresh.description!==task.description)return {status:"blocked",reason:"The plan task changed while awaiting authorization; refresh the plan before dispatch."};
  let head:string;try{head=currentRevision(input.identity.projectId);}catch{return {status:"blocked",reason:"The project stopped being a readable Git candidate; no writer was launched."};}
  if(head!==prepared.candidate.revision)return {status:"blocked",reason:"The project changed while awaiting authorization; rebuild the plan against the current candidate."};
  await input.validateIdentity();
  const binder=new TrustedTaskAgentBinder(input.todos,input.agents,input.links);
  const agentId=await input.agents.startControlledWorker({taskIdentity:prepared.taskIdentity,prompt:prepared.instruction,session:input.identity,candidate:prepared.candidate,writeSurfaces:prepared.writeSurfaces,skillSelection:prepared.workerSelection,writerAdmission:prepared.admission,routeEvidence:prepared.routeEvidence,onQueued:async(id,dispatch)=>{await input.validateIdentity();await binder.launch(fresh.taskId,id,input.identity,dispatch,input.validateIdentity);}});
  return {status:"dispatched",todoId:task.taskId,agentId,role};
 }

 const readRole=role as ReadOnlyRole,selection=task.plan.skillSelection;
 if(!selection||selection.phase!==phaseFor[readRole])return {status:"blocked",reason:`The planned ${readRole} task lacks its exact read-only skill selection; rebuild the plan.`};
 const currentPaths=selectSkills(selection).map(skill=>skill.path);
 if(currentPaths.length!==task.plan.skillPaths.length||currentPaths.some((value,index)=>value!==task.plan!.skillPaths[index]))return {status:"blocked",reason:"The persisted skill registry selection changed; rebuild the plan before dispatch."};
 const approved=await input.confirm({id:task.taskId,title:task.title,role,instruction:task.description});
 if(!approved)return {status:"blocked",reason:"Pi user declined dispatch; the plan was not changed."};
 await input.validateIdentity();
 const fresh=(await input.todos.list(context)).find(row=>row.taskId===task.taskId);
 if(!fresh||fresh.current.state!=="planned"||fresh.current.revision!==task.current.revision)return {status:"blocked",reason:"The plan task changed while awaiting confirmation; refresh the plan before dispatch."};
 await input.validateIdentity();
 const binder=new TrustedTaskAgentBinder(input.todos,input.agents,input.links);
 const agentId=await input.agents.startReadOnly({role:readRole,prompt:fresh.description!,session:input.identity,skillSelection:selection,onQueued:async(id,dispatch)=>{await input.validateIdentity();await binder.launch(fresh.taskId,id,input.identity,dispatch,input.validateIdentity);}});
 return {status:"dispatched",todoId:task.taskId,agentId,role:readRole};
}

/** @deprecated Use dispatchNextPlanTask; retained for callers that explicitly require read-only plans. */
export async function dispatchNextReadOnlyPlanTask(input:DispatchInput):Promise<DispatchResult>{return dispatchNextPlanTask(input);}
