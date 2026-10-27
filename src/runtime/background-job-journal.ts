import {mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
import type {BackgroundJobSnapshot} from "./background-jobs.js";

export interface BackgroundJobJournalEntry extends BackgroundJobSnapshot{readonly recoveredAt:string;readonly resumable:false;}
export class BackgroundJobJournal{
 constructor(private readonly file:string){}
 load(sessionId:string):readonly BackgroundJobJournalEntry[]{
  try{const value=JSON.parse(readFileSync(this.file,"utf8")) as unknown;if(!Array.isArray(value))return [];
   return Object.freeze(value.filter((row):row is BackgroundJobJournalEntry=>!!row&&typeof row==="object"&&(row as any).sessionId===sessionId&&(row as any).resumable===false));
  }catch{return []}
 }
 record(snapshot:BackgroundJobSnapshot):void{
  const current=this.readAll().filter(row=>row.id!==snapshot.id),entry={...snapshot,recoveredAt:new Date().toISOString(),resumable:false as const};
  mkdirSync(dirname(this.file),{recursive:true,mode:0o700});const temporary=`${this.file}.tmp-${process.pid}`;writeFileSync(temporary,JSON.stringify([...current,entry])+"\n",{mode:0o600,flag:"w"});renameSync(temporary,this.file);
 }
 private readAll():BackgroundJobJournalEntry[]{try{const value=JSON.parse(readFileSync(this.file,"utf8")) as unknown;return Array.isArray(value)?value as BackgroundJobJournalEntry[]:[];}catch{return [];}}
}

