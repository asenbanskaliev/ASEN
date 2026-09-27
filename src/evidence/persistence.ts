import {createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {open,readFile,rename,unlink} from "node:fs/promises";
import {basename,dirname,join} from "node:path";
import type {Candidate,Evidence} from "../core/types.js";
import {EvidenceStore} from "./store.js";
interface Envelope{version:1;candidate:Candidate;items:Evidence[];}
const kinds=new Set(["test","review","command","audit","tdd","route-decision","work-unit","scope","rollback"]);
const statuses=new Set(["pass","fail","expected-fail"]);
function sign(value:Envelope,key:Buffer):string{
 if(key.length<32)throw new Error("Evidence recovery requires a 32-byte secret");
 return createHmac("sha256",key).update(JSON.stringify(value)).digest("hex");
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
  store.add(candidate,{id:item.id,kind:item.kind,status:item.status,summary:item.summary,createdAt:item.createdAt});
 }
 return store;
}
