import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync} from "node:fs";
import type {BigIntStats} from "node:fs";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";
export interface WorkspaceFileChange{readonly path:string;readonly status:string;readonly previousPath?:string;}
export interface WorkspaceRootSnapshot{readonly root:string;readonly head:string;readonly branch:string;readonly files:readonly WorkspaceFileChange[];readonly error?:string;}
export function parseWorkspaceStatus(output:string):WorkspaceFileChange[]{
 if(output!==""&&!output.endsWith("\0"))throw new Error("git status returned unterminated porcelain data");
 const records=output.split("\0"),files:WorkspaceFileChange[]=[];
 for(let index=0;index<records.length;index++){
  const record=records[index]!;
  if(!record){if(index!==records.length-1)throw new Error("git status returned an empty porcelain record");continue;}
  if(record.length<4||record[2]!==" ")throw new Error("git status returned malformed porcelain data");
  const status=record.slice(0,2),file=record.slice(3);if(!file)throw new Error("git status returned an empty path");
  if(/[RC]/u.test(status)){
   const previousPath=records[++index];
   if(!previousPath)throw new Error("git status returned incomplete rename/copy data");
   files.push(Object.freeze({status,path:file,previousPath}));
  }else files.push(Object.freeze({status,path:file}));
 }
 return files;
}
function git(cwd:string,args:string[]):string{return execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000,maxBuffer:8*1024*1024,windowsHide:true});}
export interface WorkspaceRootIdentity{readonly canonical:string;readonly dev:bigint;readonly ino:bigint;readonly birthtimeNs:bigint;}
function identity(stat:BigIntStats,canonical:string):WorkspaceRootIdentity{return Object.freeze({canonical,dev:stat.dev,ino:stat.ino,birthtimeNs:stat.birthtimeNs});}
function sameDirectoryIdentity(left:BigIntStats,right:BigIntStats):boolean{return left.dev===right.dev&&left.ino===right.ino&&left.birthtimeNs===right.birthtimeNs;}
export function captureWorkspaceRootIdentity(root:string,resolveCanonical:(path:string)=>string=realpathSync):WorkspaceRootIdentity{
 const requested=lstatSync(root,{bigint:true});if(!requested.isDirectory()||requested.isSymbolicLink())throw new Error("workspace root is unsafe");
 const canonical=resolveCanonical(root),stat=lstatSync(canonical,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("workspace root is unsafe");if(!sameDirectoryIdentity(requested,stat))throw new Error("workspace root changed during canonicalization");
 return identity(stat,canonical);
}
export function assertWorkspaceRootIdentity(root:string,expected:WorkspaceRootIdentity):void{
 const currentPath=realpathSync(root);if(currentPath!==expected.canonical)throw new Error("workspace root changed during snapshot");
 const current=lstatSync(currentPath,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==expected.dev||current.ino!==expected.ino||current.birthtimeNs!==expected.birthtimeNs)throw new Error("workspace root changed during snapshot");
}
export function snapshotWorkspaceRoots(roots:readonly string[]):readonly WorkspaceRootSnapshot[]{
 return Object.freeze(roots.map(root=>{
  try{
   const rootIdentity=captureWorkspaceRootIdentity(root),canonical=rootIdentity.canonical;
   assertWorkspaceRootIdentity(root,rootIdentity);
   const observedRoot=realpathSync(git(canonical,["rev-parse","--show-toplevel"]).trim());
   assertWorkspaceRootIdentity(root,rootIdentity);
   if(!sameWorkspaceIdentityPath(observedRoot,canonical))throw new Error("workspace must be the exact Git root");
   const head=git(canonical,["rev-parse","HEAD"]).trim();
   assertWorkspaceRootIdentity(root,rootIdentity);
   const branch=git(canonical,["branch","--show-current"]).trim()||"detached";
   assertWorkspaceRootIdentity(root,rootIdentity);
   const status=git(canonical,["status","--porcelain=v1","-z","--untracked-files=all"]);
   assertWorkspaceRootIdentity(root,rootIdentity);
   return Object.freeze({root:canonical,head,branch,files:Object.freeze(parseWorkspaceStatus(status))});
  }catch(error){return Object.freeze({root,head:"",branch:"unavailable",files:Object.freeze([]),error:error instanceof Error?error.message:"workspace unavailable"});}
 }));
}

