import {spawn,execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
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
function assertExactGitCandidate(candidate:Candidate,cwd:string):void{
 const run=(...args:string[])=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
 let prefix:string,head:string;
 try{prefix=run("rev-parse","--show-prefix");head=run("rev-parse","HEAD");}
 catch{throw new Error("Execution evidence requires a Git repository with a checked-out HEAD");}
 if(prefix!==""||realpathSync(cwd)!==realpathSync(candidate.repository))throw new Error("Execution evidence repository mismatch");
 if(head!==candidate.revision)throw new Error("Execution evidence revision mismatch");
}

export function isExecutedEvidence(value:unknown):value is ExecutedEvidence {
 return typeof value==="object"&&value!==null&&executed.has(value);
}

export async function executeEvidenceCommand(candidate:Candidate,command:readonly [string,...string[]],options:{cwd?:string;timeoutMs?:number}={}):Promise<ExecutedEvidence>{
 if(!candidate.repository||!candidate.id||!candidate.revision)throw new Error("Execution evidence requires exact candidate identity");
 const cwd=options.cwd??candidate.repository;
 assertExactGitCandidate(candidate,cwd);
 const startedAt=new Date().toISOString();
 const exitCode=await new Promise<number>((resolve,reject)=>{
  const child=spawn(command[0],command.slice(1),{cwd,stdio:"ignore",shell:false});
  const timer=setTimeout(()=>{child.kill();reject(new Error("Execution evidence command timed out"));},options.timeoutMs??120000);
  child.on("error",error=>{clearTimeout(timer);reject(error);});
  child.on("close",code=>{clearTimeout(timer);resolve(code??-1);});
 });
 assertExactGitCandidate(candidate,cwd);
 const proof=Object.freeze({candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,command:Object.freeze([...command]),cwd,exitCode,startedAt,finishedAt:new Date().toISOString()});
 executed.add(proof);
 return proof;
}

export function addExecutedEvidence(store:EvidenceStore,candidate:Candidate,proof:ExecutedEvidence,evidence:{id:string;kind:"test"|"tdd";summary:string;expectFailure?:boolean}):Evidence{
 if(!isExecutedEvidence(proof))throw new Error("Execution evidence requires ASEN-issued execution proof");
 if(proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision)throw new Error("Execution proof candidate mismatch");
 const expectedFailure=evidence.expectFailure===true;
 if(expectedFailure?proof.exitCode===0:proof.exitCode!==0)throw new Error(expectedFailure?"Expected failing execution did not fail":"Passing execution evidence requires exit code 0");
 return store.addExecuted(candidate,proof,{id:evidence.id,kind:evidence.kind,status:expectedFailure?"expected-fail":"pass",summary:evidence.summary,createdAt:proof.finishedAt});
}
