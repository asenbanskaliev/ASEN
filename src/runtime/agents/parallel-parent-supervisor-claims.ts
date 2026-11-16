/** Durable one-shot source-supervisor batch claim. A confirmed intent is
 * committed BEFORE any child Worker launch; restart cannot replay it.
 * This journal has NO model, Writer or merge authority. */
import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {atomicWriteText} from "../../io/atomic-write.js";
import {withExclusiveFileLock} from "../../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import type {TodoContext} from "../lifecycle/todo-store.js";

const schema="asen.parallel-supervisor-claims/v1" as const;
const safe=(x:unknown):x is string=>typeof x==="string"&&x.length>0&&x.length<=1024&&
 x===x.trim()&&x===x.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(x);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export interface ParentSupervisorClaim{
 readonly batchId:string;
 readonly sourceSessionId:string;readonly sourceProjectId:string;
 readonly children:readonly Readonly<{sourceTodoId:string;childTodoId:string;childSessionId:string;childProjectId:string}>[];
 readonly claimedAt:string;
 readonly status:"claimed-not-verified";
 readonly grantsAuthority:false;readonly autoRetry:false;readonly autoMerge:false;
}
type Journal={schema:typeof schema;revision:number;claims:ParentSupervisorClaim[]};
const keys=["batchId","sourceSessionId","sourceProjectId","children","claimedAt",
 "status","grantsAuthority","autoRetry","autoMerge"] as const;
const childKeys=["sourceTodoId","childTodoId","childSessionId","childProjectId"] as const;
function validate(raw:string):Journal{
 const v:unknown=JSON.parse(raw);
 if(!exact(v,["schema","revision","claims"])||v.schema!==schema||
  !Number.isSafeInteger(v.revision)||Number(v.revision)<0||
  !Array.isArray(v.claims)||v.claims.length>256||v.revision!==v.claims.length)
  throw new Error("Invalid one-shot supervisor claim journal");
 const seen=new Set<string>(),seenSessions=new Set<string>();
 for(const claim of v.claims){
  if(!exact(claim,keys)||!safe(claim.batchId)||!safe(claim.sourceSessionId)||
   typeof claim.sourceProjectId!=="string"||!isAbsolute(claim.sourceProjectId)||
   !Array.isArray(claim.children)||claim.children.length<2||claim.children.length>4||
   !safe(claim.claimedAt)||!Number.isFinite(Date.parse(claim.claimedAt))||
   new Date(claim.claimedAt as string).toISOString()!==claim.claimedAt||
   claim.status!=="claimed-not-verified"||claim.grantsAuthority!==false||
   claim.autoRetry!==false||claim.autoMerge!==false)
   throw new Error("Invalid one-shot supervisor claim");
  const childIds=new Set<string>(),childTodoIds=new Set<string>(),roots=new Set<string>(),sessions=new Set<string>();
  for(const child of claim.children){
   if(!exact(child,childKeys)||!safe(child.sourceTodoId)||!safe(child.childTodoId)||
    !safe(child.childSessionId)||typeof child.childProjectId!=="string"||
    !isAbsolute(child.childProjectId)||
    childIds.has(child.sourceTodoId)||childTodoIds.has(child.childTodoId)||
    sessions.has(child.childSessionId)||seenSessions.has(child.childSessionId)||
    roots.has(child.childProjectId.toLocaleLowerCase("en-US")))
    throw new Error("Invalid or duplicate supervisor child claim");
   childIds.add(child.sourceTodoId);childTodoIds.add(child.childTodoId);
   sessions.add(child.childSessionId);seenSessions.add(child.childSessionId);
   roots.add(child.childProjectId.toLocaleLowerCase("en-US"));
  }
  const key=claim.batchId+"|"+claim.sourceSessionId+"|"+claim.sourceProjectId.toLowerCase();
  if(seen.has(key))throw new Error("Duplicate supervisor batch claim");seen.add(key);
 }
 return structuredClone(v) as unknown as Journal;
}
async function load(file:string):Promise<Journal>{
 if(!await preparePrivateFile(file))return {schema,revision:0,claims:[]};
 return validate(await readFile(file,"utf8"));
}
export class ParentSupervisorClaimJournal{
 constructor(readonly file:string){if(!isAbsolute(file))throw new Error("Supervisor claims require a private absolute file path");}
 async claim(input:{
  readonly source:TodoContext;readonly batchId:string;
  readonly children:readonly Readonly<{sourceTodoId:string;childTodoId:string;childSessionId:string;childProjectId:string}>[];
 }):Promise<ParentSupervisorClaim>{
  if(!safe(input.batchId)||!safe(input.source?.sessionId)||!isAbsolute(input.source?.projectId??"")||
   !Array.isArray(input.children)||input.children.length<2||input.children.length>4)
   throw new Error("Supervisor claim requires an exact bounded source batch");
  const claim:ParentSupervisorClaim={
   batchId:input.batchId,sourceSessionId:input.source.sessionId,
   sourceProjectId:input.source.projectId,
   children:input.children.map(c=>({...c})),
   claimedAt:new Date().toISOString(),status:"claimed-not-verified",
   grantsAuthority:false,autoRetry:false,autoMerge:false
  };
  validate(JSON.stringify({schema,revision:1,claims:[claim]}));
  await preparePrivateFile(this.file,true);
  return withExclusiveFileLock(this.file,async()=>{
   const journal=await load(this.file);
   if(journal.claims.length>=256||journal.claims.some(previous=>
    previous.batchId===claim.batchId&&previous.sourceSessionId===claim.sourceSessionId&&
    sameWorkspaceIdentityPath(previous.sourceProjectId,claim.sourceProjectId)||
    previous.children.some(used=>claim.children.some(next=>
     used.childSessionId===next.childSessionId||
     sameWorkspaceIdentityPath(used.childProjectId,next.childProjectId)))))
    throw new Error("Source supervisor batch previously claimed; inspect durable child results, never auto-retry");
   journal.claims.push(claim);journal.revision++;
   await atomicWriteText(this.file,JSON.stringify(validate(JSON.stringify(journal)))+"\n");
   return structuredClone(claim);
  });
 }
 async listSource(source:TodoContext):Promise<readonly ParentSupervisorClaim[]>{
  if(!safe(source?.sessionId)||!isAbsolute(source?.projectId??""))
   throw new Error("Supervisor claim read requires source identity");
  return (await load(this.file)).claims.filter(c=>c.sourceSessionId===source.sessionId&&
   sameWorkspaceIdentityPath(c.sourceProjectId,source.projectId)).map(c=>structuredClone(c));
 }
}
