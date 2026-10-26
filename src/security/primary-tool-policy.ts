import {lstat,readdir,realpath} from "node:fs/promises";
import path from "node:path";
import type {ExtensionContext,ToolCallEvent,ToolCallEventResult} from "@earendil-works/pi-coding-agent";
import {classifyNormalShellCommand} from "./normal-shell-policy.js";

export type PrimaryToolPolicyHandler=(event:ToolCallEvent,context:ExtensionContext)=>Promise<ToolCallEventResult|undefined>;

const fileTools=new Set(["read","edit","write","grep","find","ls"]);
const shellTools=new Set(["bash","bash_background","monitor"]);
const denied=(reason:string):ToolCallEventResult=>({block:true,reason:`ASEN primary tool policy blocked ${reason}`});

function sensitiveName(value:string):boolean{
 const name=process.platform==="win32"?value.toLowerCase():value;
 return name===".git"||name.startsWith(".env")||name.endsWith(".pem")||name.endsWith(".key");
}
function hasSensitiveName(value:string):boolean{
 const normalized=path.normalize(value),root=path.parse(normalized).root;
 return normalized.slice(root.length).split(path.sep).filter(Boolean).some(sensitiveName);
}
async function canonicalTarget(value:string,cwd:string):Promise<{lexical:string;canonical:string}>{
 if(!value||value.includes("\0")||!cwd||cwd.includes("\0"))throw new Error("invalid path");
 const lexical=path.resolve(cwd,value),suffix:string[]=[];let candidate=lexical;
 for(;;){
  try{return {lexical,canonical:path.resolve(await realpath(candidate),...suffix)};}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
   try{if((await lstat(candidate)).isSymbolicLink())throw new Error("unresolvable symbolic link");}
   catch(metadataError){if((metadataError as NodeJS.ErrnoException).code!=="ENOENT")throw metadataError;}
   const parent=path.dirname(candidate);if(parent===candidate)throw error;
   suffix.unshift(path.basename(candidate));candidate=parent;
  }
 }
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
export function createPrimaryToolPolicyHandler():PrimaryToolPolicyHandler{
 return async(event,context)=>{
  try{
   const toolName=event.toolName;
   if(!fileTools.has(toolName)&&!shellTools.has(toolName))return undefined;
   const input=event.input;
   if(shellTools.has(toolName)){
    if(!input||typeof input!=="object"||Array.isArray(input))return undefined;
    const command=(input as {command?:unknown}).command;
    if(typeof command!=="string")return undefined;
    const decision=classifyNormalShellCommand(command);
    if(decision.action==="pass")return undefined;
    if(decision.action==="deny")return denied("destructive shell command");
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
   if(hasSensitiveName(lexical)||hasSensitiveName(canonical))return denied("sensitive path access");
   if(toolName==="grep"||toolName==="find"||toolName==="ls")try{await assertSafeTraversal(toolName,canonical);}catch{return denied("safe directory traversal cannot be established");}
   if(event.toolName!==toolName||event.toolCallId!==toolCallId||event.input!==input||(input as {path?:unknown}).path!==rawPath||context.cwd!==cwd||context.signal!==signal||signal?.aborted)return denied("file call identity or path drift");
   return undefined;
  }catch{return denied("ambiguous or unresolvable input");}
 };
}
