import {existsSync,realpathSync} from "node:fs";
import {isAbsolute,join,relative,resolve,dirname} from "node:path";
import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";
import {PersistentWorkspaceStore} from "../src/runtime/workspace-store.js";

export interface ToolAuthority{repository:string;role:"explorer"|"worker"|"reviewer"|"verifier";writeSurfaces:readonly string[];agentId?:string;sessionId?:string;attributionFile?:string;}
function inside(base:string,target:string):boolean{
 const rest=relative(base,target);
 return rest===""||rest!==".."&&!rest.startsWith(`..${process.platform==="win32"?"\\":"/"}`)&&!isAbsolute(rest);
}
function canonicalTarget(path:string):string{
 let parent=resolve(path);
 const suffix:string[]=[];
 for(;;){
  try{return join(realpathSync(parent),...suffix.reverse());}
  catch(error){
   const next=dirname(parent);
   if(next===parent)throw error;
   suffix.push(parent.slice(next.length).replace(/^[/\\]/,""));parent=next;
  }
 }
}
export async function recordSuccessfulWorkspaceWrite(authority:ToolAuthority,toolName:"edit"|"write",input:Record<string,unknown>,beforeExists:boolean,storeFile:string):Promise<void>{
 if(!authority.agentId||!authority.sessionId||!storeFile||!authorizeToolCall(authority,toolName,input)||typeof input.path!=="string")throw new Error("ASEN writer attribution identity or scope is invalid");
 const repo=realpathSync(authority.repository),target=canonicalTarget(resolve(repo,input.path)),path=relative(repo,target);
 if(!path||path==="."||path.startsWith("..")||isAbsolute(path))throw new Error("ASEN writer attribution path is invalid");
 const store=await PersistentWorkspaceStore.open(storeFile);
 await store.append({path,actor:{kind:"agent",id:authority.agentId},sessionId:authority.sessionId,projectId:repo,worktree:repo,operation:beforeExists?"modify":"create",at:new Date().toISOString()});
}
export function authorizeToolCall(authority:ToolAuthority,toolName:string,input:Record<string,unknown>):boolean{
 if(toolName!=="read"&&toolName!=="edit"&&toolName!=="write")return false;
 if(toolName!=="read"&&authority.role!=="worker")return false;
 if(typeof input.path!=="string"||!input.path.trim())return false;
 try{
  const repo=realpathSync(authority.repository),target=canonicalTarget(resolve(repo,input.path));
  if(!inside(repo,target))return false;
  if(toolName==="read")return true;
  return authority.writeSurfaces.some(scope=>{
   if(!scope||isAbsolute(scope)||scope.split(/[/\\]/).some(segment=>segment===".."||segment==="."))return false;
   const surface=canonicalTarget(resolve(repo,scope));
   return inside(repo,surface)&&inside(surface,target);
  });
 }catch{return false;}
}

export default function(pi:ExtensionAPI):void{
 let authority:ToolAuthority;const pending=new Map<string,{path:string;operation:"create"|"modify"}>();
 try{
  const parsed=JSON.parse(process.env.ASEN_PI_AUTHORITY??"null") as ToolAuthority;
  if(!parsed||typeof parsed.repository!=="string"||!(["explorer","worker","reviewer","verifier"] as unknown[]).includes(parsed.role)||!Array.isArray(parsed.writeSurfaces)||parsed.writeSurfaces.some(x=>typeof x!=="string")||Object.keys(parsed).some(key=>!["repository","role","writeSurfaces","agentId","sessionId","attributionFile"].includes(key))||(parsed.agentId!==undefined&&(typeof parsed.agentId!=="string"||!parsed.agentId.trim()))||(parsed.sessionId!==undefined&&(typeof parsed.sessionId!=="string"||!parsed.sessionId.trim()))||(parsed.attributionFile!==undefined&&(typeof parsed.attributionFile!=="string"||!isAbsolute(parsed.attributionFile))))throw new Error("Invalid Pi authority");
  authority=parsed;
 }catch{authority={repository:"",role:"explorer",writeSurfaces:[]};}
 pi.on("tool_call",event=>{
  if(!authorizeToolCall(authority,event.toolName,event.input))return {block:true,reason:"ASEN tool authority denied"};
  if(event.toolName!=="edit"&&event.toolName!=="write")return;
  if(!authority.agentId||!authority.sessionId||!authority.attributionFile)return {block:true,reason:"ASEN writer attribution is not configured"};
  const repo=realpathSync(authority.repository),target=canonicalTarget(resolve(repo,event.input.path as string)),path=relative(repo,target);
  if(!path||path==="."||path.startsWith("..")||isAbsolute(path))return {block:true,reason:"ASEN writer attribution path is invalid"};
  pending.set(event.toolCallId,{path,operation:existsSync(target)?"modify":"create"});
 });
 pi.on("tool_result",async event=>{
  const change=pending.get(event.toolCallId);pending.delete(event.toolCallId);if(!change||event.isError)return;
  try{
   const resultRepo=realpathSync(authority.repository),resultTarget=canonicalTarget(resolve(resultRepo,String(event.input.path??""))),resultPath=relative(resultRepo,resultTarget);
   if(resultPath!==change.path)throw new Error("ASEN writer result path does not match its authorized tool call");
   await recordSuccessfulWorkspaceWrite(authority,event.toolName as "edit"|"write",event.input,change.operation==="modify",authority.attributionFile!);
  }catch(error){return {isError:true,content:[{type:"text",text:`ASEN could not persist workspace attribution: ${error instanceof Error?error.message:"unknown error"}`} ]};}
 });
 pi.registerCommand("asen-authority-status",{description:"Report ASEN tool authority policy",handler:async(_args,ctx)=>{ctx.ui.notify(`ASEN ${authority.role} tool policy active`,"info");}});
}
