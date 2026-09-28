import type {Candidate} from "../core/types.js";
import {EvidenceStore} from "../evidence/store.js";
import {isExecutedEvidence,type ExecutedEvidence} from "../evidence/execution.js";

export type TddStage="RED"|"GREEN"|"REFACTOR";
export interface IssuedTddStage{
 readonly cycleId:string;
 readonly stage:TddStage;
 readonly candidateRepository:string;
 readonly candidateId:string;
 readonly candidateRevision:string;
 readonly proof:ExecutedEvidence;
}
const issuedStages=new WeakSet<object>();
export function isIssuedTddStage(value:unknown):value is IssuedTddStage{
 return typeof value==="object"&&value!==null&&issuedStages.has(value);
}
export class TddCycle {
 #next:TddStage="RED";
 readonly #cycleId:string;
 constructor(private readonly candidate:Candidate,private readonly store:EvidenceStore,cycleId:string){
  if(!cycleId.trim()||cycleId.includes(":"))throw new Error("TDD cycle requires a stable cycle id");
  this.#cycleId=cycleId;
 }
 record(stage:TddStage,id:string,summary:string,proof:ExecutedEvidence):void{
  if(stage!==this.#next)throw new Error(`TDD stage out of order: expected ${this.#next}, got ${stage}`);
  if(id!==`${this.#cycleId}:${stage.toLowerCase()}`)throw new Error("TDD evidence id does not belong to this cycle");
  if(!isExecutedEvidence(proof))throw new Error("TDD requires ASEN-executed command evidence");
  const token=Object.freeze({cycleId:this.#cycleId,stage,candidateRepository:this.candidate.repository,candidateId:this.candidate.id,candidateRevision:this.candidate.revision,proof});
  issuedStages.add(token);
  this.store.addTddStage(this.candidate,token,{id,summary:`${this.#cycleId} ${stage}: ${summary}`});
  this.#next=stage==="RED"?"GREEN":stage==="GREEN"?"REFACTOR":"RED";
 }
}
