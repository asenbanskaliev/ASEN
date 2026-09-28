import {spawn,execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {Candidate,Evidence} from "../core/types.js";
import {EvidenceStore} from "./store.js";

export interface ExecutedEvidence {
 readonly candidateRepository:string;
 readonly candidateId:string;
 readonly candidateRevision:string;
 readonly command:readonly string[];
 readonly cwd:string;
 readonly exitCode:number;
 readonly startedAt:string;
 readonly finishedAt:string;
}
const executed=new WeakSet<object>();
export function assertExactGitCandidate(candidate:Candidate,cwd:string):void{
 const run=(...args:string[])=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
 let prefix:string,head:string;
 try{prefix=run("rev-parse","--show-prefix");head=run("rev-parse","HEAD");}
 catch{throw new Error("Execution evidence requires a Git repository with a checked-out HEAD");}
 if(prefix!==""||realpathSync(cwd)!==realpathSync(candidate.repository))throw new Error("Execution evidence repository mismatch");
 if(head!==candidate.revision)throw new Error("Execution evidence revision mismatch");
 let untracked:string;
 try{untracked=run("ls-files","--others","--exclude-standard");}
 catch{throw new Error("Execution evidence could not inspect untracked Git files");}
 if(untracked!=="")throw new Error("Execution evidence requires no untracked Git files");
 // HEAD alone does not identify the bytes executed from a modified checkout.
 try{execFileSync("git",["-C",cwd,"diff","--quiet","HEAD","--"],{stdio:"ignore"});}
 catch{throw new Error("Execution evidence requires unchanged tracked files at the candidate revision");}
}

export function isExecutedEvidence(value:unknown):value is ExecutedEvidence {
 return typeof value==="object"&&value!==null&&executed.has(value);
}

export async function executeEvidenceCommand(candidate:Candidate,command:readonly [string,...string[]],options:{cwd?:string;timeoutMs?:number}={}):Promise<ExecutedEvidence>{
 if(!candidate.repository||!candidate.id||!candidate.revision)throw new Error("Execution evidence requires exact candidate identity");
 const requestedCwd=options.cwd??candidate.repository;
 assertExactGitCandidate(candidate,requestedCwd);
 // Execute evidence against a detached, candidate-revision-only worktree. The
 // mutable caller checkout is never the tree whose bytes receive authority.
 const parent=await mkdtemp(join(tmpdir(),"asen-evidence-worktree-"));
 const isolated=join(parent,"candidate");
 try{
  execFileSync("git",["-C",candidate.repository,"worktree","add","--detach",isolated,candidate.revision],{stdio:"ignore"});
  assertExactGitCandidate({...candidate,repository:isolated},isolated);
  const startedAt=new Date().toISOString();
  const exitCode=await new Promise<number>((resolve,reject)=>{
   const child=spawn(command[0],command.slice(1),{cwd:isolated,stdio:"ignore",shell:false});
   const timer=setTimeout(()=>{child.kill();reject(new Error("Execution evidence command timed out"));},options.timeoutMs??120000);
   child.on("error",error=>{clearTimeout(timer);reject(error);});
   child.on("close",code=>{clearTimeout(timer);resolve(code??-1);});
  });
  assertExactGitCandidate({...candidate,repository:isolated},isolated);
  assertExactGitCandidate(candidate,requestedCwd);
  const proof=Object.freeze({candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,command:Object.freeze([...command]),cwd:isolated,exitCode,startedAt,finishedAt:new Date().toISOString()});
  executed.add(proof);
  return proof;
 }finally{
  try{execFileSync("git",["-C",candidate.repository,"worktree","remove","--force",isolated],{stdio:"ignore"});}catch{}
  await rm(parent,{recursive:true,force:true});
 }
}

export function addExecutedEvidence(store:EvidenceStore,candidate:Candidate,proof:ExecutedEvidence,evidence:{id:string;kind:"test"|"tdd";summary:string;expectFailure?:boolean}):Evidence{
 if(!isExecutedEvidence(proof))throw new Error("Execution evidence requires ASEN-issued execution proof");
 if(proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision)throw new Error("Execution proof candidate mismatch");
 const expectedFailure=evidence.expectFailure===true;
 if(expectedFailure?proof.exitCode===0:proof.exitCode!==0)throw new Error(expectedFailure?"Expected failing execution did not fail":"Passing execution evidence requires exit code 0");
 return store.addExecuted(candidate,proof,{id:evidence.id,kind:evidence.kind,status:expectedFailure?"expected-fail":"pass",summary:evidence.summary,createdAt:proof.finishedAt});
}
