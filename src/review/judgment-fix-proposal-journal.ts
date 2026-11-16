/** T08: diario privado de propuestas Fix observadas. Ninguna entrada permite
 * crear tareas Writer, reutilizar consentimiento, reintentar o fusionar cambios. */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../runtime/workspace-store.js";
import {validatePortableReviewPaths} from "./review-tree-paths.js";
import {hasSensitiveName} from "../security/primary-tool-policy.js";
import {isIssuedJudgmentFixHandoff,type JudgmentFixHandoff} from "./odd-agent-review-flow.js";

const schema="asen.judgment-fix-proposals/v1" as const;
const sha=/^[a-f0-9]{64}$/u;
const revision=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const safe=(value:unknown,length=1024):value is string=>
 typeof value==="string"&&value.length>0&&value.length<=length&&
 value===value.trim()&&value===value.normalize("NFC")&&
 !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(value);
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>
 typeof value==="object"&&value!==null&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype&&
 Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export interface StoredJudgmentFixProposal{
 readonly id:string;readonly requestId:string;readonly sessionId:string;
 readonly repositoryRoot:string;readonly candidateRevision:string;
 readonly candidateTreeIdentity:string;readonly paths:readonly string[];
 readonly status:"proposal-only";
 readonly requiredAction:"manual-triage"|"new-odd-plan";
 readonly modelRequested:string;readonly modelActual:"unknown";
 readonly createdAt:string;
 readonly requiresFreshWriterConsent:true;readonly autoLaunch:false;
 readonly autoMerge:false;readonly acceptance:"not-accepted";
}
interface Journal{
 readonly schema:typeof schema;readonly revision:number;
 readonly proposals:readonly StoredJudgmentFixProposal[];
}
const keys=[
 "id","requestId","sessionId","repositoryRoot","candidateRevision",
 "candidateTreeIdentity","paths","status","requiredAction","modelRequested",
 "modelActual","createdAt","requiresFreshWriterConsent",
 "autoLaunch","autoMerge","acceptance"
] as const;
function parse(raw:string):Journal{
 const data:unknown=JSON.parse(raw);
 if(!exact(data,["schema","revision","proposals"])||data.schema!==schema||
  !Number.isSafeInteger(data.revision)||Number(data.revision)<0||
  !Array.isArray(data.proposals)||data.proposals.length>256||
  data.revision!==data.proposals.length)throw new Error("Invalid Fix proposal journal");
 const seen=new Set<string>();
 for(const row of data.proposals){
  if(!exact(row,keys)||!safe(row.id)||!sha.test(row.id as string)||
   !safe(row.requestId)||!safe(row.sessionId)||!safe(row.repositoryRoot,32768)||
   !isAbsolute(row.repositoryRoot as string)||
   !safe(row.candidateRevision)||!revision.test(row.candidateRevision as string)||
   !safe(row.candidateTreeIdentity)||!safe(row.modelRequested,256)||
   row.modelActual!=="unknown"||row.status!=="proposal-only"||
   !["manual-triage","new-odd-plan"].includes(String(row.requiredAction))||
   row.requiresFreshWriterConsent!==true||row.autoLaunch!==false||
   row.autoMerge!==false||row.acceptance!=="not-accepted"||
   typeof row.createdAt!=="string"||!Number.isFinite(Date.parse(row.createdAt))||
   new Date(row.createdAt as string).toISOString()!==row.createdAt||
   !Array.isArray(row.paths)||row.paths.length<1||row.paths.length>100)
   throw new Error("Invalid non-authorizing Fix proposal");
  let scoped:readonly string[];
  try{scoped=validatePortableReviewPaths(row.paths);}
  catch{throw new Error("Invalid Fix proposal paths");}
  if(scoped.some(hasSensitiveName)||scoped.length!==(row.paths as string[]).length||
   scoped.some((path,index)=>path!==(row.paths as string[])[index]))
   throw new Error("Invalid Fix proposal file scope");
  const id=createHash("sha256").update(
   [row.requestId,row.sessionId,row.repositoryRoot,row.candidateTreeIdentity].join("\0")
  ).digest("hex");
  if(row.id!==id||seen.has(id))throw new Error("Forged or duplicate Fix proposal identity");
  seen.add(id);
 }
 return structuredClone(data) as unknown as Journal;
}
async function load(file:string):Promise<Journal>{
 if(!await preparePrivateFile(file))return {schema,revision:0,proposals:[]};
 return parse(await readFile(file,"utf8"));
}
export class JudgmentFixProposalJournal{
 constructor(readonly file:string){
  if(!isAbsolute(file))throw new Error("Fix proposal journal requires an absolute private path");
 }
 async record(handoff:JudgmentFixHandoff):Promise<StoredJudgmentFixProposal>{
  if(!isIssuedJudgmentFixHandoff(handoff)||
   !["fix-planning-required","manual-triage-required"].includes(handoff.status)||
   !safe(handoff.requestId)||!safe(handoff.sessionId)||
   !safe(handoff.repositoryRoot,32768)||!isAbsolute(handoff.repositoryRoot)||
   !revision.test(handoff.candidateRevision)||
   !safe(handoff.candidateTreeIdentity)||
   !safe(handoff.fixModelRequested,256)||
   handoff.acceptance!=="not-accepted"||handoff.writerAuthority!==false||
   handoff.autoLaunch!==false||handoff.autoMerge!==false||
   handoff.requiresFreshWriterConsent!==true||
   handoff.paths.length<1||handoff.paths.length>100)
   throw new Error("Fix proposal is not genuine, scoped or eligible");
  const id=createHash("sha256").update(
   [handoff.requestId,handoff.sessionId,handoff.repositoryRoot,handoff.candidateTreeIdentity].join("\0")
  ).digest("hex");
  const row:StoredJudgmentFixProposal=Object.freeze({
   id,requestId:handoff.requestId,sessionId:handoff.sessionId,
   repositoryRoot:handoff.repositoryRoot,
   candidateRevision:handoff.candidateRevision,
   candidateTreeIdentity:handoff.candidateTreeIdentity,
   paths:Object.freeze([...handoff.paths]),
   status:"proposal-only" as const,
   requiredAction:handoff.status==="manual-triage"?"manual-triage" as const:"new-odd-plan" as const,
   modelRequested:handoff.fixModelRequested,modelActual:"unknown" as const,
   createdAt:new Date().toISOString(),
   requiresFreshWriterConsent:true as const,
   autoLaunch:false as const,autoMerge:false as const,acceptance:"not-accepted" as const
  });
  parse(JSON.stringify({schema,revision:1,proposals:[row]}));
  await preparePrivateFile(this.file,true);
  return withExclusiveFileLock(this.file,async()=>{
   const current=await load(this.file);
   const existing=current.proposals.find(item=>item.id===id);
   if(existing){
    if(existing.candidateRevision!==row.candidateRevision||
     existing.requiredAction!==row.requiredAction||
     existing.modelRequested!==row.modelRequested||
     JSON.stringify(existing.paths)!==JSON.stringify(row.paths))
     throw new Error("Fix proposal identity was already recorded with different scope");
    return structuredClone(existing);
   }
   if(current.proposals.length>=256)throw new Error("Fix proposal journal limit reached");
   const next={schema,revision:current.revision+1,
    proposals:[...current.proposals,row]};
   await atomicWriteText(this.file,JSON.stringify(parse(JSON.stringify(next)))+"\n");
   return structuredClone(row);
  });
 }
 async list(identity:{sessionId:string;projectId:string}):Promise<readonly StoredJudgmentFixProposal[]>{
  if(!safe(identity?.sessionId)||!safe(identity?.projectId,32768)||
   !isAbsolute(identity.projectId))throw new Error("Invalid Fix proposal source session");
  return (await load(this.file)).proposals.filter(row=>
   row.sessionId===identity.sessionId&&
   sameWorkspaceIdentityPath(row.repositoryRoot,identity.projectId)
  ).map(row=>structuredClone(row));
 }
}
