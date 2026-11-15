import {lstat,mkdir,realpath} from "node:fs/promises";
import {dirname,isAbsolute,join} from "node:path";
import {canonicalProjectMemoryExport} from "./export-validation.js";
import {readProjectMemoryBackup,type ProjectMemoryBackupReadReason,type ProjectMemoryBackupReadStage} from "./project-memory-backup.js";
import {SqliteMemoryStore} from "./sqlite-store.js";
import type {MemoryExport} from "./types.js";

const RESULT_SCHEMA="asen.project-memory-restore-stage-result/v1";
const MODE="new-empty-stage";

export type ProjectMemoryRestoreStage=
 |"read-open"|"read-read"|"read-verify-source"|"create-directory"|"open-store"|"import"|"verify-import"
 |"close-imported"|"reopen-store"|"verify-reopen"|"close-reopened";
export interface ProjectMemoryRestoreStageHookContext {source:string;stagingDirectory:string;databasePath:string;}
export interface ProjectMemoryRestoreStageHooks {
 before?(stage:ProjectMemoryRestoreStage,context:ProjectMemoryRestoreStageHookContext):void|Promise<void>;
 after?(stage:ProjectMemoryRestoreStage,context:ProjectMemoryRestoreStageHookContext):void|Promise<void>;
}
export interface StageProjectMemoryBackupRestoreRequest {
 source:string;
 expectedProjectId:string;
 stagingDirectory:string;
 mode:"new-empty-stage";
 signal?:AbortSignal;
 hooks?:ProjectMemoryRestoreStageHooks;
}
export type ProjectMemoryRestoreStageReason=
 |"invalid-request"|"aborted"|"unsafe-staging-path"|"staging-exists"|"backup-refused"|"staging-parent-changed"
 |"stage-create-failed"|"stage-ownership-uncertain"|"store-create-failed"|"import-failed"|"verification-failed"
 |"close-failed"|"reopen-failed";
export interface ProjectMemoryRestoreStageResult {
 schema:typeof RESULT_SCHEMA;
 status:"staged"|"refused"|"failed"|"unknown";
 source:string;
 expectedProjectId:string;
 stagingDirectory:string;
 mode:string;
 databasePath:string|null;
 ownership:"none"|"owned-retained"|"unknown";
 reason:ProjectMemoryRestoreStageReason|null;
 backupReason:ProjectMemoryBackupReadReason|null;
}

interface PhysicalIdentity {dev:number;ino:number;birthtimeMs:number;}
interface DirectoryObservation extends PhysicalIdentity {realPath:string;}

type RequestIdentity=Pick<StageProjectMemoryBackupRestoreRequest,"source"|"expectedProjectId"|"stagingDirectory"|"mode">;

