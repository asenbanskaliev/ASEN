import {Buffer} from "node:buffer";
import {createHash,randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {link as defaultLink,lstat,open,readFile,realpath,unlink,type FileHandle} from "node:fs/promises";
import {dirname,isAbsolute,join} from "node:path";
import {canonicalProjectMemoryExport,ProjectMemoryExportValidationError,validateProjectMemoryBackupExport} from "./export-validation.js";
import type {MemoryExport,MemoryStore} from "./types.js";

const BACKUP_SCHEMA="asen.project-memory-backup/v1";
const RESULT_SCHEMA="asen.project-memory-backup-result/v1";
const MAX_BACKUP_BYTES=16*1024*1024;
const DIGEST_DOMAIN=`${BACKUP_SCHEMA}\0`;

export type ProjectMemoryBackupStage="write"|"sync"|"close"|"verify-temporary"|"link"|"verify-destination"|"cleanup";
export interface ProjectMemoryBackupHookContext {temporaryPath:string;destination:string;}
export interface ProjectMemoryBackupHooks {
 before?(stage:ProjectMemoryBackupStage,context:ProjectMemoryBackupHookContext):void|Promise<void>;
 after?(stage:ProjectMemoryBackupStage,context:ProjectMemoryBackupHookContext):void|Promise<void>;
}
export interface ProjectMemoryBackupFileSystem {link(existingPath:string,newPath:string):Promise<void>;}
export interface CreateProjectMemoryBackupRequest {
 store:Pick<MemoryStore,"exportProject">;
 projectId:string;
 destination:string;
 createdAt?:string;
 signal?:AbortSignal;
 hooks?:ProjectMemoryBackupHooks;
 fileSystem?:ProjectMemoryBackupFileSystem;
}
export type ProjectMemoryBackupReason=
 |"invalid-request"|"aborted"|"unsafe-parent"|"project-mismatch"|"invalid-export"|"backup-too-large"|"destination-exists"
 |"parent-changed"|"temporary-write-failed"|"temporary-sync-failed"|"temporary-close-failed"|"temporary-verification-failed"
 |"publish-failed"|"publish-uncertain"|"destination-verification-failed"|"cleanup-failed"|"unsupported-filesystem";
export interface ProjectMemoryBackupResult {
 schema:typeof RESULT_SCHEMA;
 status:"created"|"refused"|"unknown";
 projectId:string;
 destination:string;
 publishAttempts:0|1;
 cleanup:"none"|"removed"|"retained";
 temporaryPath:string|null;
 reason:ProjectMemoryBackupReason|null;
 payloadBytes:number|null;
 payloadSha256:string|null;
}

interface PhysicalIdentity {dev:number;ino:number;birthtimeMs:number;}
interface ParentObservation extends PhysicalIdentity {realPath:string;}
interface PublicationState {
 destination:string;
 payloadBytes:number;
 payloadSha256:string;
 temporaryPath:string;
 temporaryIdentity:PhysicalIdentity;
 expectedTemporaryBytes:Buffer|null;
 parentPath:string;
 parent:ParentObservation;
 encoded:Buffer;
}

function result(request:Pick<CreateProjectMemoryBackupRequest,"projectId"|"destination">,overrides:Partial<ProjectMemoryBackupResult>):ProjectMemoryBackupResult{
 return {schema:RESULT_SCHEMA,status:"refused",projectId:request.projectId,destination:request.destination,publishAttempts:0,cleanup:"none",temporaryPath:null,reason:null,payloadBytes:null,payloadSha256:null,...overrides};
}
function errorCode(error:unknown):string|undefined{return typeof error==="object"&&error!==null&&"code" in error?String(error.code):undefined;}
function canonicalTimestamp(value:string):boolean{
 const milliseconds=Date.parse(value);
 return Number.isFinite(milliseconds)&&new Date(milliseconds).toISOString()===value;
}
function identity(stat:{dev:number;ino:number;birthtimeMs:number}):PhysicalIdentity{return {dev:stat.dev,ino:stat.ino,birthtimeMs:stat.birthtimeMs};}
function sameIdentity(left:PhysicalIdentity,right:PhysicalIdentity):boolean{return left.dev===right.dev&&left.ino===right.ino&&left.birthtimeMs===right.birthtimeMs;}
function sha256(bytes:Uint8Array|string):string{return createHash("sha256").update(bytes).digest("hex");}
function sameBytes(left:Buffer,right:Buffer):boolean{return left.length===right.length&&sha256(left)===sha256(right)&&left.equals(right);}

async function observeParent(parentPath:string):Promise<ParentObservation|null>{
 try{
  const stat=await lstat(parentPath);
  if(!stat.isDirectory()||stat.isSymbolicLink())return null;
  return {...identity(stat),realPath:await realpath(parentPath)};
 }catch{return null;}
}
async function sameParent(parentPath:string,expected:ParentObservation):Promise<boolean>{
 const current=await observeParent(parentPath);
 return current!==null&&current.realPath===expected.realPath&&sameIdentity(current,expected);
}
async function pathState(path:string):Promise<"absent"|"exists"|"unknown">{
 try{await lstat(path);return "exists";}catch(error){return errorCode(error)==="ENOENT"?"absent":"unknown";}
}
async function ordinaryIdentity(path:string):Promise<PhysicalIdentity|null>{
 try{const stat=await lstat(path);return stat.isFile()&&!stat.isSymbolicLink()?identity(stat):null;}catch{return null;}
}
async function verifiedOwnedTemporary(state:PublicationState):Promise<boolean>{
 if(state.expectedTemporaryBytes===null||!await sameParent(state.parentPath,state.parent))return false;
 const before=await ordinaryIdentity(state.temporaryPath);
 if(!before||!sameIdentity(before,state.temporaryIdentity))return false;
 try{
  const bytes=await readFile(state.temporaryPath),after=await ordinaryIdentity(state.temporaryPath);
  return after!==null&&sameIdentity(after,state.temporaryIdentity)&&sameBytes(bytes,state.expectedTemporaryBytes);
 }catch{return false;}
}
async function retainedTemporary(state:PublicationState):Promise<{cleanup:"retained";temporaryPath:string|null}>{
 return {cleanup:"retained",temporaryPath:await verifiedOwnedTemporary(state)?state.temporaryPath:null};
}
async function removeOwnedTemporary(state:PublicationState):Promise<{cleanup:"removed"|"retained";temporaryPath:string|null}>{
 if(!await verifiedOwnedTemporary(state))return {cleanup:"retained",temporaryPath:null};
 try{
  await unlink(state.temporaryPath);
  return {cleanup:"removed",temporaryPath:null};
 }catch{return retainedTemporary(state);}
}
async function callBefore(request:CreateProjectMemoryBackupRequest,stage:ProjectMemoryBackupStage,context:ProjectMemoryBackupHookContext):Promise<void>{await request.hooks?.before?.(stage,context);}
async function callAfter(request:CreateProjectMemoryBackupRequest,stage:ProjectMemoryBackupStage,context:ProjectMemoryBackupHookContext):Promise<void>{await request.hooks?.after?.(stage,context);}

function canonicalPayload(value:unknown,projectId:string):{payload:MemoryExport;bytes:Buffer;digest:string}|ProjectMemoryBackupReason{
 try{
  const validated=validateProjectMemoryBackupExport(value,projectId),payload=canonicalProjectMemoryExport(validated),bytes=Buffer.from(JSON.stringify(payload),"utf8");
  return {payload,bytes,digest:createHash("sha256").update(DIGEST_DOMAIN).update(bytes).digest("hex")};
 }catch(error){return error instanceof ProjectMemoryExportValidationError?error.reason:"invalid-export";}
}
function encodedEnvelope(projectId:string,createdAt:string,payload:MemoryExport,payloadBytes:number,payloadSha256:string):Buffer{
 return Buffer.from(JSON.stringify({schema:BACKUP_SCHEMA,projectId,createdAt,payload,integrity:{algorithm:"sha256",payloadBytes,payloadSha256}}),"utf8");
}

async function closeAfterFailure(handle:FileHandle|null):Promise<void>{if(handle)try{await handle.close();}catch{/* The original operation failure remains authoritative. */}}
async function refuseBeforePublish(request:CreateProjectMemoryBackupRequest,state:PublicationState,reason:ProjectMemoryBackupReason,retain=false):Promise<ProjectMemoryBackupResult>{
 const cleanup=retain?await retainedTemporary(state):await removeOwnedTemporary(state);
 return result(request,{reason,payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256,...cleanup});
}
async function unknownAfterAttempt(request:CreateProjectMemoryBackupRequest,state:PublicationState,reason:ProjectMemoryBackupReason):Promise<ProjectMemoryBackupResult>{
 const retained=await retainedTemporary(state);
 return result(request,{status:"unknown",publishAttempts:1,reason,payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256,...retained});
}
async function destinationSharesTemporaryIdentity(state:PublicationState):Promise<boolean>{
 const temporary=await ordinaryIdentity(state.temporaryPath),destination=await ordinaryIdentity(state.destination);
 return temporary!==null&&destination!==null&&sameIdentity(temporary,state.temporaryIdentity)&&sameIdentity(destination,state.temporaryIdentity);
}
async function destinationMatchesPublication(state:PublicationState):Promise<boolean>{
 if(!await destinationSharesTemporaryIdentity(state))return false;
 try{return sameBytes(await readFile(state.temporaryPath),state.encoded)&&sameBytes(await readFile(state.destination),state.encoded);}catch{return false;}
}

export async function createProjectMemoryBackup(request:CreateProjectMemoryBackupRequest):Promise<ProjectMemoryBackupResult>{
 const {projectId,destination}=request;
 if(typeof projectId!=="string"||!projectId.trim()||typeof destination!=="string"||!isAbsolute(destination))return result(request,{reason:"invalid-request"});
 const createdAt=request.createdAt??new Date().toISOString();
 if(!canonicalTimestamp(createdAt))return result(request,{reason:"invalid-request"});
 if(request.signal?.aborted)return result(request,{reason:"aborted"});
 const parentPath=dirname(destination),initialParent=await observeParent(parentPath);
 if(!initialParent)return result(request,{reason:"unsafe-parent"});
 const initialDestination=await pathState(destination);
 if(initialDestination!=="absent")return result(request,{reason:initialDestination==="exists"?"destination-exists":"unsafe-parent"});
 if(request.signal?.aborted)return result(request,{reason:"aborted"});
 let exported:unknown;
 try{exported=request.store.exportProject(projectId);}catch{return result(request,{reason:"invalid-export"});}
 const canonical=canonicalPayload(exported,projectId);
 if(typeof canonical==="string")return result(request,{reason:canonical});
 const encoded=encodedEnvelope(projectId,createdAt,canonical.payload,canonical.bytes.length,canonical.digest);
 if(encoded.length>MAX_BACKUP_BYTES)return result(request,{reason:"backup-too-large"});
 if(request.signal?.aborted)return result(request,{reason:"aborted"});
 if(!await sameParent(parentPath,initialParent))return result(request,{reason:"parent-changed"});
 const revalidatedDestination=await pathState(destination);
 if(revalidatedDestination!=="absent")return result(request,{reason:revalidatedDestination==="exists"?"destination-exists":"unsafe-parent"});

 const temporaryPath=join(parentPath,`.asen-project-memory-backup-${randomUUID()}.tmp`);
 let opened:FileHandle,temporaryIdentity:PhysicalIdentity;
 try{
  opened=await open(temporaryPath,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
  temporaryIdentity=identity(await opened.stat());
 }catch{return result(request,{reason:"temporary-write-failed",payloadBytes:canonical.bytes.length,payloadSha256:canonical.digest});}
 let handle:FileHandle|null=opened;
 const publicationParent=await observeParent(parentPath);
 const state:PublicationState={destination,payloadBytes:canonical.bytes.length,payloadSha256:canonical.digest,temporaryPath,temporaryIdentity,expectedTemporaryBytes:Buffer.alloc(0),parentPath,parent:publicationParent??initialParent,encoded};
 const context={temporaryPath,destination};
 if(!publicationParent||!sameIdentity(publicationParent,initialParent)||publicationParent.realPath!==initialParent.realPath){
  await closeAfterFailure(handle);return refuseBeforePublish(request,state,"parent-changed",true);
 }

 try{
  await callBefore(request,"write",context);
  state.expectedTemporaryBytes=null;
  await handle.writeFile(encoded);
  state.expectedTemporaryBytes=encoded;
  await callAfter(request,"write",context);
 }catch{await closeAfterFailure(handle);return refuseBeforePublish(request,state,"temporary-write-failed");}
 try{await callBefore(request,"sync",context);await handle.sync();await callAfter(request,"sync",context);}
 catch{await closeAfterFailure(handle);return refuseBeforePublish(request,state,"temporary-sync-failed");}
 try{await callBefore(request,"close",context);await handle.close();handle=null;await callAfter(request,"close",context);}
 catch{await closeAfterFailure(handle);handle=null;return refuseBeforePublish(request,state,"temporary-close-failed",true);}
 try{
  await callBefore(request,"verify-temporary",context);
  if(!await verifiedOwnedTemporary(state))throw new Error("temporary verification failed");
  await callAfter(request,"verify-temporary",context);
 }catch{return refuseBeforePublish(request,state,"temporary-verification-failed");}

 try{await callBefore(request,"link",context);}catch{return refuseBeforePublish(request,state,"publish-failed");}
 if(request.signal?.aborted)return refuseBeforePublish(request,state,"aborted");
 if(!await sameParent(parentPath,state.parent))return refuseBeforePublish(request,state,"parent-changed",true);
 if(!await verifiedOwnedTemporary(state))return refuseBeforePublish(request,state,"temporary-verification-failed",true);
 let linkError:unknown,publishAttempts:0|1=0;
 const linkOperation=request.fileSystem?.link??defaultLink;
 try{
  publishAttempts=1;
  await linkOperation(temporaryPath,destination);
 }catch(error){linkError=error;}
 if(linkError){
  if(await destinationSharesTemporaryIdentity(state))return unknownAfterAttempt(request,state,"publish-uncertain");
  const destinationState=await pathState(destination),code=errorCode(linkError);
  if(destinationState==="unknown")return unknownAfterAttempt(request,state,"publish-uncertain");
  if(destinationState==="exists"){
   const cleanup=await removeOwnedTemporary(state);
   return result(request,{publishAttempts,reason:"destination-exists",payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256,...cleanup});
  }
  if(!await sameParent(parentPath,state.parent))return unknownAfterAttempt(request,state,"publish-uncertain");
  const reason:ProjectMemoryBackupReason=code==="ENOTSUP"||code==="EOPNOTSUPP"||code==="ENOSYS"||code==="EXDEV"?"unsupported-filesystem":"publish-failed";
  const cleanup=await removeOwnedTemporary(state);
  return result(request,{publishAttempts,reason,payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256,...cleanup});
 }
 try{await callAfter(request,"link",context);}catch{return unknownAfterAttempt(request,state,"publish-uncertain");}
 if(request.signal?.aborted)return unknownAfterAttempt(request,state,"publish-uncertain");

 try{
  await callBefore(request,"verify-destination",context);
  if(!await sameParent(parentPath,state.parent)||!await destinationMatchesPublication(state))throw new Error("destination verification failed");
  await callAfter(request,"verify-destination",context);
 }catch{return unknownAfterAttempt(request,state,"destination-verification-failed");}

 let cleanupRemoved=false;
 try{
  await callBefore(request,"cleanup",context);
  const cleanup=await removeOwnedTemporary(state);
  if(cleanup.cleanup!=="removed")return result(request,{status:"created",publishAttempts:1,reason:"cleanup-failed",payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256,...cleanup});
  cleanupRemoved=true;
  await callAfter(request,"cleanup",context);
  return result(request,{status:"created",publishAttempts:1,cleanup:"removed",reason:null,payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256});
 }catch{
  if(cleanupRemoved)return result(request,{status:"created",publishAttempts:1,cleanup:"removed",reason:"cleanup-failed",payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256});
  const retained=await retainedTemporary(state);
  return result(request,{status:"created",publishAttempts:1,reason:"cleanup-failed",payloadBytes:state.payloadBytes,payloadSha256:state.payloadSha256,...retained});
 }
}

const READ_RESULT_SCHEMA="asen.project-memory-backup-read-result/v1";

type ProjectMemoryBackupEnvelope={
 schema:typeof BACKUP_SCHEMA;
 projectId:string;
 createdAt:string;
 payload:MemoryExport;
 integrity:{algorithm:"sha256";payloadBytes:number;payloadSha256:string};
};
export type ProjectMemoryBackupReadStage="open"|"read"|"verify-source";
export interface ProjectMemoryBackupReadHookContext {source:string;}
export interface ProjectMemoryBackupReadHooks {
 before?(stage:ProjectMemoryBackupReadStage,context:ProjectMemoryBackupReadHookContext):void|Promise<void>;
 after?(stage:ProjectMemoryBackupReadStage,context:ProjectMemoryBackupReadHookContext):void|Promise<void>;
}
export interface ReadProjectMemoryBackupRequest {
 source:string;
 expectedProjectId:string;
 signal?:AbortSignal;
 hooks?:ProjectMemoryBackupReadHooks;
}
export type ProjectMemoryBackupReadReason=
 |"invalid-request"|"aborted"|"unsafe-source"|"source-changed"|"read-failed"|"backup-too-large"
 |"invalid-encoding"|"invalid-json"|"invalid-envelope"|"project-mismatch"|"invalid-export"
 |"noncanonical-payload"|"payload-size-mismatch"|"payload-digest-mismatch";
export interface ReadProjectMemoryBackupResult {
 schema:typeof READ_RESULT_SCHEMA;
 status:"read"|"refused";
 source:string;
 expectedProjectId:string;
 backup:ProjectMemoryBackupEnvelope|null;
 reason:ProjectMemoryBackupReadReason|null;
 bytesRead:number;
}

interface ReadSourceObservation extends PhysicalIdentity {size:number;mtimeMs:number;ctimeMs:number;}

function readResult(request:Pick<ReadProjectMemoryBackupRequest,"source"|"expectedProjectId">,overrides:Partial<ReadProjectMemoryBackupResult>={}):ReadProjectMemoryBackupResult{
 return {schema:READ_RESULT_SCHEMA,status:"refused",source:request.source,expectedProjectId:request.expectedProjectId,backup:null,reason:null,bytesRead:0,...overrides};
}
function readerRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function readerExactKeys(value:Record<string,unknown>,expected:readonly string[]):boolean{
 const keys=Object.keys(value);return keys.length===expected.length&&keys.every(key=>expected.includes(key));
}
function readObservation(stat:{dev:number;ino:number;birthtimeMs:number;size:number;mtimeMs:number;ctimeMs:number}):ReadSourceObservation{
 return {...identity(stat),size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs};
}
function sameReadObservation(left:ReadSourceObservation,right:ReadSourceObservation):boolean{
 return sameIdentity(left,right)&&left.size===right.size&&left.mtimeMs===right.mtimeMs&&left.ctimeMs===right.ctimeMs;
}
async function observedOrdinarySource(path:string):Promise<ReadSourceObservation|null>{
 try{const stat=await lstat(path);return stat.isFile()&&!stat.isSymbolicLink()?readObservation(stat):null;}catch{return null;}
}
async function readHook(request:ReadProjectMemoryBackupRequest,side:"before"|"after",stage:ProjectMemoryBackupReadStage):Promise<void>{
 await request.hooks?.[side]?.(stage,{source:request.source});
}
async function sourceStillObserved(source:string,handle:FileHandle,expected:ReadSourceObservation):Promise<boolean>{
 try{
  const descriptor=await handle.stat(),path=await observedOrdinarySource(source);
  return descriptor.isFile()&&path!==null&&sameReadObservation(readObservation(descriptor),expected)&&sameReadObservation(path,expected);
 }catch{return false;}
}

function validateBackupEnvelope(value:unknown,expectedProjectId:string):{backup:ProjectMemoryBackupEnvelope}|{reason:ProjectMemoryBackupReadReason}{
 if(!readerRecord(value)||!readerExactKeys(value,["schema","projectId","createdAt","payload","integrity"]))return {reason:"invalid-envelope"};
 if(value.schema!==BACKUP_SCHEMA||typeof value.projectId!=="string"||!value.projectId.trim()||typeof value.createdAt!=="string"||!canonicalTimestamp(value.createdAt)||!readerRecord(value.integrity)||!readerExactKeys(value.integrity,["algorithm","payloadBytes","payloadSha256"]))return {reason:"invalid-envelope"};
 const integrity=value.integrity;
 if(integrity.algorithm!=="sha256"||typeof integrity.payloadBytes!=="number"||!Number.isSafeInteger(integrity.payloadBytes)||integrity.payloadBytes<0||typeof integrity.payloadSha256!=="string"||!/^[0-9a-f]{64}$/.test(integrity.payloadSha256))return {reason:"invalid-envelope"};
 if(value.projectId!==expectedProjectId)return {reason:"project-mismatch"};
 let payload:MemoryExport;
 try{payload=validateProjectMemoryBackupExport(value.payload,value.projectId);}
 catch(error){return {reason:error instanceof ProjectMemoryExportValidationError?error.reason:"invalid-export"};}
 const canonical=canonicalProjectMemoryExport(payload),canonicalJson=JSON.stringify(canonical);
 if(JSON.stringify(value.payload)!==canonicalJson)return {reason:"noncanonical-payload"};
 const bytes=Buffer.from(canonicalJson,"utf8");
 if(integrity.payloadBytes!==bytes.length)return {reason:"payload-size-mismatch"};
 const digest=createHash("sha256").update(DIGEST_DOMAIN).update(bytes).digest("hex");
 if(integrity.payloadSha256!==digest)return {reason:"payload-digest-mismatch"};
 return {backup:{schema:BACKUP_SCHEMA,projectId:value.projectId,createdAt:value.createdAt,payload:canonical,integrity:{algorithm:"sha256",payloadBytes:integrity.payloadBytes,payloadSha256:integrity.payloadSha256}}};
}

export async function readProjectMemoryBackup(request:ReadProjectMemoryBackupRequest):Promise<ReadProjectMemoryBackupResult>{
 const {source,expectedProjectId}=request;
 if(typeof source!=="string"||!isAbsolute(source)||typeof expectedProjectId!=="string"||!expectedProjectId.trim())return readResult(request,{reason:"invalid-request"});
 if(request.signal?.aborted)return readResult(request,{reason:"aborted"});
 let handle:FileHandle|null=null,bytesRead=0;
 try{
  try{await readHook(request,"before","open");}catch{return readResult(request,{reason:"read-failed"});}
  if(request.signal?.aborted)return readResult(request,{reason:"aborted"});
  const initial=await observedOrdinarySource(source);
  if(!initial)return readResult(request,{reason:"unsafe-source"});
  if(initial.size>MAX_BACKUP_BYTES)return readResult(request,{reason:"backup-too-large"});
  try{handle=await open(source,constants.O_RDONLY);}catch{return readResult(request,{reason:"read-failed"});}
  if(!await sourceStillObserved(source,handle,initial))return readResult(request,{reason:"source-changed"});
  try{await readHook(request,"after","open");}catch{return readResult(request,{reason:"read-failed"});}
  if(request.signal?.aborted)return readResult(request,{reason:"aborted"});

  try{await readHook(request,"before","read");}catch{return readResult(request,{reason:"read-failed"});}
  if(request.signal?.aborted)return readResult(request,{reason:"aborted"});
  if(!await sourceStillObserved(source,handle,initial))return readResult(request,{reason:"source-changed"});
  const buffer=Buffer.allocUnsafe(MAX_BACKUP_BYTES+1);
  try{
   while(bytesRead<buffer.length){const current=await handle.read(buffer,bytesRead,buffer.length-bytesRead,null);if(current.bytesRead===0)break;bytesRead+=current.bytesRead;}
  }catch{return readResult(request,{reason:"read-failed",bytesRead});}
  try{await readHook(request,"after","read");}catch{return readResult(request,{reason:"read-failed",bytesRead});}
  if(request.signal?.aborted)return readResult(request,{reason:"aborted",bytesRead});
  if(bytesRead>MAX_BACKUP_BYTES)return readResult(request,{reason:"backup-too-large",bytesRead});

  try{await readHook(request,"before","verify-source");}catch{return readResult(request,{reason:"read-failed",bytesRead});}
  if(request.signal?.aborted)return readResult(request,{reason:"aborted",bytesRead});
  if(!await sourceStillObserved(source,handle,initial))return readResult(request,{reason:"source-changed",bytesRead});
  try{await readHook(request,"after","verify-source");}catch{return readResult(request,{reason:"read-failed",bytesRead});}
  if(request.signal?.aborted)return readResult(request,{reason:"aborted",bytesRead});
  if(!await sourceStillObserved(source,handle,initial))return readResult(request,{reason:"source-changed",bytesRead});

  let text:string;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(buffer.subarray(0,bytesRead));}catch{return readResult(request,{reason:"invalid-encoding",bytesRead});}
  let parsed:unknown;
  try{parsed=JSON.parse(text);}catch{return readResult(request,{reason:"invalid-json",bytesRead});}
  const validated=validateBackupEnvelope(parsed,expectedProjectId);
  return "reason" in validated?readResult(request,{reason:validated.reason,bytesRead}):readResult(request,{status:"read",backup:validated.backup,reason:null,bytesRead});
 }catch{return readResult(request,{reason:"read-failed",bytesRead});}
 finally{if(handle)try{await handle.close();}catch{/* Reading is already complete or refused; no write-side recovery exists. */}}
}
