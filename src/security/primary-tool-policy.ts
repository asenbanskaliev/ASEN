import {lstat,readdir,realpath} from "node:fs/promises";
import { canonicalPathSync } from "./path-safety.js";
import path from "node:path";
import type {ExtensionContext,ToolCallEvent,ToolCallEventResult} from "@earendil-works/pi-coding-agent";
import {classifyNormalShellCommand} from "./normal-shell-policy.js";
import type {AsenPermissionMode} from "./permission-mode-policy.js";
import type {DelegationMode} from "../runtime/lifecycle/profiles.js";
import {isYoloRoutineDelivery,isSensitiveShellAction} from "./yolo-delivery-policy.js";
import {isYoloTempScratchRemoval} from "./yolo-temp-scratch.js";

import { hasSensitiveName, sensitivePath, sensitiveName } from "./path-safety.js";
import {evaluateExecutionSurface} from "./execution-surface-guard.js";
import {checkDeliveryPreflight} from "../review/delivery-preflight.js";
import {checkConflictMarkers} from "./delivery-conflict-markers.js";

export type PrimaryToolPolicyHandler=(event:ToolCallEvent,context:ExtensionContext)=>Promise<ToolCallEventResult|undefined>;
export {isYoloRoutinePush,isYoloRoutineDelivery} from "./yolo-delivery-policy.js";
export interface PrimaryModeOptions{
 readonly getMode?:(context:ExtensionContext)=>AsenPermissionMode;
 /** Solo el perfil elegido puede activar la prohibición de escritura directa del padre. */
 readonly getDelegationMode?:(context:ExtensionContext)=>DelegationMode|Promise<DelegationMode>;
 readonly modeEpoch?:()=>number|string;
 /** Human-owned private preference file; model tool calls can never edit it. */
 readonly protectedPreferenceFile?:string;
 /** Human-owned ASEN runtime state directories; model tool calls may read them, never mutate them. */
 readonly protectedStateDirs?:readonly string[];
 /** Optional independent reviewer only. Unavailable/untrusted classifier fails closed. */
 readonly reviewAuto?:(event:ToolCallEvent,context:ExtensionContext)=>Promise<boolean>;
}


const fileTools=new Set(["read","edit","write","grep","find","ls"]);
// Custom ASEN job launch is a shell-capable tool too. Keep it in the same
// admission path so its name cannot become an authorization bypass.
const shellTools=new Set(["bash","bash_background","monitor","asen_background_start","powershell"]);
// Native user consent decisions have their own independent UI; Auto must not
// answer them, and YOLO/Super YOLO must not inherit them to children.
const consentTools=new Set(["ask_user","ask_user_question","question","asen_session_consult",
 "asen_todo_accept_result","asen_plan_dispatch_next","asen_plan_resume_batch"]);
// Herramientas permitidas al padre en delegación total; las que escriben código
// se ejecutan exclusivamente en el hijo con autorización propia.
const fullDelegationTools=new Set([
 "asen_agent_start","asen_agent_status","asen_agent_ack","asen_agent_cancel",
 "asen_agent_continue","asen_agent_retry","asen_plan_dispatch_next",
 "asen_todo_inspect_interrupted_write","asen_todo_add","asen_todo_update",
 "asen_todo_list","asen_todo_accept_result","asen_plan_request","asen_plan_resume_batch",
]);
const denied=(reason:string):ToolCallEventResult=>({block:true,reason:`ASEN primary tool policy blocked ${reason}`});

async function canonicalTarget(value:string,cwd:string):Promise<{lexical:string;canonical:string}>{
 if(value.length===0||value.includes("\0")||!cwd||cwd.includes("\0"))throw new Error("invalid path");
 const lexical=path.resolve(cwd,value);
 return {lexical,canonical:canonicalPathSync(lexical)};
}

const traversalEntryLimit=10_000,traversalDepthLimit=64;
async function assertSafeTraversal(toolName:string,target:string):Promise<void>{
 const metadata=await lstat(target);if(!metadata.isDirectory())return;
 const direct=await readdir(target,{withFileTypes:true});
 if(direct.length>traversalEntryLimit)throw new Error("directory safety scan limit exceeded");
 if(toolName==="ls"){
  if(direct.some(entry=>sensitiveName(entry.name)))throw new Error("sensitive directory entry");
  return;
 }
 let entriesSeen=0;const visited=new Set<string>();
 const walk=async(directory:string,depth:number):Promise<void>=>{
  if(depth>traversalDepthLimit)throw new Error("directory safety depth exceeded");
  const canonical=path.normalize(await realpath(directory));if(hasSensitiveName(canonical))throw new Error("sensitive symlink target");
  if(visited.has(canonical))return;visited.add(canonical);
  const entries=await readdir(canonical,{withFileTypes:true});entriesSeen+=entries.length;
  if(entriesSeen>traversalEntryLimit)throw new Error("directory safety scan limit exceeded");
  for(const entry of entries){
   if(sensitiveName(entry.name))throw new Error("sensitive descendant");
   const child=path.join(canonical,entry.name);
   if(entry.isSymbolicLink()){
    const resolved=path.normalize(await realpath(child));if(hasSensitiveName(resolved))throw new Error("sensitive symlink target");
    if((await lstat(resolved)).isDirectory())await walk(resolved,depth+1);
   }else if(entry.isDirectory())await walk(child,depth+1);
  }
 };
 await walk(target,0);
}

