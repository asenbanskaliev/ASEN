import {createHmac,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {open,readFile,rename} from "node:fs/promises";
import type {AgentRequest,AgentResult} from "../agents/dispatcher.js";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {completeAgentRecord,createAgentRecord,recoverAgentLifecycleRecords,transitionAgent,type AgentLifecycleSink,type PublicAgentRecord} from "./agent-lifecycle.js";

const SCHEMA="asen.agents/v1" as const,MAX_RECORDS=2000,MAX_EVENTS=20000,MAX_PROMPT=32000,MAX_OUTPUT=1_000_000;
type AgentRole=AgentRequest["role"];
export interface AgentTaskSpec{ id:string;role:AgentRole;prompt:string;repository:string;isolationKey:string;createdAt:string;model?:string;thinking?:AgentRequest["thinking"];continuationOf?:string; }
export interface AgentExecutionReceipt{ id:string;ok:true;output:string;sha256:string; }
export interface AgentStateEvent{ id:string;revision:number;state:PublicAgentRecord["state"];at:string;summary?:string; }
export interface AgentStoreEntry{ record:PublicAgentRecord;request:AgentTaskSpec;events:AgentStateEvent[];result?:AgentExecutionReceipt; }
export interface AgentStoreFile{schema:typeof SCHEMA;revision:number;entries:AgentStoreEntry[];}
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const identifier=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=1024&&v===v.trim()&&v===v.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
function specFrom(request:AgentRequest,createdAt:string):AgentTaskSpec{
 if(!identifier(request.id)||!identifier(request.repository)||!identifier(request.isolationKey??"default")||typeof request.prompt!=="string"||!request.prompt.trim()||request.prompt.length>MAX_PROMPT||/\u0000/u.test(request.prompt)||!(["explorer","worker","reviewer","verifier"] as unknown[]).includes(request.role))throw new Error("Invalid persistent agent request");
 if(request.role!=="explorer"||request.writeSurfaces?.length||request.candidate||request.skillContext||request.writerAdmission||request.phaseGrant)throw new Error("Authority-bearing agent requests cannot be serialized; create a fresh authorized dispatch");
 if(request.model!==undefined&&(typeof request.model!=="string"||!identifier(request.model)))throw new Error("Invalid persistent agent model");
 if(request.thinking!==undefined&&!(["off","minimal","low","medium","high"] as unknown[]).includes(request.thinking))throw new Error("Invalid persistent agent thinking level");
 const {model,thinking}=request;
 return {id:request.id,role:request.role,prompt:request.prompt,repository:request.repository,isolationKey:request.isolationKey??"default",createdAt,...(model?{model}:{}),...(thinking?{thinking}:{}),...(request.parentId?{continuationOf:request.parentId}:{})};
}
function specValue(v:unknown):v is AgentTaskSpec{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;
 const keys=["id","role","prompt","repository","isolationKey","createdAt",...(Object.hasOwn(v,"model")?["model"]:[]),...(Object.hasOwn(v,"thinking")?["thinking"]:[]),...(Object.hasOwn(v,"continuationOf")?["continuationOf"]:[])];
 if(!exact(v,keys))return false;const x=v as unknown as AgentTaskSpec;
 return identifier(x.id)&&(["explorer","worker","reviewer","verifier"] as unknown[]).includes(x.role)&&typeof x.prompt==="string"&&x.prompt.length>0&&x.prompt.length<=MAX_PROMPT&&!/[\u0000]/u.test(x.prompt)&&identifier(x.repository)&&identifier(x.isolationKey)&&typeof x.createdAt==="string"&&Number.isFinite(Date.parse(x.createdAt))&&(x.model===undefined||identifier(x.model))&&(x.thinking===undefined||(["off","minimal","low","medium","high"] as unknown[]).includes(x.thinking))&&(x.continuationOf===undefined||identifier(x.continuationOf));
}
function receiptDigest(key:Buffer,entry:AgentStoreEntry,output:string):string{return createHmac("sha256",key).update(JSON.stringify([entry.record.id,entry.record.sessionId,entry.record.projectId,entry.request,output])).digest("hex");}
function validAgentHistory(events:AgentStateEvent[],record:PublicAgentRecord):boolean{
 const transitions:Record<PublicAgentRecord["state"],PublicAgentRecord["state"][]>={queued:["running","cancelled","failed"],running:["interrupted","cancelled","failed","completed"],interrupted:["cancelled"],cancelled:[],failed:[],completed:["interrupted"]};
 for(let i=0;i<events.length;i++){const current=events[i]!;if(current.revision!==i+1||current.id!==record.id||typeof current.at!=="string"||!Number.isFinite(Date.parse(current.at)))return false;if(i===0){if(current.state!=="queued"||current.at!==record.createdAt)return false;}else{const previous=events[i-1]!;if(!transitions[previous.state]?.includes(current.state)||Date.parse(current.at)<Date.parse(previous.at))return false;if(previous.state==="completed"&&(current.state!=="interrupted"||current.summary!=="Unverified completion after restart; explicit review is required"))return false;}}
 const last=events.at(-1);return !!last&&last.state===record.state&&last.at===record.updatedAt&&last.summary===record.summary;
}
function entryValue(v:unknown,receiptKey?:Buffer,allowUnverifiedCompletion=false):v is AgentStoreEntry{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;const keys=["record","request","events",...(Object.hasOwn(v,"result")?["result"]:[])];if(!exact(v,keys))return false;
 const x=v as unknown as AgentStoreEntry,r=x.record;if(!r||!exact(r,["id","role","owner","sessionId","projectId","state","createdAt","updatedAt",...(Object.hasOwn(r,"summary")?["summary"]:[])])||!exact(r.owner,["kind","id"])||!specValue(x.request)||x.request.id!==r.id||x.request.role!==r.role||x.request.isolationKey!==r.sessionId||x.request.repository!==r.projectId||!Array.isArray(x.events)||x.events.length<1||x.events.length>MAX_EVENTS)return false;
 try{createAgentRecord({id:r.id,role:r.role,owner:r.owner,sessionId:r.sessionId,projectId:r.projectId,createdAt:r.createdAt});}catch{return false;}
 if(!identifier(r.id)||!(["queued","running","interrupted","cancelled","failed","completed"] as unknown[]).includes(r.state)||typeof r.updatedAt!=="string"||!Number.isFinite(Date.parse(r.updatedAt))||(r.summary!==undefined&&(typeof r.summary!=="string"||r.summary.length>MAX_OUTPUT)))return false;
 if(x.events.some((event,i)=>!exact(event,["id","revision","state","at",...(Object.hasOwn(event,"summary")?["summary"]:[])])||event.id!==r.id||event.revision!==i+1||!(["queued","running","interrupted","cancelled","failed","completed"] as unknown[]).includes(event.state)||typeof event.at!=="string"||!Number.isFinite(Date.parse(event.at))||(event.summary!==undefined&&(typeof event.summary!=="string"||event.summary.length>MAX_OUTPUT))))return false;
 if(!validAgentHistory(x.events,r))return false;
 if(x.result!==undefined){const result=x.result,shape=!!receiptKey&&exact(result,["id","ok","output","sha256"])&&result.id===r.id&&result.ok===true&&typeof result.output==="string"&&result.output.length<=MAX_OUTPUT&&typeof result.sha256==="string"&&/^[a-f0-9]{64}$/u.test(result.sha256);let authenticated=false;if(shape){const expected=Buffer.from(receiptDigest(receiptKey!,x,result.output),"hex"),actual=Buffer.from(result.sha256,"hex");authenticated=actual.length===expected.length&&timingSafeEqual(actual,expected);}if(!authenticated&&!(allowUnverifiedCompletion&&r.state==="completed"))return false;}
 if(allowUnverifiedCompletion&&r.state==="completed"&&x.events.at(-1)?.state==="completed")return true;
 return x.result===undefined?r.state!=="completed":r.state==="completed"&&x.events.at(-1)?.state==="completed";
}
export function parseAgentStore(raw:string,receiptKey?:Buffer,allowUnverifiedCompletion=false):AgentStoreFile{
 const value:unknown=JSON.parse(raw);if(!exact(value,["schema","revision","entries"])||value.schema!==SCHEMA||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.entries)||value.entries.length>MAX_RECORDS||!value.entries.every(entry=>entryValue(entry,receiptKey)||allowUnverifiedCompletion&&entryValue(entry,receiptKey,true)))throw new Error("Invalid ASEN agent store");
 const entries=(value.entries as unknown[]).map(rawEntry=>{const trusted=entryValue(rawEntry,receiptKey),entry=structuredClone(rawEntry) as AgentStoreEntry;if(allowUnverifiedCompletion&&!trusted){delete entry.result;}return entry;}),ids=new Set<string>();for(const entry of entries){if(ids.has(entry.record.id))throw new Error("Duplicate ASEN agent task id");ids.add(entry.record.id);}
 return {schema:SCHEMA,revision:Number(value.revision),entries:entries.map(entry=>structuredClone(entry))};
}
function empty():AgentStoreFile{return {schema:SCHEMA,revision:0,entries:[]};}
async function read(file:string,receiptKey:Buffer):Promise<AgentStoreFile>{if(!await preparePrivateFile(file))return empty();return parseAgentStore(await readFile(file,"utf8"),receiptKey);}
async function openReceiptKey(path:string):Promise<Buffer>{
 const keyPath=`${path}.receipt-key`;await preparePrivateFile(keyPath,true);
 try{const handle=await open(keyPath,"wx",0o600);try{const key=randomBytes(32);await handle.writeFile(key);await handle.sync();return key;}finally{await handle.close();}}
 catch(error){if(!(error&&typeof error==="object"&&"code" in error&&(error as NodeJS.ErrnoException).code==="EEXIST"))throw error;}
 for(let attempt=0;attempt<100;attempt++){
  const key=await readFile(keyPath);if(key.length===32)return key;if(key.length!==0&&attempt===99)throw new Error("Invalid ASEN agent receipt key");
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 throw new Error("Invalid ASEN agent receipt key");
}
async function write(file:string,value:AgentStoreFile):Promise<void>{await preparePrivateFile(file,true);await atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}
function event(record:PublicAgentRecord,revision:number):AgentStateEvent{return {id:record.id,revision,state:record.state,at:record.updatedAt,...(record.summary!==undefined?{summary:record.summary.slice(0,MAX_OUTPUT)}:{})};}
function sameIdentity(record:PublicAgentRecord,input:Omit<PublicAgentRecord,"state"|"updatedAt">):boolean{return record.id===input.id&&record.role===input.role&&record.owner.kind===input.owner.kind&&record.owner.id===input.owner.id&&record.sessionId===input.sessionId&&record.projectId===input.projectId;}

/** Durable lifecycle and queue envelope store. Only identity and request data are serialized; opaque grants are never persisted. */
export class PersistentAgentStore implements AgentLifecycleSink{
 readonly #records=new Map<string,PublicAgentRecord>();
 readonly #receiptKey:Buffer;
 private constructor(readonly path:string,private readonly now:()=>string,receiptKey:Buffer,initial:AgentStoreFile){this.#receiptKey=receiptKey;for(const entry of initial.entries)this.#records.set(entry.record.id,structuredClone(entry.record));}
 static async open(path:string,now:()=>string=()=>new Date().toISOString()):Promise<{store:PersistentAgentStore;quarantined?:string}>{
  await preparePrivateFile(path,true);const receiptKey=await openReceiptKey(path);let initial=empty(),quarantined:string|undefined,normalized=false;
  try{initial=await read(path,receiptKey);}catch(error){
   if(!(error instanceof SyntaxError)&&!(error instanceof Error&&error.message==="Invalid ASEN agent store"))throw error;
   try{initial=parseAgentStore(await readFile(path,"utf8"),receiptKey,true);normalized=true;for(const entry of initial.entries){if(entry.record.state!=="completed"||entry.result)continue;const recovered=recoverAgentLifecycleRecords([entry.record],now())[0]!;entry.record={...recovered,summary:"Unverified completion after restart; explicit review is required"};entry.events.push(event(entry.record,entry.events.length+1));}}
   catch{const target=`${path}.corrupt-${Date.now()}-${randomUUID()}`;await rename(path,target);quarantined=target;}
  }
  if(normalized)await write(path,initial);
  const store=new PersistentAgentStore(path,now,receiptKey,initial);await store.#recover();return {store,...(quarantined?{quarantined}:{})};
 }
 createdAt():string{return this.now();}
 snapshot():readonly PublicAgentRecord[]{return [...this.#records.values()].map(record=>structuredClone(record));}
 async list(sessionId:string,projectId:string):Promise<readonly PublicAgentRecord[]>{const data=await read(this.path,this.#receiptKey);return data.entries.map(x=>x.record).filter(x=>x.sessionId===sessionId&&x.projectId===projectId).map(x=>structuredClone(x));}
 async history(id:string,sessionId:string,projectId:string):Promise<readonly AgentStateEvent[]>{const data=await read(this.path,this.#receiptKey),entry=data.entries.find(x=>x.record.id===id&&x.record.sessionId===sessionId&&x.record.projectId===projectId);return entry?entry.events.map(x=>structuredClone(x)):[];}
 async get(id:string,sessionId:string,projectId:string):Promise<AgentStoreEntry|undefined>{const data=await read(this.path,this.#receiptKey),entry=data.entries.find(x=>x.record.id===id&&x.record.sessionId===sessionId&&x.record.projectId===projectId);return entry?structuredClone(entry):undefined;}
 async enqueue(request:AgentRequest,owner:PublicAgentRecord["owner"]):Promise<void>{
  const createdAt=this.now(),spec=specFrom(request,createdAt),input={id:spec.id,role:spec.role,owner,sessionId:spec.isolationKey,projectId:spec.repository,createdAt},record=createAgentRecord(input),first=event(record,1),entry:AgentStoreEntry={record,request:spec,events:[first]};
  await this.#mutate(data=>{if(data.entries.some(x=>x.record.id===spec.id))throw new Error("Agent task id already exists");data.entries.push(entry);});this.#records.set(record.id,structuredClone(record));
 }
 async queued(input:Omit<PublicAgentRecord,"state"|"updatedAt">):Promise<void>{
  const existing=await this.get(input.id,input.sessionId,input.projectId);if(existing){if(existing.record.state!=="queued"||!sameIdentity(existing.record,input))throw new Error("Agent lifecycle record already exists or has conflicting identity");return;}
  const record=createAgentRecord(input),entry:AgentStoreEntry={record,request:{id:record.id,role:record.role as AgentRole,prompt:"Queued task payload unavailable",repository:record.projectId,isolationKey:record.sessionId,createdAt:record.createdAt},events:[event(record,1)]};
  await this.#mutate(data=>{if(data.entries.some(x=>x.record.id===input.id))throw new Error("Agent lifecycle record already exists");data.entries.push(entry);});this.#records.set(record.id,structuredClone(record));
 }
 async running(id:string,at=this.now()):Promise<void>{await this.#move(id,"running",undefined,at);}
 async completed(id:string,result:AgentResult,at=this.now()):Promise<void>{
  let completed:PublicAgentRecord|undefined;
  await this.#mutate(data=>{const entry=data.entries.find(x=>x.record.id===id);if(!entry)throw new Error("Agent lifecycle record does not exist");completed=completeAgentRecord(entry.record,result,this,at);entry.record=completed;entry.result={id,ok:true,output:result.output,sha256:receiptDigest(this.#receiptKey,entry,result.output)};entry.events.push(event(completed,entry.events.length+1));});
  if(completed)this.#records.set(id,structuredClone(completed));
 }
 async failed(id:string,summary?:string,at=this.now()):Promise<void>{await this.#move(id,"failed",summary,at);}
 async cancelled(id:string,summary?:string,at=this.now()):Promise<void>{await this.#move(id,"cancelled",summary,at);}
 async #move(id:string,state:Exclude<PublicAgentRecord["state"],"queued"|"completed">,summary:string|undefined,at:string):Promise<void>{let updated:PublicAgentRecord|undefined;await this.#mutate(data=>{const entry=data.entries.find(x=>x.record.id===id);if(!entry)throw new Error("Agent lifecycle record does not exist");updated=transitionAgent(entry.record,state,at,summary);entry.record=updated;entry.events.push(event(updated,entry.events.length+1));});if(updated)this.#records.set(id,structuredClone(updated));}
 async #mutate(change:(data:AgentStoreFile)=>void):Promise<void>{await preparePrivateFile(this.path,true);await withExclusiveFileLock(this.path,async()=>{const data=await read(this.path,this.#receiptKey);change(data);if(data.entries.length>MAX_RECORDS)throw new Error("ASEN agent store has reached its record limit");const next=parseAgentStore(JSON.stringify({...data,revision:data.revision+1}),this.#receiptKey);await write(this.path,next);});}
 async #recover():Promise<void>{let recovered:PublicAgentRecord[]|undefined;await this.#mutate(data=>{const at=this.now();for(const entry of data.entries){const record=entry.record;if(record.state==="running"){const next=recoverAgentLifecycleRecords([record],at)[0]!;entry.record=next;entry.events.push(event(next,entry.events.length+1));}
  }recovered=data.entries.map(x=>x.record);});for(const record of recovered??[])this.#records.set(record.id,structuredClone(record));}
 /** Returns a request that is safe to resume; authority-bearing requests always need fresh admission. */
 resumable(entry:AgentStoreEntry):AgentRequest|undefined{
  const {request,record}=entry;if(record.state!=="queued"&&record.state!=="interrupted")return undefined;
  if(request.role!=="explorer"||record.role!=="explorer"||request.repository!==record.projectId||request.isolationKey!==record.sessionId||request.prompt==="Queued task payload unavailable")return undefined;
  return {id:`${record.id}:continue:${entry.events.length}`,role:"explorer",prompt:request.prompt,repository:request.repository,isolationKey:request.isolationKey,...(request.model?{model:request.model}:{}),...(request.thinking?{thinking:request.thinking}:{}),parentId:record.id};
 }
}
