import {createHash} from "node:crypto";
import type {HistoryEntry} from "./history.js";

export const HISTORY_PREVIEW_LIMIT=160;
const EMPTY_ROWS=Object.freeze([]) as readonly [];
const IDENTIFIER=/^[^\u0000-\u001f\u007f-\u009f]{1,256}$/u;
const FORMAT_CONTROL=/\p{Cf}/u,WHITE_SPACE=/\s/u;
const ESC="\u001b",BEL="\u0007",C1_ST="\u009c";
const STRING_OPENERS=new Set(["]","P","_","^","X"]),C1_STRING_OPENERS=new Set(["\u009d","\u0090","\u009f","\u009e","\u0098"]);

export interface HistorySelectorRow{readonly id:string;readonly timestamp:string;readonly redacted:boolean;readonly preview:string}
export type HistoryProjection=
 | Readonly<{state:"data";rows:readonly HistorySelectorRow[];nextCursor?:string}>
 | Readonly<{state:"empty";rows:readonly []}>
 | Readonly<{state:"unavailable";rows:readonly []}>;
export type HistorySelection=
 | Readonly<{state:"selected";id:string;deletionAuthorized:false}>
 | Readonly<{state:"cancelled"}>;

export function normalizeHistoryQuery(query:string):string{
 if(query.length>512)throw new Error("Invalid history query");
 return query.trim().toLowerCase();
}

function consumeCsi(text:string,index:number):number{
 while(index<text.length){const code=text.charCodeAt(index++);if(code>=0x40&&code<=0x7e)return index;}
 return text.length;
}

function consumeEscape(text:string,index:number):number{
 while(index<text.length&&text.charCodeAt(index)>=0x20&&text.charCodeAt(index)<=0x2f)index++;
 return index<text.length?index+1:text.length;
}

function sanitizePreview(text:string):string{
 const output:string[]=[];let pendingSpace=false,stringDepth=0,index=0;
 const visible=(character:string)=>{
  if(WHITE_SPACE.test(character)){pendingSpace=output.length>0;return;}
  if(pendingSpace){output.push(" ");pendingSpace=false;}output.push(character);
 };
 while(index<text.length){
  const character=text[index]!,next=text[index+1];
  if(stringDepth>0){
   if(character===BEL||character===C1_ST){stringDepth--;index++;continue;}
   if(character===ESC&&next==="\\"){stringDepth--;index+=2;continue;}
   if(character===ESC&&next!==undefined&&STRING_OPENERS.has(next)){stringDepth++;index+=2;continue;}
   if(C1_STRING_OPENERS.has(character)){stringDepth++;index++;continue;}
   index++;continue;
  }
  if(character===ESC){
   if(next!==undefined&&STRING_OPENERS.has(next)){stringDepth=1;index+=2;continue;}
   if(next==="["){index=consumeCsi(text,index+2);continue;}
   index=consumeEscape(text,index+1);continue;
  }
  if(C1_STRING_OPENERS.has(character)){stringDepth=1;index++;continue;}
  if(character==="\u009b"){index=consumeCsi(text,index+1);continue;}
  const code=character.charCodeAt(0);
  if(code<=0x1f||(code>=0x7f&&code<=0x9f)){pendingSpace=output.length>0;index++;continue;}
  const codePoint=String.fromCodePoint(text.codePointAt(index)!);index+=codePoint.length;
  if(!FORMAT_CONTROL.test(codePoint))visible(codePoint);
 }
 const safe=output.join(""),characters=Array.from(safe);
 return characters.length<=HISTORY_PREVIEW_LIMIT?safe:`${characters.slice(0,HISTORY_PREVIEW_LIMIT-1).join("")}…`;
}

function addField(hash:ReturnType<typeof createHash>,value:string):void{
 hash.update(String(Buffer.byteLength(value,"utf8"))).update(":").update(value);
}

function cursorDigest(entries:readonly HistoryEntry[],projectId:string,query:string,pageSize:number,offset:number):string{
 const hash=createHash("sha256");
 for(const field of ["history-selector/v2",projectId,query,String(pageSize),String(offset)])addField(hash,field);
 for(const entry of entries){
  if(entry.projectId!==projectId)continue;
  for(const field of [entry.id,entry.sessionId,entry.projectId,entry.text,entry.createdAt,String(entry.redacted)])addField(hash,field);
 }
 return hash.digest("hex");
}

function cursorFor(entries:readonly HistoryEntry[],offset:number,projectId:string,query:string,pageSize:number):string{
 return `history.v2.${offset.toString(36)}.${cursorDigest(entries,projectId,query,pageSize,offset)}`;
}

function cursorOffset(cursor:string|undefined,entries:readonly HistoryEntry[],projectId:string,query:string,pageSize:number):number{
 if(cursor===undefined)return 0;
 const match=/^history\.v2\.([0-9a-z]+)\.([a-f0-9]{64})$/u.exec(cursor),position=match?.[1],offset=position?Number.parseInt(position,36):NaN;
 if(!match||!Number.isSafeInteger(offset)||offset<0||cursorFor(entries,offset,projectId,query,pageSize)!==cursor)throw new Error("Invalid history cursor");
 return offset;
}

export function projectHistory(entries:readonly HistoryEntry[],projectId:string,query:string,pageSize:number,cursor?:string):HistoryProjection{
 if(!IDENTIFIER.test(projectId))throw new Error("Invalid history project");
 if(!Number.isSafeInteger(pageSize)||pageSize<3||pageSize>20)throw new Error("Invalid history page size");
 const needle=normalizeHistoryQuery(query),offset=cursorOffset(cursor,entries,projectId,needle,pageSize),matches:HistoryEntry[]=[];
 for(let index=entries.length-1;index>=0;index--){const entry=entries[index];if(entry?.projectId===projectId&&(!needle||entry.text.toLowerCase().includes(needle)))matches.push(entry);}
 if(offset>matches.length)throw new Error("Invalid history cursor");
 const page=matches.slice(offset,offset+pageSize);
 if(page.length===0)return Object.freeze({state:"empty",rows:EMPTY_ROWS});
 const rows=Object.freeze(page.map(entry=>Object.freeze({id:entry.id,timestamp:entry.createdAt,redacted:entry.redacted,preview:sanitizePreview(entry.text)})));
 const nextOffset=offset+page.length;
 return Object.freeze(nextOffset<matches.length?{state:"data",rows,nextCursor:cursorFor(entries,nextOffset,projectId,needle,pageSize)}:{state:"data",rows});
}

export function historyUnavailable():HistoryProjection{return Object.freeze({state:"unavailable",rows:EMPTY_ROWS});}
export function cancelHistorySelection():HistorySelection{return Object.freeze({state:"cancelled"});}
export function selectHistoryEntry(entries:readonly HistoryEntry[],projectId:string,query:string,pageSize:number,id:string,cursor?:string):HistorySelection{
 if(!IDENTIFIER.test(id))throw new Error("Invalid history selection");
 const projection=projectHistory(entries,projectId,query,pageSize,cursor);
 if(projection.state!=="data"||!projection.rows.some(row=>row.id===id))throw new Error("Invalid history selection");
 return Object.freeze({state:"selected",id,deletionAuthorized:false});
}
