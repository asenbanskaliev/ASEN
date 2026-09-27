import type {Candidate,TaskState} from "../core/types.js";
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
