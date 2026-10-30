import {realpath} from "node:fs/promises";
import path from "node:path";
import {ASEN_PROFILES_SCHEMA,parseRuntimeProfiles,type RuntimeProfilesFile} from "./profiles.js";

export interface ProfileSessionIdentity{sessionId:string;projectId:string}
export interface SessionProfileSnapshot{
 active:string;
 source:"inherited-global"|"inherited-default"|"explicit-session";
 file:RuntimeProfilesFile;
}
export interface SessionProfileChange{snapshot:SessionProfileSnapshot;global:RuntimeProfilesFile}
interface Binding extends ProfileSessionIdentity{
 pending:Promise<SessionProfileSnapshot>;
 selectionRevision?:number;
 explicit?:SessionProfileSnapshot;
}
type Partition=Map<string,Binding>;
const registryKey=Symbol.for("asen.pi.session-profile-bindings.v1");
const root=globalThis as typeof globalThis&{[registryKey]?:Map<string,Partition>};
const registry=root[registryKey]??=new Map<string,Partition>();

/** Canonicalize an existing file or its nearest existing ancestor without creating it. */
export async function canonicalProfilePartition(file:string):Promise<string>{
 let ancestor=path.resolve(file);const suffix:string[]=[];
 for(;;){
  try{return path.join(await realpath(ancestor),...suffix);}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
   const parent=path.dirname(ancestor);if(parent===ancestor)throw error;
   suffix.unshift(path.basename(ancestor));ancestor=parent;
  }
 }
}
function key(identity:ProfileSessionIdentity):string{
 if(!identity.sessionId||identity.sessionId!==identity.sessionId.trim()||!path.isAbsolute(identity.projectId))throw new Error("Session profile requires an exact session and canonical project");
 return JSON.stringify([identity.sessionId,identity.projectId]);
}
function checkedFile(file:RuntimeProfilesFile):RuntimeProfilesFile{
 const checked=parseRuntimeProfiles(JSON.stringify(file));if(!checked)throw new Error("Invalid profiles file");return checked;
}
function snapshot(file:RuntimeProfilesFile,name?:string):SessionProfileSnapshot{
 const checked=checkedFile(file),selected=checked.profiles.find(profile=>profile.name===(name??checked.active));
 if(name!==undefined&&!selected)throw new Error("Profile does not exist");
 return selected
  ?{active:selected.name,source:name===undefined?"inherited-global":"explicit-session",file:{schema:ASEN_PROFILES_SCHEMA,active:selected.name,profiles:[selected]}}
  :{active:"default",source:"inherited-default",file:{schema:ASEN_PROFILES_SCHEMA,profiles:[]}};
}
function getOrCreateBinding(partition:string,identity:ProfileSessionIdentity,load:()=>Promise<RuntimeProfilesFile>){
 if(!partition)throw new Error("Session profile requires a configuration partition");
 const id=key(identity);
 let bindings=registry.get(partition);if(!bindings){bindings=new Map();registry.set(partition,bindings);}
 const scope=bindings;
 let binding=scope.get(id);
 if(!binding){
  // Register before invoking the asynchronous loader: concurrent captures share one read.
  const owned:Binding={...identity,pending:Promise.resolve().then(load).then(file=>{
   if(scope.get(id)!==owned)throw new Error("Session profile capture ended before completion");
   return snapshot(file);
  }).catch(error=>{
   if(scope.get(id)===owned)scope.delete(id);
   if(scope.size===0&&registry.get(partition)===scope)registry.delete(partition);
   throw error;
  })};
  scope.set(id,owned);binding=owned;
 }
 return {partition,scope,id,binding};
}
function assertOwned(state:ReturnType<typeof getOrCreateBinding>):void{
 if(registry.get(state.partition)!==state.scope||state.scope.get(state.id)!==state.binding)throw new Error("Session profile capture ended before completion");
}
/** Routing data only. Each consumer gets a copy; no permissions or approvals live here. */
export async function captureSessionProfile(partition:string,identity:ProfileSessionIdentity,load:()=>Promise<RuntimeProfilesFile>):Promise<SessionProfileSnapshot>{
 const state=getOrCreateBinding(partition,identity,load),inherited=await state.binding.pending;
 assertOwned(state);return structuredClone(state.binding.explicit??inherited);
}
async function changeSessionProfile(partition:string,identity:ProfileSessionIdentity,name:string|undefined,load:()=>Promise<RuntimeProfilesFile>,validate?:()=>void|Promise<void>):Promise<SessionProfileChange>{
 // Validate ownership inputs before starting a promise that could reject independently.
 if(!partition)throw new Error("Session profile requires a configuration partition");key(identity);
 const read=Promise.resolve().then(load).then(file=>{
  const global=checkedFile(file);return {global,selected:name===undefined?undefined:snapshot(global,name)};
 });
 // A cold invalid selection rejects this original capture too; existing cleanup removes it.
 const state=getOrCreateBinding(partition,identity,async()=>(await read).global);
 const revision=(state.binding.selectionRevision??0)+1;state.binding.selectionRevision=revision;
 const [inherited,current]=await Promise.all([state.binding.pending,read]);
 await validate?.();assertOwned(state);
 if(state.binding.selectionRevision!==revision)throw new Error("Session profile selection was superseded");
 if(current.selected)state.binding.explicit=structuredClone(current.selected);else delete state.binding.explicit;
 return {snapshot:structuredClone(state.binding.explicit??inherited),global:structuredClone(current.global)};
}
export function selectSessionProfile(partition:string,identity:ProfileSessionIdentity,name:string,load:()=>Promise<RuntimeProfilesFile>,validate?:()=>void|Promise<void>):Promise<SessionProfileChange>{
 return changeSessionProfile(partition,identity,name,load,validate);
}
export function resetSessionProfile(partition:string,identity:ProfileSessionIdentity,load:()=>Promise<RuntimeProfilesFile>,validate?:()=>void|Promise<void>):Promise<SessionProfileChange>{
 return changeSessionProfile(partition,identity,undefined,load,validate);
}
export function clearSessionProfiles(partition:string,sessionId:string):void{
 const bindings=registry.get(partition);if(!bindings)return;
 for(const [id,binding] of bindings)if(binding.sessionId===sessionId)bindings.delete(id);
 if(bindings.size===0)registry.delete(partition);
}
