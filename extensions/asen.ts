import {RegistryLifecycle,registryStartupDisabled,type RegistryLifecycleOptions} from "../src/skills/registry-lifecycle.js";
import {access,lstat,readFile,realpath} from "node:fs/promises";
import {W_OK,X_OK} from "node:constants";
import {homedir} from "node:os";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {refreshSkillRegistry,type SkillRegistryMirror} from "../src/skills/generated-registry.js";
import type {SkillSource} from "../src/skills/discovery.js";
import {claimWorkflowSelection,readWorkflowSelection,registerWorkflowSelectionCommand} from "../src/lifecycle/workflow-selection.js";
import {decideLifecycleApplicability,decideLifecycleApplicabilityWithSelection,type LifecycleApplicability,type LifecycleApplicabilityInput} from "../src/lifecycle/applicability.js";
import type {OddRouteDecision} from "../src/flow/odd-routing.js";
import {claimedOrchestrationRouteContext} from "../src/orchestration/orchestrator.js";
import type {ExecutablePlan} from "../src/orchestration/executable-plan.js";
import {registerOrdinaryReviewCommand,type OrdinaryReviewCommandController} from "../src/review/ordinary-review-command.js";
import {deriveOddExecutionContract,type OddExecutionContract} from "../src/flow/odd-execution-contract.js";
import {trackOddTask,resumeOddTask,appendOddTaskEvent,type OddProgress} from "../src/flow/odd-task-tracking.js";
import type {MemoryContext} from "../src/memory/context.js";import type {MemoryStore} from "../src/memory/types.js";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
import {ASEN_MEMORY_GUIDANCE,ASEN_MEMORY_GUIDANCE_SECTION,ASEN_MEMORY_TOOL_NAMES,createPiMemoryBinding,finishPiMemorySession,preparePrivateMemoryDirectory,projectMemoryContext,registerPiMemoryTools,type PiMemoryBinding,type PiMemoryStore} from "../src/memory/pi-integration.js";
import type {TaskEvent} from "../src/runtime/task-replay.js";
import {ALL_INTERACTION_TOOL_NAMES,registerInteractionTools} from "../src/interaction/pi-tools.js";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import {ASEN_CODEGRAPH_TOOL_NAME,ASEN_CODE_INTELLIGENCE_TOOL_NAME,registerCodeGraphTools,type CodeIntelligenceOptions} from "../src/interaction/code-intelligence.js";
import {statusLines,type AsenStatusInput} from "../src/runtime/status.js";
import {doctorChecks,doctorExitCode} from "../src/runtime/doctor.js";
import {controlledInstructionPlanCommand,routePreviewCommand} from "../src/runtime/route-command.js";
import {ASEN_COMMAND_CATALOG} from "../src/runtime/command-catalog.js";
import {agentStatusRows,type PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";
import {findPotentialWorkspaceConflicts,visibleWorkspaceConflictRows,visibleWorkspaceRows,type WorkspaceChange} from "../src/runtime/workspace-attribution.js";
import {readProfilesFile} from "../src/runtime/profile-store.js";
import {parseHistoryStore,emptyHistoryStore} from "../src/runtime/history-store.js";
import {parseUsageFile,emptyUsageFile} from "../src/runtime/usage-store.js";
import {runHistoryCommand,recordHistoryInput,type HistoryCommandResult} from "../src/runtime/history-command.js";
import {runUsageCommand} from "../src/runtime/usage-command.js";
import {runPiHistoryStatsCommand} from "../src/stats/pi-history-command.js";
import {incrementUsageFile} from "../src/runtime/usage-store.js";
import {VERSION,type ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {validatePiHost,validatePiRegistrationCollisions,validatePiExecutionContext} from "../src/runtime/pi-host.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {Candidate} from "../src/core/types.js";
import {PiProcessRunner,type PiProviderCredential} from "../src/agents/pi-process-runner.js";
import type {AgentRunner} from "../src/agents/dispatcher.js";
import {registerAgentTools,ASEN_AGENT_TOOL_NAMES} from "../src/agents/pi-agent-tools.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {TaskAgentCoordinator} from "../src/runtime/task-agent-coordinator.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {TrustedTaskAgentBinder} from "../src/runtime/trusted-task-agent-binder.js";
import {TaskAgentTodoReconciler} from "../src/runtime/task-agent-reconciler.js";
import {dispatchNextPlanTask} from "../src/runtime/plan-dispatcher.js";
import {registerTodoTools,ASEN_TODO_TOOL_NAMES} from "../src/runtime/pi-todo-tools.js";
import {PersistentWorkspaceStore} from "../src/runtime/workspace-store.js";
import {todoProgressSummary,todoStatusRows} from "../src/runtime/todo-presentation.js";
import {addAsenRequestGuidance} from "../src/runtime/request-guidance.js";
import {ASEN_PLAN_REQUEST_TOOL,registerAsenPlanRequestTool} from "../src/runtime/natural-plan-tool.js";
import {formatActivePlanContext} from "../src/runtime/plan-context.js";

type CommandContext={cwd:string;hasUI?:boolean;signal?:AbortSignal|undefined;sessionManager?:{getSessionId?:()=>string;getSessionDir?:()=>string};ui:{notify(message:string,level:"info"|"error"):void;select?:(title:string,options:string[],opts?:{signal?:AbortSignal})=>Promise<string|undefined>;confirm?:(title:string,message:string)=>Promise<boolean>}};
type PiLike={getCommands?:()=>readonly {name:string}[];on?:(event:string,handler:(...args:any[])=>unknown)=>void;getFlag?:(name:string)=>unknown;registerCommand?:(name:string,command:{description:string;handler:(...args:any[])=>unknown})=>void;registerTool?:(tool:ToolDefinition<any>)=>void};
type Refresh=typeof refreshSkillRegistry;
const activationRegistryKey=Symbol.for("asen.pi.activation.registry.v1");
const activationRegistryRoot=globalThis as typeof globalThis&{[activationRegistryKey]?:WeakSet<object>};
const activatedPiHosts=activationRegistryRoot[activationRegistryKey]??(activationRegistryRoot[activationRegistryKey]=new WeakSet<object>());
export interface AsenExtensionDependencies {homeDir?:()=>string;packageRoot?:string;refresh?:Refresh;mirror?:SkillRegistryMirror;interactionTimeoutMs?:number;codeIntelligence?:CodeIntelligenceOptions;registryLifecycle?:Pick<RegistryLifecycleOptions,"watch"|"debounceMs">;status?:()=>AsenStatusInput;doctor?:()=>Parameters<typeof doctorChecks>[0];agents?:()=>readonly PublicAgentRecord[];changes?:()=>readonly WorkspaceChange[];profilesFile?:string;deferSessionStart?:boolean;autoAdvancePlans?:boolean;enableAgentRuntime?:boolean;agentStoreFile?:string;agentRunner?:AgentRunner;agentProviderCredential?:PiProviderCredential;agentMaxConcurrency?:number;agentRuntimeFactory?:()=>Promise<AgentRuntime>;enableTodoRuntime?:boolean;todoStoreFile?:string;todoStoreFactory?:()=>Promise<SessionTodoStore>;enableWorkspaceRuntime?:boolean;workspaceStoreFile?:string;workspaceStoreFactory?:()=>Promise<PersistentWorkspaceStore>;enableMemoryRuntime?:boolean;memoryStoreFile?:string;memoryStoreFactory?:()=>Promise<PiMemoryStore>}
export interface AsenExtensionFacade {review:OrdinaryReviewCommandController;startSession(context:CommandContext):Promise<void>;decideLifecycleApplicability(decision:OddRouteDecision,input:LifecycleApplicabilityInput):LifecycleApplicability;deriveOddExecutionContract(decision:OddRouteDecision):OddExecutionContract;trackOddTask(contract:OddExecutionContract,context:MemoryContext,documentPath:string,input:OddProgress):ReturnType<typeof trackOddTask>;resumeOddTask(contract:OddExecutionContract,store:Pick<MemoryStore,"get">,context:MemoryContext):ReturnType<typeof resumeOddTask>;appendOddTaskEvent(contract:OddExecutionContract,context:MemoryContext,store:Pick<MemoryStore,"get">,event:TaskEvent):ReturnType<typeof appendOddTaskEvent>}

const usage="Usage: /asen-skill-registry refresh";
const productionPackageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
async function privateFileState(file:string):Promise<boolean>{
 let directory;
 try{directory=await lstat(path.dirname(file));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return true;return false;}
 if(directory.isSymbolicLink()||!directory.isDirectory())return false;
 const directoryPrivate=process.platform==="win32"||(directory.mode&0o077)===0;
 let metadata;
 try{metadata=await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return directoryPrivate;return false;}
 if(metadata.isSymbolicLink()||!metadata.isFile())return false;
 return directoryPrivate&&(process.platform==="win32"||(metadata.mode&0o077)===0);
}
async function canonical(value:string):Promise<string>{
 const resolved=path.resolve(value);try{return path.normalize(await realpath(resolved));}catch{return path.normalize(resolved);}
}
function candidateAtHead(repository:string):Candidate|undefined{
 try{
  const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repository,encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2000,windowsHide:true}).trim();
  if(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(revision))return undefined;
  return {id:`asen-${revision.slice(0,12)}`,repository,revision,createdAt:new Date().toISOString()};
 }catch(error){const revision=error&&typeof error==="object"&&"status" in error&&error.status===0&&"stdout" in error?String(error.stdout).trim():"";if(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(revision))return undefined;return {id:`asen-${revision.slice(0,12)}`,repository,revision,createdAt:new Date().toISOString()};}
}
async function sourcesFor(projectRoot:string,homeRoot:string,packageRoot:string):Promise<SkillSource[]>{
 const [canonicalHome,canonicalPackage]=await Promise.all([canonical(homeRoot),canonical(packageRoot)]);
 const configured:SkillSource[]=[
  {id:"project-skills",scope:"project",root:path.join(projectRoot,"skills")},
  {id:"project-agents-skills",scope:"project",root:path.join(projectRoot,".agents","skills")},
  {id:"user-agents-skills",scope:"user",root:path.join(canonicalHome,".agents","skills")},
  {id:"package-skills",scope:"global",root:path.join(canonicalPackage,"skills")},
 ];
 const unique:SkillSource[]=[],seen=new Set<string>();
 for(const source of configured){const root=await canonical(source.root);if(!seen.has(root)){seen.add(root);unique.push({...source,root});}}
 return unique;
}
function safeErrorMessage(error:unknown):string{
 if(!(error instanceof Error))return "Unknown error";
 return error.message.replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim()||"Unknown error";
}

