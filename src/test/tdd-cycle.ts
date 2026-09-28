import type {Candidate} from "../core/types.js";
import {EvidenceStore} from "../evidence/store.js";
import {addExecutedEvidence,type ExecutedEvidence} from "../evidence/execution.js";
export type TddStage="RED"|"GREEN"|"REFACTOR";
export class TddCycle {
 #next:TddStage="RED";
 readonly #cycleId:string;
 constructor(private readonly candidate:Candidate,private readonly store:EvidenceStore,cycleId:string){
  if(!cycleId.trim())throw new Error("TDD cycle requires a stable cycle id");
  this.#cycleId=cycleId;
 }
 record(stage:TddStage,id:string,summary:string,proof:ExecutedEvidence):void{
  if(stage!==this.#next) throw new Error(`TDD stage out of order: expected ${this.#next}, got ${stage}`);
  if(!id.startsWith(`${this.#cycleId}:`))throw new Error("TDD evidence id does not belong to this cycle");
  addExecutedEvidence(this.store,this.candidate,proof,{id,kind:"tdd",summary:`${this.#cycleId} ${stage}: ${summary}`,expectFailure:stage==="RED"});
  this.#next=stage==="RED"?"GREEN":stage==="GREEN"?"REFACTOR":"RED";
 }
}
