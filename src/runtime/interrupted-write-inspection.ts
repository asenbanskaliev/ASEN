import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {isAbsolute} from "node:path";

export interface InterruptedWriteInspection {
 readonly candidate:{readonly expectedRevision:string;readonly observedHead:string;readonly matches:boolean};
 readonly repository:{readonly root:string;readonly clean:boolean};
 readonly changes:readonly {readonly path:string;readonly indexStatus:string;readonly worktreeStatus:string;readonly scope:"approved"|"outside";readonly addedLines?:number;readonly deletedLines?:number;readonly untracked?:true}[];
 readonly recovery:{readonly automaticWriteAllowed:false;readonly freshAuthorizationRequired:true;readonly eligibleForFreshPlan:boolean;readonly findings:readonly string[];readonly nextSteps:readonly string[]};
}

const revisionPattern=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu;
function git(root:string,args:readonly string[]):string{
 return execFileSync("git",[...args],{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:3000,windowsHide:true}).replace(/\r?\n$/u,"");
}
function safeScope(paths:readonly string[]):string[]{
 if(!Array.isArray(paths)||paths.length===0||paths.length>256)throw new TypeError("Interrupted writer inspection requires a bounded approved file scope");
 const normalized=paths.map(path=>{
  if(typeof path!=="string"||!path||path!==path.trim()||path.includes("\0")||isAbsolute(path)||path.split(/[\\/]/u).some(part=>part===".."||part==="."))throw new TypeError("Interrupted writer scope contains an unsafe path");
  return path.replaceAll("\\","/");
 });
 if(new Set(normalized).size!==normalized.length)throw new TypeError("Interrupted writer scope contains duplicate paths");
 return normalized;
}

/** Read-only reconciliation of one interrupted write against its saved candidate and exact scope. */
export function inspectInterruptedWrite(input:{repository:string;expectedRevision:string;writeSurfaces:readonly string[]}):InterruptedWriteInspection{
 if(typeof input.repository!=="string"||!isAbsolute(input.repository))throw new TypeError("Interrupted writer inspection requires an absolute project path");
 if(typeof input.expectedRevision!=="string"||!revisionPattern.test(input.expectedRevision))throw new TypeError("Interrupted writer candidate revision is invalid");
 const scope=safeScope(input.writeSurfaces),root=realpathSync(input.repository);
 // Running rev-parse from this real path proves it belongs to a Git worktree.
 // Ask Git for its relative prefix rather than comparing absolute paths: on
 // Windows, temporary paths can have equivalent short and long spellings.
 const projectPrefix=git(root,["rev-parse","--show-prefix"]);
 if(projectPrefix.split("/").some(part=>part===".."))throw new Error("Interrupted writer project is outside its Git worktree");
 const observedHead=git(root,["rev-parse","HEAD"]);
 if(!revisionPattern.test(observedHead))throw new Error("Git returned an invalid current candidate revision");
 const status=git(root,["status","--porcelain=v1","-z","--untracked-files=all","--no-renames"]);
 const numstat=git(root,["diff","--numstat","HEAD","--"]);
 const counts=new Map<string,{addedLines:number;deletedLines:number}>();
 for(const row of numstat.split("\n")){if(!row)continue;const [added,deleted,...file]=row.split("\t");const path=file.join("\t");if(path)counts.set(path,{addedLines:Number(added)||0,deletedLines:Number(deleted)||0});}
 const records=status.split("\0").filter(Boolean).map(row=>({indexStatus:row.slice(0,1),worktreeStatus:row.slice(1,2),path:row.slice(3)}));
 const changes=records.map(row=>{
  const count=counts.get(row.path),untracked=row.indexStatus==="?"&&row.worktreeStatus==="?";
  return {path:row.path,indexStatus:row.indexStatus,worktreeStatus:row.worktreeStatus,scope:scope.includes(row.path)?"approved" as const:"outside" as const,...(count??{}),...(untracked?{untracked:true as const}:{})};
 }).sort((a,b)=>a.path.localeCompare(b.path));
 const candidateMatches=observedHead===input.expectedRevision,dirty=changes.length>0,outside=changes.filter(row=>row.scope==="outside").map(row=>row.path);
 const findings:string[]=[];
 if(!candidateMatches)findings.push("Git HEAD differs from the interrupted task's saved candidate.");
 if(!dirty)findings.push("No tracked or untracked working-tree changes are currently visible.");
 if(dirty)findings.push(`${changes.length} changed file(s) are present; file contents were not included in this report.`);
 if(outside.length)findings.push(`${outside.length} changed file(s) fall outside the task's saved write scope.`);
 if(changes.some(row=>row.scope==="approved"&&row.untracked))findings.push("At least one approved path is untracked, so its contents have no Git baseline for automatic comparison.");
 const eligibleForFreshPlan=candidateMatches&&!dirty;
 return Object.freeze({candidate:Object.freeze({expectedRevision:input.expectedRevision,observedHead,matches:candidateMatches}),repository:Object.freeze({root,clean:!dirty}),changes:Object.freeze(changes.map(row=>Object.freeze(row))),recovery:Object.freeze({automaticWriteAllowed:false as const,freshAuthorizationRequired:true as const,eligibleForFreshPlan,findings:Object.freeze(findings),nextSteps:Object.freeze(eligibleForFreshPlan?["Create a fresh plan against this exact clean candidate.","Review and approve a new, one-use write scope before execution."]: ["Review each listed change and decide manually whether to keep or revert it.","Resolve out-of-scope, untracked, or candidate drift before creating a fresh plan.","Inspect the current Git state again, then request a new authorization."])})});
}
