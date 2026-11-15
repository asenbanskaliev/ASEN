/** Safe, read-only inspection of one prepared Git worktree for a frozen
 * source candidate. This is not code review, test evidence, merge approval,
 * or an agent execution receipt. Never invokes shell or repository hooks. */
import {execFileSync} from "node:child_process";
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
function git(root:string,...args:string[]):string{
 return execFileSync("git",[
  "-c","core.fsmonitor=false","-c","core.untrackedCache=false",
  "-C",root,...args
 ],{
  encoding:"utf8",maxBuffer:1_000_000,timeout:7500,windowsHide:true,
  stdio:["ignore","pipe","ignore"],env:{...process.env,GIT_OPTIONAL_LOCKS:"0"}
 });
}
function plainRelative(path:string):boolean{
 return path.length>0&&path.length<=1024&&path===path.normalize("NFC")&&
 !/[\u0000-\u001f\u007f-\u009f\uFFFD\p{Cf}]/u.test(path)&&
 !path.startsWith("/")&&!path.includes("\\")&&!path.includes(":")&&
 path.split("/").every(part=>!!part&&part!=="."&&part!==".."&&part.toLowerCase()!==".git");
}
function includesPath(paths:readonly string[],value:string):boolean{
 const p=value.toLocaleLowerCase("en-US");
 return paths.some(scope=>{
  const s=scope.toLocaleLowerCase("en-US");
  return p===s||p.startsWith(s+"/");
 });
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
  const untracked=git(root,"ls-files","--others","--directory","-z");
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
