/** Safe, read-only inspection of one prepared Git worktree for a frozen
 * source candidate. This is not code review, test evidence, merge approval,
 * or an agent execution receipt. Never invokes shell or repository hooks. */
import {execFile,execFileSync} from "node:child_process";
import {realpathSync,lstatSync} from "node:fs";
import {isAbsolute,resolve} from "node:path";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";

export interface ParallelWorktreeChangeInspection{
 readonly status:"clean"|"scoped-changes"|"out-of-scope"|"head-diverged"|"unavailable";
 readonly changedPaths:readonly string[];
 readonly outOfScopePaths:readonly string[];
 readonly headMatchesBase:boolean;readonly sourceVerified:boolean;
 readonly acceptance:"not-accepted";readonly autoMerge:false;
}
const sha=/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const changedLimit=512;
/** Git -C no hereda GIT_DIR ni GIT_WORK_TREE de Pi/Windows. */
function inspectionGitEnv():NodeJS.ProcessEnv{
 const env:NodeJS.ProcessEnv={};
 for(const [key,value] of Object.entries(process.env)){
  if(!key.toUpperCase().startsWith("GIT_"))env[key]=value;
 }
 env.GIT_OPTIONAL_LOCKS="0";
 return env;
}
function git(root:string,...args:string[]):string{
 return execFileSync("git",[
  "-c","core.fsmonitor=false","-c","core.untrackedCache=false",
  "-C",root,...args
 ],{
  encoding:"utf8",maxBuffer:1_000_000,timeout:7500,windowsHide:true,
  stdio:["ignore","pipe","ignore"],env:inspectionGitEnv()
 });
}
function plainRelative(path:string):boolean{
 return path.length>0&&path.length<=1024&&path===path.normalize("NFC")&&
 !/[\u0000-\u001f\u007f-\u009f\uFFFD\p{Cf}]/u.test(path)&&
 !path.startsWith("/")&&!path.includes("\\")&&!path.includes(":")&&
 path.split("/").every(part=>!!part&&part!=="."&&part!==".."&&part.toLowerCase()!==".git");
}
function includesPath(paths:readonly string[],value:string):boolean{
 // Las rutas Git se comparan exactamente: Foo.ts y foo.ts no comparten permiso.
 return paths.some(scope=>value===scope||value.startsWith(scope+"/"));
}
function commonDir(root:string):string{
 return realpathSync(resolve(root,git(root,"rev-parse","--git-common-dir").trim()));
}
function unavailable():ParallelWorktreeChangeInspection{
 return Object.freeze({status:"unavailable",changedPaths:Object.freeze([]),outOfScopePaths:Object.freeze([]),
  headMatchesBase:false,sourceVerified:false,acceptance:"not-accepted",autoMerge:false});
}
export function inspectParallelWorktreeChanges(input:{
 readonly sourceRoot:string;readonly worktreeRoot:string;readonly baseRevision:string;
 readonly writeSurfaces:readonly string[];
}):ParallelWorktreeChangeInspection{
 try{
  if(!isAbsolute(input.sourceRoot)||!isAbsolute(input.worktreeRoot)||!sha.test(input.baseRevision)||
   !Array.isArray(input.writeSurfaces)||input.writeSurfaces.length<1||
   input.writeSurfaces.length>256||input.writeSurfaces.some(x=>typeof x!=="string"||!plainRelative(x)))
   return unavailable();
  if(!lstatSync(input.worktreeRoot).isDirectory()||lstatSync(input.worktreeRoot).isSymbolicLink())
   return unavailable();
  const source=realpathSync(input.sourceRoot),root=realpathSync(input.worktreeRoot);
  if(sameWorkspaceIdentityPath(source,root)||
   !sameWorkspaceIdentityPath(source,resolve(git(source,"rev-parse","--show-toplevel").trim()))||
   !sameWorkspaceIdentityPath(root,resolve(git(root,"rev-parse","--show-toplevel").trim()))||
   !sameWorkspaceIdentityPath(commonDir(root),commonDir(source))||
   git(source,"rev-parse","HEAD").trim()!==input.baseRevision)
   return unavailable();
  const headMatchesBase=git(root,"rev-parse","HEAD").trim()===input.baseRevision;
  // Compare against base, not HEAD, so local commits remain visible.
  const tracked=git(root,"diff","--name-only","--no-ext-diff","--no-textconv","--no-renames","-z",input.baseRevision);
  // Includes ignored worktree files: absence of an ignore rule is not a write grant.
  const untracked=git(root,"ls-files","--others","-z");
  const raw=[...tracked.split("\0"),...untracked.split("\0")].filter(Boolean);
  if(raw.length>changedLimit||raw.some(x=>!plainRelative(x)))return unavailable();
  const changedPaths=Object.freeze([...new Set(raw)].sort());
  const outOfScopePaths=Object.freeze(changedPaths.filter(x=>!includesPath(input.writeSurfaces,x)));
  const status=outOfScopePaths.length?"out-of-scope":!headMatchesBase?"head-diverged":
   changedPaths.length?"scoped-changes":"clean";
  return Object.freeze({status,changedPaths,outOfScopePaths,headMatchesBase,sourceVerified:true,
   acceptance:"not-accepted",autoMerge:false});
 }catch{return unavailable();}
}