function result(request:RequestIdentity,overrides:Partial<ProjectMemoryRestoreStageResult>={}):ProjectMemoryRestoreStageResult{
 return {schema:RESULT_SCHEMA,status:"refused",source:request.source,expectedProjectId:request.expectedProjectId,stagingDirectory:request.stagingDirectory,mode:request.mode,databasePath:null,ownership:"none",reason:null,backupReason:null,...overrides};
}
function physicalIdentity(value:{dev:number;ino:number;birthtimeMs:number}):PhysicalIdentity{return {dev:value.dev,ino:value.ino,birthtimeMs:value.birthtimeMs};}
function sameIdentity(left:PhysicalIdentity,right:PhysicalIdentity):boolean{return left.dev===right.dev&&left.ino===right.ino&&left.birthtimeMs===right.birthtimeMs;}
function errorCode(error:unknown):string|undefined{return typeof error==="object"&&error!==null&&"code" in error?String(error.code):undefined;}
async function observeDirectory(path:string):Promise<DirectoryObservation|null>{
 try{
  const info=await lstat(path);
  if(!info.isDirectory()||info.isSymbolicLink())return null;
  return {...physicalIdentity(info),realPath:await realpath(path)};
 }catch{return null;}
}
async function sameDirectory(path:string,expected:DirectoryObservation):Promise<boolean>{
 const current=await observeDirectory(path);
 return current!==null&&current.realPath===expected.realPath&&sameIdentity(current,expected);
}
async function pathState(path:string):Promise<"absent"|"exists"|"unknown">{
 try{await lstat(path);return "exists";}catch(error){return errorCode(error)==="ENOENT"?"absent":"unknown";}
}
function exactExport(left:MemoryExport,right:MemoryExport):boolean{return JSON.stringify(canonicalProjectMemoryExport(left))===JSON.stringify(canonicalProjectMemoryExport(right));}
async function callHook(request:StageProjectMemoryBackupRestoreRequest,side:"before"|"after",stage:ProjectMemoryRestoreStage,context:ProjectMemoryRestoreStageHookContext):Promise<void>{await request.hooks?.[side]?.(stage,context);}
async function closePreservingFailure(store:SqliteMemoryStore|null):Promise<void>{if(store)try{store.close();}catch{/* The stage failure remains authoritative. */}}
async function retainedFailure(request:RequestIdentity,databasePath:string,owned:DirectoryObservation,reason:ProjectMemoryRestoreStageReason):Promise<ProjectMemoryRestoreStageResult>{
 if(!await sameDirectory(request.stagingDirectory,owned))return result(request,{status:"unknown",ownership:"unknown",reason:"stage-ownership-uncertain"});
 return result(request,{status:"failed",databasePath,ownership:"owned-retained",reason});
}