export function createAsenExtension(dependencies:AsenExtensionDependencies={}):(pi:PiLike)=>AsenExtensionFacade {
 const home=dependencies.homeDir??homedir,packageRoot=dependencies.packageRoot??productionPackageRoot,refresh=dependencies.refresh??refreshSkillRegistry;
 return pi=>{
  const register=pi.registerCommand?.bind(pi);
  if(!register)throw new Error("ASEN extension requires Pi command registration");
  const registerData=(name:string,command:{description:string;handler:(...args:any[])=>unknown})=>register(name,{
   ...command,handler:(...args:any[])=>{
    const publish=(result:unknown)=>{
     const ctx=args[1] as CommandContext|undefined;
     if(ctx?.ui?.notify){
      const message=typeof result==="string"?result:Array.isArray(result)&&result.every(row=>typeof row==="string")?result.join("\n"):JSON.stringify(result,null,2);
      ctx.ui.notify(message||"No entries.","info");
     }
     return result;
    };
    const result=command.handler(...args);
    return result instanceof Promise?result.then(publish):publish(result);
   }
  });
  const registryObservations=new Map<string,number>(),registryRefreshGeneration=new Map<string,number>();
  const observedRefresh:Refresh=async options=>{const project=path.resolve(options.projectId),generation=(registryRefreshGeneration.get(project)??0)+1;registryRefreshGeneration.set(project,generation);registryObservations.delete(project);try{const result=await refresh(options);if(registryRefreshGeneration.get(project)===generation)registryObservations.set(project,result.count);return result;}catch(error){if(registryRefreshGeneration.get(project)===generation)registryObservations.delete(project);throw error;}};
  const lifecycle=new RegistryLifecycle({refresh:observedRefresh,prepare:async cwd=>{
   const projectRoot=await realpath(path.resolve(cwd)),sources=await sourcesFor(projectRoot,home(),packageRoot);
   return {projectRoot,projectId:projectRoot,sources,...(dependencies.mirror?{mirror:dependencies.mirror}:{})};
  },...dependencies.registryLifecycle});
  const historyFile=path.join(home(),".asen","history.json"),usageFile=path.join(home(),".asen","usage.json");
  const profilesFile=dependencies.profilesFile??path.join(home(),".asen","profiles.json");
  let agentDeliveryContext:CommandContext|undefined,agentDeliveryIdentity:{sessionId:string;projectId:string}|undefined;
  let unsubscribeAgentDelivery:(()=>void)|undefined;
  const workspaceFile=dependencies.workspaceStoreFile??path.join(home(),".asen","workspace.json");
  const memoryFile=dependencies.memoryStoreFile??path.join(home(),".asen","memory.db");
  const memoryStorePromise=dependencies.memoryStoreFactory?.()??(dependencies.enableMemoryRuntime?(async()=>{await preparePrivateMemoryDirectory(memoryFile);return new SqliteMemoryStore(memoryFile);})():undefined);
  let activeMemory:PiMemoryBinding|undefined,memoryFirstRequest=true;
  const currentMemoryBinding=async(host:unknown):Promise<PiMemoryBinding>=>{
   const context=host as CommandContext|undefined,binding=activeMemory;
   if(!binding||binding.closed||!context?.cwd||context.sessionManager?.getSessionId?.()!==binding.piSessionId||await canonical(context.cwd)!==binding.projectId)throw new Error("ASEN memory is unavailable for this Pi session and project");
   return binding;
  };
  const finishActiveMemory=()=>{if(!activeMemory||activeMemory.closed)return;finishPiMemorySession(activeMemory);activeMemory=undefined;};
  const agentRuntimePromise=dependencies.agentRuntimeFactory?.()??(dependencies.enableAgentRuntime?AgentRuntime.open({storeFile:dependencies.agentStoreFile??path.join(home(),".asen","agents.json"),runner:dependencies.agentRunner??new PiProcessRunner({attributionFile:workspaceFile,policyRoot:packageRoot,...(dependencies.agentProviderCredential?{providerCredential:dependencies.agentProviderCredential}:{})}),...(dependencies.agentMaxConcurrency!==undefined?{maxConcurrency:dependencies.agentMaxConcurrency}:{})}):undefined);
  const getAgentRuntime=async()=>{if(!agentRuntimePromise)throw new Error("ASEN agent runtime is unavailable");return agentRuntimePromise;};
  
  const todoStorePromise=dependencies.todoStoreFactory?.()??(dependencies.enableTodoRuntime?(dependencies.todoStoreFile?SessionTodoStore.open(dependencies.todoStoreFile):SessionTodoStore.openProjectScoped(path.join(home(),".asen","todos"),path.join(home(),".asen","todos.json"))):undefined);
  const taskAgentLinks=agentRuntimePromise&&todoStorePromise?new TaskAgentLinkStore(path.join(home(),".asen","task-agent-links.json")):undefined;
  if(todoStorePromise)registerTodoTools(pi,async()=>todoStorePromise,taskAgentLinks&&agentRuntimePromise?async(taskId,identity)=>{
   const [links,runtime]=await Promise.all([taskAgentLinks.list(identity),agentRuntimePromise]);
   await Promise.all(links.filter(link=>link.taskId===taskId).map(link=>runtime.cancel(link.agentId,identity)));
  }:undefined,taskAgentLinks&&agentRuntimePromise?{links:async()=>taskAgentLinks,agents:async()=>agentRuntimePromise}:undefined,async host=>{await advancePlan(host as CommandContext);});
  if(memoryStorePromise)registerPiMemoryTools(pi,host=>currentMemoryBinding(host));
  const resetAgentProjectAccess=agentRuntimePromise?registerAgentTools(pi,getAgentRuntime,taskAgentLinks&&todoStorePromise?{todos:async()=>todoStorePromise,binder:async()=>new TrustedTaskAgentBinder(await todoStorePromise,await agentRuntimePromise!,taskAgentLinks),links:async()=>taskAgentLinks}:undefined):undefined;
  const workspaceStorePromise=dependencies.workspaceStoreFactory?.()??(dependencies.enableWorkspaceRuntime?PersistentWorkspaceStore.open(workspaceFile):undefined);
  const sessionIdentity=async(ctx:CommandContext)=>{const sessionId=ctx.sessionManager?.getSessionId?.();if(!sessionId)throw new Error("ASEN requires the active Pi session");const projectId=await canonical(ctx.cwd);return {sessionId,projectId,worktree:projectId};};
  const advancingPlans=new Set<string>();
  const advancePlan=async(ctx:CommandContext):Promise<{started:boolean;authorized:boolean;role?:string;title?:string}>=>{
   if(dependencies.autoAdvancePlans===false)return {started:false,authorized:false};
   if(!todoStorePromise||!agentRuntimePromise||!taskAgentLinks)return {started:false,authorized:false};
   const identity=await sessionIdentity(ctx),key=`${identity.sessionId}\0${identity.projectId}`;if(advancingPlans.has(key))return {started:false,authorized:false};advancingPlans.add(key);
   try{
    const [todos,agents]=await Promise.all([todoStorePromise,agentRuntimePromise]);
    const result=await dispatchNextPlanTask({todos,agents,links:taskAgentLinks,identity,autoApproveReadOnly:true,validateIdentity:async()=>{const current=await sessionIdentity(ctx);if(current.sessionId!==identity.sessionId||current.projectId!==identity.projectId)throw new Error("Pi session or project changed during automatic plan advancement");},confirm:async task=>{
     if(task.role==="clarifier")return false;
     if(!task.writeSurfaces)return true;
     if(ctx.hasUI!==true||typeof ctx.ui.confirm!=="function")return false;
     return ctx.ui.confirm("Authorize scoped ASEN write?",`${task.title} (${task.role})\n\n${task.instruction}\n\nCandidate: ${task.candidateRevision}\nAuthorized write surfaces (only): ${task.writeSurfaces.join(", ")}\nFailure rule: stop without commit or merge; leave scoped changes for review.\n\nAuthorize this single worker run in the current session and project?`);
    }});
    const dispatched=result.status==="dispatched",title=dispatched?(await todos.list(identity)).find(task=>task.taskId===result.todoId)?.title:undefined;
    if(dispatched){const labels:Record<string,string>={explorer:"la exploración",worker:"el cambio autorizado",reviewer:"la revisión",verifier:"la verificación"};ctx.ui.notify(`ASEN ha iniciado ${labels[result.role]??"la tarea siguiente"}${title?`: ${title}`:""}.`,"info");}
    return dispatched?{started:true,authorized:result.role==="worker",role:result.role,...(title?{title}:{})}:{started:false,authorized:false};
   }finally{advancingPlans.delete(key);}
  };
  const startSession=async(ctx:CommandContext)=>{
   agentDeliveryContext=undefined;agentDeliveryIdentity=undefined;await lifecycle.start(ctx,registryStartupDisabled(undefined));
   try{
    finishActiveMemory();
    if(memoryStorePromise){const identity=await sessionIdentity(ctx),store=await memoryStorePromise;activeMemory=createPiMemoryBinding(store,identity.projectId,identity.sessionId);memoryFirstRequest=true;}
   }catch(error){activeMemory=undefined;try{ctx.ui.notify(`ASEN no pudo activar la memoria local del proyecto: ${safeErrorMessage(error)}`,"error");}catch{/* Memory remains unavailable without interrupting Pi startup. */}}
   let identity:{sessionId:string;projectId:string}|undefined;const todos=todoStorePromise?await todoStorePromise:undefined;
   if(todos){try{identity=await sessionIdentity(ctx);await todos.recover(identity);}catch{ctx.ui.notify("ASEN no pudo recuperar el estado de las tareas; no ha repetido ninguna.","error");}if(todos.diagnostics())ctx.ui.notify("ASEN aisló un archivo de tareas dañado; no inició ninguna tarea guardada.","error");if(identity){const interrupted=(await todos.list(identity)).filter(item=>item.current.state==="blocked"&&/restarted|session ended|interrupted/iu.test(item.current.reason??""));if(interrupted.length)ctx.ui.notify(todoProgressSummary(interrupted),"info");}}
   if(workspaceStorePromise){const store=await workspaceStorePromise;if(store.diagnostics())ctx.ui.notify("ASEN detectó y aisló datos de atribución dañados.","error");}
   if(agentRuntimePromise){const runtime=await agentRuntimePromise;identity??=await sessionIdentity(ctx);agentDeliveryContext=ctx;agentDeliveryIdentity=identity;
    if(!unsubscribeAgentDelivery)unsubscribeAgentDelivery=runtime.subscribeTerminal(record=>{
     const current=agentDeliveryContext,active=agentDeliveryIdentity;if(!current||!active||record.sessionId!==active.sessionId||record.projectId!==active.projectId||current.sessionManager?.getSessionId?.()!==active.sessionId)return;
     const roleLabels:Record<string,string>={primary:"la tarea",explorer:"la exploración",worker:"el cambio",reviewer:"la revisión",verifier:"la verificación",clarifier:"la aclaración"};
     const completed=record.state==="completed",failed=record.state==="failed";current.ui.notify(completed?`ASEN terminó ${roleLabels[record.role]??"una tarea"}; comprobará el resultado antes de cerrar el plan.`:failed?`ASEN no pudo completar ${roleLabels[record.role]??"una tarea"}. Si quieres reintentarlo, di «continúa» y revisaré el estado primero.`:`ASEN pausó ${roleLabels[record.role]??"una tarea"}. Di «continúa» cuando quieras que revise cómo retomarla.`,completed?"info":"error");
     if(todoStorePromise&&taskAgentLinks)void Promise.all([todoStorePromise,agentRuntimePromise]).then(async([store,agents])=>{await new TaskAgentTodoReconciler(store,agents!,taskAgentLinks).reconcile({sessionId:record.sessionId,projectId:record.projectId});const latest=agentDeliveryContext,currentIdentity=agentDeliveryIdentity;if(latest&&currentIdentity&&record.sessionId===currentIdentity.sessionId&&record.projectId===currentIdentity.projectId&&latest.sessionManager?.getSessionId?.()===currentIdentity.sessionId){await advancePlan(latest);const rows=await store.list(currentIdentity);if(rows.length)latest.ui.notify(todoProgressSummary(rows),"info");else{const archived=await store.archived(currentIdentity);if(archived.length)latest.ui.notify(todoProgressSummary(archived),"info");}}}).catch(()=>{});
    });
    const records=await runtime.list(identity),recoverable=records.filter(record=>record.state==="queued"||record.state==="interrupted");if(runtime.quarantined)ctx.ui.notify("ASEN aisló datos de agentes dañados; no inició tareas guardadas.","error");if(recoverable.length)ctx.ui.notify(`Hay ${recoverable.length} tarea(s) pausada(s). Si quieres retomarlas, di «continúa»; ASEN comprobará cada estado y pedirá confirmación cuando corresponda. No repetirá trabajo automáticamente.`,"info");
    try{await advancePlan(ctx);}catch{ctx.ui.notify("ASEN no pudo avanzar el plan automáticamente. Di «continúa» y revisaré el estado antes de reintentarlo.","error");}
   }
   try{await incrementUsageFile(usageFile,"sessions");}catch{try{ctx.ui.notify("ASEN no pudo guardar el uso local.","error");}catch{/* Notification is best-effort when the UI is unavailable. */}}
  };
  if(!dependencies.deferSessionStart)pi.on?.("session_start",async(_event,ctx)=>startSession(ctx));
  pi.on?.("session_shutdown",async(_event,ctx)=>{agentDeliveryContext=undefined;agentDeliveryIdentity=undefined;resetAgentProjectAccess?.();unsubscribeAgentDelivery?.();unsubscribeAgentDelivery=undefined;if(todoStorePromise&&ctx?.sessionManager?.getSessionId?.()&&ctx?.cwd)try{await (await todoStorePromise).recover(await sessionIdentity(ctx),"shutdown");}catch{try{ctx.ui.notify("ASEN could not safely block running Todo tasks when the session ended.","error");}catch{/* Shutdown must continue when the UI is unavailable. */}}if(agentRuntimePromise&&ctx?.sessionManager?.getSessionId?.()&&ctx?.cwd)try{const runtime=await agentRuntimePromise;await runtime.cancelSessionProjects(ctx.sessionManager.getSessionId());}catch{/* Lifecycle shutdown still runs after best-effort agent cancellation. */}try{finishActiveMemory();}catch(error){try{ctx?.ui?.notify(`ASEN no pudo cerrar la sesión de memoria: ${safeErrorMessage(error)}`,"error");}catch{/* Shutdown continues after best-effort memory finalization. */}}if(memoryStorePromise)try{(await memoryStorePromise).close();}catch{/* Shutdown continues after best-effort memory close. */}await lifecycle.shutdown();});
  pi.on?.("input",async(event,ctx)=>{
   const text=typeof event?.text==="string"?event.text:"",sessionId=ctx.sessionManager?.getSessionId?.();
   if(event?.source!=="interactive"&&event?.source!=="rpc")return;
   if(text.startsWith("/")){try{await incrementUsageFile(usageFile,"commands");}catch{try{ctx.ui.notify("ASEN local usage could not be saved.","error");}catch{/* Notification is best-effort when the UI is unavailable. */}}return;}
   if(!sessionId)return;
   try{await recordHistoryInput({storePath:historyFile,projectId:await canonical(ctx.cwd),sessionId,hasUI:ctx.hasUI===true},text);}
   catch{try{ctx.ui.notify("ASEN private history could not be saved; your input was not changed.","error");}catch{/* Notification is best-effort when the UI is unavailable. */}}
  });
  pi.on?.("turn_start",async()=>{try{await incrementUsageFile(usageFile,"agentRuns");}catch{/* Usage accounting must not interrupt the host turn. */}});
  registerInteractionTools(pi,dependencies.interactionTimeoutMs);
  if(pi.registerTool)registerCodeGraphTools({registerTool:pi.registerTool.bind(pi)},dependencies.codeIntelligence);
  pi.on?.("before_agent_start",async(event,ctx)=>{
   const options=(event as {systemPromptOptions?:{sections?:Record<string,string>}}|undefined)?.systemPromptOptions;
   if(options?.sections){
    delete options.sections.asen_request_handling;
    delete options.sections.asen_project_memory;
    delete options.sections.asen_project_memory_context;
    delete options.sections.asen_active_plan;
    addAsenRequestGuidance(options,!!pi.registerTool);
    if(memoryStorePromise){options.sections[ASEN_MEMORY_GUIDANCE_SECTION]=ASEN_MEMORY_GUIDANCE;try{const binding=await currentMemoryBinding(ctx);const context=projectMemoryContext(binding,(event as {prompt?:string}).prompt??"",memoryFirstRequest,4096);memoryFirstRequest=false;if(context)options.sections.asen_project_memory_context=context;}catch{/* Missing or mismatched session identity never exposes stored context or blocks the requested turn. */}}
    if(todoStorePromise)try{
     const context=ctx as CommandContext,manager=context.sessionManager,cwd=context.cwd,identity=await sessionIdentity(context),rows=await (await todoStorePromise).list(identity);
     if(context.sessionManager===manager&&manager?.getSessionId?.()===identity.sessionId&&context.cwd===cwd){
      const current=await sessionIdentity(context);
      if(current.sessionId===identity.sessionId&&current.projectId===identity.projectId){const planContext=formatActivePlanContext(rows);if(planContext)options.sections.asen_active_plan=planContext;}
     }
    }catch{/* Task context is read-only and optional; identity or storage failures never block the user's turn. */}
   }
  });
  registerData("asen",{description:"Show ASEN harness status",handler:()=>({product:"ASEN",mode:"pi-native",status:"ready",principle:"ASEN extends Pi; it does not replace Pi."})});
  registerData("asen-commands",{description:"List ASEN public commands",handler:()=>ASEN_COMMAND_CATALOG.map(c=>({name:c.name,group:c.group,implemented:c.implemented}))});
  registerData("asen-status",{description:"Show bounded local ASEN status",handler:async(_args:string|undefined,ctx:CommandContext|undefined)=>{
   if(dependencies.status)return statusLines(dependencies.status());
   let agents:readonly PublicAgentRecord[]=[],changes:readonly WorkspaceChange[]=[],agentsAvailable=false,changesAvailable=false;
   if(agentRuntimePromise&&ctx){const rows=await (await agentRuntimePromise).list(await sessionIdentity(ctx));agents=rows;agentsAvailable=true;}else if(dependencies.agents){agents=dependencies.agents();agentsAvailable=true;}
   if(workspaceStorePromise&&ctx){changes=(await (await workspaceStorePromise).list(await sessionIdentity(ctx))).map(row=>row.change);changesAvailable=true;}else if(dependencies.changes){changes=dependencies.changes();changesAvailable=true;}
   const readPrivateStore=async<T>(file:string,parse:(raw:string)=>T,empty:()=>T):Promise<T>=>{if(!await privateFileState(file))throw new Error("ASEN private state is not safe to read");try{return parse(await readFile(file,"utf8"));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return empty();throw error;}};
   const [project,profiles,history,usage]=await Promise.all([ctx?.cwd?canonical(ctx.cwd):Promise.resolve(undefined),readProfilesFile(profilesFile),readPrivateStore(historyFile,parseHistoryStore,emptyHistoryStore),readPrivateStore(usageFile,parseUsageFile,emptyUsageFile)]),registrySkillCount=project?registryObservations.get(project):undefined;
   return statusLines({agents,changes,agentsAvailable,changesAvailable,skills:{enabled:registrySkillCount!==undefined,count:registrySkillCount??null},profile:profiles.active??"default",historyEnabled:history.policy.enabled,telemetryEnabled:usage.telemetryConsent?.enabled===true});
  }});
  registerData("asen-doctor",{description:"Check local ASEN invariants",handler:async(_args:string|undefined,ctx:CommandContext|undefined)=>{
   let input:Parameters<typeof doctorChecks>[0];
   if(dependencies.doctor)input=dependencies.doctor();
   else{
    let homeWritable=false,profileValid=false,telemetryConsentValid=false,registryAvailable=false;
    try{await access(home(),W_OK|X_OK);homeWritable=true;}catch{}
    try{await readProfilesFile(profilesFile);profileValid=true;}catch{}
    try{if(await privateFileState(usageFile)){const raw=await readFile(usageFile,"utf8");parseUsageFile(raw);telemetryConsentValid=true;}}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")telemetryConsentValid=true;}
    try{if(ctx?.cwd)registryAvailable=registryObservations.has(await canonical(ctx.cwd));}catch{}
    input={piVersionOk:typeof VERSION==="string"&&VERSION.length>0,homeWritable,registryAvailable,profileValid,historyPrivate:await privateFileState(historyFile),telemetryConsentValid};
   }
   const checks=doctorChecks(input);return {exitCode:doctorExitCode(checks),checks};
  }});
  registerData("asen-route",{description:"Advanced read-only route diagnostic for exact ODD facts; for ordinary requests, write what you want in chat",handler:async(args:string|undefined,ctx:CommandContext)=>{if(!ctx.sessionManager?.getSessionId?.())throw new Error("ASEN route preview requires the active Pi session");let project:string;try{project=await realpath(ctx.cwd);}catch{throw new Error("ASEN route preview requires an existing active project");}return routePreviewCommand(args??"",project);}});
  const preparePlan=async(args:string|undefined,ctx:CommandContext):Promise<string>=>{
   const manager=ctx.sessionManager,sessionId=manager?.getSessionId?.(),cwd=ctx.cwd;if(!manager||!sessionId)throw new Error("ASEN planning requires the active Pi session");
   const validateContext=()=>{if(ctx.sessionManager!==manager||manager.getSessionId?.()!==sessionId||ctx.cwd!==cwd)throw new Error("Pi session or project changed before plan persistence");};
   let project:string;try{project=await realpath(cwd);}catch{throw new Error("ASEN planning requires an existing active project");}validateContext();
   let output:Record<string,unknown>&{executablePlan?:ExecutablePlan;persistedTasks?:Array<{planTaskId:string;todoId:string|undefined;dependsOn:Array<string|undefined>}>};
   try{output=JSON.parse(controlledInstructionPlanCommand(args??"",project,candidateAtHead(project))) as typeof output;}
   catch(error){if(error instanceof Error)throw error;throw new Error("ASEN plan output was invalid");}
   if(!output.executablePlan)return JSON.stringify(output,null,2);
   if(!todoStorePromise){output.persistence={status:"unavailable",reason:"Todo store is not configured; this graph was not saved or made runnable"};output.execution={started:false,authorized:false};output.notice="Plan only. The Todo store is unavailable, so no task records were persisted. No agent was dispatched and no permission was granted.";return JSON.stringify(output,null,2);}
   const store=await todoStorePromise,identity=await sessionIdentity(ctx),todoIds=new Map<string,string>(),ordered=output.executablePlan.topologicalOrder.map(taskId=>{const task=output.executablePlan!.tasks.find(item=>item.id===taskId);if(!task)throw new Error("ASEN executable plan order references an unknown task");return task;});
   validateContext();if(identity.sessionId!==sessionId||identity.projectId!==project)throw new Error("Pi session or project changed while preparing the plan");
    const persisted=await store.addPlan(ordered.map(task=>({title:task.title,requestId:`asen-plan:${task.id}`,dependsOn:task.dependsOn.map(id=>`asen-plan:${id}`),description:task.instruction,plan:{role:task.role,skillPaths:[...task.skillPaths],priority:task.priority,...(task.skillSelection?{skillSelection:task.skillSelection}:{}),...(task.candidate?{candidate:task.candidate}:{}),...(task.writeSurfaces?{writeSurfaces:[...task.writeSurfaces]}:{}),...(task.writerAuthorizationBasis?{writerAuthorizationBasis:task.writerAuthorizationBasis}:{})}})),identity,undefined,validateContext);
   validateContext();
   for(const item of persisted)todoIds.set(item.requestId!.slice("asen-plan:".length),item.taskId);
   output.persistedTasks=output.executablePlan.tasks.map(task=>({planTaskId:task.id,todoId:todoIds.get(task.id),dependsOn:task.dependsOn.map(id=>todoIds.get(id))}));
   output.persistence={status:"saved",sessionId:identity.sessionId,projectId:identity.projectId};
   const execution=await advancePlan(ctx);
   output.execution=execution;
   output.notice=execution.started?(execution.authorized?"The plan was saved and the exact scoped writer was started after Pi approval. Independent review and verification will continue automatically.":"The plan was saved and its first dependency-ready read-only task started automatically. A writer still requires exact Pi approval; completion requires a passing independent verifier."):"The plan was saved. No dependency-ready task could be started automatically; inspect its Todo state and resolve any required authorization or clarification.";
   return JSON.stringify(output,null,2);
  };
  registerData("asen-plan",{description:"Internal plan materializer for validated ODD facts; ordinary-language requests are planned from chat without user-authored JSON",handler:preparePlan});
  if(pi.registerTool)registerAsenPlanRequestTool({registerTool:pi.registerTool.bind(pi)},preparePlan);
  registerData("asen-agents",{description:"Show attributed ASEN agent lifecycle",handler:async(_args:string|undefined,ctx:CommandContext)=>{if(agentRuntimePromise){const rows=await (await agentRuntimePromise).list(await sessionIdentity(ctx));return agentStatusRows(rows);}return dependencies.agents?agentStatusRows(dependencies.agents()):["ASEN agents unavailable: no local agent provider configured."];}});
  registerData("asen-changes",{description:"Show current-session attributed changes and possible same-path actor conflicts",handler:async(_args:string|undefined,ctx:CommandContext)=>{if(workspaceStorePromise){const rows=await (await workspaceStorePromise).list(await sessionIdentity(ctx)),changes=rows.map(row=>row.change),conflicts=findPotentialWorkspaceConflicts(changes);return [...(conflicts.length?["Potential conflicts require review; no content comparison, winner selection, or automatic resolution is performed.",...visibleWorkspaceConflictRows(conflicts)]:[]),...visibleWorkspaceRows(changes)];}return dependencies.changes?visibleWorkspaceRows(dependencies.changes()):["ASEN workspace changes unavailable: no local change provider configured."];}});
  registerData("asen-todos",{description:"Show active Todo tasks, or archived completed task history for the current Pi session and project",handler:async(args:string|undefined,ctx:CommandContext)=>{if(!todoStorePromise)return ["ASEN no tiene un almacén local de tareas configurado."];const store=await todoStorePromise,identity=await sessionIdentity(ctx),history=args?.trim()==="history",rows=history?await store.archived(identity):await store.list(identity);return rows.length?todoStatusRows(rows):[history?"No hay tareas archivadas para este proyecto y sesión.":"No hay tareas activas para este proyecto y sesión."];}});
  registerData("asen-memory",{description:"Consultar o borrar recuerdos locales del proyecto actual",handler:async(args:string|undefined,ctx:CommandContext)=>{
   if(!memoryStorePromise)return ["La memoria local de ASEN está desactivada."];
   const binding=await currentMemoryBinding(ctx),parts=(args??"").trim().split(/\s+/u),operation=parts[0]??"status";
   if(operation==="status"){
    if(parts.length>1)return ["Uso: /asen-memory [status | search <texto> | forget <id>"];
    const data=binding.store.exportProject(binding.projectId);
    return [`Memoria local activa para este proyecto: ${data.observations.length} recuerdos; ${data.summaries.length} resúmenes de sesión.`,`Base privada: ${path.basename(memoryFile)}.`];
   }
   if(operation==="search"){
    const query=(args??"").trim().slice("search".length).trim();if(!query)return ["Uso: /asen-memory search <texto>"];
    const matches=binding.store.searchPreviews(binding.projectId,query,{matchMode:"any",limit:5});
    return matches.length?matches.map(item=>`${item.id} | ${item.title??item.topicKey??item.kind} | ${item.preview}${item.truncated?"…":""}`):["No hay recuerdos relacionados en este proyecto."];
   }
   if(operation==="forget"){
    const id=parts[1];if(!id||parts.length!==2)return ["Uso: /asen-memory forget <id>"];
    if(ctx.hasUI!==true||typeof ctx.ui.confirm!=="function")throw new Error("Borrar un recuerdo requiere confirmación en la interfaz de Pi.");
    const item=binding.store.get(id);if(!item||item.projectId!==binding.projectId)return ["No se encontró ese recuerdo en este proyecto."];
    if(!await ctx.ui.confirm("Borrar recuerdo de ASEN",`${item.title??"Recuerdo"}\n\nSe ocultará de búsquedas futuras en este proyecto. ¿Continuar?`))return ["No se ha borrado ningún recuerdo."];
    binding.store.deleteObservation(id,binding.projectId);for(let index=binding.saved.length-1;index>=0;index--)if(binding.saved[index]?.id===id)binding.saved.splice(index,1);return ["Recuerdo borrado de la memoria activa del proyecto."];
   }
   return ["Uso: /asen-memory [status | search <texto> | forget <id>"];
  }});
  registerData("asen-task-agents",{description:"Show read-only task, dependency readiness and agent coordination for the current Pi session",handler:async(_args:string|undefined,ctx:CommandContext)=>{if(!todoStorePromise||!agentRuntimePromise)return ["ASEN task-agent coordination requires both local stores."];const identity=await sessionIdentity(ctx);const coordinator=new TaskAgentCoordinator(await todoStorePromise,await agentRuntimePromise,taskAgentLinks);const view=await coordinator.snapshot(identity);return view.tasks.map(task=>({taskId:task.id,title:task.title,state:task.state,revision:task.revision,dependsOn:task.dependsOn,blockedBy:task.blockedBy,ready:task.ready,agents:task.agents}));}});
  registerData("asen-profiles",{description:"Show local runtime profiles",handler:async()=>{const value=await readProfilesFile(profilesFile);return {active:value.active??"default",profiles:value.profiles.map(p=>p.name),available:true};}});
  pi.registerCommand?.("asen-history",{description:"Manage opt-in, redacted, project-scoped local prompt history",handler:async(args:string,ctx:CommandContext)=>{
   const sessionId=ctx.sessionManager?.getSessionId?.();if(!sessionId){ctx.ui.notify("ASEN history is unavailable without a current session.","error");return;}
   const selecting=args.trim().split(/\s+/u)[0]==="select";
   try{
    const result=await runHistoryCommand(args,{storePath:historyFile,projectId:await canonical(ctx.cwd),sessionId,hasUI:ctx.hasUI===true,...(ctx.signal?{signal:ctx.signal}:{}),...(ctx.ui.select?{select:ctx.ui.select.bind(ctx.ui)}:{}),...(ctx.ui.confirm?{confirm:ctx.ui.confirm.bind(ctx.ui)}:{})}) as HistoryCommandResult;
    if(selecting){
     if(typeof result==="string")throw new Error("Unexpected history selection result");
     let message:string;
     switch(result.state){case "selected":message="History entry selected.";break;case "cancelled":message="History selection cancelled.";break;case "empty":message="No matching history entries.";break;case "unavailable":message="History selection is unavailable.";break;}
     ctx.ui.notify(message,"info");return;
    }
    if(typeof result!=="string")throw new Error("Unexpected history command result");ctx.ui.notify(result,"info");return result;
   }
   catch(error){if(selecting){ctx.ui.notify("ASEN history selection failed.","error");return;}ctx.ui.notify(`ASEN history failed: ${safeErrorMessage(error)}`,"error");throw error;}
  }});
  pi.registerCommand?.("asen-usage",{description:"Show, delete and review local ASEN usage and telemetry consent",handler:async(args:string,ctx:CommandContext)=>{
   try{const result=await runUsageCommand(args,{storePath:usageFile,hasUI:ctx.hasUI===true,...(ctx.ui.confirm?{confirm:ctx.ui.confirm.bind(ctx.ui)}:{})});ctx.ui.notify(result,"info");return result;}
   catch(error){ctx.ui.notify(`ASEN usage failed: ${safeErrorMessage(error)}`,"error");throw error;}
  }});
  registerData("asen-stats",{description:"Show fresh read-only Pi history aggregates for the active project and optional local date range",handler:async(args:string|undefined,ctx:CommandContext)=>{const manager=ctx.sessionManager,sessionId=manager?.getSessionId?.();if(!sessionId)return runPiHistoryStatsCommand(args??"");return runPiHistoryStatsCommand(args??"",manager?.getSessionDir?.(),await canonical(ctx.cwd));}});
  pi.registerCommand?.("asen-skill-registry",{description:"Refresh the generated ASEN skill registry",handler:async(args:string|undefined,ctx:CommandContext)=>{
   if(args?.trim()!=="refresh"){ctx.ui.notify(usage,"info");return usage;}
   try{
    const result=await lifecycle.refresh(ctx.cwd),empty=result.count===0?" (empty when zero)":"",memory=result.persistence.status;
    const message=`ASEN skill registry refreshed: path=${result.path}; skills=${result.count}${empty}; cache=${result.cache}; diagnostics=${result.skipped.length}; memory=${memory}.`;
    ctx.ui.notify(message,"info");return message;
   }catch(error){ctx.ui.notify(`ASEN skill registry refresh failed: ${safeErrorMessage(error)}`,"error");throw error;}
  }});
  const consumer=registerWorkflowSelectionCommand(register);
  const review=registerOrdinaryReviewCommand(register);
  return Object.freeze({review,startSession,deriveOddExecutionContract,trackOddTask,resumeOddTask,appendOddTaskEvent,decideLifecycleApplicability:(decision:OddRouteDecision,input:LifecycleApplicabilityInput)=>{
   const original=claimedOrchestrationRouteContext(decision),binding={taskIdentity:original.facts.taskIdentity,repositoryIdentity:original.facts.repositoryIdentity},choice=readWorkflowSelection(consumer,binding);
   if(!choice)return decideLifecycleApplicability(decision,input);
   const claimed=claimWorkflowSelection(consumer,choice,binding);
   return decideLifecycleApplicabilityWithSelection(decision,input,claimed);
  }});
 };
}

