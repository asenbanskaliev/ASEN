import {createHash,randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {link,lstat,mkdir,mkdtemp,open,readdir,rename,rm,rmdir,unlink} from "node:fs/promises";
import type {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import path from "node:path";
import {readBoundedOrdinaryFile} from "../io/bounded-file.js";

export const HOME_BACKUP_SCHEMA="asen.home-backup/v1";
export const HOME_BACKUP_MAX_FILE_BYTES=64*1024*1024;
export const HOME_BACKUP_MAX_TOTAL_BYTES=256*1024*1024;
export const HOME_BACKUP_MAX_ENTRIES=20_000;
const MAGIC=Buffer.from("ASENBAK1");
const MAX_MANIFEST_BYTES=8*1024*1024;
const HASH_BYTES=32;
const SQLITE_HEADER=Buffer.from("SQLite format 3\0","ascii");

export type HomeBackupErrorCode="INVALID_REQUEST"|"CONFIRMATION_REQUIRED"|"DESTINATION_EXISTS"|"DESTINATION_INSIDE_SOURCE"|"SOURCE_LINK"|"SOURCE_UNSUPPORTED"|"SOURCE_CHANGED"|"SQLITE_SNAPSHOT_FAILED"|"BOUNDS_EXCEEDED"|"BACKUP_CORRUPT"|"BACKUP_INCOMPATIBLE"|"TARGET_EXISTS"|"TARGET_UNSAFE"|"RECOVERY_REQUIRED"|"RESTORE_FAILED";
export class HomeBackupError extends Error{
 constructor(readonly code:HomeBackupErrorCode,message:string,options?:{cause?:unknown}){super(message,{cause:options?.cause});this.name="HomeBackupError";}
}
const fail=(code:HomeBackupErrorCode,message:string,cause?:unknown):never=>{throw new HomeBackupError(code,message,cause===undefined?undefined:{cause});};
const sha256=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const enoent=(error:unknown)=>(error as NodeJS.ErrnoException).code==="ENOENT";
const within=(root:string,candidate:string)=>{const relative=path.relative(root,candidate);return relative===""||(!relative.startsWith("..")&&!path.isAbsolute(relative));};

interface CollectedFile{entry:Entry;absolute:string;mtimeMs:number;dev:number;ino:number;snapshot?:Buffer}
function sameFileIdentity(left:{dev:number;ino:number},right:{dev:number;ino:number}):boolean{return left.dev===right.dev&&left.ino===right.ino;}

async function hasSqliteHeader(file:string,expected:{dev:number;ino:number},size:number):Promise<boolean>{
 if(size<SQLITE_HEADER.length)return false;
 const flags=constants.O_RDONLY|(process.platform==="win32"?0:constants.O_NOFOLLOW|constants.O_NONBLOCK),handle=await open(file,flags);
 try{
  const opened=await handle.stat();if(!opened.isFile()||!sameFileIdentity(opened,expected))return fail("SOURCE_CHANGED","A backup source changed before SQLite inspection");
  const header=Buffer.alloc(SQLITE_HEADER.length);let offset=0;
  while(offset<header.length){const read=await handle.read(header,offset,header.length-offset,offset);if(read.bytesRead===0)break;offset+=read.bytesRead;}
  const after=await handle.stat();if(!sameFileIdentity(after,opened))return fail("SOURCE_CHANGED","A backup source changed during SQLite inspection");
  return offset===header.length&&header.equals(SQLITE_HEADER);
 }finally{await handle.close();}
}

async function assertSqliteSidecarsOrdinary(file:string):Promise<void>{
 for(const suffix of ["-wal","-shm","-journal"]){
  const sidecar=`${file}${suffix}`,info=await lstat(sidecar).catch(error=>enoent(error)?undefined:Promise.reject(error));
  if(!info)continue;
  if(info.isSymbolicLink())return fail("SOURCE_LINK",`Refusing linked SQLite sidecar: ${path.basename(sidecar)}`);
  if(!info.isFile())return fail("SOURCE_UNSUPPORTED",`SQLite sidecar is not an ordinary file: ${path.basename(sidecar)}`);
 }
}

/** Uses SQLite's consistent VACUUM INTO snapshot so committed WAL pages are included and sidecars are not restored. */
async function snapshotSqlite(file:string,expected:{dev:number;ino:number}):Promise<Buffer>{
 const scratch=await mkdtemp(path.join(tmpdir(),"asen-home-sqlite-")),snapshot=path.join(scratch,"snapshot.sqlite");let source:DatabaseSync|undefined;
 try{
  const before=await lstat(file);if(!before.isFile()||before.isSymbolicLink()||!sameFileIdentity(before,expected))return fail("SOURCE_CHANGED","SQLite database path changed before snapshot opening");
  const {DatabaseSync}=await import("node:sqlite");
  source=new DatabaseSync(file,{readOnly:true});
  const opened=await lstat(file);if(!opened.isFile()||opened.isSymbolicLink()||!sameFileIdentity(opened,expected))return fail("SOURCE_CHANGED","SQLite database path changed while snapshot connection opened");
  source.exec("PRAGMA busy_timeout=5000;");source.prepare("VACUUM INTO ?").run(snapshot);
  const check=new DatabaseSync(snapshot,{readOnly:true});
  try{
   const rows=check.prepare("PRAGMA integrity_check;").all() as Array<Record<string,unknown>>;
   if(rows.length!==1||rows[0]?.integrity_check!=="ok")return fail("SQLITE_SNAPSHOT_FAILED","SQLite snapshot failed its integrity check");
  }finally{check.close();}
  const info=await lstat(snapshot);if(!info.isFile()||info.isSymbolicLink())return fail("SQLITE_SNAPSHOT_FAILED","SQLite snapshot is not an ordinary file");
  if(info.size>HOME_BACKUP_MAX_FILE_BYTES)return fail("BOUNDS_EXCEEDED","SQLite snapshot exceeds the per-file backup bound");
  const bytes=await readBoundedOrdinaryFile(snapshot,HOME_BACKUP_MAX_FILE_BYTES),after=await lstat(file);
  if(!after.isFile()||after.isSymbolicLink()||!sameFileIdentity(after,expected))return fail("SOURCE_CHANGED","SQLite database path changed while its snapshot was created");
  return bytes;
 }catch(error){
  if(error instanceof HomeBackupError)throw error;
  return fail("SQLITE_SNAPSHOT_FAILED","Could not create a consistent SQLite database snapshot",error);
 }finally{
  try{source?.close();}catch{/* Preserve the primary snapshot result. */}
  await rm(scratch,{recursive:true,force:true}).catch(()=>undefined);
 }
}

type Root="home"|"config";
interface Entry{readonly root:Root;readonly path:string;readonly size:number;readonly sha256:string;readonly mode:number}
interface Manifest{
 readonly schema:typeof HOME_BACKUP_SCHEMA;
 readonly createdAt:string;
 readonly asenVersion:string;
 readonly dirs:readonly {root:Root;path:string}[];
 readonly entries:readonly Entry[];
}

function safeRelative(value:unknown):string{
 if(typeof value!=="string"||!value||value.length>1024||/[\u0000-\u001f\u007f\\:]/u.test(value)||value.startsWith("/"))return fail("BACKUP_CORRUPT","Backup contains an unsafe path");
 const parts=value.split("/");
 if(parts.some(part=>!part||part==="."||part===".."||/[. ]$/u.test(part)))return fail("BACKUP_CORRUPT","Backup contains an unsafe path");
 return value;
}

export interface CreateHomeBackupRequest{
 readonly homeDir:string;
 readonly configFile?:string;
 readonly destination:string;
 readonly skipLinks?:boolean;
 readonly asenVersion:string;
}
export interface HomeBackupCreateReport{
 readonly schema:"asen.home-backup-report/v1";
 readonly operation:"backup-home";
 readonly status:"created";
 readonly destination:string;
 readonly files:number;
 readonly directories:number;
 readonly bytes:number;
 readonly sha256:string;
 readonly skippedLinks:readonly string[];
 readonly consistency:"sqlite-snapshot-and-per-file-stable-checked";
}

async function collect(homeDir:string,skipLinks:boolean):Promise<{files:CollectedFile[];dirs:string[];skipped:string[]}>{
 const files:CollectedFile[]=[],dirs:string[]=[],skipped:string[]=[],sqliteSidecars=new Set<string>();
 let total=0;
 const walk=async(directory:string,prefix:string):Promise<void>=>{
  for(const name of (await readdir(directory)).sort()){
   const absolute=path.join(directory,name),relative=prefix?`${prefix}/${name}`:name;
   const info=await lstat(absolute);
   if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory())){
    if(skipLinks){skipped.push(relative);continue;}
    return fail(info.isSymbolicLink()?"SOURCE_LINK":"SOURCE_UNSUPPORTED",`Refusing to back up ${info.isSymbolicLink()?"a link":"a non-regular entry"}: ${relative}`);
   }
   if(sqliteSidecars.has(absolute)){
    if(!info.isFile())return fail("SOURCE_UNSUPPORTED",`SQLite sidecar is not a regular file: ${relative}`);
    continue;
   }
   if(info.isDirectory()){dirs.push(relative);await walk(absolute,relative);continue;}
   const sqlite=await hasSqliteHeader(absolute,info,info.size);
   if(sqlite)await assertSqliteSidecarsOrdinary(absolute);
   const snapshot=sqlite?await snapshotSqlite(absolute,info):undefined;
   if(sqlite)for(const suffix of ["-wal","-shm","-journal"])sqliteSidecars.add(`${absolute}${suffix}`);
   const bytes=snapshot??await readBoundedOrdinaryFile(absolute,HOME_BACKUP_MAX_FILE_BYTES),after=await lstat(absolute);
   if(!sameFileIdentity(after,info)||(!sqlite&&(after.size!==bytes.length||after.mtimeMs!==info.mtimeMs)))return fail("SOURCE_CHANGED",`File changed while it was read: ${relative}`);
   if(bytes.length>HOME_BACKUP_MAX_FILE_BYTES)return fail("BOUNDS_EXCEEDED",`File exceeds the per-file bound: ${relative}`);
   total+=bytes.length;
   if(total>HOME_BACKUP_MAX_TOTAL_BYTES||files.length>=HOME_BACKUP_MAX_ENTRIES)return fail("BOUNDS_EXCEEDED","Backup source exceeds finite bounds");
   files.push({entry:{root:"home",path:relative,size:bytes.length,sha256:sha256(bytes),mode:info.mode&0o777},absolute,mtimeMs:info.mtimeMs,dev:info.dev,ino:info.ino,...(snapshot?{snapshot}:{})});
  }
 };
 await walk(homeDir,"");
 return {files,dirs,skipped};
}

