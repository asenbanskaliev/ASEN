import {constants,closeSync,fstatSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,unlinkSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {join,resolve} from "node:path";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

function recoverDeadWriterLock(lock:string):boolean{
 let before,contents:string;
 try{before=lstatSync(lock);if(!before.isFile()||before.isSymbolicLink())return false;contents=readFileSync(lock,"utf8");}
 catch{return false;}
 let owner:unknown;try{owner=JSON.parse(contents);}catch{return false;}
 if(!owner||typeof owner!=="object")return false;
 const pid=(owner as {pid?:unknown}).pid,token=(owner as {token?:unknown}).token;
 if(!Number.isSafeInteger(pid)||Number(pid)<1||typeof token!=="string"||!token)return false;
 try{process.kill(Number(pid),0);return false;}
 catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")return false;}
 try{const current=lstatSync(lock);if(!current.isFile()||current.isSymbolicLink()||current.dev!==before.dev||current.ino!==before.ino||readFileSync(lock,"utf8")!==contents)return false;unlinkSync(lock);return true;}
 catch{return false;}
}

/** Fail-closed coordination for a single authorized workspace writer. */
export function acquireWorkspaceWriter(input:{root:string;expectedHead:string;authorizationId:string;allowedPaths:readonly string[]}){
 const {root,expectedHead,authorizationId}=input,requestedPaths=input.allowedPaths;
 const allowedPaths=Array.isArray(requestedPaths)?requestedPaths.map(path=>typeof path==="string"?path.replace(/\/$/u,""):path):requestedPaths;
 if(!/^[0-9a-f]{40,64}$/.test(expectedHead)||!authorizationId||!Array.isArray(allowedPaths)||allowedPaths.length===0
  ||allowedPaths.some(path=>typeof path!=="string"||!path||path.startsWith("/")||path.includes("\\")||path.split("/").some(part=>part===".."||part==="."||!part)))
  throw new Error("Invalid writer authorization");
 const worktree=resolve(root);
 const git=(...args:string[])=>execFileSync("git",["-C",worktree,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 const changedPaths=()=>{
  const output=execFileSync("git",["-C",worktree,"status","--porcelain=v1","-z","--untracked-files=all"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  const rows=output.split("\0"),paths:string[]=[];
  for(let index=0;index<rows.length;index++){
   const row=rows[index]!;if(!row)continue;
   if(row.length<4||row[2]!==" ")throw new Error("Git returned malformed writer status");
   paths.push(row.slice(3));
   if(/[RC]/u.test(row.slice(0,2))){const source=rows[++index];if(!source)throw new Error("Git returned incomplete rename status");paths.push(source);}
  }
  return paths;
 };
 const rootStat=lstatSync(worktree);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error("Writer repository root must be a real directory");
 const rootPath=realpathSync.native(worktree),toplevel=resolve(git("rev-parse","--show-toplevel"));
 if(!sameWorkspaceIdentityPath(toplevel,worktree))throw new Error("Writer must own the exact Git root");
 const gitDir=resolve(worktree,git("rev-parse","--git-dir"));
 const lock=join(gitDir,"asen-t05-writer.lock");
 let fd:number;
 try{fd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);}
 catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST"&&recoverDeadWriterLock(lock)){try{fd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);}catch(retryError){if((retryError as NodeJS.ErrnoException).code==="EEXIST")throw new Error("Workspace writer conflict: another process acquired the recovered lease");throw retryError;}}else if((error as NodeJS.ErrnoException).code==="EEXIST")throw new Error("Workspace writer conflict: live, unsafe, or unverifiable lock remains");else throw error;}
 const identity=fstatSync(fd),token=randomUUID();let released=false;
 const release=()=>{if(released)return;released=true;try{closeSync(fd);}finally{try{const current=lstatSync(lock);if(current.dev===identity.dev&&current.ino===identity.ino)unlinkSync(lock);}catch{ /* Never remove another owner's lock. */ }}};
 try{
  if(git("rev-parse","HEAD")!==expectedHead)throw new Error("Stale writer authorization: HEAD changed");
  if(changedPaths().length)throw new Error("Writer requires a clean workspace");
  writeFileSync(fd,JSON.stringify({token,pid:process.pid,authorizationId,expectedHead,allowedPaths,createdAt:new Date().toISOString()}));fsyncSync(fd);
  return Object.freeze({authorizationId,expectedHead,allowedPaths:Object.freeze([...allowedPaths]),
   verify:()=>{if(released)throw new Error("Writer lease released");const current=lstatSync(lock),currentRoot=lstatSync(worktree);if(current.dev!==identity.dev||current.ino!==identity.ino)throw new Error("Writer lease replaced");if(!currentRoot.isDirectory()||currentRoot.isSymbolicLink()||currentRoot.dev!==rootStat.dev||currentRoot.ino!==rootStat.ino||realpathSync.native(worktree)!==rootPath)throw new Error("Writer repository identity changed");if(git("rev-parse","HEAD")!==expectedHead)throw new Error("Writer candidate changed");for(const path of changedPaths())if(!allowedPaths.some(scope=>path===scope||path.startsWith(scope+"/")))throw new Error(`Writer modified unauthorized path: ${path}`);},
   release});
 }catch(error){release();throw error;}
}
