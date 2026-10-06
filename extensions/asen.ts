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
import {trackOddTask,resumeOddTask,type OddProgress} from "../src/flow/odd-task-tracking.js";
import type {MemoryContext} from "../src/memory/context.js";import type {MemoryStore} from "../src/memory/types.js";
import {registerInteractionTools} from "../src/interaction/pi-tools.js";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import {createCodeIntelligenceTool,type CodeIntelligenceOptions} from "../src/interaction/code-intelligence.js";
import {statusLines,type AsenStatusInput} from "../src/runtime/status.js";
import {doctorChecks,doctorExitCode} from "../src/runtime/doctor.js";
import {ASEN_COMMAND_CATALOG} from "../src/runtime/command-catalog.js";
import {agentStatusRows,type PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";
import {visibleWorkspaceRows,type WorkspaceChange} from "../src/runtime/workspace-attribution.js";
import {readProfilesFile} from "../src/runtime/profile-store.js";

type CommandContext={cwd:string;ui:{notify(message:string,level:"info"|"error"):void}};
type PiLike={on?:(event:string,handler:(...args:any[])=>unknown)=>void;registerFlag?:(name:string,options:any)=>void;getFlag?:(name:string)=>unknown;registerCommand?:(name:string,command:{description:string;handler:(...args:any[])=>unknown})=>void;registerTool?:(tool:ToolDefinition<any>)=>void};
type Refresh=typeof refreshSkillRegistry;
export interface AsenExtensionDependencies {homeDir?:()=>string;packageRoot?:string;refresh?:Refresh;mirror?:SkillRegistryMirror;interactionTimeoutMs?:number;codeIntelligence?:CodeIntelligenceOptions;registryLifecycle?:Pick<RegistryLifecycleOptions,"watch"|"debounceMs">;status?:()=>AsenStatusInput;doctor?:()=>Parameters<typeof doctorChecks>[0];agents?:()=>readonly PublicAgentRecord[];changes?:()=>readonly WorkspaceChange[];profilesFile?:string}
export interface AsenExtensionFacade {review:OrdinaryReviewCommandController;decideLifecycleApplicability(decision:OddRouteDecision,input:LifecycleApplicabilityInput):LifecycleApplicability;deriveOddExecutionContract(decision:OddRouteDecision):OddExecutionContract;trackOddTask(contract:OddExecutionContract,context:MemoryContext,documentPath:string,input:OddProgress):ReturnType<typeof trackOddTask>;resumeOddTask(contract:OddExecutionContract,store:Pick<MemoryStore,"get">):ReturnType<typeof resumeOddTask>}

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
  const lifecycle=new RegistryLifecycle({refresh,prepare:async cwd=>{
   const projectRoot=await realpath(path.resolve(cwd)),sources=await sourcesFor(projectRoot,home(),packageRoot);
   return {projectRoot,projectId:projectRoot,sources,...(dependencies.mirror?{mirror:dependencies.mirror}:{})};
  },...dependencies.registryLifecycle});
  pi.registerFlag?.("asen-no-skill-registry",{description:"Disable ASEN skill registry startup refresh and watchers",type:"boolean",default:false});
  pi.on?.("session_start",(_event,ctx)=>lifecycle.start(ctx,registryStartupDisabled(pi.getFlag?.("asen-no-skill-registry"))));
  pi.on?.("session_shutdown",()=>lifecycle.shutdown());
  registerInteractionTools(pi,dependencies.interactionTimeoutMs);
  pi.registerTool?.(createCodeIntelligenceTool(dependencies.codeIntelligence));
  pi.registerCommand?.("asen",{description:"Show ASEN harness status",handler:()=>({product:"ASEN",mode:"pi-native",status:"ready",principle:"ASEN extends Pi; it does not replace Pi."})});
  pi.registerCommand?.("asen-commands",{description:"List ASEN public commands",handler:()=>ASEN_COMMAND_CATALOG.map(c=>({name:c.name,group:c.group,implemented:c.implemented}))});
  pi.registerCommand?.("asen-status",{description:"Show bounded local ASEN status",handler:()=>dependencies.status?statusLines(dependencies.status()):["ASEN status unavailable: no local status provider configured."]});
  pi.registerCommand?.("asen-doctor",{description:"Check local ASEN invariants",handler:()=>{if(!dependencies.doctor)return {exitCode:1,checks:[],message:"ASEN doctor unavailable: no local diagnostics provider configured."};const checks=doctorChecks(dependencies.doctor());return {exitCode:doctorExitCode(checks),checks};}});
  pi.registerCommand?.("asen-agents",{description:"Show attributed ASEN agent lifecycle",handler:()=>dependencies.agents?agentStatusRows(dependencies.agents()):["ASEN agents unavailable: no local agent provider configured."]});
  pi.registerCommand?.("asen-changes",{description:"Show attributed workspace changes",handler:()=>dependencies.changes?visibleWorkspaceRows(dependencies.changes()):["ASEN workspace changes unavailable: no local change provider configured."]});
  pi.registerCommand?.("asen-profiles",{description:"Show local runtime profiles",handler:async()=>{if(!dependencies.profilesFile)return {active:"default",profiles:[],available:false};const value=await readProfilesFile(dependencies.profilesFile);return {active:value.active??"default",profiles:value.profiles.map(p=>p.name),available:true};}});
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
  return Object.freeze({review,deriveOddExecutionContract,trackOddTask,resumeOddTask,decideLifecycleApplicability:(decision:OddRouteDecision,input:LifecycleApplicabilityInput)=>{
   const original=claimedOrchestrationRouteContext(decision),binding={taskIdentity:original.facts.taskIdentity,repositoryIdentity:original.facts.repositoryIdentity},choice=readWorkflowSelection(consumer,binding);
   if(!choice)return decideLifecycleApplicability(decision,input);
   const claimed=claimWorkflowSelection(consumer,choice,binding);
   return decideLifecycleApplicabilityWithSelection(decision,input,claimed);
  }});
 };
}

export default createAsenExtension();