/** Creates one finite, hash-sealed backup file of the ASEN data home and launcher config. Never overwrites. */
export async function createHomeBackup(request:CreateHomeBackupRequest):Promise<HomeBackupCreateReport>{
 for(const value of [request.homeDir,request.destination,...(request.configFile?[request.configFile]:[])])if(!path.isAbsolute(value))fail("INVALID_REQUEST","Backup paths must be absolute");
 const home=path.resolve(request.homeDir),destination=path.resolve(request.destination);
 const homeInfo=await lstat(home).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!homeInfo||homeInfo.isSymbolicLink()||!homeInfo.isDirectory())return fail("INVALID_REQUEST","ASEN home must be an existing ordinary directory");
 if(within(home,destination))return fail("DESTINATION_INSIDE_SOURCE","Backup destination must be outside the data home");
 if(await lstat(destination).then(()=>true,()=>false))return fail("DESTINATION_EXISTS","Backup destination already exists; it is never overwritten");
 const parent=await lstat(path.dirname(destination)).catch(()=>undefined);
 if(!parent||!parent.isDirectory()||parent.isSymbolicLink())return fail("INVALID_REQUEST","Backup destination parent must be an existing ordinary directory");
 const collected=await collect(home,request.skipLinks===true);
 const entries=collected.files.map(item=>item.entry),sources:CollectedFile[]=collected.files.map(item=>({...item}));
 const dirs=collected.dirs.map(directory=>({root:"home" as const,path:directory}));
 if(request.configFile){
  const info=await lstat(path.resolve(request.configFile)).catch(error=>enoent(error)?undefined:Promise.reject(error));
  if(info){
   if(info.isSymbolicLink()||!info.isFile())return fail("SOURCE_UNSUPPORTED","Launcher config must be an ordinary file");
   const bytes=await readBoundedOrdinaryFile(path.resolve(request.configFile),HOME_BACKUP_MAX_FILE_BYTES);
   const entry:Entry={root:"config",path:"config.json",size:bytes.length,sha256:sha256(bytes),mode:info.mode&0o777};
   entries.push(entry);sources.push({absolute:path.resolve(request.configFile),mtimeMs:info.mtimeMs,entry,dev:info.dev,ino:info.ino});
  }
 }
 const manifest:Manifest={schema:HOME_BACKUP_SCHEMA,createdAt:new Date().toISOString(),asenVersion:request.asenVersion,dirs,entries};
 const manifestBytes=Buffer.from(JSON.stringify(manifest)),header=Buffer.alloc(4);header.writeUInt32BE(manifestBytes.length);
 const temporary=`${destination}.${randomUUID()}.tmp`,hash=createHash("sha256");
 let handle=await open(temporary,"wx",0o600),bytes=0;
 const write=async(chunk:Uint8Array)=>{hash.update(chunk);await handle.write(chunk);bytes+=chunk.length;};
 try{
  await write(MAGIC);await write(header);await write(manifestBytes);
  for(const source of sources){
   const after=await lstat(source.absolute);
   if(!after.isFile()||after.isSymbolicLink()||!sameFileIdentity(after,source))return fail("SOURCE_CHANGED",`File changed during backup: ${source.entry.path}`);
   const data=source.snapshot??await readBoundedOrdinaryFile(source.absolute,HOME_BACKUP_MAX_FILE_BYTES);
   if(sha256(data)!==source.entry.sha256||(!source.snapshot&&after.mtimeMs!==source.mtimeMs))return fail("SOURCE_CHANGED",`File changed during backup: ${source.entry.path}`);
   await write(data);
  }
  const digest=hash.digest();await handle.write(digest);bytes+=digest.length;
  await handle.sync();await handle.close();handle=undefined as never;
  await link(temporary,destination).catch(error=>{
   if((error as NodeJS.ErrnoException).code==="EEXIST")return fail("DESTINATION_EXISTS","Backup destination appeared; it is never overwritten");
   throw error;
  });
  await unlink(temporary);
  const verified=await verifyHomeBackup(destination);
  return Object.freeze({schema:"asen.home-backup-report/v1",operation:"backup-home",status:"created",destination,files:entries.length,directories:dirs.length,bytes,sha256:verified.sha256,skippedLinks:Object.freeze(collected.skipped),consistency:"sqlite-snapshot-and-per-file-stable-checked"});
 }catch(error){
  if(handle)await handle.close().catch(()=>undefined);
  await rm(temporary,{force:true}).catch(()=>undefined);
  throw error;
 }
}

