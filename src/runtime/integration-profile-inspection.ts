import {parseRuntimeProfiles,resolveRuntimeRoute,type ProfileLayer,type RuntimeProfilesFile,type Thinking} from "./profiles.js";
import type {SessionProfileSnapshot} from "./session-profile-binding.js";

const SCAN_LIMIT=256;
const ENTRY_LIMIT=32;
const publicName=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/u.test(value);
const roleName=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value);
type RecordValue=Record<string,unknown>;
const record=(value:unknown):RecordValue|undefined=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as RecordValue:undefined;

/** Structural subsets of public inventory rows; no config reader or health API. */
export interface PublicInventoryRow {
 name:string;
 source?:string;
 sourceInfo?:{source?:string;scope?:string;origin?:string};
 namespace?:{name:string};
}
export interface LoadedProfileInspection {
 layers:ProfileLayer;
 /** A missing file is absent; parse/read failure must be unavailable. */
 projectState:"loaded"|"absent"|"unavailable";
 roles:readonly string[];
 snapshot?:SessionProfileSnapshot;
}
export interface IntegrationProfileInspectionInput {
 getCommands?:()=>readonly PublicInventoryRow[];
 getAllTools?:()=>readonly PublicInventoryRow[];
 profiles?:LoadedProfileInspection;
}
export interface InventoryEntry {
 name:string;
 namespace?:string;
 status:"configured"|"registered";
 connection:"unknown";
 provenance:{source:"extension"|"prompt"|"skill"|"builtin"|"sdk"|"unknown";scope?:"user"|"project"|"temporary";origin?:"package"|"top-level"};
}
export interface InventoryInspection {
 state:"unavailable"|"empty"|"reported";
 entries:InventoryEntry[];
 /** Rows were withheld or the scan/output cap was reached; never a total count. */
 limited:boolean;
 diagnostic?:string;
}
export interface ProfileRouteInspection {
 role:string;
 source:ReturnType<typeof resolveRuntimeRoute>["source"];
 configured:boolean;
 /** Raw model strings can contain private URLs/paths, so only presence is public. */
 model:"configured"|"unspecified";
 thinking?:Thinking;
 actual:"unknown";
}
export interface ProfileInspection {
 state:"available"|"unavailable";
 routes:ProfileRouteInspection[];
 limited:boolean;
 diagnostic?:string;
 snapshot?:{active:string;source:SessionProfileSnapshot["source"];frozen:true;lifetime:"in-process";restartDurability:"unproven"};
}
export interface IntegrationProfileInspection {
 commands:InventoryInspection;
 tools:InventoryInspection;
 profiles:ProfileInspection;
}

function inventory(reader:(()=>readonly PublicInventoryRow[])|undefined,kind:"commands"|"tools"):InventoryInspection {
 try {
  if(typeof reader!=="function")throw new Error();
  const rows=reader();
  if(!Array.isArray(rows))throw new Error();
  const entries:InventoryEntry[]=[],seen=new Set<string>();
  let limited=rows.length>SCAN_LIMIT;
  for(let i=0;i<Math.min(rows.length,SCAN_LIMIT);i++){
   const row=record(rows[i]);
   if(!row||!publicName(row.name)){limited=true;continue;}
   const info=record(row.sourceInfo),ns=record(row.namespace);
   const namespace=kind==="tools"&&publicName(ns?.name)?ns.name:undefined;
   const id=JSON.stringify([row.name,namespace]);
   if(seen.has(id))continue;
   seen.add(id);
   if(entries.length>=ENTRY_LIMIT){limited=true;continue;}
   const source=kind==="commands"?row.source:info?.source;
   const provenance:InventoryEntry["provenance"]={source:
    kind==="commands"&&(source==="extension"||source==="prompt"||source==="skill")?source:
    kind==="tools"&&(source==="builtin"||source==="sdk")?source:"unknown"};
   if(info?.scope==="user"||info?.scope==="project"||info?.scope==="temporary")provenance.scope=info.scope;
   if(info?.origin==="package"||info?.origin==="top-level")provenance.origin=info.origin;
   entries.push({name:row.name,...(namespace?{namespace}:{}),status:kind==="commands"?"configured":"registered",connection:"unknown",provenance});
  }
  if(rows.length===0)return {state:"empty",entries,limited,diagnostic:"No entries reported; configuration and connectivity are unknown."};
  return {state:"reported",entries,limited};
 } catch {
  return {state:"unavailable",entries:[],limited:false,diagnostic:"Inventory unavailable."};
 }
}

function checked(file:RuntimeProfilesFile):RuntimeProfilesFile {
 const parsed=parseRuntimeProfiles(JSON.stringify(file));
 if(!parsed)throw new Error();
 return parsed;
}
function profiles(input:LoadedProfileInspection|undefined):ProfileInspection {
 try {
  if(!input||!(input.projectState==="loaded"||input.projectState==="absent")||!Array.isArray(input.roles))throw new Error();
  if(input.projectState==="loaded"&&!input.layers.project)throw new Error();
  if(input.projectState==="absent"&&input.layers.project)throw new Error();
  const layers:ProfileLayer={};
  for(const key of ["session","project","global"] as const){
   const file=input.layers[key];
   if(file!==undefined)layers[key]=checked(file);
  }
  let snapshot:ProfileInspection["snapshot"];
  if(input.snapshot){
   const frozen=input.snapshot;
   if(!roleName(frozen.active)||!["explicit-session","inherited-global","inherited-default"].includes(frozen.source))throw new Error();
   const file=checked(frozen.file);
   if((file.active??"default")!==frozen.active)throw new Error();
   if(frozen.source==="explicit-session")layers.session=file;
   else layers.global=file;
   snapshot={active:frozen.active,source:frozen.source,frozen:true,lifetime:"in-process",restartDurability:"unproven"};
  }
  const routes:ProfileRouteInspection[]=[],seen=new Set<string>();
  let limited=input.roles.length>SCAN_LIMIT;
  for(const role of input.roles.slice(0,SCAN_LIMIT)){
   if(!roleName(role)){limited=true;continue;}
   if(seen.has(role))continue;
   seen.add(role);
   if(routes.length>=ENTRY_LIMIT){limited=true;continue;}
   const resolved=resolveRuntimeRoute(layers,role),choice=resolved.choice;
   routes.push({role,source:resolved.source,configured:choice!==undefined,model:choice?.model!==undefined?"configured":"unspecified",...(choice?.thinking!==undefined?{thinking:choice.thinking}:{}),actual:"unknown"});
  }
  return {state:"available",routes,limited,...(snapshot?{snapshot}:{})};
 } catch {
  return {state:"unavailable",routes:[],limited:false,diagnostic:"Profile inspection unavailable."};
 }
}

/** Detached read-only facts only: no filesystem, registry mutations, connection checks or execution. */
export function inspectIntegrationProfiles(input:IntegrationProfileInspectionInput):IntegrationProfileInspection {
 return {commands:inventory(input.getCommands,"commands"),tools:inventory(input.getAllTools,"tools"),profiles:profiles(input.profiles)};
}