/** Inspección de solo lectura sin bloquear el bucle de eventos de Pi.
 * Misma política de rechazo, mismo alcance y mismos límites del inspector manual.
 */
function gitAsync(root:string,...args:string[]):Promise<string>{
 return new Promise((resolve,reject)=>{
  execFile("git",["-c","core.fsmonitor=false","-c","core.untrackedCache=false",
   "-C",root,...args],{
   encoding:"utf8",maxBuffer:1_000_000,timeout:7500,windowsHide:true,
   env:inspectionGitEnv()
  },(error,stdout)=>{if(error)reject(error);else resolve(stdout);});
 });
}
async function commonDirAsync(root:string):Promise<string>{
 return realpathSync(resolve(root,(await gitAsync(root,"rev-parse","--git-common-dir")).trim()));
}
export async function inspectParallelWorktreeChangesAsync(
 input:Parameters<typeof inspectParallelWorktreeChanges>[0]
):Promise<ParallelWorktreeChangeInspection>{
 try{
  if(!isAbsolute(input.sourceRoot)||!isAbsolute(input.worktreeRoot)||!sha.test(input.baseRevision)||
    !Array.isArray(input.writeSurfaces)||input.writeSurfaces.length<1||
    input.writeSurfaces.length>256||input.writeSurfaces.some(x=>typeof x!=="string"||!plainRelative(x)))
   return unavailable();
  if(!lstatSync(input.worktreeRoot).isDirectory()||lstatSync(input.worktreeRoot).isSymbolicLink())
   return unavailable();
  const source=realpathSync(input.sourceRoot),root=realpathSync(input.worktreeRoot);
  if(sameWorkspaceIdentityPath(source,root)||
    !sameWorkspaceIdentityPath(source,resolve((await gitAsync(source,"rev-parse","--show-toplevel")).trim()))||
    !sameWorkspaceIdentityPath(root,resolve((await gitAsync(root,"rev-parse","--show-toplevel")).trim()))||
    !sameWorkspaceIdentityPath(await commonDirAsync(root),await commonDirAsync(source))||
    (await gitAsync(source,"rev-parse","HEAD")).trim()!==input.baseRevision)
   return unavailable();
  const headMatchesBase=(await gitAsync(root,"rev-parse","HEAD")).trim()===input.baseRevision;
  const tracked=await gitAsync(root,"diff","--name-only","--no-ext-diff","--no-textconv",
   "--no-renames","-z",input.baseRevision);
  const untracked=await gitAsync(root,"ls-files","--others","-z");
  const raw=[...tracked.split("\0"),...untracked.split("\0")].filter(Boolean);
  if(raw.length>changedLimit||raw.some(x=>!plainRelative(x)))return unavailable();
  const changedPaths=Object.freeze([...new Set(raw)].sort());
  const outOfScopePaths=Object.freeze(changedPaths.filter(x=>!includesPath(input.writeSurfaces,x)));
  const status=outOfScopePaths.length?"out-of-scope":!headMatchesBase?"head-diverged":
   changedPaths.length?"scoped-changes":"clean";
  return Object.freeze({status,changedPaths,outOfScopePaths,headMatchesBase,sourceVerified:true,
   acceptance:"not-accepted",autoMerge:false});
 }catch{return unavailable();}
}
