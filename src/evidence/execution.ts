import {spawn,execFileSync,type ChildProcess} from "node:child_process";
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

function waitForProcessExit(child:ChildProcess):Promise<void>{
 if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve();
 return new Promise(resolve=>{
  const done=()=>{child.removeListener("close",done);child.removeListener("error",done);resolve();};
  child.once("close",done);child.once("error",done);
 });
}

async function terminateProcessTree(child:ChildProcess):Promise<void>{
 if(!child.pid)return;
 const exited=waitForProcessExit(child);
 if(process.platform==="win32"){
  await new Promise<void>(resolve=>{
   const killer=spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});
   killer.once("error",()=>{child.kill("SIGKILL");resolve();});
   killer.once("close",code=>{if(code!==0)child.kill("SIGKILL");resolve();});
  });
 }else{
  try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}
 }
 await exited;
}

export function assertExactGitCandidate(candidate:Candidate,cwd:string):void{
 const run=(...args:string[])=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],maxBuffer:16*1024*1024}).trim();
 let prefix:string,head:string;
 try{prefix=run("rev-parse","--show-prefix");head=run("rev-parse","HEAD");}
 catch{throw new Error("Execution evidence requires a Git repository with a checked-out HEAD");}
 if(prefix!==""||realpathSync(cwd)!==realpathSync(candidate.repository))throw new Error("Execution evidence repository mismatch");
 if(head!==candidate.revision)throw new Error("Execution evidence revision mismatch");
 let untracked:string;
 try{untracked=run("ls-files","--others","--exclude-standard");}
 catch(error){throw new Error(`Execution evidence could not inspect untracked Git files: ${error instanceof Error?error.message:String(error)}`);}
 if(untracked!=="")throw new Error(`Execution evidence requires no untracked Git files: ${untracked.split("\n").slice(0,20).join(", ")}${untracked.split("\n").length>20?" …":""}`);
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
   const child=spawn(command[0],command.slice(1),{cwd:isolated,stdio:"ignore",shell:false,detached:process.platform!=="win32"});
   let timedOut=false;
   const timer=setTimeout(()=>{
    timedOut=true;
    void terminateProcessTree(child).finally(()=>reject(new Error("Execution evidence command timed out")));
   },options.timeoutMs??120000);
   child.on("error",error=>{clearTimeout(timer);if(!timedOut)reject(error);});
   child.on("close",code=>{clearTimeout(timer);if(!timedOut)resolve(code??-1);});
  });
  assertExactGitCandidate({...candidate,repository:isolated},isolated);
  assertExactGitCandidate(candidate,requestedCwd);
  const proof=Object.freeze({candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,command:Object.freeze([...command]),cwd:isolated,exitCode,startedAt,finishedAt:new Date().toISOString()});
  executed.add(proof);
  return proof;
 }finally{
  try{execFileSync("git",["-C",candidate.repository,"worktree","remove","--force",isolated],{stdio:"ignore"});}
  catch{/* The recursive parent cleanup below remains authoritative. */}
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