export interface VerifiedHomeBackup{
 readonly schema:"asen.home-backup-verification/v1";
 readonly file:string;
 readonly asenVersion:string;
 readonly createdAt:string;
 readonly files:number;
 readonly directories:number;
 readonly hasConfig:boolean;
 readonly sha256:string;
 /** @internal parsed content for restore */
 readonly _manifest:Manifest;
 readonly _bytes:Buffer;
 readonly _offsets:readonly number[];
}

/** Verifies container integrity, schema compatibility, path safety and every entry hash. */
export async function verifyHomeBackup(file:string):Promise<VerifiedHomeBackup>{
 if(!path.isAbsolute(file))fail("INVALID_REQUEST","Backup path must be absolute");
 let bytes:Buffer;
 try{bytes=await readBoundedOrdinaryFile(file,HOME_BACKUP_MAX_TOTAL_BYTES+MAX_MANIFEST_BYTES+1024*1024);}
 catch(error){return fail("BACKUP_CORRUPT","Backup is unreadable or exceeds bounds",error);}
 if(bytes.length<MAGIC.length+4+HASH_BYTES||!bytes.subarray(0,MAGIC.length).equals(MAGIC)){
  return fail(bytes.subarray(0,5).toString()==="ASENB"?"BACKUP_INCOMPATIBLE":"BACKUP_CORRUPT","Not a recognised ASEN backup");
 }
 const body=bytes.subarray(0,bytes.length-HASH_BYTES),trailer=bytes.subarray(bytes.length-HASH_BYTES);
 if(!createHash("sha256").update(body).digest().equals(trailer))return fail("BACKUP_CORRUPT","Backup checksum does not match its content");
 const manifestLength=bytes.readUInt32BE(MAGIC.length);
 if(manifestLength>MAX_MANIFEST_BYTES||MAGIC.length+4+manifestLength>body.length)return fail("BACKUP_CORRUPT","Backup manifest length is invalid");
 let raw:unknown;
 try{raw=JSON.parse(body.subarray(MAGIC.length+4,MAGIC.length+4+manifestLength).toString("utf8"));}catch(error){return fail("BACKUP_CORRUPT","Backup manifest is not valid JSON",error);}
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return fail("BACKUP_CORRUPT","Backup manifest is malformed");
 const record=raw as Record<string,unknown>;
 if(typeof record.schema!=="string"||!record.schema.startsWith("asen.home-backup/"))return fail("BACKUP_CORRUPT","Backup manifest is malformed");
 if(record.schema!==HOME_BACKUP_SCHEMA)return fail("BACKUP_INCOMPATIBLE",`Unsupported backup schema ${record.schema}`);
 if(typeof record.createdAt!=="string"||typeof record.asenVersion!=="string"||!Array.isArray(record.entries)||!Array.isArray(record.dirs)||record.entries.length>HOME_BACKUP_MAX_ENTRIES||record.dirs.length>HOME_BACKUP_MAX_ENTRIES)return fail("BACKUP_CORRUPT","Backup manifest is malformed");
 const seen=new Set<string>(),offsets:number[]=[];let cursor=MAGIC.length+4+manifestLength,configs=0;
 const dirs=(record.dirs as unknown[]).map(value=>{
  const item=value as {root?:unknown;path?:unknown};
  if(item?.root!=="home")return fail("BACKUP_CORRUPT","Backup directory record is malformed");
  return {root:"home" as const,path:safeRelative(item.path)};
 });
 const entries=(record.entries as unknown[]).map(value=>{
  const item=value as Record<string,unknown>;
  if(!item||(item.root!=="home"&&item.root!=="config")||typeof item.size!=="number"||!Number.isSafeInteger(item.size)||item.size<0||item.size>HOME_BACKUP_MAX_FILE_BYTES
   ||typeof item.sha256!=="string"||!/^[a-f0-9]{64}$/u.test(item.sha256)||typeof item.mode!=="number"||!Number.isInteger(item.mode))return fail("BACKUP_CORRUPT","Backup entry record is malformed");
  const relative=safeRelative(item.path),key=`${item.root}/${relative.toLowerCase()}`;
  if(seen.has(key))return fail("BACKUP_CORRUPT","Backup contains duplicate paths");
  seen.add(key);
  if(item.root==="config"){configs++;if(relative!=="config.json")return fail("BACKUP_CORRUPT","Backup config entry is unexpected");}
  return {root:item.root,path:relative,size:item.size,sha256:item.sha256,mode:item.mode&0o777} as Entry;
 });
 if(configs>1)return fail("BACKUP_CORRUPT","Backup contains duplicate config entries");
 for(const entry of entries){
  offsets.push(cursor);
  if(cursor+entry.size>body.length)return fail("BACKUP_CORRUPT","Backup content is truncated");
  if(sha256(body.subarray(cursor,cursor+entry.size))!==entry.sha256)return fail("BACKUP_CORRUPT",`Backup content hash mismatch: ${entry.path}`);
  cursor+=entry.size;
 }
 if(cursor!==body.length)return fail("BACKUP_CORRUPT","Backup has unexpected trailing content");
 const manifest:Manifest={schema:HOME_BACKUP_SCHEMA,createdAt:record.createdAt,asenVersion:record.asenVersion,dirs,entries};
 return Object.freeze({schema:"asen.home-backup-verification/v1",file,asenVersion:manifest.asenVersion,createdAt:manifest.createdAt,files:entries.length,directories:dirs.length,hasConfig:configs===1,sha256:trailer.toString("hex"),_manifest:manifest,_bytes:body,_offsets:offsets});
}
export function describeVerifiedBackup(backup:VerifiedHomeBackup){
 const {_manifest,_bytes,_offsets,...rest}=backup;void _manifest;void _bytes;void _offsets;
 return rest;
}

