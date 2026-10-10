import {RegistryLifecycle,registryStartupDisabled,type RegistryLifecycleOptions} from "../src/skills/registry-lifecycle.js";
import {realpath} from "node:fs/promises";
import {homedir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {refreshSkillRegistry,type SkillRegistryMirror} from "../src/skills/generated-registry.js";
import type {SkillSource} from "../src/skills/discovery.js";
import {claimWorkflowSelection,readWorkflowSelection,registerWorkflowSelectionCommand} from "../src/lifecycle/workflow-selection.js";
import {decideLifecycleApplicability,decideLifecycleApplicabilityWithSelection,type LifecycleApplicability,type LifecycleApplicabilityInput} from "../src/lifecycle/applicability.js";
import type {OddRouteDecision} from "../src/flow/odd-routing.js";
import {claimedOrchestrationRouteContext} from "../src/orchestration/orchestrator.js";
import {registerOrdinaryReviewCommand,type OrdinaryReviewCommandController} from "../src/review/ordinary-review-command.js";
import {deriveOddExecutionContract,type OddExecutionContract} from "../src/flow/odd-execution-contract.js";
import {trackOddTask,resumeOddTask,appendOddTaskEvent,type OddProgress} from "../src/flow/odd-task-tracking.js";
import type {MemoryContext} from "../src/memory/context.js";import type {MemoryStore} from "../src/memory/types.js";
import type {TaskEvent} from "../src/runtime/task-replay.js";
import {ASEN_INTERACTION_TOOL_NAMES,registerInteractionTools} from "../src/interaction/pi-tools.js";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import {ASEN_CODEGRAPH_TOOL_NAME,ASEN_CODE_INTELLIGENCE_TOOL_NAME,registerCodeGraphTools,type CodeIntelligenceOptions} from "../src/interaction/code-intelligence.js";
import {statusLines,type AsenStatusInput} from "../src/runtime/status.js";
import {doctorChecks,doctorExitCode} from "../src/runtime/doctor.js";
import {ASEN_COMMAND_CATALOG} from "../src/runtime/command-catalog.js";
import {agentStatusRows,type PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";
import {visibleWorkspaceRows,type WorkspaceChange} from "../src/runtime/workspace-attribution.js";
import {readProfilesFile} from "../src/runtime/profile-store.js";
import {runHistoryCommand,recordHistoryInput} from "../src/runtime/history-command.js";
import {runUsageCommand} from "../src/runtime/usage-command.js";
import {incrementUsageFile} from "../src/runtime/usage-store.js";
import {VERSION,type ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {validatePiHost,validatePiRegistrationCollisions,validatePiExecutionContext} from "../src/runtime/pi-host.js";

type CommandContext={cwd:string;hasUI?:boolean;sessionManager?:{getSessionId?:()=>string};ui:{notify(message:string,level:"info"|"error"):void;confirm?:(title:string,message:string)=>Promise<boolean>}};
type PiLike={getCommands?:()=>readonly {name:string}[];on?:(event:string,handler:(...args:any[])=>unknown)=>void;getFlag?:(name:string)=>unknown;registerCommand?:(name:string,command:{description:string;handler:(...args:any[])=>unknown})=>void;registerTool?:(tool:ToolDefinition<any>)=>void};
type Refresh=typeof refreshSkillRegistry;
export interface AsenExtensionDependencies {homeDir?:()=>string;packageRoot?:string;refresh?:Refresh;mirror?:SkillRegistryMirror;interactionTimeoutMs?:number;codeIntelligence?:CodeIntelligenceOptions;registryLifecycle?:Pick<RegistryLifecycleOptions,"watch"|"debounceMs">;status?:()=>AsenStatusInput;doctor?:()=>Parameters<typeof doctorChecks>[0];agents?:()=>readonly PublicAgentRecord[];changes?:()=>readonly WorkspaceChange[];profilesFile?:string;deferSessionStart?:boolean}
export interface AsenExtensionFacade {review:OrdinaryReviewCommandController;startSession(context:CommandContext):Promise<void>;decideLifecycleApplicability(decision:OddRouteDecision,input:LifecycleApplicabilityInput):LifecycleApplicability;deriveOddExecutionContract(decision:OddRouteDecision):OddExecutionContract;trackOddTask(contract:OddExecutionContract,context:MemoryContext,documentPath:string,input:OddProgress):ReturnType<typeof trackOddTask>;resumeOddTask(contract:OddExecutionContract,store:Pick<MemoryStore,"get">):ReturnType<typeof resumeOddTask>;appendOddTaskEvent(contract:OddExecutionContract,context:MemoryContext,store:Pick<MemoryStore,"get">,event:TaskEvent):ReturnType<typeof appendOddTaskEvent>}

const usage="Usage: /asen-skill-registry refresh";
const productionPackageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
async function canonical(value:string):Promise<string>{
 const resolved=path.resolve(value);try{return path.normalize(await realpath(resolved));}catch{return path.normalize(resolved);}
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
  const lifecycle=new RegistryLifecycle({refresh,prepare:async cwd=>{
   const projectRoot=await realpath(path.resolve(cwd)),sources=await sourcesFor(projectRoot,home(),packageRoot);
   return {projectRoot,projectId:projectRoot,sources,...(dependencies.mirror?{mirror:dependencies.mirror}:{})};
  },...dependencies.registryLifecycle});
  const historyFile=path.join(home(),".asen","history.json"),usageFile=path.join(home(),".asen","usage.json");
  const startSession=async(ctx:CommandContext)=>{await lifecycle.start(ctx,registryStartupDisabled(undefined));try{await incrementUsageFile(usageFile,"sessions");}catch{try{ctx.ui.notify("ASEN local usage could not be saved.","error");}catch{}}};
  if(!dependencies.deferSessionStart)pi.on?.("session_start",async(_event,ctx)=>startSession(ctx));
  pi.on?.("session_shutdown",()=>lifecycle.shutdown());
  pi.on?.("input",async(event,ctx)=>{
   const text=typeof event?.text==="string"?event.text:"",sessionId=ctx.sessionManager?.getSessionId?.();
   if(event?.source!=="interactive"&&event?.source!=="rpc")return;
   if(text.startsWith("/")){try{await incrementUsageFile(usageFile,"commands");}catch{try{ctx.ui.notify("ASEN local usage could not be saved.","error");}catch{}}return;}
   if(!sessionId)return;
   try{await recordHistoryInput({storePath:historyFile,projectId:await canonical(ctx.cwd),sessionId,hasUI:ctx.hasUI===true},text);}
   catch{try{ctx.ui.notify("ASEN private history could not be saved; your input was not changed.","error");}catch{}}
  });
  pi.on?.("turn_start",async()=>{try{await incrementUsageFile(usageFile,"agentRuns");}catch{}});
  registerInteractionTools(pi,dependencies.interactionTimeoutMs);
  if(pi.registerTool)registerCodeGraphTools({registerTool:pi.registerTool.bind(pi)},dependencies.codeIntelligence);
  registerData("asen",{description:"Show ASEN harness status",handler:()=>({product:"ASEN",mode:"pi-native",status:"ready",principle:"ASEN extends Pi; it does not replace Pi."})});
  registerData("asen-commands",{description:"List ASEN public commands",handler:()=>ASEN_COMMAND_CATALOG.map(c=>({name:c.name,group:c.group,implemented:c.implemented}))});
  registerData("asen-status",{description:"Show bounded local ASEN status",handler:()=>dependencies.status?statusLines(dependencies.status()):["ASEN status unavailable: no local status provider configured."]});
  registerData("asen-doctor",{description:"Check local ASEN invariants",handler:()=>{if(!dependencies.doctor)return {exitCode:1,checks:[],message:"ASEN doctor unavailable: no local diagnostics provider configured."};const checks=doctorChecks(dependencies.doctor());return {exitCode:doctorExitCode(checks),checks};}});
  registerData("asen-agents",{description:"Show attributed ASEN agent lifecycle",handler:()=>dependencies.agents?agentStatusRows(dependencies.agents()):["ASEN agents unavailable: no local agent provider configured."]});
  registerData("asen-changes",{description:"Show attributed workspace changes",handler:()=>dependencies.changes?visibleWorkspaceRows(dependencies.changes()):["ASEN workspace changes unavailable: no local change provider configured."]});
  registerData("asen-profiles",{description:"Show local runtime profiles",handler:async()=>{if(!dependencies.profilesFile)return {active:"default",profiles:[],available:false};const value=await readProfilesFile(dependencies.profilesFile);return {active:value.active??"default",profiles:value.profiles.map(p=>p.name),available:true};}});
  pi.registerCommand?.("asen-history",{description:"Manage opt-in, redacted, project-scoped local prompt history",handler:async(args:string,ctx:CommandContext)=>{
   const sessionId=ctx.sessionManager?.getSessionId?.();if(!sessionId){ctx.ui.notify("ASEN history is unavailable without a current session.","error");return;}
   try{const result=await runHistoryCommand(args,{storePath:historyFile,projectId:await canonical(ctx.cwd),sessionId,hasUI:ctx.hasUI===true,...(ctx.ui.confirm?{confirm:ctx.ui.confirm.bind(ctx.ui)}:{})});ctx.ui.notify(result,"info");return result;}
   catch(error){ctx.ui.notify(`ASEN history failed: ${safeErrorMessage(error)}`,"error");throw error;}
  }});
  pi.registerCommand?.("asen-usage",{description:"Show, delete and review local ASEN usage and telemetry consent",handler:async(args:string,ctx:CommandContext)=>{
   try{const result=await runUsageCommand(args,{storePath:usageFile,hasUI:ctx.hasUI===true,...(ctx.ui.confirm?{confirm:ctx.ui.confirm.bind(ctx.ui)}:{})});ctx.ui.notify(result,"info");return result;}
   catch(error){ctx.ui.notify(`ASEN usage failed: ${safeErrorMessage(error)}`,"error");throw error;}
  }});
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
 const commandNames=ASEN_COMMAND_CATALOG.filter(command=>command.implemented&&command.owner!=="extensions/authority.ts").map(command=>command.name);
 const toolNames=[...ASEN_INTERACTION_TOOL_NAMES,ASEN_CODE_INTELLIGENCE_TOOL_NAME,ASEN_CODEGRAPH_TOOL_NAME];
 let attempted=false,registrationsReady=false,generation=0,sessionStart:((context:CommandContext)=>Promise<void>)|undefined;
 pi.on("session_start",async(_event,ctx)=>{
  if(attempted){if(registrationsReady)await sessionStart?.(ctx);return;}
  attempted=true;
  const token=++generation;let publicWrites=0;
  try{
   validatePiExecutionContext(ctx);
   // Pi's public inventory methods can exist before their runtime is initialized; read them only here.
   validatePiRegistrationCollisions(pi,commandNames,toolNames);
   const facade=createAsenExtension({...dependencies,deferSessionStart:true})({
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
   try{ctx.ui.notify(`ASEN host preflight failed; ${recovery}: ${message}`,"error");}catch{}
  }
 });
 };
}

export default function asen(pi:ExtensionAPI):void{
 createPiExtension()(pi);
}
