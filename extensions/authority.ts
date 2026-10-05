import {realpathSync} from "node:fs";
import {isAbsolute,join,relative,resolve,dirname} from "node:path";
import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";

export interface ToolAuthority{repository:string;role:"explorer"|"worker"|"reviewer"|"verifier";writeSurfaces:readonly string[];}
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
 let authority:ToolAuthority;
 try{
  const parsed=JSON.parse(process.env.ASEN_PI_AUTHORITY??"null") as ToolAuthority;
  if(!parsed||typeof parsed.repository!=="string"||!(["explorer","worker","reviewer","verifier"] as unknown[]).includes(parsed.role)||!Array.isArray(parsed.writeSurfaces)||parsed.writeSurfaces.some(x=>typeof x!=="string"))throw new Error("Invalid Pi authority");
  authority=parsed;
 }catch{authority={repository:"",role:"explorer",writeSurfaces:[]};}
 pi.on("tool_call",event=>authorizeToolCall(authority,event.toolName,event.input)?undefined:{block:true,reason:"ASEN tool authority denied"});
 pi.registerCommand("asen-authority-status",{description:"Report ASEN tool authority policy",handler:async(_args,ctx)=>{ctx.ui.notify(`ASEN ${authority.role} tool policy active`,"info");}});
}
