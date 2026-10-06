import {mkdir,readFile,rename,rm,stat,writeFile} from "node:fs/promises";import path from "node:path";import {randomUUID} from "node:crypto";
export interface SetupEntry{source:string;destination:string}
export interface SetupPlan{home:string;entries:SetupEntry[]}
async function exists(p:string){try{await stat(p);return true}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return false;throw e}}
export function validateSetupPlan(plan:SetupPlan):void{if(!path.isAbsolute(plan.home))throw new Error("ASEN home must be absolute");const seen=new Set<string>();for(const e of plan.entries){if(!path.isAbsolute(e.source)||!path.isAbsolute(e.destination))throw new Error("Setup paths must be absolute");const dest=path.normalize(e.destination);if(!dest.startsWith(path.normalize(plan.home+path.sep)))throw new Error("Setup destination escapes ASEN home");if(seen.has(dest))throw new Error("Duplicate setup destination");seen.add(dest);}}
export async function applySetupPlan(plan:SetupPlan):Promise<{created:string[];unchanged:string[]}>{
 validateSetupPlan(plan);await mkdir(plan.home,{recursive:true});const created:string[]=[],unchanged:string[]=[];
 try{for(const e of plan.entries){const bytes=await readFile(e.source);if(await exists(e.destination)){const current=await readFile(e.destination);if(Buffer.compare(bytes,current)===0){unchanged.push(e.destination);continue;}throw new Error(`Refusing to overwrite existing setup file: ${e.destination}`);}
  await mkdir(path.dirname(e.destination),{recursive:true});const temp=`${e.destination}.${randomUUID()}.tmp`;await writeFile(temp,bytes,{flag:"wx",mode:0o600});await rename(temp,e.destination);created.push(e.destination);}
  return {created,unchanged};
 }catch(error){for(const p of created.reverse())await rm(p,{force:true});throw error;}
}
