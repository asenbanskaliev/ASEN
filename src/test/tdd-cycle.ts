import type {Candidate} from "../core/types.js";
import {EvidenceStore} from "../evidence/store.js";
import {addExecutedEvidence,type ExecutedEvidence} from "../evidence/execution.js";
export type TddStage="RED"|"GREEN"|"REFACTOR";
export class TddCycle {
 #next:TddStage="RED";
 constructor(private readonly candidate:Candidate,private readonly store:EvidenceStore){}
 record(stage:TddStage,id:string,summary:string,proof:ExecutedEvidence):void{
  if(stage!==this.#next) throw new Error(`TDD stage out of order: expected ${this.#next}, got ${stage}`);
  addExecutedEvidence(this.store,this.candidate,proof,{id,kind:"tdd",summary:`${stage}: ${summary}`,expectFailure:stage==="RED"});
  this.#next=stage==="RED"?"GREEN":stage==="GREEN"?"REFACTOR":"RED";
 }
}
