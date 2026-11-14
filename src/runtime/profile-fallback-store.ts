import {mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {isThinking,type Thinking} from "./profiles.js";

export const ASEN_PROFILE_FALLBACKS_SCHEMA="asen.profile-fallbacks/v1" as const;
export const DEFAULT_PROFILE_FALLBACK_ROLE="*" as const;
export const MAX_PROFILE_FALLBACK_CHAIN_LENGTH=8;

export interface ProfileFallbackStep{model:string;thinking?:Thinking}
export type ProfileFallbackChain=readonly ProfileFallbackStep[];
export interface ProfileFallbacksFile{
 schema:typeof ASEN_PROFILE_FALLBACKS_SCHEMA;
 profiles:Record<string,Record<string,ProfileFallbackStep[]>>;
}

const NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_PROFILES=64;
const MAX_ROLES_PER_PROFILE=64;
const MAX_MODEL_LENGTH=256;
const MAX_FILE_TEXT_BYTES=1024*1024;

function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value);}
function exactKeys(value:Record<string,unknown>,allowed:readonly string[]):boolean{return Object.keys(value).every(key=>allowed.includes(key));}
function validProfileName(value:string):boolean{return NAME.test(value);}
function validRole(value:string):boolean{return value===DEFAULT_PROFILE_FALLBACK_ROLE||NAME.test(value);}
function validModel(value:string):boolean{return value.length>0&&value.length<=MAX_MODEL_LENGTH&&value===value.trim()&&!/[\u0000-\u001f\u007f]/u.test(value);}

function normalizeStep(value:unknown):ProfileFallbackStep|undefined{
 if(!record(value)||!exactKeys(value,["model","thinking"])||typeof value.model!=="string"||!validModel(value.model))return undefined;
 if(value.thinking===undefined)return {model:value.model};
 return isThinking(value.thinking)?{model:value.model,thinking:value.thinking}:undefined;
}
function normalizeChain(value:unknown):ProfileFallbackStep[]|undefined{
 if(!Array.isArray(value)||value.length>MAX_PROFILE_FALLBACK_CHAIN_LENGTH)return undefined;
 const chain:ProfileFallbackStep[]=[];
 const models=new Set<string>();
 for(const candidate of value){const step=normalizeStep(candidate);if(!step||models.has(step.model))return undefined;models.add(step.model);chain.push(step);}
 return chain;
}

export function emptyProfileFallbacks():ProfileFallbacksFile{return {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:{}};}
export function normalizeProfileFallbacks(value:unknown):ProfileFallbacksFile|undefined{
 if(!record(value)||!exactKeys(value,["schema","profiles"])||value.schema!==ASEN_PROFILE_FALLBACKS_SCHEMA||!record(value.profiles))return undefined;
 const profileEntries=Object.entries(value.profiles);if(profileEntries.length>MAX_PROFILES)return undefined;
 const profiles:Array<[string,Record<string,ProfileFallbackStep[]>]>=[];
 for(const [profile,candidateRoles] of profileEntries){
  if(!validProfileName(profile)||!record(candidateRoles))return undefined;
  const roleEntries=Object.entries(candidateRoles);if(roleEntries.length>MAX_ROLES_PER_PROFILE)return undefined;
  const roles:Array<[string,ProfileFallbackStep[]]>=[];
  for(const [role,candidateChain] of roleEntries){const chain=validRole(role)?normalizeChain(candidateChain):undefined;if(!chain)return undefined;if(chain.length>0)roles.push([role,chain]);}
  if(roles.length>0)profiles.push([profile,Object.fromEntries(roles)]);
 }
 return {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:Object.fromEntries(profiles)};
}
export function parseProfileFallbacks(raw:string):ProfileFallbacksFile|undefined{
 if(Buffer.byteLength(raw,"utf8")>MAX_FILE_TEXT_BYTES)return undefined;
 try{return normalizeProfileFallbacks(JSON.parse(raw));}catch{return undefined;}
}
function prepareProfileFallbacks(value:ProfileFallbacksFile):{checked:ProfileFallbacksFile;text:string}{
 const checked=normalizeProfileFallbacks(value);if(!checked)throw new Error("Invalid profile fallback file");
 const text=`${JSON.stringify(checked,null,2)}\n`;if(Buffer.byteLength(text,"utf8")>MAX_FILE_TEXT_BYTES)throw new Error("Profile fallback file is too large");
 return {checked,text};
}
export function serializeProfileFallbacks(value:ProfileFallbacksFile):string{return prepareProfileFallbacks(value).text;}
export async function readProfileFallbacksFile(file:string):Promise<ProfileFallbacksFile>{
 try{const parsed=parseProfileFallbacks(await readFile(file,"utf8"));if(!parsed)throw new Error("Invalid profile fallback file");return parsed;}
 catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return emptyProfileFallbacks();throw error;}
}
async function writeUnlocked(file:string,value:ProfileFallbacksFile):Promise<ProfileFallbacksFile>{
 const {checked,text}=prepareProfileFallbacks(value);await atomicWriteText(file,text);return checked;
}
export async function writeProfileFallbacksFile(file:string,value:ProfileFallbacksFile):Promise<void>{
 prepareProfileFallbacks(value);
 await mkdir(path.dirname(file),{recursive:true});
 await withExclusiveFileLock(file,async()=>{await readProfileFallbacksFile(file);await writeUnlocked(file,value);});
}
export async function updateProfileFallbacksFile(file:string,change:(current:ProfileFallbacksFile)=>ProfileFallbacksFile|Promise<ProfileFallbacksFile>):Promise<ProfileFallbacksFile>{
 await mkdir(path.dirname(file),{recursive:true});
 return withExclusiveFileLock(file,async()=>{const current=await readProfileFallbacksFile(file);const next=await change(current);return writeUnlocked(file,next);});
}

