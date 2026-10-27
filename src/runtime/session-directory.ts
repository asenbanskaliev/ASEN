import {mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
export interface SessionDirectoryEntry{readonly sessionId:string;readonly subject:string;readonly projectId:string;readonly taskAlias?:string;readonly classification:"read"|"write"|"review";readonly updatedAt:string;}
export class SessionDirectory{
 constructor(private readonly file:string){}
 publish(entry:SessionDirectoryEntry):void{if(!entry.sessionId||!entry.subject||!entry.projectId)throw new Error("Session identity is incomplete");const rows=this.read().filter(row=>row.sessionId!==entry.sessionId);mkdirSync(dirname(this.file),{recursive:true,mode:0o700});const tmp=`${this.file}.tmp-${process.pid}`;writeFileSync(tmp,JSON.stringify([...rows,entry])+"\n",{mode:0o600});renameSync(tmp,this.file);}
 list(projectId?:string):readonly SessionDirectoryEntry[]{return Object.freeze(this.read().filter(row=>projectId===undefined||row.projectId===projectId));}
 consult(requesterSessionId:string,targetSessionId:string,projectId:string,authorized:boolean):SessionDirectoryEntry{if(!authorized)throw new Error("Cross-session consultation requires explicit permission");if(requesterSessionId===targetSessionId)throw new Error("Cross-session consultation requires a different session");const target=this.read().find(row=>row.sessionId===targetSessionId&&row.projectId===projectId);if(!target)throw new Error("Target session is unavailable");return Object.freeze({...target});}
 remove(sessionId:string):void{const rows=this.read().filter(row=>row.sessionId!==sessionId);mkdirSync(dirname(this.file),{recursive:true,mode:0o700});const tmp=`${this.file}.tmp-${process.pid}`;writeFileSync(tmp,JSON.stringify(rows)+"\n",{mode:0o600});renameSync(tmp,this.file);}
 private read():SessionDirectoryEntry[]{try{const value=JSON.parse(readFileSync(this.file,"utf8")) as unknown;return Array.isArray(value)?value.filter(row=>!!row&&typeof row==="object"&&typeof (row as any).sessionId==="string") as SessionDirectoryEntry[]:[];}catch{return [];}}
}

