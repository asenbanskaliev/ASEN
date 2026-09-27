import type {Candidate,TaskState} from "../core/types.js";
import {open,readFile,rename,unlink} from "node:fs/promises";
import {dirname,basename,join} from "node:path";
import {randomUUID} from "node:crypto";
export interface SessionCheckpoint{version:1;projectId:string;sessionId:string;task:TaskState;candidate?:Candidate;savedAt:string;}
export function createCheckpoint(projectId:string,sessionId:string,task:TaskState,candidate?:Candidate):SessionCheckpoint{
 if(task.candidateId&&(!candidate||candidate.id!==task.candidateId))throw new Error("Checkpoint candidate mismatch");
 return {version:1,projectId,sessionId,task:structuredClone(task),...(candidate?{candidate:structuredClone(candidate)}:{}),savedAt:new Date().toISOString()};
}
export function restoreCheckpoint(checkpoint:SessionCheckpoint,projectId:string):{task:TaskState;candidate?:Candidate}{
 if(checkpoint.version!==1)throw new Error("Unsupported checkpoint version");
 if(checkpoint.projectId!==projectId)throw new Error("Checkpoint project mismatch");
 if(checkpoint.task.candidateId&&checkpoint.candidate?.id!==checkpoint.task.candidateId)throw new Error("Checkpoint candidate mismatch");
 return {task:structuredClone(checkpoint.task),...(checkpoint.candidate?{candidate:structuredClone(checkpoint.candidate)}:{})};
}
export function assertResumeRevision(candidate:Candidate,currentRevision:string):void{
 if(candidate.revision!==currentRevision)throw new Error("Repository revision changed since checkpoint");
}

export interface ResumeIdentity{projectId:string;sessionId:string;repository:string;revision:string;}

// The checkpoint is a recovery hint, never a source of previously verified evidence.
export async function saveCheckpoint(path:string,checkpoint:SessionCheckpoint):Promise<void>{
 const temporary=join(dirname(path),`.${basename(path)}.${randomUUID()}.tmp`);
 let handle;
 try{
  handle=await open(temporary,"wx",0o600);
  await handle.writeFile(JSON.stringify(checkpoint),"utf8");
  await handle.sync();
  await handle.close();handle=undefined;
  await rename(temporary,path);
 }finally{
  if(handle)await handle.close();
  await unlink(temporary).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});
 }
}

export async function loadCheckpoint(path:string,identity:ResumeIdentity):Promise<{task:TaskState;candidate:Candidate}>{
 const raw=JSON.parse(await readFile(path,"utf8")) as SessionCheckpoint;
 if(!raw||typeof raw!=="object"||!raw.task||!raw.candidate)throw new Error("Checkpoint missing candidate");
 if(raw.sessionId!==identity.sessionId)throw new Error("Checkpoint session mismatch");
 const restored=restoreCheckpoint(raw,identity.projectId);
 const candidate=restored.candidate;
 if(!candidate||!restored.task.candidateId||candidate.id!==restored.task.candidateId)throw new Error("Checkpoint candidate mismatch");
 if(candidate.repository!==identity.repository)throw new Error("Checkpoint repository mismatch");
 assertResumeRevision(candidate,identity.revision);
 return {task:restored.task,candidate};
}
