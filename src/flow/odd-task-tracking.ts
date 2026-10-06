import {createHash} from "node:crypto";
import {readFile,realpath,stat} from "node:fs/promises";
import {relative,resolve} from "node:path";
import {types} from "node:util";
import type {MemoryItem,MemoryStore} from "../memory/types.js";
import {MemoryContext} from "../memory/context.js";
import {oddExecutionBinding,type OddExecutionContract} from "./odd-execution-contract.js";

export interface OddTodo {readonly id:string;readonly text:string;readonly status:"pending"|"done";}
export interface OddProgress {readonly todos:readonly OddTodo[];readonly nextStep:string;}
interface TrackingRecord {version:1;task:string;repository:string;candidateId:string;revision:string;documentPath:string;document:string;todos:readonly OddTodo[];nextStep:string;}
const claims=new WeakSet<object>();
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
function text(value:unknown):string{
 if(typeof value!=="string"||!value||value.length>8192||value!==value.trim()||value!==value.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(value))throw new Error("Invalid ODD tracking text");return value;
}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(typeof value!=="object"||value===null||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("ODD tracking requires exact plain data");
 const own=Reflect.ownKeys(value);
 if(own.length!==keys.length||own.some(k=>typeof k!=="string"||!keys.includes(k)))throw new Error("ODD tracking shape mismatch");
 return Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!("value" in d))throw new Error("ODD tracking accessor rejected");return[k,d.value];}));
}
function progress(value:unknown):OddProgress{
 const input=exact(value,["todos","nextStep"]),todos=input.todos;
 if(typeof todos!=="object"||todos===null||types.isProxy(todos)||!Array.isArray(todos)||Object.getPrototypeOf(todos)!==Array.prototype||!todos.length||todos.length>256||Reflect.ownKeys(todos).length!==todos.length+1)throw new Error("ODD tracking requires exact bounded TODOs");
 const parsed=Array.from({length:todos.length},(_,i)=>{
  const d=Object.getOwnPropertyDescriptor(todos,String(i));if(!d?.enumerable||!("value" in d))throw new Error("ODD TODO accessor rejected");
  const item=exact(d.value,["id","text","status"]);
  if(item.status!=="pending"&&item.status!=="done")throw new Error("ODD TODO status invalid");
  return Object.freeze({id:text(item.id),text:text(item.text),status:item.status});
 });
 if(new Set(parsed.map(item=>item.id)).size!==parsed.length)throw new Error("ODD TODO IDs must be unique");
 return Object.freeze({todos:Object.freeze(parsed),nextStep:text(input.nextStep)});
}
async function documentBytes(repository:string,path:string):Promise<string>{
 text(path);if(!/^odd\/tasks\/[a-z0-9][a-z0-9-]*\.md$/u.test(path))throw new Error("ODD task document must be bounded under odd/tasks");
 const root=await realpath(repository),target=resolve(root,path),actual=await realpath(target);
 if(actual!==target||relative(root,actual)!==path)throw new Error("ODD task document canonical binding mismatch");
 const info=await stat(actual);if(!info.isFile()||info.size>1_000_000)throw new Error("ODD task document must be a bounded file");
 const bytes=await readFile(actual);if(bytes.length>1_000_000)throw new Error("ODD task document too large");
 const decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);if(!decoded.trim())throw new Error("ODD task document empty");return decoded;
}
/** Uses the existing project/session MemoryContext; mirrors the entire task document, not a summary. */
export async function trackOddTask(contract:OddExecutionContract,context:MemoryContext,documentPath:string,input:OddProgress):Promise<MemoryItem|undefined>{
 const binding=oddExecutionBinding(contract);
 if(claims.has(contract))throw new Error("ODD tracking contract already consumed");claims.add(contract);
 // Read-only work never reads a task artifact or invokes persistence, even when substantial.
 if(contract.readOnly||!contract.substantial)return undefined;
 if(!(context instanceof MemoryContext)||context.projectId!==binding.facts.repositoryIdentity)throw new Error("ODD tracking memory project mismatch");
 const state=progress(input),document=await documentBytes(binding.facts.repositoryIdentity,documentPath);
 const payload:TrackingRecord={version:1,task:binding.facts.taskIdentity,repository:binding.facts.repositoryIdentity,candidateId:binding.candidate.id,revision:binding.candidate.revision,documentPath,document,...state};
 const item:MemoryItem={id:`odd-task-${digest(JSON.stringify([payload.repository,payload.task,payload.candidateId]))}`,projectId:context.projectId,sessionId:context.sessionId,kind:"decision",topic:"odd-task-tracking-v1",content:JSON.stringify(payload),createdAt:new Date().toISOString()};
 context.remember(item);return Object.freeze({...item});
}
/** Reconstructs TODO/resume only after exact live binding and task-document byte validation. No authority is restored. */
export async function resumeOddTask(contract:OddExecutionContract,store:Pick<MemoryStore,"get">):Promise<Readonly<TrackingRecord>|undefined>{
 const binding=oddExecutionBinding(contract);
 if(contract.readOnly||!contract.substantial)return undefined;
 const {facts,candidate}=binding,id=`odd-task-${digest(JSON.stringify([facts.repositoryIdentity,facts.taskIdentity,candidate.id]))}`,item=store.get(id);
 if(!item)return undefined;
 if(item.id!==id||item.projectId!==facts.repositoryIdentity||item.kind!=="decision"||item.topic!=="odd-task-tracking-v1")throw new Error("ODD tracking memory binding mismatch");
 const value=exact(JSON.parse(item.content),["version","task","repository","candidateId","revision","documentPath","document","todos","nextStep"]);
 if(value.version!==1||value.task!==facts.taskIdentity||value.repository!==facts.repositoryIdentity||value.candidateId!==candidate.id||value.revision!==candidate.revision)throw new Error("ODD tracking exact candidate mismatch");
 const document=await documentBytes(facts.repositoryIdentity,text(value.documentPath));if(document!==value.document)throw new Error("ODD tracking task document changed; revalidate before resume");
 const state=progress({todos:value.todos,nextStep:value.nextStep});
 return Object.freeze({version:1,task:facts.taskIdentity,repository:facts.repositoryIdentity,candidateId:candidate.id,revision:candidate.revision,documentPath:value.documentPath as string,document,...state});
}
