import {lstat,readdir,realpath} from "node:fs/promises";
import { canonicalPathSync } from "./path-safety.js";
import path from "node:path";
import type {ExtensionContext,ToolCallEvent,ToolCallEventResult} from "@earendil-works/pi-coding-agent";
import {classifyNormalShellCommand} from "./normal-shell-policy.js";
import type {AsenPermissionMode} from "./permission-mode-policy.js";

import { hasSensitiveName, sensitivePath, sensitiveName } from "./path-safety.js";

export type PrimaryToolPolicyHandler=(event:ToolCallEvent,context:ExtensionContext)=>Promise<ToolCallEventResult|undefined>;
/** Conservative primary-only routine delivery waiver. Compound shell, ambiguous remote,
 * deletion, ref rewriting and forced Git commands continue through the original guard. */
export function isYoloRoutinePush(command:string):boolean{
 if(typeof command!=="string"||command.length>512||/[;&|\x60$<>\\\r\n]/u.test(command))return false;
 const match=/^git\s+push\s+(?:(?:-u|--set-upstream)\s+)?origin\s+((?:feat|feature|fix|chore|docs|test)\/[A-Za-z0-9._/-]+)\s*$/u.exec(command.trim());
 if(!match)return false;
 const ref=match[1]!;
 return !ref.split("/").some(part=>!part||part==="."||part==="..")&&!ref.includes("..")&&!ref.endsWith(".lock");
}
export interface PrimaryModeOptions{
 readonly getMode?:(context:ExtensionContext)=>AsenPermissionMode;
 /** Optional independent reviewer only. Unavailable/untrusted classifier fails closed. */
 readonly reviewAuto?:(event:ToolCallEvent,context:ExtensionContext)=>Promise<boolean>;
}


const fileTools=new Set(["read","edit","write","grep","find","ls"]);
// Custom ASEN job launch is a shell-capable tool too. Keep it in the same
// admission path so its name cannot become an authorization bypass.
const shellTools=new Set(["bash","bash_background","monitor","asen_background_start"]);
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
  const autoRequested=mode==="auto";
  const autoAllowed=async()=>{
   if(!options.reviewAuto)return false;
   const name=event.toolName,id=event.toolCallId,input=event.input,cwd=context.cwd,signal=context.signal;
   let before:string;
   try{before=JSON.stringify(input);if(before.length>8192)return false;}catch{return false;}
   try{
    if(await options.reviewAuto(event,context)!==true)return false;
    return event.toolName===name&&event.toolCallId===id&&event.input===input&&
     JSON.stringify(event.input)===before&&context.cwd===cwd&&context.signal===signal&&
     signal?.aborted!==true&&options.getMode?.(context)==="auto";
   }catch{return false;}
  };
  try{
   const toolName=event.toolName;
   if(!fileTools.has(toolName)&&!shellTools.has(toolName))
    return autoRequested?denied("unreviewed custom tool in Auto mode"):undefined;
   const input=event.input;
   if(shellTools.has(toolName)){
    if(!input||typeof input!=="object"||Array.isArray(input))return undefined;
    const command=(input as {command?:unknown;args?:unknown}).command;
    if(typeof command!=="string")return autoRequested||toolName==="asen_background_start"?denied("malformed background command"):undefined;
    if(toolName==="asen_background_start"&&(Object.hasOwn(input,"args")||Object.keys(input).some(key=>key!=="command"&&key!=="timeoutMs"&&key!=="monitor")))return denied("unsupported background command shape");
    const decision=classifyNormalShellCommand(command);
    if(decision.action==="deny")return denied("destructive shell command");
    if(autoRequested&&!(await autoAllowed()))return denied("Auto independent review is unavailable or denied");
    if(decision.action==="pass")return undefined;
    if(mode==="yolo"&&decision.guardedKey==="gitPush"&&isYoloRoutinePush(command))return undefined;
    if(context.hasUI!==true||typeof context.ui?.confirm!=="function")return denied("guarded shell command requires interactive confirmation");
    return context.ui.confirm(`ASEN · ${decision.title}`,decision.preview??"").then(approved=>approved===true?undefined:denied("guarded shell command was not confirmed"));
   }
   const toolCallId=event.toolCallId,cwd=context.cwd,signal=context.signal;
   if(!input||typeof input!=="object")return denied("malformed tool input");
   const rawPath=(input as {path?:unknown}).path;
   const optional=toolName==="grep"||toolName==="find"||toolName==="ls";
   if(rawPath!==undefined&&typeof rawPath!=="string"||rawPath===undefined&&!optional)return denied("malformed file path");
   const requested=rawPath===undefined?".":rawPath as string,{lexical,canonical}=await canonicalTarget(requested,cwd);
   if(event.toolName!==toolName||event.toolCallId!==toolCallId||event.input!==input||(input as {path?:unknown}).path!==rawPath||context.cwd!==cwd||context.signal!==signal||signal?.aborted)return denied("file call identity or path drift");
   if(hasSensitiveName(lexical)||hasSensitiveName(canonical)||sensitivePath(lexical)||sensitivePath(canonical))return denied("sensitive path access");
   if(toolName==="grep"||toolName==="find"||toolName==="ls")try{await assertSafeTraversal(toolName,canonical);}catch{return denied("safe directory traversal cannot be established");}
   if(event.toolName!==toolName||event.toolCallId!==toolCallId||event.input!==input||(input as {path?:unknown}).path!==rawPath||context.cwd!==cwd||context.signal!==signal||signal?.aborted)return denied("file call identity or path drift");
   if(autoRequested&&!(await autoAllowed()))return denied("Auto independent review is unavailable or denied");
   return undefined;
  }catch{return denied("ambiguous or unresolvable input");}
 };
}
export { hasSensitiveName, sensitivePath } from "./path-safety.js";
