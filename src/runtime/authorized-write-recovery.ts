import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {isAbsolute,relative,resolve} from "node:path";
import type {BackgroundJobJournal} from "./background-job-journal.js";

export type AuthorizedWriteRecoveryDecision=
 | Readonly<{state:"pending";action:"fresh-authorization-required";observedPaths:readonly string[];reason:string}>
 | Readonly<{state:"completed";action:"do-not-replay";observedPaths:readonly string[];fileSha256:Readonly<Record<string,string>>;reason:string}>
 | Readonly<{state:"uncertain";action:"manual-reconciliation-required";observedPaths:readonly string[];reason:string}>;

function boundedPaths(value:readonly string[],label:string):string[]{
 if(!Array.isArray(value)||!value.length||value.length>256)throw new Error(`${label} must contain bounded repository paths`);
 const paths=value.map(path=>{
  if(typeof path!=="string"||!path||path!==path.trim()||isAbsolute(path)||path.includes("\\")||path.split("/").some(part=>!part||part==="."||part===".."))throw new Error(`${label} contains an unsafe path`);
  return path;
 });
 if(new Set(paths).size!==paths.length)throw new Error(`${label} contains duplicate paths`);
 return paths;
}
function statusPaths(root:string):string[]{
 const raw=execFileSync("git",["-C",root,"status","--porcelain=v1","-z","--untracked-files=all"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 const rows=raw.split("\0"),paths:string[]=[];
 for(let index=0;index<rows.length;index++){
  const row=rows[index]!;if(!row)continue;
  if(row.length<4||row[2]!==" ")throw new Error("Git returned malformed recovery status");
  paths.push(row.slice(3));
  if(/[RC]/u.test(row.slice(0,2))){const source=rows[++index];if(!source)throw new Error("Git returned incomplete recovery rename status");paths.push(source);}
 }
 return [...new Set(paths)].sort();
}

/**
 * Reconciles an interrupted authorized write without executing or replaying it.
 * Exact expected bytes prove completion; a clean tree proves only that a new
 * authorization is needed; every partial, stale or out-of-scope result remains
 * uncertain and blocked.
 */
export function reconcileInterruptedAuthorizedWrite(input:{
 readonly journal:BackgroundJobJournal;
 readonly sessionId:string;
 readonly projectId:string;
 readonly interruptedJobId:string;
 readonly expectedHead:string;
 readonly allowedPaths:readonly string[];
 readonly expectedFileSha256:Readonly<Record<string,string>>;
}):AuthorizedWriteRecoveryDecision{
 const {journal,sessionId,projectId,interruptedJobId,expectedHead}=input;
 if(!sessionId||!projectId||!interruptedJobId||!/^[0-9a-f]{40,64}$/u.test(expectedHead))throw new Error("Recovery identity is invalid");
 const allowed=boundedPaths(input.allowedPaths,"Recovery authorization"),expectedPaths=boundedPaths(Object.keys(input.expectedFileSha256),"Recovery expected outputs").sort();
 if(expectedPaths.some(path=>!allowed.some(scope=>path===scope||path.startsWith(scope+"/"))))throw new Error("Recovery expected output exceeds the authorized paths");
 for(const path of expectedPaths)if(!/^[0-9a-f]{64}$/u.test(input.expectedFileSha256[path]!))throw new Error("Recovery expected output hash is invalid");
 const root=realpathSync(projectId),entry=journal.load(sessionId,root).find(row=>row.id===interruptedJobId);
 if(!entry||entry.state!=="interrupted"||entry.projectId!==root||entry.expectedHead!==expectedHead||!entry.allowedPaths||[...entry.allowedPaths].sort().join("\0")!==[...allowed].sort().join("\0"))throw new Error("Interrupted write does not match its durable authorization");
 const observed=statusPaths(root);
 let head:string;try{head=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();}catch{return Object.freeze({state:"uncertain",action:"manual-reconciliation-required",observedPaths:Object.freeze(observed),reason:"Git candidate identity is unavailable"});}
 if(head!==expectedHead)return Object.freeze({state:"uncertain",action:"manual-reconciliation-required",observedPaths:Object.freeze(observed),reason:"Candidate HEAD changed after interruption"});
 if(observed.length===0)return Object.freeze({state:"pending",action:"fresh-authorization-required",observedPaths:Object.freeze([]),reason:"No authorized output is present; the interrupted grant is never reused"});
 if(observed.some(path=>!allowed.some(scope=>path===scope||path.startsWith(scope+"/"))))return Object.freeze({state:"uncertain",action:"manual-reconciliation-required",observedPaths:Object.freeze(observed),reason:"Workspace contains changes outside the interrupted authorization"});
 if(observed.length!==expectedPaths.length||observed.some((path,index)=>path!==expectedPaths[index]))return Object.freeze({state:"uncertain",action:"manual-reconciliation-required",observedPaths:Object.freeze(observed),reason:"Authorized outputs are partial or differ from the declared operation"});
 const hashes:Record<string,string>={};
 for(const path of expectedPaths){
  const target=resolve(root,path),inside=relative(root,target);
  if(!inside||inside.startsWith("..")||isAbsolute(inside))return Object.freeze({state:"uncertain",action:"manual-reconciliation-required",observedPaths:Object.freeze(observed),reason:"Authorized output escaped the project"});
  try{
   const stat=lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("unsafe output");
   hashes[path]=createHash("sha256").update(readFileSync(target)).digest("hex");
  }catch{return Object.freeze({state:"uncertain",action:"manual-reconciliation-required",observedPaths:Object.freeze(observed),reason:"Authorized output is missing or is not a regular file"});}
  if(hashes[path]!==input.expectedFileSha256[path])return Object.freeze({state:"uncertain",action:"manual-reconciliation-required",observedPaths:Object.freeze(observed),reason:"Authorized output bytes do not match the declared operation"});
 }
 return Object.freeze({state:"completed",action:"do-not-replay",observedPaths:Object.freeze(observed),fileSha256:Object.freeze(hashes),reason:"Exact authorized output is present; replay is forbidden"});
}
