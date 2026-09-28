import type { Candidate, Evidence } from "../core/types.js";
import {isExecutedEvidence,type ExecutedEvidence} from "./execution.js";
const recovered=new WeakSet<object>();
export interface RecoveredEvidence {readonly value:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">;}
export function issueRecoveredEvidence(value:RecoveredEvidence["value"]):RecoveredEvidence{const proof=Object.freeze({value});recovered.add(proof);return proof;}
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
 restoreSigned(candidate:Candidate,proof:RecoveredEvidence):Evidence{
  if(!recovered.has(proof))throw new Error("Recovered evidence requires verified signed proof");
  const evidence=proof.value;
  if(evidence.status==="pass"&&(evidence.kind==="test"||evidence.kind==="tdd")){
   const x=evidence.execution;if(!x||x.exitCode!==0||!Array.isArray(x.command)||x.command.length===0||!x.cwd||!x.startedAt||!x.finishedAt)throw new Error("Recovered passing execution evidence lacks provenance");
  }
  return this.#insert(candidate,evidence);
 }
 #insert(candidate:Candidate,evidence:Omit<Evidence,"candidateRepository"|"candidateId"|"candidateRevision">):Evidence{
  if(this.#items.has(evidence.id)) throw new Error(`Evidence id already exists: ${evidence.id}`);
  const item:Evidence={...evidence,candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision};
  this.#items.set(item.id,Object.freeze(item)); return item;
 }
 forCandidate(candidate:Candidate):Evidence[]{return [...this.#items.values()].filter(i=>i.candidateRepository===candidate.repository&&i.candidateId===candidate.id&&i.candidateRevision===candidate.revision);}
 hasPassing(candidate:Candidate,kind:Evidence["kind"]):boolean{return this.forCandidate(candidate).some(i=>i.kind===kind&&i.status==="pass");}
}