export interface RestoreHomeBackupRequest{
 readonly backup:string;
 readonly targetHome:string;
 readonly targetConfig?:string;
 readonly replace?:boolean;
 readonly confirmed:boolean;
 /** @internal deterministic failure injection for restore recovery tests. */
 readonly hooks?:Readonly<{afterStagedFile?:(relativePath:string)=>void|Promise<void>;afterStagedConfigCreate?:()=>void|Promise<void>;beforePublish?:()=>void|Promise<void>;afterHomePublish?:()=>void|Promise<void>;afterConfigMove?:()=>void|Promise<void>;afterConfigPublish?:()=>void|Promise<void>;beforeConfigRecovery?:()=>void|Promise<void>;afterRecoveryStageRemoved?:()=>void|Promise<void>}>;
}
export interface HomeRestoreReport{
 readonly schema:"asen.home-restore-report/v1";
 readonly operation:"restore-home";
 readonly status:"restored";
 readonly targetHome:string;
 readonly files:number;
 readonly configRestored:boolean;
 readonly movedAside:readonly string[];
 readonly backupSha256:string;
}

interface RestorePathIdentity{readonly dev:number;readonly ino:number;readonly birthtimeMs:number}
interface RestoreStageOwner{
 readonly schema:"asen.home-restore-stage/v1";
 readonly phase:"staging"|"cleanup";
 readonly target:string;
 readonly stageRoot:string;
 readonly pid:number;
 readonly stageIdentity?:RestorePathIdentity;
 readonly targetState:"absent"|"empty"|"moved";
 readonly previousTargetIdentity?:RestorePathIdentity;
 readonly movedTarget?:string;
 readonly configTarget?:string;
 readonly configState?:"absent"|"existing";
 readonly previousConfigIdentity?:RestorePathIdentity;
 readonly movedConfig?:string;
 readonly stagedConfig?:Readonly<{path:string;identity?:RestorePathIdentity;size:number;sha256:string}>;
 readonly directories:readonly string[];
 readonly files:readonly Readonly<{path:string;size:number;sha256:string}>[];
}
const restoreOwnerPath=(target:string)=>`${target}.restore-owner.json`;
const sameRestoreIdentity=(left:{dev:number;ino:number;birthtimeMs:number},right:{dev:number;ino:number;birthtimeMs:number})=>
 left.dev===right.dev&&left.ino===right.ino&&left.birthtimeMs===right.birthtimeMs;
const sameRestoreFileObject=(left:{dev:number;ino:number},right:{dev:number;ino:number})=>left.dev===right.dev&&left.ino===right.ino;
const validRestoreIdentity=(value:unknown):value is RestorePathIdentity=>!!value&&typeof value==="object"
 &&Number.isFinite((value as RestorePathIdentity).dev)&&Number.isFinite((value as RestorePathIdentity).ino)&&Number.isFinite((value as RestorePathIdentity).birthtimeMs);
