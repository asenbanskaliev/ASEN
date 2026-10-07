import type {Candidate,TaskState} from "../core/types.js";
import type {IssuedSkillContext} from "../skills/context.js";
import {createAgentRecord,transitionAgent,type PublicAgentRecord} from "../runtime/agent-lifecycle.js";
import {open,readFile,realpath,rename,unlink} from "node:fs/promises";
import {dirname,basename,join} from "node:path";
import {randomUUID} from "node:crypto";
const MAX_CHECKPOINT_AGENTS=256;
const validTaskPhases:Record<TaskState["phase"],true>={DISCOVERING:true,PLANNING:true,IMPLEMENTING:true,TESTING:true,REVIEWING:true,VERIFYING:true,VERIFIED:true,BLOCKED:true,FAILED:true,ROLLED_BACK:true};
function validTaskPhase(value:unknown):value is TaskState["phase"]{return typeof value==="string"&&Object.hasOwn(validTaskPhases,value);}
function validateLifecycle(records:readonly PublicAgentRecord[]|undefined,sessionId:string,repository:string|undefined):PublicAgentRecord[]|undefined{if(!records)return undefined;if(records.length>MAX_CHECKPOINT_AGENTS)throw new Error("Checkpoint agent lifecycle exceeds limit");const ids=new Set<string>();return records.map(record=>{if(ids.has(record.id))throw new Error("Checkpoint agent lifecycle contains duplicate id");ids.add(record.id);if(record.sessionId!==sessionId||record.projectId!==repository)throw new Error("Checkpoint agent lifecycle identity mismatch");const queued=createAgentRecord({id:record.id,role:record.role,owner:record.owner,sessionId:record.sessionId,projectId:record.projectId,createdAt:record.createdAt});if(record.state==="queued"){if(record.updatedAt!==record.createdAt)throw new Error("Invalid queued lifecycle timestamp");return queued;}const running=record.state==="running"?transitionAgent(queued,"running",record.updatedAt,record.summary):undefined;if(running)return running;const intermediate=transitionAgent(queued,"running",record.createdAt);return transitionAgent(intermediate,record.state,record.updatedAt,record.summary);});}
export interface SessionCheckpoint{version:1;projectId:string;sessionId:string;task:TaskState;candidate?:Candidate;skillContext?:IssuedSkillContext;skillPaths?:string[];piSessionFile?:string;agentLifecycle?:PublicAgentRecord[];savedAt:string;}
export function createCheckpoint(projectId:string,sessionId:string,task:TaskState,candidate?:Candidate,piSessionFile?:string,skillContext?:IssuedSkillContext,skillPaths?:string[],agentLifecycle?:readonly PublicAgentRecord[]):SessionCheckpoint{
 if(!validTaskPhase(task?.phase))throw new Error("Checkpoint task phase invalid");
 if(task.candidateId&&(!candidate||candidate.id!==task.candidateId))throw new Error("Checkpoint candidate mismatch");
 if(skillContext&&(!candidate||skillContext.candidateId!==candidate.id||skillContext.candidateRevision!==candidate.revision||skillContext.repository!==candidate.repository))throw new Error("Checkpoint skill context mismatch");
 if(skillPaths?.some(path=>!/^skills\/asen-[a-z-]+\/SKILL\.md$/.test(path)))throw new Error("Checkpoint invalid skill path");
 const checkedLifecycle=validateLifecycle(agentLifecycle,sessionId,candidate?.repository);
 return {version:1,projectId,sessionId,task:structuredClone(task),...(candidate?{candidate:structuredClone(candidate)}:{}),...(skillContext?{skillContext}:{}),...(skillPaths?{skillPaths:[...skillPaths]}:{}),...(piSessionFile?{piSessionFile}:{}),...(checkedLifecycle?{agentLifecycle:structuredClone(checkedLifecycle)}:{}),savedAt:new Date().toISOString()};
}
export function restoreCheckpoint(checkpoint:SessionCheckpoint,projectId:string):{task:TaskState;candidate?:Candidate;skillContext?:IssuedSkillContext;skillPaths?:string[];agentLifecycle?:PublicAgentRecord[]}{
 if(checkpoint.version!==1)throw new Error("Unsupported checkpoint version");
 if(checkpoint.projectId!==projectId)throw new Error("Checkpoint project mismatch");
 if(!validTaskPhase(checkpoint.task?.phase))throw new Error("Checkpoint task phase invalid");
 if(checkpoint.task.candidateId&&checkpoint.candidate?.id!==checkpoint.task.candidateId)throw new Error("Checkpoint candidate mismatch");
 if(checkpoint.skillContext&&(!checkpoint.candidate||checkpoint.skillContext.candidateId!==checkpoint.candidate.id||checkpoint.skillContext.candidateRevision!==checkpoint.candidate.revision||checkpoint.skillContext.repository!==checkpoint.candidate.repository))throw new Error("Checkpoint skill context mismatch");
 const checkedLifecycle=validateLifecycle(checkpoint.agentLifecycle,checkpoint.sessionId,checkpoint.candidate?.repository);
 return {task:structuredClone(checkpoint.task),...(checkpoint.candidate?{candidate:structuredClone(checkpoint.candidate)}:{}),...(checkpoint.skillContext?{skillContext:checkpoint.skillContext}:{}),...(checkpoint.skillPaths?{skillPaths:[...checkpoint.skillPaths]}:{}),...(checkedLifecycle?{agentLifecycle:structuredClone(checkedLifecycle)}:{})};
}
export function assertResumeRevision(candidate:Candidate,currentRevision:string):void{
 if(candidate.revision!==currentRevision)throw new Error("Repository revision changed since checkpoint");
}

export interface ResumeIdentity{projectId:string;sessionId:string;repository:string;revision:string;piSessionFile?:string;}

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

export async function loadCheckpoint(path:string,identity:ResumeIdentity):Promise<{task:TaskState;candidate:Candidate;skillContext?:IssuedSkillContext;skillPaths?:string[];agentLifecycle?:PublicAgentRecord[]}>{
 const raw=JSON.parse(await readFile(path,"utf8")) as SessionCheckpoint;
 if(!raw||typeof raw!=="object"||!raw.task||!raw.candidate)throw new Error("Checkpoint missing candidate");
 if(raw.sessionId!==identity.sessionId)throw new Error("Checkpoint session mismatch");
 if(identity.piSessionFile){
  if(!raw.piSessionFile||await realpath(raw.piSessionFile)!==await realpath(identity.piSessionFile))throw new Error("Pi session file mismatch");
 }
 const restored=restoreCheckpoint(raw,identity.projectId);
 const candidate=restored.candidate;
 if(!candidate||!restored.task.candidateId||candidate.id!==restored.task.candidateId)throw new Error("Checkpoint candidate mismatch");
 if(candidate.repository!==identity.repository)throw new Error("Checkpoint repository mismatch");
 assertResumeRevision(candidate,identity.revision);
 return {task:restored.task,candidate,...(restored.skillContext?{skillContext:restored.skillContext}:{}),...(restored.skillPaths?{skillPaths:restored.skillPaths}:{}),...(restored.agentLifecycle?{agentLifecycle:restored.agentLifecycle}:{})};
}
