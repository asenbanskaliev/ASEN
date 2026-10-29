import {constants,closeSync,fstatSync,lstatSync,mkdirSync,openSync,readFileSync,unlinkSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {join,resolve} from "node:path";

/** Fail-closed coordination for a single authorized workspace writer. */
export function acquireWorkspaceWriter(input:{root:string;expectedHead:string;authorizationId:string;allowedPaths:readonly string[]}){
 const {root,expectedHead,authorizationId,allowedPaths}=input;
 if(!/^[0-9a-f]{40}$/.test(expectedHead)||!authorizationId||!Array.isArray(allowedPaths)||allowedPaths.length===0
  ||allowedPaths.some(path=>typeof path!=="string"||!path||path.startsWith("/")||path.includes("\\")||path.split("/").some(part=>part===".."||part==="."||!part)))
  throw new Error("Invalid writer authorization");
 const worktree=resolve(root);
 const git=(...args:string[])=>execFileSync("git",["-C",worktree,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 const toplevel=resolve(git("rev-parse","--show-toplevel"));
 if(toplevel!==worktree)throw new Error("Writer must own the exact Git root");
 const gitDir=resolve(worktree,git("rev-parse","--git-dir"));
 const lock=join(gitDir,"asen-t05-writer.lock");
 let fd:number;
 try{fd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);}
 catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new Error("Workspace writer conflict: another writer owns this repository");throw error;}
 const identity=fstatSync(fd),token=randomUUID();let released=false;
 const release=()=>{if(released)return;released=true;try{closeSync(fd);}finally{try{const current=lstatSync(lock);if(current.dev===identity.dev&&current.ino===identity.ino)unlinkSync(lock);}catch{ /* Never remove another owner's lock. */ }}};
 try{
  if(git("rev-parse","HEAD")!==expectedHead)throw new Error("Stale writer authorization: HEAD changed");
  if(git("status","--porcelain=v1","--untracked-files=all"))throw new Error("Writer requires a clean workspace");
  writeFileSync(fd,JSON.stringify({token,authorizationId,expectedHead,allowedPaths,createdAt:new Date().toISOString()}));
  return Object.freeze({authorizationId,expectedHead,allowedPaths:Object.freeze([...allowedPaths]),
   verify:()=>{if(released)throw new Error("Writer lease released");const current=lstatSync(lock);if(current.dev!==identity.dev||current.ino!==identity.ino)throw new Error("Writer lease replaced");if(git("rev-parse","HEAD")!==expectedHead)throw new Error("Writer candidate changed");const changed=git("status","--porcelain=v1","--untracked-files=all");for(const row of changed.split("\n").filter(Boolean)){const path=row.slice(3);if(!allowedPaths.includes(path))throw new Error("Writer modified a path outside authorization");}},
   release});
 }catch(error){release();throw error;}
}
