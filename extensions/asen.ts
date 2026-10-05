import {realpath} from "node:fs/promises";
import {homedir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {refreshSkillRegistry,type RefreshSkillRegistryOptions,type SkillRegistryMirror} from "../src/skills/generated-registry.js";
import type {SkillSource} from "../src/skills/discovery.js";
import {claimWorkflowSelection,readWorkflowSelection,registerWorkflowSelectionCommand} from "../src/lifecycle/workflow-selection.js";
import {decideLifecycleApplicability,decideLifecycleApplicabilityWithSelection,type LifecycleApplicability,type LifecycleApplicabilityInput} from "../src/lifecycle/applicability.js";
import type {OddRouteDecision} from "../src/flow/odd-routing.js";
import {claimedOrchestrationRouteContext} from "../src/orchestration/orchestrator.js";

type CommandContext={cwd:string;ui:{notify(message:string,level:"info"|"error"):void}};
type PiLike={registerCommand?:(name:string,command:{description:string;handler:(...args:any[])=>unknown})=>void};
type Refresh=typeof refreshSkillRegistry;
export interface AsenExtensionDependencies {homeDir?:()=>string;packageRoot?:string;refresh?:Refresh;mirror?:SkillRegistryMirror}
export interface AsenExtensionFacade {decideLifecycleApplicability(decision:OddRouteDecision,input:LifecycleApplicabilityInput):LifecycleApplicability}

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
  pi.registerCommand?.("asen",{description:"Show ASEN harness status",handler:()=>({product:"ASEN",mode:"pi-native",status:"ready",principle:"ASEN extends Pi; it does not replace Pi."})});
  pi.registerCommand?.("asen-skill-registry",{description:"Refresh the generated ASEN skill registry",handler:async(args:string|undefined,ctx:CommandContext)=>{
   if(args?.trim()!=="refresh"){ctx.ui.notify(usage,"info");return usage;}
   try{
    const projectRoot=await realpath(path.resolve(ctx.cwd)),sources=await sourcesFor(projectRoot,home(),packageRoot);
    const options:RefreshSkillRegistryOptions={projectRoot,projectId:projectRoot,sources,...(dependencies.mirror?{mirror:dependencies.mirror}:{})};
    const result=await refresh(options),empty=result.count===0?" (empty when zero)":"",memory=result.persistence.status;
    const message=`ASEN skill registry refreshed: path=${result.path}; skills=${result.count}${empty}; cache=${result.cache}; diagnostics=${result.skipped.length}; memory=${memory}.`;
    ctx.ui.notify(message,"info");return message;
   }catch(error){ctx.ui.notify(`ASEN skill registry refresh failed: ${safeErrorMessage(error)}`,"error");throw error;}
  }});
  const consumer=registerWorkflowSelectionCommand(register);
  return Object.freeze({decideLifecycleApplicability:(decision:OddRouteDecision,input:LifecycleApplicabilityInput)=>{
   const original=claimedOrchestrationRouteContext(decision),binding={taskIdentity:original.facts.taskIdentity,repositoryIdentity:original.facts.repositoryIdentity},choice=readWorkflowSelection(consumer,binding);
   if(!choice)return decideLifecycleApplicability(decision,input);
   const claimed=claimWorkflowSelection(consumer,choice,binding);
   return decideLifecycleApplicabilityWithSelection(decision,input,claimed);
  }});
 };
}

export default createAsenExtension();
