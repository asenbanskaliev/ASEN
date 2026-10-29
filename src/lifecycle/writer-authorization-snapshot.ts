import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync,type Stats} from "node:fs";
import {isAbsolute,join,relative} from "node:path";
import type {Candidate} from "../core/types.js";

/**
 * Private before/after binding for one active writer grant.
 *
 * This is deliberately an execution guard, not durable authority.  It is kept
 * behind the phase-grant WeakMap so a restarted process cannot revive it.
 */
export interface WriterAuthorizationSnapshot {
 readonly repository:string;
 readonly revision:string;
 readonly surfaces:readonly string[];
 readonly root:{readonly dev:number;readonly ino:number;readonly birthtimeMs:number};
}

function git(root:string,args:readonly string[]):Buffer {
 return execFileSync("git",["-c","core.fsmonitor=false","-C",root,...args],{
  env:{PATH:process.env.PATH??"",Path:process.env.Path,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null",GIT_OPTIONAL_LOCKS:"0",GIT_NO_REPLACE_OBJECTS:"1",GIT_TERMINAL_PROMPT:"0",GIT_ALLOW_PROTOCOL:""},
  stdio:["ignore","pipe","ignore"],maxBuffer:16*1024*1024,windowsHide:true,
 });
}
function gitText(root:string,args:readonly string[]):string{return git(root,args).toString("utf8").trim();}
function repositoryRoot(candidate:Candidate):{root:string;info:Stats} {
 if(!candidate.repository||!candidate.revision)throw new Error("Writer authorization requires an exact candidate");
 const supplied=lstatSync(candidate.repository) as Stats;
 if(!supplied.isDirectory()||supplied.isSymbolicLink())throw new Error("Writer authorization repository is unsafe");
 const root=realpathSync(candidate.repository),info=lstatSync(root) as Stats;
 if(!info.isDirectory()||info.isSymbolicLink())throw new Error("Writer authorization repository is unsafe");
 if(gitText(root,["rev-parse","--show-toplevel"])!==root)throw new Error("Writer authorization requires the Git toplevel");
 if(gitText(root,["rev-parse","HEAD"])!==candidate.revision)throw new Error("Writer authorization candidate changed");
 return {root,info};
}
function safeSurfaces(surfaces:readonly string[]):string[]{
 if(!Array.isArray(surfaces)||!surfaces.length||surfaces.length>256)throw new Error("Writer authorization requires bounded surfaces");
 const clean=surfaces.map(surface=>{
  if(typeof surface!=="string"||!surface||surface!==surface.trim()||isAbsolute(surface)||surface.includes("\\")||surface.includes(":"))throw new Error("Writer authorization surface is invalid");
  const value=surface.replace(/\/$/u,"");
  if(!value||value.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Writer authorization surface is invalid");
  return value;
 });
 if(new Set(clean).size!==clean.length)throw new Error("Writer authorization surfaces must be unique");
 return clean;
}
function assertSafeSurfacePaths(root:string,surfaces:readonly string[]):void{
 for(const surface of surfaces){
  let current=root;
  for(const component of surface.split("/")){
   current=join(current,component);
   try{if(lstatSync(current).isSymbolicLink())throw new Error("Writer authorization surface is symbolic link");}
   catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")break;throw error;}
  }
 }
}
function cleanWorkspace(root:string):void{
 if(git(root,["status","--porcelain=v1","-z","--untracked-files=all"]).length!==0)throw new Error("Writer authorization requires an unchanged workspace snapshot");
}
function assertRoot(snapshot:WriterAuthorizationSnapshot):void{
 const root=realpathSync(snapshot.repository),info=lstatSync(root);
 if(root!==snapshot.repository||!info.isDirectory()||info.isSymbolicLink()||info.dev!==snapshot.root.dev||info.ino!==snapshot.root.ino||info.birthtimeMs!==snapshot.root.birthtimeMs)throw new Error("Writer authorization repository identity changed");
 if(gitText(root,["rev-parse","HEAD"])!==snapshot.revision)throw new Error("Writer authorization candidate changed");
}
function nulPaths(root:string,args:readonly string[]):string[]{
 const bytes=git(root,args);if(!bytes.length)return [];
 const values=bytes.toString("utf8").split("\0");
 if(values.pop()!=="")throw new Error("Git returned an invalid writer authorization path list");
 if(values.some(path=>!path||path.includes("\\")||path.includes("\0")))throw new Error("Git returned an unsafe writer authorization path");
 return values;
}
function allowed(snapshot:WriterAuthorizationSnapshot,path:string):boolean{
 if(!path||isAbsolute(path)||path.includes("\\")||path.split("/").some(part=>!part||part==="."||part===".."))return false;
 return snapshot.surfaces.some(surface=>path===surface||path.startsWith(surface+"/"));
}

/** Capture the exact clean state immediately before the one-use writer starts. */
export function captureWriterAuthorizationSnapshot(candidate:Candidate,surfaces:readonly string[]):WriterAuthorizationSnapshot{
 const {root,info}=repositoryRoot(candidate),scope=safeSurfaces(surfaces);
 assertSafeSurfacePaths(root,scope);
 cleanWorkspace(root);
 const snapshot=Object.freeze({repository:root,revision:candidate.revision,surfaces:Object.freeze(scope),root:Object.freeze({dev:info.dev,ino:info.ino,birthtimeMs:info.birthtimeMs})});
 assertWriterAuthorizationSnapshotCurrent(snapshot);
 return snapshot;
}

/** Reject a race before the writer receives execution control. */
export function assertWriterAuthorizationSnapshotCurrent(snapshot:WriterAuthorizationSnapshot):void{
 assertRoot(snapshot);assertSafeSurfacePaths(snapshot.repository,snapshot.surfaces);cleanWorkspace(snapshot.repository);
}

/**
 * Verify the resulting real Git state.  Changes are never silently attributed
 * to an authorization if they fall outside its original scope.
 */
export function assertWriterAuthorizationSnapshotOutcome(snapshot:WriterAuthorizationSnapshot):readonly string[]{
 assertRoot(snapshot);
 const changed=[
  ...nulPaths(snapshot.repository,["diff","--name-only","-z","HEAD","--"]),
  ...nulPaths(snapshot.repository,["ls-files","--others","--exclude-standard","-z"]),
 ];
 const unique=[...new Set(changed)].sort();
 const outside=unique.filter(path=>!allowed(snapshot,path));
 if(outside.length)throw new Error(`Writer authorization observed changes outside its exact scope: ${outside.join(", ")}`);
 // A path that escaped the repository cannot be admitted through a Git name.
 for(const path of unique){const absolute=realpathSync(snapshot.repository),target=relative(absolute,absolute+"/"+path);if(target===".."||target.startsWith("../")||isAbsolute(target))throw new Error("Writer authorization observed an unsafe change path");}
 return Object.freeze(unique);
}
