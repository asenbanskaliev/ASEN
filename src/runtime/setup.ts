import {lstat,mkdir,readFile,realpath,rename,rm,writeFile} from "node:fs/promises";import path from "node:path";import {randomUUID} from "node:crypto";
export interface SetupEntry{source:string;destination:string}
export interface SetupPlan{home:string;entries:SetupEntry[]}
async function exists(p:string){try{return await lstat(p)}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw e}}
function isWithin(root:string,candidate:string):boolean{const relative=path.relative(root,candidate);return relative===""||(!path.isAbsolute(relative)&&relative!==".."&&!relative.startsWith(`..${path.sep}`));}
async function prepareDestinationParent(home:string,parent:string):Promise<string>{let ancestor=parent;while(!(await exists(ancestor))){const next=path.dirname(ancestor);if(next===ancestor)throw new Error("Unable to resolve setup destination parent");ancestor=next;}const canonicalAncestor=await realpath(ancestor);if(!isWithin(home,canonicalAncestor))throw new Error(`Setup destination escapes ASEN home through a symlink: ${parent}`);await mkdir(parent,{recursive:true});const canonicalParent=await realpath(parent);if(!isWithin(home,canonicalParent))throw new Error(`Setup destination escapes ASEN home through a symlink: ${parent}`);return canonicalParent;}
export function validateSetupPlan(plan:SetupPlan):void{if(!path.isAbsolute(plan.home))throw new Error("ASEN home must be absolute");const seen=new Set<string>();for(const e of plan.entries){if(!path.isAbsolute(e.source)||!path.isAbsolute(e.destination))throw new Error("Setup paths must be absolute");const dest=path.normalize(e.destination);if(!dest.startsWith(path.normalize(plan.home+path.sep)))throw new Error("Setup destination escapes ASEN home");if(seen.has(dest))throw new Error("Duplicate setup destination");seen.add(dest);}}
export async function applySetupPlan(plan:SetupPlan):Promise<{created:string[];unchanged:string[]}>{
 validateSetupPlan(plan);await mkdir(plan.home,{recursive:true});const canonicalHome=await realpath(plan.home),created:string[]=[],unchanged:string[]=[];
 try{for(const e of plan.entries){const bytes=await readFile(e.source);await prepareDestinationParent(canonicalHome,path.dirname(e.destination));
  const existing=await exists(e.destination);if(existing){if(existing.isSymbolicLink()||!existing.isFile())throw new Error(`Refusing non-regular setup destination: ${e.destination}`);const current=await readFile(e.destination);if(Buffer.compare(bytes,current)===0){unchanged.push(e.destination);continue;}throw new Error(`Refusing to overwrite existing setup file: ${e.destination}`);}
  const temp=`${e.destination}.${randomUUID()}.tmp`;await writeFile(temp,bytes,{flag:"wx",mode:0o600});await rename(temp,e.destination);created.push(e.destination);}
  return {created,unchanged};
 }catch(error){for(const p of created.reverse())await rm(p,{force:true});throw error;}
}