export function resolveProfileFallbackChain(file:ProfileFallbacksFile,profile:string|undefined,role:string):ProfileFallbackStep[]{
 if(!profile||!validProfileName(profile)||!validRole(role)||!Object.hasOwn(file.profiles,profile))return [];
 const roles=file.profiles[profile];if(!roles)return [];
 const chain=Object.hasOwn(roles,role)?roles[role]:Object.hasOwn(roles,DEFAULT_PROFILE_FALLBACK_ROLE)?roles[DEFAULT_PROFILE_FALLBACK_ROLE]:undefined;
 return chain?.map(item=>({...item}))??[];
}
export function setProfileFallbackChain(file:ProfileFallbacksFile,profile:string,role:string,steps:ProfileFallbackChain):ProfileFallbacksFile{
 const checked=normalizeProfileFallbacks(file);if(!checked)throw new Error("Invalid profile fallback file");
 if(!validProfileName(profile))throw new Error("Invalid profile name");if(!validRole(role))throw new Error("Invalid fallback role");
 const chain=normalizeChain(steps.map(item=>({...item})));if(!chain)throw new Error("Invalid profile fallback chain");
 const roles=Object.hasOwn(checked.profiles,profile)?Object.fromEntries(Object.entries(checked.profiles[profile]??{}).map(([name,value])=>[name,value.map(item=>({...item}))])):{};
 if(chain.length>0)Object.defineProperty(roles,role,{value:chain,enumerable:true,configurable:true,writable:true});else delete roles[role];
 const profiles=Object.fromEntries(Object.entries(checked.profiles).map(([name,value])=>[name,Object.fromEntries(Object.entries(value).map(([key,items])=>[key,items.map(item=>({...item}))]))]));
 if(Object.keys(roles).length>0)Object.defineProperty(profiles,profile,{value:roles,enumerable:true,configurable:true,writable:true});else delete profiles[profile];
 const next={schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles};const normalized=normalizeProfileFallbacks(next);if(!normalized)throw new Error("Invalid profile fallback file");return normalized;
}
export function renameProfileFallbacks(file:ProfileFallbacksFile,from:string,to:string):ProfileFallbacksFile{
 const checked=normalizeProfileFallbacks(file);if(!checked)throw new Error("Invalid profile fallback file");
 if(!validProfileName(from)||!validProfileName(to))throw new Error("Invalid profile name");
 if(!Object.hasOwn(checked.profiles,from))return checked;if(from!==to&&Object.hasOwn(checked.profiles,to))throw new Error("Profile fallback target already exists");
 return {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:Object.fromEntries(Object.entries(checked.profiles).map(([name,roles])=>[name===from?to:name,roles]))};
}
export function removeProfileFallbacks(file:ProfileFallbacksFile,profile:string):ProfileFallbacksFile{
 const checked=normalizeProfileFallbacks(file);if(!checked)throw new Error("Invalid profile fallback file");if(!validProfileName(profile))throw new Error("Invalid profile name");
 return {schema:ASEN_PROFILE_FALLBACKS_SCHEMA,profiles:Object.fromEntries(Object.entries(checked.profiles).filter(([name])=>name!==profile))};
}
