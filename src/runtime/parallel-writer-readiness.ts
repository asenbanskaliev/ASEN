import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync} from "node:fs";
import {resolve,join} from "node:path";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

export interface ParallelWriterLane {
 root:string;
 head:string;
 paths:readonly string[];
}
export interface ParallelWriterReadiness {
 status:"READINESS_ONLY";
 head:string;
 worktrees:readonly string[];
 humanApproval:false;
 integrationApproved:false;
}
/** Conservative case-folding prevents path aliases on case-insensitive systems.
 * On case-sensitive systems it may block a safe pair, never admit an unsafe one. */
const collides=(a:string,b:string)=>{
 const left=a.toLocaleLowerCase("en-US"),right=b.toLocaleLowerCase("en-US");
 return left===right||left.startsWith(right+"/")||right.startsWith(left+"/");
};
/** A read-only preliminary check, never a writing or merging capability. */
export function inspectParallelWriterReadiness(lanes:readonly ParallelWriterLane[]):ParallelWriterReadiness{
 if(!Array.isArray(lanes)||lanes.length!==2)throw new Error("Exactly two writer lanes required");
 const scopes=lanes.map(lane=>{
  if(!lane||typeof lane.root!=="string"||!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(lane.head)||
   !Array.isArray(lane.paths)||!lane.paths.length||lane.paths.length>256||
   lane.paths.some((p:string)=>typeof p!=="string"||!p||p!==p.trim()||p.length>1024||
    p.startsWith("/")||p.includes("\\")||p.includes(":")||p!==p.normalize("NFC")||/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(p)||
    p.split("/").some(segment=>!segment||segment==="."||segment===".."||segment===".git"))||
   new Set(lane.paths).size!==lane.paths.length||
   lane.paths.some((path:string,index:number)=>lane.paths.slice(index+1).some((other:string)=>collides(path,other))))
   throw new Error("Invalid exact writer scopes");
  const root=resolve(lane.root),stat=lstatSync(root);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("Writer root is not a real directory");
  const real=realpathSync.native(root);
  const git=(...args:string[])=>execFileSync("git",["-C",real,...args],{
   encoding:"utf8",timeout:5000,windowsHide:true,stdio:["ignore","pipe","ignore"]}).trim();
  if(!sameWorkspaceIdentityPath(resolve(git("rev-parse","--show-toplevel")),real))
   throw new Error("Writer root is not the Git worktree root");
  const common=realpathSync.native(resolve(real,git("rev-parse","--git-common-dir")));
  const index=realpathSync.native(resolve(real,git("rev-parse","--git-dir")));
  if(git("rev-parse","HEAD")!==lane.head)throw new Error("Stale writer candidate");
  if(git("status","--porcelain=v1","--untracked-files=all"))
   throw new Error("Writer worktree is not clean");
  for(const path of lane.paths){
   let location=real;
   for(const component of path.split("/")){
    location=join(location,component);
    try{if(lstatSync(location).isSymbolicLink())throw new Error("Writer scope contains symbolic link");}
    catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")break;throw error;}
   }
  }
  return {root:real,index,common,head:lane.head,paths:lane.paths};
 });
 const [a,b]=scopes;
 if(!a||!b)throw new Error("Writer lane missing");
 if(sameWorkspaceIdentityPath(a.root,b.root)||sameWorkspaceIdentityPath(a.index,b.index))
  throw new Error("Writer lanes share a worktree or Git index");
 if(!sameWorkspaceIdentityPath(a.common,b.common))
  throw new Error("Writer worktrees are not from the same repository");
 if(a.head!==b.head)throw new Error("Parallel writers do not share one candidate");
 for(const left of a.paths)for(const right of b.paths)
  if(collides(left,right))
   throw new Error("Parallel writer paths overlap");
 return Object.freeze({status:"READINESS_ONLY",head:a.head,
  worktrees:Object.freeze([a.root,b.root]),humanApproval:false,integrationApproved:false});
}
