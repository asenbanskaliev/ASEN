import type {Candidate} from "../core/types.js";import {EvidenceStore} from "../evidence/store.js";
export type TddStage="RED"|"GREEN"|"REFACTOR";
export class TddCycle {
 #next:TddStage="RED"; constructor(private readonly candidate:Candidate,private readonly store:EvidenceStore){}
 record(stage:TddStage,id:string,summary:string):void{
  if(stage!==this.#next) throw new Error(`TDD stage out of order: expected ${this.#next}, got ${stage}`);
  this.store.add(this.candidate,{id,kind:"tdd",status:stage==="RED"?"fail":"pass",summary:`${stage}: ${summary}`,createdAt:new Date().toISOString()});
  this.#next=stage==="RED"?"GREEN":stage==="GREEN"?"REFACTOR":"RED";
 }
}
