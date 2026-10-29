import {closeSync,fstatSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {dirname} from "node:path";
import type {BackgroundJobSnapshot} from "./background-jobs.js";

export interface BackgroundJobJournalEntry extends BackgroundJobSnapshot{readonly recoveredAt:string;readonly resumable:false;}
const MAX_JOURNAL_BYTES=2*1024*1024,MAX_ENTRIES=500,MAX_TAIL_LINES=200,MAX_LINE_CHARS=10_000;
function privatePath(file:string):void{
 const parent=dirname(file);mkdirSync(parent,{recursive:true,mode:0o700});const directory=lstatSync(parent);
 if(!directory.isDirectory()||directory.isSymbolicLink()||(process.platform!=="win32"&&(directory.mode&0o077)!==0))throw new Error("Background journal directory is not private and safe");
 try{const target=lstatSync(file);if(!target.isFile()||target.isSymbolicLink()||(process.platform!=="win32"&&(target.mode&0o077)!==0))throw new Error("Background journal file is not private and safe");}
 catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
}
function validateRows(value:unknown):BackgroundJobJournalEntry[]{
 if(!Array.isArray(value)||value.length>MAX_ENTRIES)throw new Error("Background job journal is corrupt or exceeds its retention bound");
 const seen=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=="object")throw new Error("Background job journal entry is malformed");
  const entry=row as BackgroundJobJournalEntry;
  if(typeof entry.id!=="string"||!entry.id||entry.id.length>256||seen.has(entry.id)||typeof entry.sessionId!=="string"||!entry.sessionId||entry.sessionId.length>256||typeof entry.projectId!=="string"||!entry.projectId||entry.projectId.length>4096||typeof entry.command!=="string"||entry.command.length>16_384||!(["background","monitor"].includes(entry.mode))||!(["running","completed","failed","stopped","timed_out","flooded","interrupted"].includes(entry.state))||typeof entry.createdAt!=="string"||!Number.isFinite(Date.parse(entry.createdAt))||typeof entry.updatedAt!=="string"||!Number.isFinite(Date.parse(entry.updatedAt))||!(entry.exitCode===null||Number.isInteger(entry.exitCode))||!Number.isSafeInteger(entry.eventCount)||entry.eventCount<0||!Array.isArray(entry.tail)||entry.tail.length>MAX_TAIL_LINES||entry.tail.some(line=>typeof line!=="string"||line.length>MAX_LINE_CHARS)||typeof entry.recoveredAt!=="string"||!Number.isFinite(Date.parse(entry.recoveredAt))||entry.resumable!==false||(entry.deliveryState!==undefined&&entry.deliveryState!=="pending"&&entry.deliveryState!=="enqueued")||(entry.deliveryError!==undefined&&(typeof entry.deliveryError!=="string"||entry.deliveryError.length>500)))throw new Error("Background job journal entry is malformed");
  seen.add(entry.id);
 }
 return value as BackgroundJobJournalEntry[];
}
export class BackgroundJobJournal{
 constructor(private readonly file:string){if(typeof file!=="string"||!file)throw new Error("Background journal path is invalid");}
 load(sessionId:string,projectId?:string):readonly BackgroundJobJournalEntry[]{
  if(typeof sessionId!=="string"||!sessionId)throw new Error("Background journal session is invalid");
  const rows=this.readAll(),recoveredAt=new Date().toISOString();
  return Object.freeze(rows.filter(row=>row.sessionId===sessionId&&(projectId===undefined||row.projectId===projectId)).map(row=>Object.freeze({...row,state:row.state==="running"?"interrupted":row.state,recoveredAt,resumable:false as const})));
 }
 record(snapshot:BackgroundJobSnapshot):void{
  this.withExclusiveLock(()=>{
   privatePath(this.file);const current=this.readAll().filter(row=>row.id!==snapshot.id),entry={...snapshot,recoveredAt:new Date().toISOString(),resumable:false as const};
   const perSession=new Map<string,BackgroundJobJournalEntry[]>();for(const row of [...current,entry]){const entries=perSession.get(row.sessionId)??[];entries.push(row);perSession.set(row.sessionId,entries);}
   const retained=[...perSession.values()].flatMap(rows=>rows.sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)).slice(-100));
   retained.sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));const bounded=retained.slice(-MAX_ENTRIES),serialized=JSON.stringify(bounded)+"\n";if(Buffer.byteLength(serialized)>MAX_JOURNAL_BYTES)throw new Error("Background job journal exceeds its byte limit");
   const temporary=`${this.file}.tmp-${process.pid}-${randomUUID()}`;let fd:number|undefined;
   try{
    fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);writeFileSync(fd,serialized,{encoding:"utf8"});fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,this.file);
    try{const dirFd=openSync(dirname(this.file),constants.O_RDONLY);try{fsyncSync(dirFd);}finally{closeSync(dirFd);}}catch{/* Some platforms do not support syncing directories; file data is already flushed. */}
   }catch(error){if(fd!==undefined)try{closeSync(fd);}catch{}try{unlinkSync(temporary);}catch{}throw error;}
  });
 }
 private readAll():BackgroundJobJournalEntry[]{
  privatePath(this.file);let fd:number;try{fd=openSync(this.file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}
  let raw:Buffer;try{const stat=fstatSync(fd);if(!stat.isFile()||(process.platform!=="win32"&&(stat.mode&0o077)!==0))throw new Error("Background journal file is not private and safe");if(stat.size>MAX_JOURNAL_BYTES)throw new Error("Background job journal exceeds its byte limit");raw=readFileSync(fd);}finally{closeSync(fd);}if(raw.byteLength>MAX_JOURNAL_BYTES)throw new Error("Background job journal exceeds its byte limit");
  let value:unknown;try{value=JSON.parse(raw.toString("utf8"));}catch{throw new Error("Background job journal is corrupt; refusing to treat it as empty");}
  return validateRows(value);
 }
 private withExclusiveLock<T>(operation:()=>T):T{
  privatePath(this.file);const lock=`${this.file}.lock`,deadline=Date.now()+3_000,waitCell=new Int32Array(new SharedArrayBuffer(4));let fd:number|undefined,identity:{dev:number;ino:number}|undefined,permissionError:unknown;
  while(fd===undefined){
   try{fd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);const stat=fstatSync(fd);identity={dev:stat.dev,ino:stat.ino};writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:Date.now()}));fsyncSync(fd);}
   catch(error){const failedToCreate=fd===undefined;if(fd!==undefined){try{closeSync(fd);}catch{}fd=undefined;if(identity)try{const current=lstatSync(lock);if(current.dev===identity.dev&&current.ino===identity.ino)unlinkSync(lock);}catch{/* Preserve an unowned replacement lock. */}identity=undefined;}
    const code=(error as NodeJS.ErrnoException).code,windowsPermission=failedToCreate&&process.platform==="win32"&&code==="EPERM";
    if(!failedToCreate||code!=="EEXIST"&&!windowsPermission)throw error;
    try{const observed=lstatSync(lock);if(!observed.isFile()||observed.isSymbolicLink()||(process.platform!=="win32"&&(observed.mode&0o077)!==0))throw new Error("Background journal lock is unsafe");}
    catch(lockError){if(windowsPermission&&(lockError as NodeJS.ErrnoException).code!=="ENOENT")throw error;if((lockError as NodeJS.ErrnoException).code!=="ENOENT")throw lockError;}
    if(windowsPermission)permissionError??=error;
    if(Date.now()>=deadline){if(permissionError)throw permissionError;throw new Error("Background journal is busy; refusing a concurrent overwrite");}Atomics.wait(waitCell,0,0,10);
   }
  }
  try{return operation();}finally{try{closeSync(fd);}finally{try{const current=lstatSync(lock);if(identity&&current.dev===identity.dev&&current.ino===identity.ino)unlinkSync(lock);}catch{/* Never unlink a lock owned by another process. */}}}
 }
}
