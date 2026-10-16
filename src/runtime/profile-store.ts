import {mkdir,readFile} from "node:fs/promises";
import path from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {ASEN_PROFILES_SCHEMA,parseRuntimeProfiles,serializeRuntimeProfiles,type RuntimeProfilesFile} from "./profiles.js";

export function emptyProfiles():RuntimeProfilesFile{return {schema:ASEN_PROFILES_SCHEMA,profiles:[]};}
export async function readProfilesFile(file:string):Promise<RuntimeProfilesFile>{try{const parsed=parseRuntimeProfiles(await readFile(file,"utf8"));if(!parsed)throw new Error("Invalid profiles file");return parsed;}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return emptyProfiles();throw e;}}
async function writeUnlocked(file:string,value:RuntimeProfilesFile):Promise<void>{await atomicWriteText(file,serializeRuntimeProfiles(value));}
export async function writeProfilesFile(file:string,value:RuntimeProfilesFile):Promise<void>{await mkdir(path.dirname(file),{recursive:true});await withExclusiveFileLock(file,()=>writeUnlocked(file,value));}
export async function mutateProfilesFile(file:string,change:(current:RuntimeProfilesFile)=>RuntimeProfilesFile):Promise<RuntimeProfilesFile>{
 await mkdir(path.dirname(file),{recursive:true});
 return withExclusiveFileLock(file,async()=>{const current=await readProfilesFile(file),next=change(current);await writeUnlocked(file,next);return next;});
}
