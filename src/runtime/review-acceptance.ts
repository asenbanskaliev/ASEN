import {execFileSync} from "node:child_process";
import type {AgentRuntime,AgentSessionIdentity} from "../agents/agent-runtime.js";
import type {TaskAgentLinkStore} from "./task-agent-link-store.js";
import type {SessionTodoStore} from "./todo-store.js";
import {sameWorkspaceIdentityPath} from "./workspace-store.js";

export interface ParsedReviewVerdict{readonly verdict:"pass"|"fail";readonly evidence:readonly string[];}
export interface ReviewApprovalRequest{
 readonly taskId:string;readonly agentId:string;readonly role:"reviewer"|"verifier";
 readonly candidateRevision:string;readonly evidence:readonly string[];
}
export type ReviewAcceptanceResult={status:"accepted";taskId:string;role:"reviewer"|"verifier"}|
 {status:"blocked";reason:string};

/** A text result is always untrusted, even after its agent state was authenticated.
 * Never accept Markdown fences, unexpected keys, empty evidence or terminal controls. */
function canonicalJsonWithoutSpacing(raw:string):string{
 let result="",quoted=false,escaped=false;
 for(const ch of raw){
  if(quoted){
   result+=ch;
   if(escaped)escaped=false;
   else if(ch==="\\")escaped=true;
   else if(ch==='"')quoted=false;
  }else if(ch==='"'){quoted=true;result+=ch;}
  else if(ch!==" "&&ch!=="\t"&&ch!=="\n"&&ch!=="\r")result+=ch;
 }
 return result;
}
export function parseReviewVerdict(text:unknown):ParsedReviewVerdict|undefined{
 if(typeof text!=="string"||!text.trim()||text.length>8_192||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\p{Cf}\u2028\u2029]/u.test(text))return undefined;
 let parsed:unknown;
 try{parsed=JSON.parse(text);}catch{return undefined;}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
    Object.getPrototypeOf(parsed)!==Object.prototype)return undefined;
 const value=parsed as Record<string,unknown>;
 // Exact canonical serialization rejects duplicate JSON keys and ambiguous escapes.
 if(canonicalJsonWithoutSpacing(text)!==JSON.stringify(parsed))return undefined;
 if(Object.keys(value).sort().join("|")!=="evidence|verdict"||
    (value.verdict!=="pass"&&value.verdict!=="fail")||!Array.isArray(value.evidence)||
    value.evidence.length<1||value.evidence.length>12)return undefined;
 const evidence=value.evidence as unknown[];
 if(evidence.some(item=>typeof item!=="string"||!item.trim()||item!==item.trim()||
    item.length>600||item!==item.normalize("NFC")||
    /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(item)))return undefined;
 return Object.freeze({verdict:value.verdict,evidence:Object.freeze([...evidence] as string[])});
}
function candidateAtCleanHead(repository:string):string{
 const options={cwd:repository,encoding:"utf8" as const,windowsHide:true,timeout:5000,
  maxBuffer:16_384,stdio:["ignore","pipe","ignore"] as ["ignore","pipe","ignore"]};
 const sha=execFileSync("git",["rev-parse","--verify","HEAD"],options).trim();
 if(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(sha))throw new Error("Review acceptance requires a real Git commit");
 const changes=execFileSync("git",["status","--porcelain=v1","--untracked-files=all"],options);
 if(changes.length)throw new Error("Review acceptance requires a clean worktree and index");
 return sha;
}
/** F4/F5: explicit Pi confirmation, one verified completed agent, exact HEAD,
 * no automatic promotion of a model's claim, CAS Todo journal and no writer grant. */
export async function acceptIndependentReview(input:{
 todos:Pick<SessionTodoStore,"list"|"acceptReviewedTask">;
 agents:Pick<AgentRuntime,"query">;
 links:Pick<TaskAgentLinkStore,"list">;
 identity:AgentSessionIdentity;taskId:string;
 validateIdentity:()=>Promise<void>;
 confirm:(details:ReviewApprovalRequest)=>Promise<boolean>;
 signal?:AbortSignal;
}):Promise<ReviewAcceptanceResult>{
 const blocked=(reason:string):ReviewAcceptanceResult=>({status:"blocked",reason});
 if(!input.taskId||input.taskId.length>256||!input.identity.sessionId||!input.identity.projectId||
    input.signal?.aborted)return blocked("Review acceptance requires an active Pi session and a task ID.");
 const identity=input.identity;
 await input.validateIdentity();
 const item=(await input.todos.list(identity)).find(task=>task.taskId===input.taskId);
 if(!item||item.current.state!=="blocked"||
    item.current.reason!=="Linked review result requires explicit user acceptance"||
    (item.plan?.role!=="reviewer"&&item.plan?.role!=="verifier")||
    !item.plan.candidateRevision)
  return blocked("This Todo is not a completed independent review awaiting Pi acceptance.");
 const revision=item.plan.candidateRevision,role=item.plan.role;
 const evidence=async()=>{
  const current=candidateAtCleanHead(identity.projectId);
  if(current!==revision)throw new Error("Review candidate changed; rebuild the review against the current HEAD");
  const links=(await input.links.list(identity)).filter(link=>link.taskId===item.taskId&&
    link.sessionId===identity.sessionId&&sameWorkspaceIdentityPath(link.projectId,identity.projectId));
  if(links.length!==1)throw new Error("Review acceptance requires exactly one session-owned agent link");
  const agent=await input.agents.query(links[0]!.agentId,identity),record=agent?.record;
  if(!record||record.state!=="completed"||record.role!==role||
     record.sessionId!==identity.sessionId||
     !sameWorkspaceIdentityPath(record.projectId,identity.projectId))
   throw new Error("Review acceptance requires an authenticated completed role-specific agent result");
  const result=parseReviewVerdict(record.summary);
  if(result?.verdict!=="pass")throw new Error("Review result is malformed or not passing; no acceptance permitted");
  return Object.freeze({taskId:item.taskId,agentId:record.id,role,candidateRevision:revision,
   evidence:result.evidence});
 };
 let details:ReviewApprovalRequest;
 try{details=await evidence();}catch(error){return blocked(error instanceof Error?error.message:"Review result could not be verified");}
 let approved=false;
 try{approved=await input.confirm(details);}catch{return blocked("Pi review confirmation was interrupted; no state changed.");}
 if(!approved)return blocked("User did not authorize accepting this independent review.");
 if(input.signal?.aborted)return blocked("Review acceptance was cancelled; no state changed.");
 await input.validateIdentity();
 const fresh=(await input.todos.list(identity)).find(task=>task.taskId===item.taskId);
 if(!fresh||JSON.stringify(fresh)!==JSON.stringify(item))
  return blocked("Review Todo changed during Pi confirmation; refresh and reconfirm.");
 try{
  await input.todos.acceptReviewedTask(item,identity,details.agentId,async()=>{
   await input.validateIdentity();
   const latest=await evidence();
   if(JSON.stringify(latest)!==JSON.stringify(details))
    throw new Error("Review evidence changed during Pi confirmation; no state changed");
  },input.signal);
 }catch(error){return blocked(error instanceof Error?error.message:"Review Todo could not be committed");}
 return {status:"accepted",taskId:item.taskId,role};
}
