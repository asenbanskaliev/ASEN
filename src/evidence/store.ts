import {createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {open,readFile,rename,unlink} from "node:fs/promises";
import {basename,dirname,join} from "node:path";
import type { Candidate, Evidence } from "../core/types.js";
import {isExecutedEvidence,type ExecutedEvidence} from "./execution.js";
interface Envelope{version:1;candidate:Candidate;items:Evidence[];}
const kinds=new Set(["test","review","command","audit","tdd","route-decision","work-unit","scope","rollback"]);
const statuses=new Set(["pass","fail","expected-fail"]);
function sign(value:Envelope,key:Buffer):string{
 if(key.length<32)throw new Error("Evidence recovery requires a 32-byte secret");
 return createHmac("sha256",key).update(JSON.stringify(value)).digest("hex");
}
export class EvidenceStore {
 readonly #items=new Map<string,Evidence>();
 add(candidate:Candidate,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(evidence.status==="pass"&&(evidence.kind==="test"||evidence.kind==="tdd"))throw new Error(`Passing ${evidence.kind} evidence requires executed proof`);
  return this.#insert(candidate,evidence);
 }
 addExecuted(candidate:Candidate,proof:ExecutedEvidence,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(!isExecutedEvidence(proof))throw new Error("Executed evidence requires ASEN-issued execution proof");
  if(proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision)throw new Error("Executed evidence candidate mismatch");
  if(evidence.kind!=="test"&&evidence.kind!=="tdd")throw new Error("Executed evidence only applies to test or tdd");
  const execution={command:[...proof.command],cwd:proof.cwd,exitCode:proof.exitCode,startedAt:proof.startedAt,finishedAt:proof.finishedAt};
  return this.#insert(candidate,{...evidence,execution});
 }
 #restoreVerified(candidate:Candidate,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(evidence.status==="pass"&&(evidence.kind==="test"||evidence.kind==="tdd")){
   const x=evidence.execution;if(!x||x.exitCode!==0||!Array.isArray(x.command)||x.command.length===0||!x.cwd||!x.startedAt||!x.finishedAt)throw new Error("Recovered passing execution evidence lacks provenance");
  }
  return this.#insert(candidate,evidence);
 }
 static async loadVerified(path:string,candidate:Candidate,key:Buffer):Promise<EvidenceStore>{
 const raw=JSON.parse(await readFile(path,"utf8")) as {value:Envelope;mac:string};
 if(!raw?.value||typeof raw.mac!=="string"||!/^[0-9a-f]{64}$/i.test(raw.mac))throw new Error("Evidence recovery signature missing");
 const expected=Buffer.from(sign(raw.value,key),"hex"),actual=Buffer.from(raw.mac,"hex");
 if(!timingSafeEqual(expected,actual))throw new Error("Evidence recovery integrity mismatch");
 const v=raw.value,c=v.candidate;
 if(v.version!==1||!c||c.repository!==candidate.repository||c.id!==candidate.id||c.revision!==candidate.revision)throw new Error("Evidence recovery candidate mismatch");
 if(!Array.isArray(v.items))throw new Error("Evidence recovery items invalid");
 const store=new EvidenceStore();
 for(const item of v.items){
  if(!item||item.candidateRepository!==candidate.repository||item.candidateId!==candidate.id||item.candidateRevision!==candidate.revision||typeof item.id!=="string"||!item.id||!kinds.has(item.kind)||!statuses.has(item.status)||typeof item.summary!=="string"||typeof item.createdAt!=="string")throw new Error("Evidence recovery item mismatch");
  store.#restoreVerified(candidate,{id:item.id,kind:item.kind,status:item.status,summary:item.summary,createdAt:item.createdAt,...(item.execution?{execution:item.execution}:{})});
 }
 return store;
}
 #insert(candidate:Candidate,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(this.#items.has(evidence.id)) throw new Error(`Evidence id already exists: ${evidence.id}`);
  const item:Evidence={...evidence,candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision};
  this.#items.set(item.id,Object.freeze(item)); return item;
 }
 forCandidate(candidate:Candidate):Evidence[]{return [...this.#items.values()].filter(i=>i.candidateRepository===candidate.repository&&i.candidateId===candidate.id&&i.candidateRevision===candidate.revision);}
 hasPassing(candidate:Candidate,kind:Evidence["kind"]):boolean{return this.forCandidate(candidate).some(i=>i.kind===kind&&i.status==="pass");}
}

export async function saveEvidence(path:string,candidate:Candidate,store:EvidenceStore,key:Buffer):Promise<void>{
 const value:Envelope={version:1,candidate:structuredClone(candidate),items:store.forCandidate(candidate)};
 const temp=join(dirname(path),`.${basename(path)}.${randomUUID()}.tmp`);
 let handle;
 try{
  handle=await open(temp,"wx",0o600);
  await handle.writeFile(JSON.stringify({value,mac:sign(value,key)}),"utf8");await handle.sync();await handle.close();handle=undefined;
  await rename(temp,path);
 }finally{if(handle)await handle.close();await unlink(temp).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});}
}

export async function loadEvidence(path:string,candidate:Candidate,key:Buffer):Promise<EvidenceStore>{
 return EvidenceStore.loadVerified(path,candidate,key);
}
