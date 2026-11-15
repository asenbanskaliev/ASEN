import {randomUUID} from "node:crypto";

export interface SessionDirectoryEntry{readonly sessionId:string;readonly subject:string;readonly projectId:string;readonly taskAlias?:string;readonly classification:"read"|"write"|"review";readonly updatedAt:string;}
export interface SessionConsentRequest{readonly requesterSessionId:string;readonly targetSessionId:string;readonly projectId:string;readonly expiresAt:string;readonly token:string;}
const MAX_SESSIONS=256,CONSENT_TTL_MS=60_000;
function safe(value:unknown,max=512):value is string{return typeof value==="string"&&value.length>0&&value.length<=max&&value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);}
/** Process-local directory containing only live session labels and one-use metadata grants. */
export class SessionDirectory{
 readonly #sessions=new Map<string,SessionDirectoryEntry>();
 readonly #consents=new Map<string,SessionConsentRequest>();
 publish(entry:SessionDirectoryEntry):void{
  if(!entry||!safe(entry.sessionId)||!safe(entry.subject)||!safe(entry.projectId,4096)||!(["read","write","review"].includes(entry.classification))||!Number.isFinite(Date.parse(entry.updatedAt))||(entry.taskAlias!==undefined&&!safe(entry.taskAlias)))throw new Error("Session identity is incomplete or invalid");
  this.#sessions.delete(entry.sessionId);this.#sessions.set(entry.sessionId,Object.freeze(structuredClone(entry)));
  while(this.#sessions.size>MAX_SESSIONS)this.#sessions.delete(this.#sessions.keys().next().value!);
 }
 list(projectId:string):readonly SessionDirectoryEntry[]{if(!safe(projectId,4096))throw new Error("Session project identity is invalid");return Object.freeze([...this.#sessions.values()].filter(row=>row.projectId===projectId).map(row=>Object.freeze({...row})));}
 issueConsent(input:{requesterSessionId:string;targetSessionId:string;projectId:string;now?:number}):SessionConsentRequest{
  const now=input.now??Date.now();if(!safe(input.requesterSessionId)||!safe(input.targetSessionId)||!safe(input.projectId,4096)||input.requesterSessionId===input.targetSessionId||!Number.isFinite(now))throw new Error("Cross-session consent scope is invalid");
  for(const [token,consent] of this.#consents)if(Date.parse(consent.expiresAt)<=now)this.#consents.delete(token);if(this.#consents.size>=1024)throw new Error("Cross-session consent limit reached");
  const request=Object.freeze({requesterSessionId:input.requesterSessionId,targetSessionId:input.targetSessionId,projectId:input.projectId,expiresAt:new Date(now+CONSENT_TTL_MS).toISOString(),token:randomUUID()});this.#consents.set(request.token,request);return request;
 }
 consult(token:string,requesterSessionId:string,targetSessionId:string,projectId:string,now=Date.now()):SessionDirectoryEntry{
  const consent=this.#consents.get(token);if(consent)this.#consents.delete(token);
  if(!consent||!safe(requesterSessionId)||!safe(targetSessionId)||!safe(projectId,4096)||!Number.isFinite(now)||Date.parse(consent.expiresAt)<=now||consent.requesterSessionId!==requesterSessionId||consent.targetSessionId!==targetSessionId||consent.projectId!==projectId)throw new Error("Cross-session consultation requires a valid unused consent for this session and project");
  const target=this.#sessions.get(targetSessionId);if(!target||target.projectId!==projectId)throw new Error("Target session is unavailable");
  return Object.freeze({sessionId:target.sessionId,subject:target.subject,projectId:target.projectId,classification:target.classification,updatedAt:target.updatedAt,...(target.taskAlias?{taskAlias:target.taskAlias}:{})});
 }
 remove(sessionId:string):void{this.#sessions.delete(sessionId);for(const [token,consent] of this.#consents)if(consent.requesterSessionId===sessionId||consent.targetSessionId===sessionId)this.#consents.delete(token);}
}
