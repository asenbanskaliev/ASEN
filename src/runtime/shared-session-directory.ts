import {createHash,randomUUID} from "node:crypto";
import {closeSync,constants,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import path from "node:path";
import {SessionDirectory,type SessionDirectoryEntry} from "./session-directory.js";

const SCHEMA="asen.shared-session-directory/v1",MAX_ENTRIES=256,MAX_BYTES=4096,TTL_MS=4*60*60*1000;
interface RecordFile{
 schema:typeof SCHEMA;entry:SessionDirectoryEntry;pid:number;owner:string;expiresAt:string;
}
const safe=(value:unknown,max=4096):value is string=>typeof value==="string"&&value.length>0&&value.length<=max&&value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
function rootVerified(root:string):string{
 const absolute=path.resolve(root);
 mkdirSync(absolute,{recursive:true,mode:0o700});
 const stat=lstatSync(absolute);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(process.platform!=="win32"&&(stat.mode&0o077)!==0))
  throw new Error("ASEN shared-session directory must be private and canonical");
 return realpathSync.native(absolute);
}
function nameOf(projectId:string,sessionId:string):string{
 return createHash("sha256").update(projectId).update("\0").update(sessionId).digest("hex")+".json";
}
function readRecord(file:string):RecordFile|undefined{
 let before;
 try{before=lstatSync(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;}
 if(!before.isFile()||before.isSymbolicLink()||before.size>MAX_BYTES||(process.platform!=="win32"&&(before.mode&0o077)!==0))throw new Error("Shared-session record must be a bounded private file");
 const data=readFileSync(file),after=lstatSync(file);
 if(data.length>MAX_BYTES||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)
  throw new Error("Shared-session record changed during inspection");
 const value:unknown=JSON.parse(data.toString("utf8"));
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="entry,expiresAt,owner,pid,schema")
  throw new Error("Shared-session record format is invalid");
 const row=value as Record<string,unknown>,entry=row.entry;
 if(row.schema!==SCHEMA||!safe(row.owner,256)||!Number.isSafeInteger(row.pid)||Number(row.pid)<1||!safe(row.expiresAt,40)||!Number.isFinite(Date.parse(row.expiresAt))||
    !entry||typeof entry!=="object"||Array.isArray(entry))throw new Error("Shared-session record is invalid");
 const e=entry as Record<string,unknown>;
 if(!safe(e.sessionId,512)||!safe(e.projectId,4096)||!safe(e.subject,512)||!safe(e.updatedAt,40)||!Number.isFinite(Date.parse(e.updatedAt))||
    !["read","write","review"].includes(e.classification as string)||(e.taskAlias!==undefined&&!safe(e.taskAlias,512))||
    Object.keys(e).some(key=>!["sessionId","subject","projectId","taskAlias","classification","updatedAt"].includes(key)))throw new Error("Shared-session metadata is invalid");
 return value as RecordFile;
}
function alive(row:RecordFile,now=Date.now()):boolean{
 if(Date.parse(row.expiresAt)<=now)return false;
 try{process.kill(row.pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code!=="ESRCH";}
}

/** Opt-in process-shared session labels only. Grants stay local to SessionDirectory. */
export class SharedSessionDirectory extends SessionDirectory{
 readonly #root:string;
 readonly #owner=randomUUID();
 readonly #owned=new Map<string,string>();
 readonly #imported=new Set<string>();
 constructor(root:string){super();this.#root=rootVerified(root);}
 override publish(entry:SessionDirectoryEntry):void{
  // Validate a prospective local record before any file mutations.
  if(!safe(entry?.sessionId,512)||!safe(entry?.projectId,4096)||!safe(entry?.subject,512)||!safe(entry?.updatedAt,40)||
     !Number.isFinite(Date.parse(entry.updatedAt))||!["read","write","review"].includes(entry.classification)||
     (entry.taskAlias!==undefined&&!safe(entry.taskAlias,512)))throw new Error("Shared-session metadata is invalid");
  const filename=nameOf(entry.projectId,entry.sessionId),file=path.join(this.#root,filename);
  const prior=this.#owned.get(entry.sessionId);
  if(prior&&prior!==filename)this.remove(entry.sessionId); // Project switch invalidates the previous entry.
  rootVerified(this.#root);
  const existing=readRecord(file);
  if(existing&&existing.owner!==this.#owner&&alive(existing))throw new Error("Another active Pi process already owns this session");
  const record:RecordFile={schema:SCHEMA,entry:structuredClone(entry),pid:process.pid,owner:this.#owner,expiresAt:new Date(Date.now()+TTL_MS).toISOString()};
  const contents=JSON.stringify(record)+"\n";
  if(Buffer.byteLength(contents,"utf8")>MAX_BYTES)throw new Error("Shared-session metadata exceeds the bounded file limit");
  const temp=path.join(this.#root,filename+".tmp-"+randomUUID());
  let fd:number|undefined;
  try{
   fd=openSync(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);
   writeFileSync(fd,contents,"utf8");fsyncSync(fd);closeSync(fd);fd=undefined;
   rootVerified(this.#root);
   const checked=readRecord(file);
   if(checked&&checked.owner!==this.#owner&&alive(checked))throw new Error("Another Pi process took the session identity");
   renameSync(temp,file);
   super.publish(entry);
   this.#owned.set(entry.sessionId,filename);
  }finally{
   if(fd!==undefined)try{closeSync(fd);}catch{/* Keep prior error. */}
   try{unlinkSync(temp);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  }
 }
 override list(projectId:string):readonly SessionDirectoryEntry[]{
  rootVerified(this.#root);
  for(const id of this.#imported)super.remove(id);
  this.#imported.clear();
  const local=super.list(projectId),localIds=new Set(local.map(entry=>entry.sessionId));
  const names=readdirSync(this.#root).filter(name=>name.endsWith(".json"));
  if(names.length>MAX_ENTRIES)throw new Error("Shared-session metadata exceeds the directory limit");
  for(const name of names){
   if(!/^[a-f0-9]{64}\.json$/u.test(name))throw new Error("Shared-session file name is unsafe");
   const record=readRecord(path.join(this.#root,name));
   if(!record)continue;
   if(name!==nameOf(record.entry.projectId,record.entry.sessionId))throw new Error("Shared-session file identity is inconsistent");
   if(record.entry.projectId!==projectId||localIds.has(record.entry.sessionId)||this.#owned.has(record.entry.sessionId)||!alive(record))continue;
   super.publish(record.entry);
   this.#imported.add(record.entry.sessionId);
  }
  return super.list(projectId);
 }
 override remove(sessionId:string):void{
  super.remove(sessionId);
  this.#imported.delete(sessionId);
  const filename=this.#owned.get(sessionId);
  if(!filename)return;
  this.#owned.delete(sessionId);
  rootVerified(this.#root);
  const file=path.join(this.#root,filename),record=readRecord(file);
  if(record?.owner===this.#owner)unlinkSync(file);
 }
}