/** Production entry uses the real public Pi contract; dependency injection keeps lifecycle tests isolated. */
export function createPiExtension(dependencies:AsenExtensionDependencies={}){
 return (pi:ExtensionAPI):void=>{
 validatePiHost(pi,VERSION);
 if(activatedPiHosts.has(pi))return;
 const commandNames=ASEN_COMMAND_CATALOG.filter(command=>command.implemented&&command.owner!=="extensions/authority.ts").map(command=>command.name);
 const toolNames=[...ALL_INTERACTION_TOOL_NAMES,ASEN_CODE_INTELLIGENCE_TOOL_NAME,ASEN_CODEGRAPH_TOOL_NAME,ASEN_PLAN_REQUEST_TOOL,...(dependencies.enableAgentRuntime===false?[]:ASEN_AGENT_TOOL_NAMES),...(dependencies.enableTodoRuntime===false?[]:ASEN_TODO_TOOL_NAMES),...(dependencies.enableMemoryRuntime===false&&!dependencies.memoryStoreFactory?[]:ASEN_MEMORY_TOOL_NAMES)];
 let attempted=false,registrationsReady=false,generation=0,sessionStart:((context:CommandContext)=>Promise<void>)|undefined;
 pi.on("session_start",async(_event,ctx)=>{
  if(attempted){if(registrationsReady){validatePiExecutionContext(ctx);await sessionStart?.(ctx);}return;}
  attempted=true;
  const token=++generation;let publicWrites=0;
  try{
   validatePiExecutionContext(ctx);
   // Pi's public inventory methods can exist before their runtime is initialized; read them only here.
   validatePiRegistrationCollisions(pi,commandNames,toolNames);
   const facade=createAsenExtension({...dependencies,enableAgentRuntime:dependencies.enableAgentRuntime??true,enableTodoRuntime:dependencies.enableTodoRuntime??true,enableWorkspaceRuntime:dependencies.enableWorkspaceRuntime??true,enableMemoryRuntime:dependencies.enableMemoryRuntime??true,deferSessionStart:true})({
    on:(event,handler)=>pi.on(event as any,(...args:any[])=>{
     if(token!==generation||!registrationsReady)return undefined;
     validatePiExecutionContext(args[1]);
     return handler(...args);
    }),
    getFlag:name=>pi.getFlag(name),
    registerTool:tool=>{publicWrites++;pi.registerTool({...tool,execute:async(...args:any[])=>{
     if(!registrationsReady)throw new Error("ASEN registrations are disabled after an incomplete host setup");
     validatePiExecutionContext(args[4]);
     return (tool.execute as any)(...args);
    }});},
    registerCommand:(name,command)=>{publicWrites++;pi.registerCommand(name,{description:command.description,handler:async(args,commandContext)=>{
     if(!registrationsReady)throw new Error("ASEN registrations are disabled after an incomplete host setup");
     validatePiExecutionContext(commandContext);
     await command.handler(args,commandContext);
    }});},
   });
   registrationsReady=true;
   sessionStart=facade.startSession;
   await sessionStart(ctx);
  }catch(error){
   registrationsReady=false;
   if(publicWrites===0){attempted=false;generation++;}
   const message=safeErrorMessage(error);
   const recovery=publicWrites===0?"a later session start may retry":"partial registrations remain inert; reload Pi to recover";
   try{ctx.ui.notify(`ASEN host preflight failed; ${recovery}: ${message}`,"error");}catch{/* Preflight remains failed when the UI cannot report it. */}
  }
 });
 activatedPiHosts.add(pi);
 };
}

export default function asen(pi:ExtensionAPI):void{
 createPiExtension()(pi);
}
