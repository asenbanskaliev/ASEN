import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync} from "node:fs";
export interface WorkspaceFileChange{readonly path:string;readonly status:string;}
export interface WorkspaceRootSnapshot{readonly root:string;readonly head:string;readonly branch:string;readonly files:readonly WorkspaceFileChange[];readonly error?:string;}
export function snapshotWorkspaceRoots(roots:readonly string[]):readonly WorkspaceRootSnapshot[]{
 return Object.freeze(roots.map(root=>{
  try{
   const canonical=realpathSync(root),stat=lstatSync(canonical);
   if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("workspace root is unsafe");
   const head=execFileSync("git",["-C",canonical,"rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
   const branch=execFileSync("git",["-C",canonical,"branch","--show-current"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()||"detached";
   const status=execFileSync("git",["-C",canonical,"status","--porcelain=v1","--untracked-files=all"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
   const files=status?status.split("\n").map(line=>Object.freeze({status:line.slice(0,2),path:line.slice(3)})):[];
   return Object.freeze({root:canonical,head,branch,files:Object.freeze(files)});
  }catch(error){return Object.freeze({root,head:"",branch:"unavailable",files:Object.freeze([]),error:error instanceof Error?error.message:"workspace unavailable"});}
 }));
}