/** Primary-session policy. Child authority remains owned by extensions/authority.ts. */
export function createPrimaryToolPolicyHandler(options:PrimaryModeOptions={}):PrimaryToolPolicyHandler{
 return async(event,context)=>{
  const mode=options.getMode?.(context)??"normal";
  const startEpoch=options.modeEpoch?.();
  const sameTurn=()=>options.modeEpoch?.()===startEpoch;
  let delegation:DelegationMode;
  try{delegation=await options.getDelegationMode?.(context)??"organic";}
  catch{return denied("delegation profile could not be verified");}
  if(delegation!=="organic"&&delegation!=="full-delegation")return denied("invalid delegation profile");
  if(!sameTurn())return denied("permission or delegation turn changed during policy admission");
  const autoRequested=mode==="auto";
  let confirmationRejected=false;
  const autoAllowed=async()=>{
   if(!options.reviewAuto)return false;
   const name=event.toolName,id=event.toolCallId,input=event.input,cwd=context.cwd,signal=context.signal;
   let before:string;
   try{before=JSON.stringify(input);if(before.length>8192)return false;}catch{return false;}
   try{
    if(await options.reviewAuto(event,context)!==true)return false;
    return event.toolName===name&&event.toolCallId===id&&event.input===input&&
     JSON.stringify(event.input)===before&&context.cwd===cwd&&context.signal===signal&&
     signal?.aborted!==true&&options.getMode?.(context)==="auto"&&
     options.modeEpoch?.()===startEpoch;
   }catch{return false;}
  };
  try{
   const toolName=event.toolName;
   if(delegation==="full-delegation"){
    // No escrituras directas ni comandos de terminal: incluso bash puede
    // escribir archivos mediante redirecciones, scripts o tareas externas.
    if(toolName==="edit"||toolName==="write"||shellTools.has(toolName))
     return denied("full delegation: parent cannot modify files or run shell commands");
    if(toolName==="codegraph"||toolName==="asen_code_intelligence"){
     const input=event.input as {operation?:unknown}|undefined;
     if(input?.operation!=="query")return denied("full delegation: only read-only code queries are allowed");
    }else if(!fileTools.has(toolName)&&!consentTools.has(toolName)&&!fullDelegationTools.has(toolName))
     return denied("full delegation: tool not verified as read-only or scoped agent dispatch");
   }
   if(!fileTools.has(toolName)&&!shellTools.has(toolName)){
    if(consentTools.has(toolName))return sameTurn()?undefined:denied("tool call outlived its original turn"); // Native UI owns the decision.
    if(autoRequested&&!(await autoAllowed()))return denied("Auto independent review is unavailable or denied");
    return sameTurn()?undefined:denied("tool call outlived its original turn");
   }
   const input=event.input;
   if(shellTools.has(toolName)){
    if(!input||typeof input!=="object"||Array.isArray(input))return denied("malformed shell command");
    const command=(input as {command?:unknown;args?:unknown}).command;
    if(typeof command==="string"&&/(?:permission-mode\.json|asen-mode\s+default)/iu.test(command))
     return denied("human-owned permission configuration");
    if(typeof command!=="string")return denied("malformed shell command");
    if(isSensitiveShellAction(command))return denied("sensitive shell path");
    if(toolName==="asen_background_start"&&(Object.hasOwn(input,"args")||Object.keys(input).some(key=>key!=="command"&&key!=="timeoutMs"&&key!=="monitor")))return denied("unsupported background command shape");
    const decision=classifyNormalShellCommand(command);
    if(decision.action==="deny")return denied("destructive shell command");
    if(autoRequested&&!(await autoAllowed()))return denied("Auto independent review is unavailable or denied");
    // Delivery and conflict-marker controls run BEFORE pass/YOLO/Super YOLO
    // shortcuts. The only existing no-review exception remains the strictly
    // scoped, human-selected YOLO routine feature-branch delivery contract.
    const delivery=checkDeliveryPreflight({cwd:context.cwd,command,deliveryAuthorized:false,signal:context.signal});
    const routineWaiver=(mode==="yolo"||mode==="super-yolo")&&isYoloRoutineDelivery(command);
    if(delivery?.blocked&&!routineWaiver&&(mode==="super-yolo"||autoRequested||decision.action==="pass"))
     return denied(delivery.reason??"delivery preflight blocked");
    const markerResult=await checkConflictMarkers(command,context.cwd,context.signal);
    if(markerResult?.blocked)return denied(markerResult.reason??"delivery conflict markers detected");
    if(!sameTurn())return denied("tool call outlived its original turn");
    if(decision.action==="pass")return undefined;
    if(mode==="super-yolo")return undefined; // No publish/merge bypass: checked above.
    if(mode==="yolo"&&decision.dataLossKind==="filesystem"&&
     isYoloTempScratchRemoval(command))return undefined;
    if(mode==="yolo"&&decision.dataLossKind===undefined&&
       isYoloRoutineDelivery(command))return undefined;
    if(context.hasUI!==true||typeof context.ui?.confirm!=="function")return denied("guarded shell command requires interactive confirmation");
    const id=event.toolCallId,inputAtReview=event.input,cwd=context.cwd,signal=context.signal;
    let approved:boolean;
    try{approved=await context.ui.confirm(`ASEN · ${decision.title}`,decision.preview??"");}
    catch(error){confirmationRejected=true;throw error;}
    if(approved!==true)return denied("guarded shell command was not confirmed");
    if(event.toolCallId!==id||event.input!==inputAtReview||context.cwd!==cwd||
     context.signal!==signal||signal?.aborted||!sameTurn()||(options.getMode?.(context)??"normal")!==mode||
     options.modeEpoch?.()!==startEpoch||(event.input as {command?:unknown}).command!==command)
     return denied("guarded shell confirmation expired");
    // A shell confirmation alone never grants independent publication authority.
    // Conflict-marker checks already ran for every mode above.
    if(delivery?.blocked&&!routineWaiver)
     return denied(delivery.reason??"delivery preflight blocked");
    return undefined;
   }
   const surfaceBlock=evaluateExecutionSurface(toolName,input);
   if(surfaceBlock)return surfaceBlock;
   const toolCallId=event.toolCallId,cwd=context.cwd,signal=context.signal;
   if(!input||typeof input!=="object")return denied("malformed tool input");
   const rawPath=(input as {path?:unknown}).path;
   const optional=toolName==="grep"||toolName==="find"||toolName==="ls";
   if(rawPath!==undefined&&typeof rawPath!=="string"||rawPath===undefined&&!optional)return denied("malformed file path");
   const requested=rawPath===undefined?".":rawPath as string,{lexical,canonical}=await canonicalTarget(requested,cwd);
   if(event.toolName!==toolName||event.toolCallId!==toolCallId||event.input!==input||(input as {path?:unknown}).path!==rawPath||context.cwd!==cwd||context.signal!==signal||signal?.aborted||!sameTurn())return denied("file call identity or path drift");
   if(hasSensitiveName(lexical)||hasSensitiveName(canonical)||sensitivePath(lexical)||sensitivePath(canonical))return denied("sensitive path access");
   if((toolName==="write"||toolName==="edit")&&options.protectedPreferenceFile){
    const parent=path.dirname(options.protectedPreferenceFile);
    const resolvedParent=canonicalPathSync(parent);
    if(canonical===canonicalPathSync(options.protectedPreferenceFile)||
      canonical===resolvedParent||canonical.startsWith(resolvedParent+path.sep))
     return denied("human-owned permission configuration");
   }
   if(toolName==="write"||toolName==="edit"){
    for(const stateDir of [path.resolve(cwd,".asen"),...(options.protectedStateDirs??[])]){
     const resolvedStateDir=canonicalPathSync(stateDir);
     if(canonical===resolvedStateDir||canonical.startsWith(resolvedStateDir+path.sep))
      return denied("human-owned ASEN state");
    }
   }
   if(toolName==="grep"||toolName==="find"||toolName==="ls")try{await assertSafeTraversal(toolName,canonical);}catch{return denied("safe directory traversal cannot be established");}
   if(event.toolName!==toolName||event.toolCallId!==toolCallId||event.input!==input||(input as {path?:unknown}).path!==rawPath||context.cwd!==cwd||context.signal!==signal||signal?.aborted)return denied("file call identity or path drift");
   if(autoRequested&&!(await autoAllowed()))return denied("Auto independent review is unavailable or denied");
   return sameTurn()?undefined:denied("tool call outlived its original turn");
  }catch(error){
   // A failed native consent dialog belongs to the host and must propagate unchanged.
   // Untrusted path/classifier errors still block with zero execution.
   if(confirmationRejected)throw error;
   return denied("ambiguous or unresolvable input");
  }
 };
}
export { hasSensitiveName, sensitivePath } from "./path-safety.js";
