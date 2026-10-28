import {createHash,randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {link,lstat,mkdir,mkdtemp,open,readdir,rename,rm,rmdir,unlink} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
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

export type HomeBackupErrorCode="INVALID_REQUEST"|"CONFIRMATION_REQUIRED"|"DESTINATION_EXISTS"|"DESTINATION_INSIDE_SOURCE"|"SOURCE_LINK"|"SOURCE_UNSUPPORTED"|"SOURCE_CHANGED"|"SQLITE_SNAPSHOT_FAILED"|"BOUNDS_EXCEEDED"|"BACKUP_CORRUPT"|"BACKUP_INCOMPATIBLE"|"TARGET_EXISTS"|"TARGET_UNSAFE"|"RESTORE_FAILED";
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
 readonly hooks?:Readonly<{afterStagedFile?:(relativePath:string)=>void|Promise<void>;beforePublish?:()=>void|Promise<void>}>;
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
 const empty=await isEmptyDirectory(target);
 if(empty===false&&request.replace!==true)return fail("TARGET_EXISTS","Restore target is not empty; refusing to overwrite (use --replace to move it aside)");
 const configExists=config?await lstat(config).then(()=>true,()=>false):false;
 if(config&&configExists&&request.replace!==true)return fail("TARGET_EXISTS","Config target exists; refusing to overwrite");
 const stageRoot=`${target}.restore-${randomUUID()}`,movedAside:string[]=[];
 const configEntry=verified._manifest.entries.findIndex(entry=>entry.root==="config");
 await mkdir(stageRoot,{mode:0o700});
 let published=false,movedTarget:string|undefined,movedConfig:string|undefined,configPublished=false;
 try{
  for(const directory of verified._manifest.dirs)await mkdir(path.join(stageRoot,...directory.path.split("/")),{recursive:true,mode:0o700});
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
  let stagedConfig:string|undefined;
  if(config&&configEntry>=0){
   const entry=verified._manifest.entries[configEntry]!;
   stagedConfig=`${config}.${randomUUID()}.tmp`;
   const handle=await open(stagedConfig,"wx",0o600);
   try{await handle.writeFile(verified._bytes.subarray(verified._offsets[configEntry]!,verified._offsets[configEntry]!+entry.size));await handle.sync();}finally{await handle.close();}
  }
  try{
   await request.hooks?.beforePublish?.();
   if(empty===false){movedTarget=`${target}.pre-restore-${Date.now()}-${randomUUID().slice(0,8)}`;await rename(target,movedTarget);movedAside.push(movedTarget);}
   else if(empty===true)await rmdir(target);
   if(config&&configExists){movedConfig=`${config}.pre-restore-${Date.now()}-${randomUUID().slice(0,8)}`;await rename(config,movedConfig);movedAside.push(movedConfig);}
   await rename(stageRoot,target);published=true;
   if(stagedConfig){await link(stagedConfig,config!);configPublished=true;}
  }catch(error){
   if(!published){
    if(movedTarget)await rename(movedTarget,target).catch(()=>undefined);
    else if(empty===true)await mkdir(target).catch(()=>undefined);
    if(movedConfig&&config)await rename(movedConfig,config).catch(()=>undefined);
   }else{
    // Home was published but the config step failed: restore the previous home as it was.
    await rename(target,stageRoot).catch(()=>undefined);published=false;
    if(movedTarget)await rename(movedTarget,target).catch(()=>undefined);
    else if(empty===true)await mkdir(target).catch(()=>undefined);
    if(movedConfig&&config)await rename(movedConfig,config).catch(()=>undefined);
   }
   throw error;
  }finally{if(stagedConfig)await unlink(stagedConfig).catch(()=>undefined);}
  return Object.freeze({schema:"asen.home-restore-report/v1",operation:"restore-home",status:"restored",targetHome:target,files:restored,configRestored:configPublished,movedAside:Object.freeze(movedAside),backupSha256:verified.sha256});
 }catch(error){
  if(!published)await rm(stageRoot,{recursive:true,force:true}).catch(()=>undefined);
  if(error instanceof HomeBackupError)throw error;
  throw new HomeBackupError("RESTORE_FAILED","Restore failed and the previous state was kept: "+(error instanceof Error?error.message:String(error)),{cause:error});
 }
}