function validMovedAsidePath(original:string,value:unknown):value is string{
 if(typeof value!=="string"||path.dirname(value)!==path.dirname(original)||!value.startsWith(`${original}.pre-restore-`))return false;
 return /^\d{10,16}-[0-9a-f]{8}$/u.test(value.slice(`${original}.pre-restore-`.length));
}
function validStagedConfigPath(config:string,value:unknown):value is string{
 if(typeof value!=="string"||path.dirname(value)!==path.dirname(config)||!value.startsWith(`${config}.`)||!value.endsWith(".tmp"))return false;
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/iu.test(value.slice(`${config}.`.length));
}
function restoreProcessAlive(pid:number):boolean{
 try{process.kill(pid,0);return true;}
 catch(error){const code=(error as NodeJS.ErrnoException).code;if(code==="ESRCH")return false;if(code==="EPERM")return true;throw error;}
}
async function clearRestoreOwner(ownerFile:string,expectedInfo:{dev:number;ino:number;birthtimeMs:number},expectedBytes:Buffer):Promise<void>{
 const current=await lstat(ownerFile).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!current||!sameRestoreIdentity(expectedInfo,current)||!(await readBoundedOrdinaryFile(ownerFile,8*1024*1024)).equals(expectedBytes))
  return fail("RECOVERY_REQUIRED","Restore recovery marker changed; preserving it");
 await unlink(ownerFile);
}
async function writeRestoreOwner(ownerFile:string,owner:RestoreStageOwner,previous?:{info:{dev:number;ino:number;birthtimeMs:number};bytes:Buffer}){
 const bytes=Buffer.from(JSON.stringify(owner)+"\n"),temporary=`${ownerFile}.${randomUUID()}.tmp`;
 const handle=await open(temporary,"wx",0o600);let info:{dev:number;ino:number;birthtimeMs:number};
 try{await handle.writeFile(bytes);await handle.sync();info=await handle.stat();}finally{await handle.close();}
 try{
  if(previous){
   const current=await lstat(ownerFile);
   if(!sameRestoreIdentity(previous.info,current)||!(await readBoundedOrdinaryFile(ownerFile,8*1024*1024)).equals(previous.bytes))
    return fail("RECOVERY_REQUIRED","Restore recovery marker changed; preserving it");
   await rename(temporary,ownerFile);
  }else await link(temporary,ownerFile);
  const committed=await lstat(ownerFile);
  // A rename can change reported birth time on Windows while preserving the same file object.
  const identityMatches=previous?sameRestoreFileObject(info,committed):sameRestoreIdentity(info,committed);
  if(!committed.isFile()||committed.isSymbolicLink()||!identityMatches||!(await readBoundedOrdinaryFile(ownerFile,8*1024*1024)).equals(bytes))
   return fail("RECOVERY_REQUIRED","Restore recovery marker publication is uncertain");
  await unlink(temporary).catch(()=>undefined);
  return {info:committed,bytes};
 }catch(error){
  await unlink(temporary).catch(()=>undefined);
  throw error;
 }
}
async function removeRestoreOwnedFile(stageRoot:string,relativePath:string,expected:{size:number;sha256:string}):Promise<void>{
 const parts=relativePath.split("/");let parent=stageRoot;
 for(const part of parts.slice(0,-1)){
  parent=path.join(parent,part);
  const info=await lstat(parent).catch(error=>enoent(error)?undefined:Promise.reject(error));
  if(!info)return;
  if(!info.isDirectory()||info.isSymbolicLink())return fail("RECOVERY_REQUIRED","Restore staging contains an unexpected linked path");
 }
 const file=path.join(parent,parts.at(-1)!),info=await lstat(file).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!info)return;
 if(!info.isFile()||info.isSymbolicLink())return fail("RECOVERY_REQUIRED","Restore staging contains an unexpected file type");
 const bytes=await readBoundedOrdinaryFile(file,HOME_BACKUP_MAX_FILE_BYTES);
 if(bytes.length!==expected.size||sha256(bytes)!==expected.sha256)return fail("RECOVERY_REQUIRED","Restore staging bytes changed; preserving the stage for inspection");
 await unlink(file);
}
async function moveConfigFileNoReplace(source:string,destination:string,expected:RestorePathIdentity):Promise<void>{
 const sourceInfo=await lstat(source);
 if(!sourceInfo.isFile()||sourceInfo.isSymbolicLink()||!sameRestoreIdentity(sourceInfo,expected))
  return fail("RECOVERY_REQUIRED","Restore config identity changed; preserving it");
 await link(source,destination);
 const linked=await lstat(destination);
 if(!sameRestoreIdentity(linked,sourceInfo))return fail("RECOVERY_REQUIRED","Restore config move is uncertain; preserving both paths");
 const current=await lstat(source).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!current||!sameRestoreIdentity(current,sourceInfo))return fail("RECOVERY_REQUIRED","Restore config changed during move; preserving both paths");
 await unlink(source);
}
async function restoreConfigFileNoReplace(moved:string,destination:string,expected:RestorePathIdentity):Promise<void>{
 const movedInfo=await lstat(moved).catch(error=>enoent(error)?undefined:Promise.reject(error));
 const targetInfo=await lstat(destination).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(targetInfo&&sameRestoreIdentity(targetInfo,expected)){
  if(movedInfo){
   if(!sameRestoreIdentity(movedInfo,expected))return fail("RECOVERY_REQUIRED","Moved-aside restore config identity changed; preserving it");
   await unlink(moved);
  }
  return;
 }
 if(targetInfo)return fail("RECOVERY_REQUIRED","Restore config destination is occupied; preserving all paths");
 if(!movedInfo||!movedInfo.isFile()||movedInfo.isSymbolicLink()||!sameRestoreIdentity(movedInfo,expected))
  return fail("RECOVERY_REQUIRED","Original restore config is missing or changed; preserving staged data");
 try{await link(moved,destination);}
 catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")return fail("RECOVERY_REQUIRED","Restore config destination appeared; preserving all paths",error);throw error;}
 const linked=await lstat(destination);
 if(!sameRestoreIdentity(linked,movedInfo))return fail("RECOVERY_REQUIRED","Restore config recovery is uncertain; preserving both paths");
 const current=await lstat(moved).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!current||!sameRestoreIdentity(current,movedInfo))return fail("RECOVERY_REQUIRED","Moved-aside restore config changed; preserving both paths");
 await unlink(moved);
}
async function removeStagedConfig(owner:NonNullable<RestoreStageOwner["stagedConfig"]>):Promise<void>{
 const info=await lstat(owner.path).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!info)return;
 if(!info.isFile()||info.isSymbolicLink())return fail("RECOVERY_REQUIRED","Staged restore config changed type; preserving it");
 if(owner.identity){
  if(!sameRestoreIdentity(info,owner.identity))return fail("RECOVERY_REQUIRED","Staged restore config identity changed; preserving it");
 }else if(info.size!==0)return fail("RECOVERY_REQUIRED","Unidentified staged restore config is not empty; preserving it");
 await unlink(owner.path);
}
async function restorePriorStateComplete(owner:RestoreStageOwner):Promise<boolean>{
 const targetInfo=await lstat(owner.target).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(owner.targetState==="absent"&&targetInfo)return false;
 if(owner.targetState==="empty"&&(!targetInfo||!targetInfo.isDirectory()||targetInfo.isSymbolicLink()||(await readdir(owner.target)).length!==0))return false;
 if(owner.targetState==="moved"&&(!targetInfo||!sameRestoreIdentity(targetInfo,owner.previousTargetIdentity!)||await lstat(owner.movedTarget!).then(()=>true,error=>enoent(error)?false:Promise.reject(error))))return false;
 if(owner.configTarget){
  const configInfo=await lstat(owner.configTarget).catch(error=>enoent(error)?undefined:Promise.reject(error));
  if(owner.configState==="absent"&&configInfo)return false;
  if(owner.configState==="existing"&&(!configInfo||!sameRestoreIdentity(configInfo,owner.previousConfigIdentity!)
   ||await lstat(owner.movedConfig!).then(()=>true,error=>enoent(error)?false:Promise.reject(error))))return false;
  if(owner.stagedConfig&&await lstat(owner.stagedConfig.path).then(()=>true,error=>enoent(error)?false:Promise.reject(error)))return false;
 }
 return true;
}
async function recoverAbandonedRestoreStage(target:string,hooks?:RestoreHomeBackupRequest["hooks"]):Promise<void>{
 const ownerFile=restoreOwnerPath(target);let ownerInfo=await lstat(ownerFile).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!ownerInfo)return;
 if(!ownerInfo.isFile()||ownerInfo.isSymbolicLink())return fail("RECOVERY_REQUIRED","Restore recovery marker is not an ordinary file");
 let ownerBytes=await readBoundedOrdinaryFile(ownerFile,8*1024*1024);
 let owner:Partial<RestoreStageOwner>;
 try{owner=JSON.parse(ownerBytes.toString("utf8")) as Partial<RestoreStageOwner>;}
 catch(error){return fail("RECOVERY_REQUIRED","Restore recovery marker is malformed",error);}
 const stageRoot=owner.stageRoot;
 const stageSuffix=typeof stageRoot==="string"?path.basename(stageRoot).slice(`${path.basename(target)}.restore-`.length):"";
 if(owner.schema!=="asen.home-restore-stage/v1"||owner.target!==target||!["staging","cleanup"].some(phase=>phase===owner.phase)||!Number.isSafeInteger(owner.pid)||owner.pid!<=0||typeof stageRoot!=="string"
  ||path.dirname(stageRoot)!==path.dirname(target)||!stageRoot.startsWith(`${target}.restore-`)
  ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(stageSuffix)
  ||owner.stageIdentity!==undefined&&!validRestoreIdentity(owner.stageIdentity)
  ||!["absent","empty","moved"].some(state=>state===owner.targetState)
  ||owner.targetState!=="absent"&&!validRestoreIdentity(owner.previousTargetIdentity)
  ||owner.targetState==="absent"&&owner.previousTargetIdentity!==undefined
  ||owner.targetState==="moved"&&!validMovedAsidePath(target,owner.movedTarget)
  ||owner.targetState!=="moved"&&owner.movedTarget!==undefined
  ||owner.configTarget!==undefined&&(!path.isAbsolute(owner.configTarget!)||within(target,owner.configTarget!)||within(owner.configTarget!,target))
  ||owner.configTarget===undefined&&(owner.configState!==undefined||owner.previousConfigIdentity!==undefined||owner.movedConfig!==undefined||owner.stagedConfig!==undefined)
  ||owner.configTarget!==undefined&&owner.configState!=="absent"&&owner.configState!=="existing"
  ||owner.configState==="existing"&&(!validRestoreIdentity(owner.previousConfigIdentity)||!validMovedAsidePath(owner.configTarget!,owner.movedConfig))
  ||owner.configState==="absent"&&(owner.previousConfigIdentity!==undefined||owner.movedConfig!==undefined)
  ||owner.stagedConfig!==undefined&&(!owner.stagedConfig||typeof owner.stagedConfig!=="object"||typeof owner.stagedConfig.path!=="string"
   ||!validStagedConfigPath(owner.configTarget!,owner.stagedConfig.path)
   ||owner.stagedConfig.identity!==undefined&&!validRestoreIdentity(owner.stagedConfig.identity)
   ||!Number.isSafeInteger(owner.stagedConfig.size)||owner.stagedConfig.size<0||!/^[a-f0-9]{64}$/u.test(owner.stagedConfig.sha256))
  ||!Array.isArray(owner.directories)||owner.directories.length>HOME_BACKUP_MAX_ENTRIES
  ||!owner.directories.every(directory=>typeof directory==="string")
  ||!Array.isArray(owner.files)||owner.files.length>HOME_BACKUP_MAX_ENTRIES
  ||!owner.files.every(file=>!!file&&typeof file==="object"&&typeof file.path==="string"&&Number.isSafeInteger(file.size)&&typeof file.sha256==="string"))
  return fail("RECOVERY_REQUIRED","Restore recovery marker is malformed");
 if(restoreProcessAlive(owner.pid!))return fail("RECOVERY_REQUIRED","Another restore operation is still active");
 let stageInfo=await lstat(stageRoot).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!owner.stageIdentity){
  if(!stageInfo){await clearRestoreOwner(ownerFile,ownerInfo,ownerBytes);return;}
  if(!stageInfo.isDirectory()||stageInfo.isSymbolicLink()||(await readdir(stageRoot)).length!==0)
   return fail("RECOVERY_REQUIRED","Unidentified restore staging is not empty; preserving it");
  await rmdir(stageRoot);await clearRestoreOwner(ownerFile,ownerInfo,ownerBytes);return;
 }
 if(!stageInfo&&owner.phase==="cleanup"){
  if(!await restorePriorStateComplete(owner as RestoreStageOwner))return fail("RECOVERY_REQUIRED","Restore cleanup state is uncertain; preserving the marker");
  await clearRestoreOwner(ownerFile,ownerInfo,ownerBytes);return;
 }
 let targetInfo=await lstat(target).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!stageInfo&&targetInfo&&sameRestoreIdentity(targetInfo,owner.stageIdentity)){
  await rename(target,stageRoot);stageInfo=await lstat(stageRoot);targetInfo=undefined;
 }
 if(!stageInfo||!stageInfo.isDirectory()||stageInfo.isSymbolicLink()||!sameRestoreIdentity(stageInfo,owner.stageIdentity!))
  return fail("RECOVERY_REQUIRED","Restore staging identity changed; preserving all paths");
 if(targetInfo&&(!owner.previousTargetIdentity||!sameRestoreIdentity(targetInfo,owner.previousTargetIdentity)))
  return fail("RECOVERY_REQUIRED","Restore target identity changed; preserving all paths");
 if(owner.targetState==="moved"){
  const asideInfo=await lstat(owner.movedTarget!).catch(error=>enoent(error)?undefined:Promise.reject(error));
  if(asideInfo){
   if(!sameRestoreIdentity(asideInfo,owner.previousTargetIdentity!))
    return fail("RECOVERY_REQUIRED","Moved-aside restore target identity changed; preserving it");
   if(targetInfo)return fail("RECOVERY_REQUIRED","Both original and moved-aside restore targets exist; preserving both");
   await rename(owner.movedTarget!,target);
  }else if(!targetInfo)return fail("RECOVERY_REQUIRED","Original restore target is missing; preserving the staged data");
 }else if(owner.targetState==="empty"){
  if(!targetInfo)await mkdir(target);
 }else if(targetInfo)return fail("RECOVERY_REQUIRED","Unexpected target appeared during restore recovery");
 if(owner.configTarget){
  const configTarget=owner.configTarget,configInfo=await lstat(configTarget).catch(error=>enoent(error)?undefined:Promise.reject(error));
  const movedInfo=owner.movedConfig?await lstat(owner.movedConfig).catch(error=>enoent(error)?undefined:Promise.reject(error)):undefined;
  const staged=owner.stagedConfig;
  if(staged?.identity&&configInfo&&sameRestoreIdentity(configInfo,staged.identity)){
   const bytes=await readBoundedOrdinaryFile(configTarget,HOME_BACKUP_MAX_FILE_BYTES);
   if(bytes.length!==staged.size||sha256(bytes)!==staged.sha256)return fail("RECOVERY_REQUIRED","Published restore config changed; preserving it");
   await unlink(configTarget);
  }else if(configInfo&&(!owner.previousConfigIdentity||!sameRestoreIdentity(configInfo,owner.previousConfigIdentity)))
   return fail("RECOVERY_REQUIRED","Restore config identity changed; preserving it");
  if(owner.configState==="existing"){
   if(movedInfo){
    if(!sameRestoreIdentity(movedInfo,owner.previousConfigIdentity!))return fail("RECOVERY_REQUIRED","Moved-aside restore config identity changed; preserving it");
    await hooks?.beforeConfigRecovery?.();
    await restoreConfigFileNoReplace(owner.movedConfig!,configTarget,owner.previousConfigIdentity!);
   }else if(!await lstat(configTarget).then(()=>true,error=>enoent(error)?false:Promise.reject(error)))
    return fail("RECOVERY_REQUIRED","Original restore config is missing; preserving staged data");
  }
  if(staged){
   await removeStagedConfig(staged);
  }
 }
 const files=owner.files as Array<{path:string;size:number;sha256:string}>;
 const directories=owner.directories as string[];
 for(const file of files){
  const relativePath=safeRelative(file?.path);
  if(!Number.isSafeInteger(file.size)||file.size<0||typeof file.sha256!=="string"||!/^[a-f0-9]{64}$/u.test(file.sha256))
   return fail("RECOVERY_REQUIRED","Restore recovery file inventory is malformed");
  await removeRestoreOwnedFile(stageRoot,relativePath,file);
 }
 const allDirectories=new Set(directories);
 for(const file of files){let parent=path.posix.dirname(file.path);while(parent!=="."){allDirectories.add(parent);parent=path.posix.dirname(parent);}}
 for(const directory of [...allDirectories].sort((a,b)=>b.length-a.length)){
  safeRelative(directory);
  const targetDirectory=path.join(stageRoot,...directory.split("/"));
  const info=await lstat(targetDirectory).catch(error=>enoent(error)?undefined:Promise.reject(error));
  if(!info)continue;
  if(!info.isDirectory()||info.isSymbolicLink())return fail("RECOVERY_REQUIRED","Restore staging contains an unexpected directory type");
  try{await rmdir(targetDirectory);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")return fail("RECOVERY_REQUIRED","Restore staging contains unowned entries; preserving the stage",error);}
 }
 const cleanupOwner=await writeRestoreOwner(ownerFile,{...owner as RestoreStageOwner,phase:"cleanup"},{info:ownerInfo,bytes:ownerBytes});
 ownerInfo=cleanupOwner.info;ownerBytes=cleanupOwner.bytes;
 try{await rmdir(stageRoot);}catch(error){return fail("RECOVERY_REQUIRED","Restore staging contains unowned entries; preserving the stage",error);}
 await hooks?.afterRecoveryStageRemoved?.();
 await clearRestoreOwner(ownerFile,ownerInfo,ownerBytes);
}

