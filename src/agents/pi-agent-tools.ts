import {AgentProjectAccess} from "./agent-project-access.js";
import {realpath} from "node:fs/promises";
import {isAbsolute,resolve} from "node:path";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import type {AgentRuntime} from "./agent-runtime.js";
import type {AgentSessionIdentity} from "./agent-runtime.js";
import type {TrustedTaskAgentBinder} from "../runtime/trusted-task-agent-binder.js";
import type {TaskAgentLinkStore} from "../runtime/task-agent-link-store.js";
import type {SessionTodoStore} from "../runtime/todo-store.js";
import {selectSkills,type SkillSelectionContext} from "../skills/registry.js";
import {dispatchNextPlanTask} from "../runtime/plan-dispatcher.js";

const text={type:"string",minLength:1,maxLength:32000};
const rootSchema={type:"string",minLength:1,maxLength:4096};
const idSchema={type:"string",minLength:1,maxLength:1024};
const MAX_VISIBLE_AGENT_INSTRUCTION=4096;
function cancelled():Error{const error=new Error("Agent task cancelled");error.name="AbortError";return error;}
function throwIfCancelled(signal?:AbortSignal):void{if(signal?.aborted)throw cancelled();}
async function confirmWithAbort(confirm:(signal?:AbortSignal)=>Promise<boolean>,signal?:AbortSignal):Promise<boolean>{
 throwIfCancelled(signal);if(!signal)return confirm();let onAbort!:()=>void;
 const aborted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(cancelled());signal.addEventListener("abort",onAbort,{once:true});if(signal.aborted)onAbort();});
 try{const result=await Promise.race([Promise.resolve().then(()=>confirm(signal)),aborted]);throwIfCancelled(signal);return result;}finally{signal.removeEventListener("abort",onAbort);}
}
const result=(value:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(value)}],details:value});
async function identity(context:any):Promise<AgentSessionIdentity>{
 const sessionId=context?.sessionManager?.getSessionId?.(),cwd=context?.cwd;
 if(typeof sessionId!=="string"||!sessionId||sessionId!==sessionId.trim()||typeof cwd!=="string"||!isAbsolute(cwd))throw new Error("ASEN agent tools require the active Pi session and project");
 return {sessionId,projectId:await realpath(resolve(cwd))};
}
export const ASEN_AGENT_TOOL_NAMES=Object.freeze(["asen_agent_start","asen_agent_status","asen_agent_cancel","asen_agent_continue","asen_agent_retry","asen_plan_dispatch_next"] as const);
/** Exposes only read-only explorer work by default; write agents require an internal fresh ASEN grant. */
export function registerAgentTools(pi:{registerTool?:(tool:ToolDefinition<any>)=>void},runtime:()=>Promise<AgentRuntime>,todoLink?:{todos:()=>Promise<SessionTodoStore>;binder:()=>Promise<TrustedTaskAgentBinder>;links:()=>Promise<TaskAgentLinkStore>}):()=>void{
 const access=new AgentProjectAccess();
 const selectedIdentity=async(root:unknown,context:any,launch:boolean,signal?:AbortSignal)=>access.resolve(root,context,await identity(context),launch,()=>confirmWithAbort(dialogSignal=>context.ui.confirm("Authorize another project?",`Start a read-only ASEN agent in ${String(root)}? Access applies only to this live session and project.`,dialogSignal?{signal:dialogSignal}:undefined),signal),signal);
 pi.registerTool?.({name:"asen_agent_start",label:"Start ASEN agent",description:"Queue an isolated, read-only Pi agent task in the current session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["prompt"],properties:{prompt:text,root:rootSchema,todoId:idSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);
  const prompt=(params as {prompt?:unknown})?.prompt;if(typeof prompt!=="string"||!prompt.trim()||prompt.length>32000)throw new Error("Invalid agent prompt");
  const session=await selectedIdentity((params as {root?:unknown}).root,context,true,signal);
  const todoId=(params as {todoId?:unknown}).todoId;
  let dispatchRole:"explorer"|"reviewer"|"verifier"="explorer";
  let planSkillSelection:SkillSelectionContext|undefined;
  if(todoId!==undefined){
   if(typeof todoId!=="string"||!todoId.trim()||!todoLink)throw new Error("Todo binding is unavailable");
   const task=(await (await todoLink.todos()).list(session)).find(item=>item.taskId===todoId);
   if(!task||task.current.state==="done"||task.current.state==="cancelled"||task.current.state==="blocked")throw new Error("Todo must be an active, owned task before agent launch");
   if(task.description&&prompt!==task.description)throw new Error("A planned Todo agent must receive the exact persisted task instruction");
   if(task.plan){if(task.plan.role!=="explorer"&&task.plan.role!=="reviewer"&&task.plan.role!=="verifier")throw new Error(`Planned ${task.plan.role} work requires a controlled ${task.plan.role} dispatcher`);const expectedPhase={explorer:"explore",reviewer:"adversarial-review",verifier:"verify"}[task.plan.role];if(task.plan.skillSelection?.phase!==expectedPhase)throw new Error(`Planned ${task.plan.role} Todo is missing its exact ASEN skill selection`);const expectedPaths=selectSkills(task.plan.skillSelection).map(skill=>skill.path);if(expectedPaths.length!==task.plan.skillPaths.length||expectedPaths.some((path,index)=>path!==task.plan!.skillPaths[index]))throw new Error("Persisted ASEN skill registry selection changed; rebuild this plan before dispatch");dispatchRole=task.plan.role;planSkillSelection=task.plan.skillSelection;}
  }
  throwIfCancelled(signal);
  const active=await runtime(),taskId=await active.startReadOnly({role:dispatchRole,prompt,session,...(planSkillSelection?{skillSelection:planSkillSelection}:{}),...(typeof todoId==="string"?{onQueued:async(agentId:string,dispatch:()=>void)=>{const validate=async()=>{const current=await identity(context);if(current.sessionId!==session.sessionId||current.projectId!==session.projectId)throw new Error("Pi session or project changed before Todo agent dispatch");};await validate();await (await todoLink!.binder()).launch(todoId,agentId,session,dispatch,validate);}}:{})},signal);
  return result({id:taskId,state:"queued",role:dispatchRole,...(typeof todoId==="string"?{todoId}:{})});
 }});
 pi.registerTool?.({name:"asen_agent_status",label:"ASEN agent status",description:"List owned agent tasks, or query one task and its durable state history by id.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,properties:{id:idSchema,root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);
  const taskId=(params as {id?:unknown})?.id;
  if(taskId!==undefined&&(typeof taskId!=="string"||!taskId.trim()||taskId.length>1024))throw new Error("Invalid agent task id");
  const active=await runtime(),session=await selectedIdentity((params as {root?:unknown}).root,context,false,signal);throwIfCancelled(signal);
  if(typeof taskId==="string")return result({id:taskId,task:await active.query(taskId,session)});
  const rows=await active.list(session);
  return result(rows.map(({id,role,state,createdAt,updatedAt,summary})=>({id,role,state,createdAt,updatedAt,...(summary?{summary}:{})})));
 }});
 pi.registerTool?.({name:"asen_agent_cancel",label:"Cancel ASEN agent",description:"Cancel a queued or running task owned by the current Pi session and project.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id"],properties:{id:idSchema,root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);const taskId=(params as {id?:unknown})?.id;if(typeof taskId!=="string")throw new Error("Invalid agent task id");const active=await runtime();return result({id:taskId,cancelled:await active.cancel(taskId,await selectedIdentity((params as {root?:unknown}).root,context,false,signal))});
 }});
 pi.registerTool?.({name:"asen_agent_continue",label:"Continue ASEN agent",description:"After the user asks to continue, resume only an interrupted read-only explorer whose saved identity matches the current Pi session and project. Never use this for failed, cancelled, reviewer, verifier, or writer tasks.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id"],properties:{id:idSchema,root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);const taskId=(params as {id?:unknown})?.id;if(typeof taskId!=="string")throw new Error("Invalid agent task id");const session=await selectedIdentity((params as {root?:unknown}).root,context,false,signal);throwIfCancelled(signal);
  const active=await runtime(),prior=await active.query(taskId,session);
  if(!prior)throw new Error("Agent task is unavailable to this session or project");
  if(prior.record.state!=="interrupted"||prior.record.role!=="explorer"||prior.record.sessionId!==session.sessionId||prior.record.projectId!==session.projectId)throw new Error("Only an interrupted read-only explorer in the current session and project can continue automatically");
  const link=todoLink?(await (await todoLink.links()).list(session)).find(item=>item.agentId===taskId):undefined;
  const todos=link&&todoLink?await todoLink.todos():undefined;
  const todo=link&&todos?(await todos.list(session)).find(item=>item.taskId===link.taskId):undefined;
  if(link&&(!todo||todo.current.state!=="blocked"||!/(?:restarted|session ended|interrupted)/iu.test(todo.current.reason??"")||todo.plan&&todo.plan.role!=="explorer"))throw new Error("A linked Todo must match this interrupted read-only explorer before it can continue");
  throwIfCancelled(signal);const confirmedIdentity=await identity(context);if(confirmedIdentity.sessionId!==session.sessionId||confirmedIdentity.projectId!==session.projectId)throw new Error("Pi session or project changed before agent continuation");
  const resumed=link&&todo&&todos?await todos.update(todo.taskId,session,todo.current.revision,"running","User asked ASEN to continue this persisted read-only task in the same session and project",signal):undefined;
  try{
   const next=await active.continue(taskId,session,signal,link&&todoLink?async(agentId,dispatch)=>{const validate=async()=>{const current=await identity(context);if(current.sessionId!==session.sessionId||current.projectId!==session.projectId)throw new Error("Pi session or project changed before agent continuation dispatch");};await validate();await (await todoLink!.binder()).launch(link.taskId,agentId,session,dispatch,validate);}:undefined);
   return result({id:next,state:"queued",continuedFrom:taskId,role:"explorer",...(link?{todoId:link.taskId}:{} )});
  }catch(error){
   if(resumed&&todos){const current=(await todos.list(session)).find(item=>item.taskId===resumed.taskId);if(current?.current.state==="running")await todos.update(current.taskId,session,current.current.revision,"blocked","Linked agent continuation was not dispatched; review is required",undefined).catch(()=>{});}
   throw error;
  }
 }});
 pi.registerTool?.({name:"asen_agent_retry",label:"Retry failed ASEN plan task",description:"After explicit Pi UI confirmation, create one new read-only attempt for a failed linked Todo task; writes and cancelled tasks are not retried.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,required:["id"],properties:{id:idSchema,root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);const agentId=(params as {id?:unknown})?.id;if(typeof agentId!=="string"||!agentId.trim()||!todoLink)throw new Error("Retry requires a linked ASEN Todo agent");
  const session=await selectedIdentity((params as {root?:unknown}).root,context,true,signal),[links,todos,active]=await Promise.all([todoLink.links(),todoLink.todos(),runtime()]);
  const link=(await links.list(session)).find(item=>item.agentId===agentId);if(!link)throw new Error("Retry requires a Todo-agent link owned by this session and project");
  const todo=(await todos.list(session)).find(item=>item.taskId===link.taskId),prior=await active.query(agentId,session);
  if(!todo||todo.current.state!=="blocked"||!todo.description)throw new Error("Retry requires a blocked Todo with its exact persisted instruction");const instruction=todo.description;
  if(instruction.length>MAX_VISIBLE_AGENT_INSTRUCTION)throw new Error("The complete saved instruction exceeds the safe Pi confirmation size; split the task before retrying.");
  const attempts=(await links.list(session)).filter(item=>item.taskId===link.taskId);if(attempts.length!==1||attempts[0]?.agentId!==agentId)throw new Error("This Todo already used its single controlled retry; review the result and create a new plan if needed");
  if(!prior||prior.record.state!=="failed"||!(["explorer","reviewer","verifier"] as const).includes(prior.record.role as "explorer"|"reviewer"|"verifier"))throw new Error("Only a failed read-only agent may be retried; interrupted work requires explicit continuation");
  const role=prior.record.role as "explorer"|"reviewer"|"verifier",selection=todo.plan?.skillSelection;
  if(todo.plan&&(todo.plan.role!==role||!selection||selection.phase!==({explorer:"explore",reviewer:"adversarial-review",verifier:"verify"} as const)[role]))throw new Error("Failed agent does not match the persisted read-only plan role and skill phase");
  if(selection){const expected=selectSkills(selection).map(skill=>skill.path);if(expected.length!==todo.plan!.skillPaths.length||expected.some((value,index)=>value!==todo.plan!.skillPaths[index]))throw new Error("Persisted ASEN skill registry selection changed; rebuild this plan before retry");}
  if(context?.hasUI!==true||typeof context?.ui?.confirm!=="function"||!await confirmWithAbort(dialogSignal=>context.ui.confirm("Retry failed ASEN task?",`${todo.title}\n\nThe previous read-only attempt failed. Start one new attempt with the exact saved instruction and bind it to this Todo?\n\n${instruction}`,dialogSignal?{signal:dialogSignal}:undefined),signal))throw new Error("Explicit Pi UI confirmation is required to retry a failed task");
  throwIfCancelled(signal);const confirmedIdentity=await identity(context);if(confirmedIdentity.sessionId!==session.sessionId||confirmedIdentity.projectId!==session.projectId)throw new Error("Pi session or project changed before agent retry");
  const fresh=(await todos.list(session)).find(item=>item.taskId===todo.taskId),latest=await active.query(agentId,session);
  if(!fresh||fresh.current.state!=="blocked"||fresh.current.revision!==todo.current.revision||!latest||latest.record.state!=="failed")throw new Error("Failed Todo or agent changed during retry confirmation; refresh before retry");
  const resumed=await todos.update(todo.taskId,session,todo.current.revision,"running","User confirmed a new read-only retry in Pi UI",signal);
  try{
   const next=await active.startReadOnly({role,prompt:instruction,session,...(selection?{skillSelection:selection}:{}),onQueued:async(id,dispatch)=>{const validate=async()=>{const currentIdentity=await identity(context);if(currentIdentity.sessionId!==session.sessionId||currentIdentity.projectId!==session.projectId)throw new Error("Pi session or project changed before agent retry dispatch");};await validate();await (await todoLink.binder()).launch(todo.taskId,id,session,dispatch,validate);}},signal);
   return result({id:next,state:"queued",retriedFrom:agentId,role,todoId:todo.taskId});
  }catch(error){const current=(await todos.list(session)).find(item=>item.taskId===todo.taskId);if(current?.current.state==="running")await todos.update(current.taskId,session,current.current.revision,"blocked","Read-only retry was not dispatched; review is required",undefined).catch(()=>{});throw error;}
 }});
 pi.registerTool?.({name:"asen_plan_dispatch_next",label:"Dispatch next ASEN plan task",description:"After explicit Pi UI confirmation, dispatch one dependency-ready persisted plan task. Read-only exploration and structured passing reviews can complete automatically. Writer tasks require a fresh candidate, exact ODD file scope and one-use authorization; failed or interrupted work pauses for review.",executionMode:"sequential",parameters:{type:"object",additionalProperties:false,properties:{root:rootSchema}},execute:async(_id,params,signal,_update,context)=>{
  throwIfCancelled(signal);const session=await selectedIdentity((params as {root?:unknown}).root,context,true,signal);
  if(context?.hasUI!==true||typeof context?.ui?.confirm!=="function")throw new Error("Interactive Pi UI confirmation is required to dispatch a planned task");
  if(!todoLink)throw new Error("ASEN plan dispatch requires the session Todo and durable task-agent link stores");
  const [todos,links,runtimeValue]=await Promise.all([todoLink.todos(),todoLink.links(),runtime()]);
  const validateIdentity=async()=>{const current=await identity(context);if(current.sessionId!==session.sessionId||current.projectId!==session.projectId)throw new Error("Pi session or project changed before plan task dispatch");};
  const dispatched=await dispatchNextPlanTask({todos,agents:runtimeValue,links,identity:session,validateIdentity,confirm:async task=>confirmWithAbort(dialogSignal=>context.ui.confirm(task.writeSurfaces?"Authorize scoped ASEN write?":"Dispatch next ASEN plan task?",`${task.title} (${task.role})\n\n${task.instruction}${task.writeSurfaces?`\n\nCandidate: ${task.candidateRevision}\nAuthorized write surfaces (only): ${task.writeSurfaces.join(", ")}\nFailure rule: stop without commit or merge; leave scoped changes for review.\n\nAuthorize this single worker run in the current session and project?`:"\n\nStart this read-only task in the current session and project?"}`,dialogSignal?{signal:dialogSignal}:undefined),signal)});
  return result(dispatched);
 }});
 return ()=>access.reset();
}
