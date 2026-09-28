import type {Candidate} from "../core/types.js";
import {EvidenceStore} from "../evidence/store.js";
import {isExecutedEvidence,type ExecutedEvidence} from "../evidence/execution.js";

export type TddStage="RED"|"GREEN"|"REFACTOR";
export interface IssuedTddStage{
 readonly cycleId:string; readonly stage:TddStage;
 readonly candidateRepository:string; readonly candidateId:string; readonly candidateRevision:string;
 readonly previousRevision?:string; readonly proof:ExecutedEvidence;
}
const issuedStages=new WeakSet<object>();
export function isIssuedTddStage(value:unknown):value is IssuedTddStage{return typeof value==="object"&&value!==null&&issuedStages.has(value);}
export class TddCycle {
 #next:TddStage="RED"; #previous?:Candidate; readonly #cycleId:string;
 constructor(private candidate:Candidate,private readonly store:EvidenceStore,cycleId:string){
  if(!cycleId.trim()||cycleId.includes(":"))throw new Error("TDD cycle requires a stable cycle id"); this.#cycleId=cycleId;
 }
 record(stage:TddStage,id:string,summary:string,proof:ExecutedEvidence,candidate:Candidate=this.candidate):void{
  if(stage!==this.#next)throw new Error(`TDD stage out of order: expected ${this.#next}, got ${stage}`);
  if(id!==`${this.#cycleId}:${stage.toLowerCase()}`)throw new Error("TDD evidence id does not belong to this cycle");
  if(!isExecutedEvidence(proof))throw new Error("TDD requires ASEN-executed command evidence");
  if(candidate.id!==this.candidate.id||candidate.repository!==this.candidate.repository)throw new Error("TDD candidate lineage mismatch");
  if(proof.candidateRepository!==candidate.repository||proof.candidateId!==candidate.id||proof.candidateRevision!==candidate.revision)throw new Error("TDD execution does not match stage revision");
  if(stage!=="RED"&&(!this.#previous||candidate.revision===this.#previous.revision))throw new Error("TDD GREEN and REFACTOR require a new candidate revision");
  const token=Object.freeze({cycleId:this.#cycleId,stage,candidateRepository:candidate.repository,candidateId:candidate.id,candidateRevision:candidate.revision,...(this.#previous?{previousRevision:this.#previous.revision}:{}),proof});
  issuedStages.add(token); this.store.addTddStage(candidate,token,{id,summary:`${this.#cycleId} ${stage}: ${summary}`});
  this.#previous=candidate; this.candidate=candidate; this.#next=stage==="RED"?"GREEN":stage==="GREEN"?"REFACTOR":"RED";
 }
}