export async function stageProjectMemoryBackupRestore(request:StageProjectMemoryBackupRestoreRequest):Promise<ProjectMemoryRestoreStageResult>{
 const {source,expectedProjectId,stagingDirectory,mode}=request;
 if(typeof source!=="string"||!isAbsolute(source)||typeof expectedProjectId!=="string"||!expectedProjectId.trim()||typeof stagingDirectory!=="string"||!isAbsolute(stagingDirectory)||mode!==MODE)return result(request,{reason:"invalid-request"});
 if(request.signal?.aborted)return result(request,{reason:"aborted"});

 const parentPath=dirname(stagingDirectory),initialParent=await observeDirectory(parentPath);
 if(!initialParent)return result(request,{reason:"unsafe-staging-path"});
 const initialStageState=await pathState(stagingDirectory);
 if(initialStageState!=="absent")return result(request,{reason:initialStageState==="exists"?"staging-exists":"unsafe-staging-path"});
 if(request.signal?.aborted)return result(request,{reason:"aborted"});

 const databasePath=join(stagingDirectory,"memory.db"),context={source,stagingDirectory,databasePath};
 const readerStage=(stage:ProjectMemoryBackupReadStage):ProjectMemoryRestoreStage=>{
  if(stage==="open")return "read-open";
  if(stage==="read")return "read-read";
  return "read-verify-source";
 };
 const readerHooks={
  before(stage:ProjectMemoryBackupReadStage){return callHook(request,"before",readerStage(stage),context);},
  after(stage:ProjectMemoryBackupReadStage){return callHook(request,"after",readerStage(stage),context);}
 };
 const read=request.signal
  ?await readProjectMemoryBackup({source,expectedProjectId,signal:request.signal,hooks:readerHooks})
  :await readProjectMemoryBackup({source,expectedProjectId,hooks:readerHooks});
 if(read.status!=="read"||!read.backup)return result(request,{reason:"backup-refused",backupReason:read.reason});
 if(request.signal?.aborted)return result(request,{reason:"aborted"});
 if(!await sameDirectory(parentPath,initialParent))return result(request,{reason:"staging-parent-changed"});
 const revalidatedStageState=await pathState(stagingDirectory);
 if(revalidatedStageState!=="absent")return result(request,{reason:revalidatedStageState==="exists"?"staging-exists":"unsafe-staging-path"});

 try{await callHook(request,"before","create-directory",context);}catch{return result(request,{reason:"stage-create-failed"});}
 if(request.signal?.aborted)return result(request,{reason:"aborted"});
 if(!await sameDirectory(parentPath,initialParent))return result(request,{reason:"staging-parent-changed"});
 try{await mkdir(stagingDirectory,{mode:0o700});}catch(error){
  const current=await pathState(stagingDirectory);
  return result(request,{reason:current==="exists"||errorCode(error)==="EEXIST"?"staging-exists":"stage-create-failed"});
 }
 const owned=await observeDirectory(stagingDirectory);
 if(!owned)return result(request,{status:"unknown",ownership:"unknown",reason:"stage-ownership-uncertain"});
 try{await callHook(request,"after","create-directory",context);}catch{return retainedFailure(request,databasePath,owned,"stage-create-failed");}
 if(!await sameDirectory(stagingDirectory,owned))return result(request,{status:"unknown",ownership:"unknown",reason:"stage-ownership-uncertain"});
 if(request.signal?.aborted)return retainedFailure(request,databasePath,owned,"aborted");

 let store:SqliteMemoryStore|null=null;
 try{
  await callHook(request,"before","open-store",context);
  if(request.signal?.aborted)return retainedFailure(request,databasePath,owned,"aborted");
  if(!await sameDirectory(stagingDirectory,owned))return result(request,{status:"unknown",ownership:"unknown",reason:"stage-ownership-uncertain"});
  store=new SqliteMemoryStore(databasePath);
  await callHook(request,"after","open-store",context);
 }catch{await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"store-create-failed");}

 try{
  await callHook(request,"before","import",context);
  if(request.signal?.aborted){await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"aborted");}
  store.importProject(read.backup.payload);
  await callHook(request,"after","import",context);
 }catch{await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"import-failed");}
 try{
  await callHook(request,"before","verify-import",context);
  if(request.signal?.aborted){await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"aborted");}
  if(!exactExport(store.exportProject(expectedProjectId),read.backup.payload))throw new Error("stage export mismatch");
  await callHook(request,"after","verify-import",context);
 }catch{await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"verification-failed");}
 try{
  await callHook(request,"before","close-imported",context);
  store.close();store=null;
  await callHook(request,"after","close-imported",context);
 }catch{await closePreservingFailure(store);store=null;return retainedFailure(request,databasePath,owned,"close-failed");}
 if(request.signal?.aborted)return retainedFailure(request,databasePath,owned,"aborted");

 try{
  await callHook(request,"before","reopen-store",context);
  if(request.signal?.aborted)return retainedFailure(request,databasePath,owned,"aborted");
  if(!await sameDirectory(stagingDirectory,owned))return result(request,{status:"unknown",ownership:"unknown",reason:"stage-ownership-uncertain"});
  store=new SqliteMemoryStore(databasePath);
  await callHook(request,"after","reopen-store",context);
 }catch{await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"reopen-failed");}
 try{
  await callHook(request,"before","verify-reopen",context);
  if(request.signal?.aborted){await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"aborted");}
  if(!exactExport(store.exportProject(expectedProjectId),read.backup.payload))throw new Error("reopened stage export mismatch");
  await callHook(request,"after","verify-reopen",context);
 }catch{await closePreservingFailure(store);return retainedFailure(request,databasePath,owned,"verification-failed");}
 try{
  await callHook(request,"before","close-reopened",context);
  store.close();store=null;
  await callHook(request,"after","close-reopened",context);
 }catch{await closePreservingFailure(store);store=null;return retainedFailure(request,databasePath,owned,"close-failed");}
 if(request.signal?.aborted)return retainedFailure(request,databasePath,owned,"aborted");
 if(!await sameDirectory(stagingDirectory,owned))return result(request,{status:"unknown",ownership:"unknown",reason:"stage-ownership-uncertain"});
 return result(request,{status:"staged",databasePath,ownership:"owned-retained",reason:null});
}
