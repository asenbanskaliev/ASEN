import {randomUUID} from "node:crypto";
import type {AgentRequest,AgentRunner} from "./dispatcher.js";
import {Dispatcher} from "./dispatcher.js";
import {EvidenceStore} from "../evidence/store.js";
import type {PublicAgentRecord} from "../runtime/agent-lifecycle.js";
import {PersistentAgentStore} from "../runtime/agent-store.js";

export interface AgentSessionIdentity{sessionId:string;projectId:string;}
/** Production coordinator using the existing Dispatcher, with session checks around every public action. */
export class AgentRuntime{
 private constructor(readonly store:PersistentAgentStore,private readonly dispatcher:Dispatcher,readonly quarantined?:string){}
 static async open(options:{storeFile:string;runner:AgentRunner;maxConcurrency?:number}):Promise<AgentRuntime>{
  const {store,quarantined}=await PersistentAgentStore.open(options.storeFile),dispatcher=new Dispatcher(options.runner,new EvidenceStore(),options.maxConcurrency??4,store);
  return new AgentRuntime(store,dispatcher,quarantined);
 }
 snapshot():readonly PublicAgentRecord[]{return this.store.snapshot();}
 async list(identity:AgentSessionIdentity):Promise<readonly PublicAgentRecord[]>{return this.store.list(identity.sessionId,identity.projectId);}
 async startExplorer(input:{prompt:string;session:AgentSessionIdentity;owner?:PublicAgentRecord["owner"]}):Promise<string>{
  if(!input.session.sessionId||!input.session.projectId)throw new Error("An active Pi session and project are required");
  const request:AgentRequest={id:`agent-${randomUUID()}`,role:"explorer",prompt:input.prompt,repository:input.session.projectId,isolationKey:input.session.sessionId,owner:input.owner??{kind:"user",id:`pi:${input.session.sessionId}`}};
  await this.store.enqueue(request,request.owner!);
  void this.dispatcher.dispatch(request).catch(()=>{});
  return request.id;
 }
 async cancel(id:string,identity:AgentSessionIdentity):Promise<boolean>{
  const entry=await this.store.get(id,identity.sessionId,identity.projectId);if(!entry||!["queued","running","interrupted"].includes(entry.record.state))return false;
  if(this.dispatcher.cancel(id,identity.sessionId,identity.projectId))return true;
  if(entry.record.state==="queued"||entry.record.state==="interrupted"){await this.store.cancelled(id,"Cancelled by the owning Pi session");return true;}
  return false;
 }
 async continue(id:string,identity:AgentSessionIdentity):Promise<string>{
  const entry=await this.store.get(id,identity.sessionId,identity.projectId);if(!entry)throw new Error("Agent task is unavailable to this session or project");
  const request=this.store.resumable(entry);if(!request)throw new Error("This task cannot be resumed safely; create a new task with fresh authority");
  await this.store.enqueue(request,{kind:"user",id:`pi:${identity.sessionId}`});
  void this.dispatcher.dispatch(request).catch(()=>{});
  return request.id;
 }
 async cancelSession(identity:AgentSessionIdentity):Promise<void>{
  const entries=await this.store.list(identity.sessionId,identity.projectId);
  await Promise.all(entries.filter(x=>x.state==="queued"||x.state==="running").map(async record=>{
   if(!this.dispatcher.cancel(record.id,identity.sessionId,identity.projectId)&&record.state==="queued")await this.store.cancelled(record.id,"Pi session ended before execution");
  }));
 }
}
