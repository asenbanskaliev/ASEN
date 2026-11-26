/** Safe, read-only inspection of one prepared Git worktree for a frozen
 * source candidate. This is not code review, test evidence, merge approval,
 * or an agent execution receipt. Never invokes shell or repository hooks. */
import {execFile,execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {constants,realpathSync,lstatSync} from "node:fs";
import {lstat,open} from "node:fs/promises";
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
/** Huella del índice propio del worktree, acotada y solo de lectura.
 * Se lee del mismo descriptor, sin seguir enlaces en sistemas POSIX.
 * No se permite crecer el índice durante la lectura. */
/** El descriptor no puede bloquearse si el índice pasa a ser una FIFO tras lstat. */
export function gitIndexReadFlags(platform:string):number{
 return platform==="win32"?constants.O_RDONLY:
  constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK;
}
async function indexFingerprint(root:string):Promise<string>{
 const index=(await gitAsync(root,"rev-parse","--git-path","index")).trim();
 const indexPath=isAbsolute(index)?index:resolve(root,index);
 const first=await lstat(indexPath);
 if(!first.isFile()||first.isSymbolicLink()||first.size>32_000_000||first.size<12)
  throw new Error("Índice Git no verificable");
 // Windows no garantiza O_NOFOLLOW: contrastar en ambos sistemas el archivo abierto.
 const file=await open(indexPath,gitIndexReadFlags(process.platform));
 try{
  const info=await file.stat();
  if(!info.isFile()||info.size>32_000_000||info.size<12||
     info.dev!==first.dev||info.ino!==first.ino)
   throw new Error("Índice Git cambiado antes de su lectura");
  // No usar readFile: un proceso concurrente podría ampliar el índice tras stat.
  const bytes=Buffer.alloc(info.size);
  let offset=0;
  while(offset<bytes.length){
   const chunk=await file.read(bytes,offset,bytes.length-offset,offset);
   if(chunk.bytesRead===0)throw new Error("Índice Git truncado");
   offset+=chunk.bytesRead;
  }
  if((await file.read(Buffer.alloc(1),0,1,bytes.length)).bytesRead!==0)
   throw new Error("Índice Git creció durante su lectura");
  const final=await file.stat(),pathNow=await lstat(indexPath);
  if(final.size!==info.size||pathNow.isSymbolicLink()||
     pathNow.dev!==info.dev||pathNow.ino!==info.ino)
   throw new Error("Índice Git sustituido durante su lectura");
  return createHash("sha256").update(bytes).digest("hex");
 }finally{await file.close();}
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
  const initialHead=(await gitAsync(root,"rev-parse","HEAD")).trim();
  const headMatchesBase=initialHead===input.baseRevision;
  let tracked="",untracked="",stable=false;
  // Un archivo preparado entre diff y ls-files podría desaparecer de ambas listas.
  // Reintentar una vez si cambia el índice; persistencia de la carrera = unavailable.
  for(let attempt=0;attempt<2;attempt++){
   const before=await indexFingerprint(root);
   tracked=await gitAsync(root,"diff","--name-only","--no-ext-diff","--no-textconv",
    "--no-renames","-z",input.baseRevision);
   untracked=await gitAsync(root,"ls-files","--others","-z");
   if(before===await indexFingerprint(root)){stable=true;break;}
  }
  if(!stable||(await gitAsync(root,"rev-parse","HEAD")).trim()!==initialHead||
     (await gitAsync(source,"rev-parse","HEAD")).trim()!==input.baseRevision)
   return unavailable();
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