async function isEmptyDirectory(directory:string):Promise<boolean|undefined>{
 const info=await lstat(directory).catch(error=>enoent(error)?undefined:Promise.reject(error));
 if(!info)return undefined;
 if(info.isSymbolicLink()||!info.isDirectory())return fail("TARGET_UNSAFE","Restore target is not an ordinary directory");
 return (await readdir(directory)).length===0;
}

/** Restores a verified backup. Existing targets are refused unless `replace` moves them aside (never deletes them). */
export async function restoreHomeBackup(request:RestoreHomeBackupRequest):Promise<HomeRestoreReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Restore requires explicit confirmation");
 for(const value of [request.backup,request.targetHome,...(request.targetConfig?[request.targetConfig]:[])])if(!path.isAbsolute(value))fail("INVALID_REQUEST","Restore paths must be absolute");
 const verified=await verifyHomeBackup(request.backup);
 const target=path.resolve(request.targetHome),config=request.targetConfig?path.resolve(request.targetConfig):undefined;
 if(within(path.resolve(request.backup),target)||within(target,path.resolve(request.backup)))return fail("TARGET_UNSAFE","Restore target overlaps the backup file");
 if(config&&within(target,config))return fail("TARGET_UNSAFE","Config target must be outside the restored home");
 const parent=path.dirname(target),parentInfo=await lstat(parent).catch(()=>undefined);
 if(!parentInfo||parentInfo.isSymbolicLink()||!parentInfo.isDirectory())return fail("TARGET_UNSAFE","Restore target parent must be an existing ordinary directory");
 await recoverAbandonedRestoreStage(target,request.hooks);
 const targetInfo=await lstat(target).catch(error=>enoent(error)?undefined:Promise.reject(error));
 const empty=await isEmptyDirectory(target);
 if(empty===false&&request.replace!==true)return fail("TARGET_EXISTS","Restore target is not empty; refusing to overwrite (use --replace to move it aside)");
 const configInfo=config?await lstat(config).catch(error=>enoent(error)?undefined:Promise.reject(error)):undefined;
 const configExists=!!configInfo;
 if(configInfo&&(!configInfo.isFile()||configInfo.isSymbolicLink()))return fail("TARGET_UNSAFE","Restore config target must be an ordinary file");
 if(config&&configExists&&request.replace!==true)return fail("TARGET_EXISTS","Config target exists; refusing to overwrite");
 const stageRoot=`${target}.restore-${randomUUID()}`,movedAside:string[]=[];
 const movedTarget=empty===false?`${target}.pre-restore-${Date.now()}-${randomUUID().slice(0,8)}`:undefined;
 const movedConfig=config&&configExists?`${config}.pre-restore-${Date.now()}-${randomUUID().slice(0,8)}`:undefined;
 const configEntry=verified._manifest.entries.findIndex(entry=>entry.root==="config");
 const ownerFile=restoreOwnerPath(target);let ownerInfo:{dev:number;ino:number;birthtimeMs:number}|undefined,ownerBytes:Buffer|undefined;
 let published=false,configPublished=false,stagedConfig:string|undefined,stagedConfigCreated=false,stagedConfigOwner:NonNullable<RestoreStageOwner["stagedConfig"]>|undefined;
 try{
  const ownerBase:RestoreStageOwner={
   schema:"asen.home-restore-stage/v1",phase:"staging",target,stageRoot,pid:process.pid,
   targetState:empty===undefined?"absent":empty?"empty":"moved",
   ...(targetInfo?{previousTargetIdentity:{dev:targetInfo.dev,ino:targetInfo.ino,birthtimeMs:targetInfo.birthtimeMs}}:{}),
   ...(movedTarget?{movedTarget}:{}),
   ...(config?{configTarget:config,configState:configExists?"existing":"absent"}:{}),
   ...(configInfo?{previousConfigIdentity:{dev:configInfo.dev,ino:configInfo.ino,birthtimeMs:configInfo.birthtimeMs}}:{}),
   ...(movedConfig?{movedConfig}:{}),
   directories:verified._manifest.dirs.filter(directory=>directory.root==="home").map(directory=>directory.path),
   files:verified._manifest.entries.filter(entry=>entry.root==="home").map(entry=>({path:entry.path,size:entry.size,sha256:entry.sha256})),
  };
  const initialOwner=await writeRestoreOwner(ownerFile,ownerBase);
  ownerInfo=initialOwner.info;ownerBytes=initialOwner.bytes;
  await mkdir(stageRoot,{mode:0o700});
  const stageInfo=await lstat(stageRoot);
  const committedOwner=await writeRestoreOwner(ownerFile,{...ownerBase,stageIdentity:{dev:stageInfo.dev,ino:stageInfo.ino,birthtimeMs:stageInfo.birthtimeMs}},{info:ownerInfo,bytes:ownerBytes});
  ownerInfo=committedOwner.info;ownerBytes=committedOwner.bytes;
  for(const directory of verified._manifest.dirs.filter(item=>item.root==="home"))await mkdir(path.join(stageRoot,...directory.path.split("/")),{recursive:true,mode:0o700});
  let restored=0;
  for(const [index,entry] of verified._manifest.entries.entries()){
   if(entry.root!=="home")continue;
   const destination=path.join(stageRoot,...entry.path.split("/"));
   if(!within(stageRoot,destination))return fail("BACKUP_CORRUPT","Backup path escapes the restore target");
   await mkdir(path.dirname(destination),{recursive:true,mode:0o700});
   const data=verified._bytes.subarray(verified._offsets[index]!,verified._offsets[index]!+entry.size);
   const handle=await open(destination,"wx",(entry.mode&0o700)|0o600);
   try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
   const written=await readBoundedOrdinaryFile(destination,HOME_BACKUP_MAX_FILE_BYTES);
   if(sha256(written)!==entry.sha256)return fail("RESTORE_FAILED",`Restored bytes differ from the backup: ${entry.path}`);
   await request.hooks?.afterStagedFile?.(entry.path);
   restored++;
  }
  if(config&&configEntry>=0){
   const entry=verified._manifest.entries[configEntry]!;
   stagedConfig=`${config}.${randomUUID()}.tmp`;
   const data=verified._bytes.subarray(verified._offsets[configEntry]!,verified._offsets[configEntry]!+entry.size);
   const plannedOwner=await writeRestoreOwner(ownerFile,{...ownerBase,stageIdentity:{dev:stageInfo.dev,ino:stageInfo.ino,birthtimeMs:stageInfo.birthtimeMs},
    stagedConfig:{path:stagedConfig,size:entry.size,sha256:entry.sha256}},
    {info:ownerInfo!,bytes:ownerBytes!});
   ownerInfo=plannedOwner.info;ownerBytes=plannedOwner.bytes;
   stagedConfigOwner={path:stagedConfig,size:entry.size,sha256:entry.sha256};
   const handle=await open(stagedConfig,"wx",0o600);
   stagedConfigCreated=true;
   try{
    await request.hooks?.afterStagedConfigCreate?.();
    const stagedConfigInfo=await handle.stat();
    stagedConfigOwner={...stagedConfigOwner,identity:{dev:stagedConfigInfo.dev,ino:stagedConfigInfo.ino,birthtimeMs:stagedConfigInfo.birthtimeMs}};
    const updatedOwner=await writeRestoreOwner(ownerFile,{...ownerBase,stageIdentity:{dev:stageInfo.dev,ino:stageInfo.ino,birthtimeMs:stageInfo.birthtimeMs},
     stagedConfig:stagedConfigOwner},
     {info:ownerInfo!,bytes:ownerBytes!});
    ownerInfo=updatedOwner.info;ownerBytes=updatedOwner.bytes;
    await handle.writeFile(data);await handle.sync();
   }finally{await handle.close();}
   const stagedBytes=await readBoundedOrdinaryFile(stagedConfig,HOME_BACKUP_MAX_FILE_BYTES);
   if(stagedBytes.length!==entry.size||sha256(stagedBytes)!==entry.sha256)return fail("RESTORE_FAILED","Staged config bytes differ from the backup");
  }
  try{
   await request.hooks?.beforePublish?.();
   if(empty===false){await rename(target,movedTarget!);movedAside.push(movedTarget!);}
   else if(empty===true)await rmdir(target);
   if(config&&configExists){await moveConfigFileNoReplace(config,movedConfig!,ownerBase.previousConfigIdentity!);movedAside.push(movedConfig!);await request.hooks?.afterConfigMove?.();}
   await rename(stageRoot,target);published=true;
   await request.hooks?.afterHomePublish?.();
   if(stagedConfig){await link(stagedConfig,config!);configPublished=true;await request.hooks?.afterConfigPublish?.();}
  }catch(error){
   if(!published){
    if(movedTarget)await rename(movedTarget,target).catch(()=>undefined);
    else if(empty===true)await mkdir(target).catch(()=>undefined);
    if(movedConfig&&config)await restoreConfigFileNoReplace(movedConfig,config,ownerBase.previousConfigIdentity!).catch(()=>undefined);
   }else{
    // Home was published but the config step failed: restore the previous home as it was.
    await rename(target,stageRoot).catch(()=>undefined);published=false;
    if(movedTarget)await rename(movedTarget,target).catch(()=>undefined);
    else if(empty===true)await mkdir(target).catch(()=>undefined);
    if(movedConfig&&config)await restoreConfigFileNoReplace(movedConfig,config,ownerBase.previousConfigIdentity!).catch(()=>undefined);
   }
   throw error;
  }finally{if(stagedConfigCreated&&stagedConfigOwner)await removeStagedConfig(stagedConfigOwner);}
  await clearRestoreOwner(ownerFile,ownerInfo!,ownerBytes!);
  return Object.freeze({schema:"asen.home-restore-report/v1",operation:"restore-home",status:"restored",targetHome:target,files:restored,configRestored:configPublished,movedAside:Object.freeze(movedAside),backupSha256:verified.sha256});
 }catch(error){
  if(!published){
   if(stagedConfigCreated&&stagedConfigOwner)await removeStagedConfig(stagedConfigOwner);
   await rm(stageRoot,{recursive:true,force:true}).catch(()=>undefined);
   if(ownerInfo&&ownerBytes)await clearRestoreOwner(ownerFile,ownerInfo,ownerBytes).catch(()=>undefined);
  }
  if(error instanceof HomeBackupError)throw error;
  throw new HomeBackupError("RESTORE_FAILED","Restore failed and the previous state was kept: "+(error instanceof Error?error.message:String(error)),{cause:error});
 }
}
