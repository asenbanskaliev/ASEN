import {createHash} from "node:crypto";
import {constants,type BigIntStats} from "node:fs";
import {lstat,open,realpath,type FileHandle} from "node:fs/promises";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {
 decodeManagedAcquisitionManifest,
 type ManagedAcquisitionFile,
 type ManagedAcquisitionManifest,
} from "./managed-install.js";

export const MANAGED_ACQUISITION_MAX_FILE_BYTES=64*1024*1024;
export const MANAGED_ACQUISITION_MAX_TOTAL_BYTES=256*1024*1024;
export const MANAGED_ACQUISITION_READ_CHUNK_BYTES=1024*1024;
export const MANAGED_ACQUISITION_DEADLINE_MS=30_000;

export type ManagedAcquisitionVerificationErrorCode=
 | "INVALID_PACKAGE_ROOT"
 | "PACKAGE_BOUNDS_EXCEEDED"
 | "PACKAGE_IDENTITY_UNAVAILABLE"
 | "PACKAGE_SOURCE_NOT_REGULAR"
 | "PACKAGE_SOURCE_LINKED"
 | "PACKAGE_SOURCE_ESCAPE"
 | "PACKAGE_CONTENT_MISMATCH"
 | "PACKAGE_SOURCE_DRIFT"
 | "PACKAGE_DEADLINE_EXCEEDED"
 | "PACKAGE_READ_FAILED";

export class ManagedAcquisitionVerificationError extends Error{
 readonly code:ManagedAcquisitionVerificationErrorCode;

 constructor(
  code:ManagedAcquisitionVerificationErrorCode,
  message:string,
  options?:{cause?:unknown},
 ){
  super(message,{cause:options?.cause});
  this.name="ManagedAcquisitionVerificationError";
  this.code=code;
 }
}

export interface ManagedAcquisitionVerifiedFile extends ManagedAcquisitionFile{
 readonly contentObservation:"declared-bytes-matched";
 readonly confinementObservation:"contained-at-validation-points";
}

export interface ManagedAcquisitionVerificationReport{
 readonly status:"verified";
 readonly packageRoot:string;
 readonly canonicalPackageRoot:string;
 readonly version:string;
 readonly files:readonly ManagedAcquisitionVerifiedFile[];
 readonly bytesRead:number;
 readonly contentObservation:"declared-bytes-matched";
 readonly confinementObservation:"contained-at-validation-points";
 readonly snapshotGuarantee:"none";
 readonly producerAuthenticity:"not-established";
 readonly authority:false;
 readonly runtimeReady:false;
 readonly budgets:Readonly<{
  perFileBytes:number;
  totalBytes:number;
  readChunkBytes:number;
  cooperativeDeadlineMs:number;
 }>;
}

type ObservedPath={
 absolute:string;
 canonical:string;
 kind:"directory"|"file";
 dev:bigint;
 ino:bigint;
 nlink:bigint;
 mode:bigint;
 size:bigint;
 mtimeNs:bigint;
 ctimeNs:bigint;
 birthtimeNs:bigint;
};

function fail(
 code:ManagedAcquisitionVerificationErrorCode,
 message:string,
 cause?:unknown,
):never{
 throw new ManagedAcquisitionVerificationError(
  code,
  message,
  cause===undefined?undefined:{cause},
 );
}

function displayed(value:string):string{
 return value.split(path.sep).join("/");
}

function within(root:string,value:string):boolean{
 const relative=path.relative(root,value);
 return relative===""||(
  !relative.startsWith(`..${path.sep}`)
  && relative!==".."
  && !path.isAbsolute(relative)
 );
}

function checkedRoot(value:unknown):string{
 if(typeof value!=="string"||value.length===0||!path.isAbsolute(value)){
  fail("INVALID_PACKAGE_ROOT","Managed acquisition package root must be a fully qualified local absolute path");
 }
 const root=value as string;
 if(process.platform==="win32"&&(
  !/^[A-Za-z]:[\\/]/u.test(root)
  || /^\\\\/u.test(root)
  || /^\\\\[?.]\\/u.test(root)
 )){
  fail("INVALID_PACKAGE_ROOT","Managed acquisition package root must be a local drive-qualified path");
 }
 return path.resolve(root);
}

function checkDeadline(start:number):void{
 if(performance.now()-start>MANAGED_ACQUISITION_DEADLINE_MS){
  fail("PACKAGE_DEADLINE_EXCEEDED","Managed acquisition verification exceeded its cooperative deadline");
 }
}

async function progress<T>(start:number,operation:()=>Promise<T>):Promise<T>{
 checkDeadline(start);
 try{
  const result=await operation();
  checkDeadline(start);
  return result;
 }catch(error){
  checkDeadline(start);
  throw error;
 }
}

function supportedIdentity(stats:{dev:unknown;ino:unknown}):stats is {dev:bigint;ino:bigint}{
 return typeof stats.dev==="bigint"
  && stats.dev>=0n
  && typeof stats.ino==="bigint"
  && stats.ino>0n;
}

function same(left:ObservedPath,right:ObservedPath):boolean{
 return left.absolute===right.absolute
  && left.canonical===right.canonical
  && left.kind===right.kind
  && left.dev===right.dev
  && left.ino===right.ino
  && left.nlink===right.nlink
  && left.mode===right.mode
  && left.size===right.size
  && left.mtimeNs===right.mtimeNs
  && left.ctimeNs===right.ctimeNs
  && left.birthtimeNs===right.birthtimeNs;
}

async function observe(absolute:string,expected:"directory"|"file"):Promise<ObservedPath>;
async function observe(absolute:string,expected:"directory"|"file",rootCanonical:string):Promise<ObservedPath>;
async function observe(absolute:string,expected:"directory"|"file",start:number,rootCanonical?:string):Promise<ObservedPath>;
async function observe(
 absolute:string,
 expected:"directory"|"file",
 startOrRoot?:number|string,
 explicitRoot?:string,
):Promise<ObservedPath>{
 const start=typeof startOrRoot==="number"?startOrRoot:performance.now();
 const rootCanonical=typeof startOrRoot==="string"?startOrRoot:explicitRoot;
 let stats:BigIntStats|undefined;
 let canonical:string|undefined;
 try{
  stats=await progress(start,()=>lstat(absolute,{bigint:true}));
  if(stats.isSymbolicLink()){
   fail("PACKAGE_SOURCE_LINKED",`Managed acquisition path is linked: ${displayed(absolute)}`);
  }
  checkDeadline(start);
  canonical=await progress(start,()=>realpath(absolute));
 }catch(error){
  if(error instanceof ManagedAcquisitionVerificationError)throw error;
  fail(
   expected==="directory"?"INVALID_PACKAGE_ROOT":"PACKAGE_SOURCE_NOT_REGULAR",
   `Managed acquisition ${expected} is unavailable: ${displayed(absolute)}`,
   error,
  );
 }
 if(!stats||canonical===undefined){
  fail("PACKAGE_SOURCE_DRIFT",`Managed acquisition metadata was unavailable: ${displayed(absolute)}`);
 }
 if(!supportedIdentity(stats)){
  fail("PACKAGE_IDENTITY_UNAVAILABLE",`Managed acquisition path identity is unavailable: ${displayed(absolute)}`);
 }
 if(expected==="directory"&&!stats.isDirectory()){
  fail("PACKAGE_SOURCE_NOT_REGULAR",`Managed acquisition ancestor is not an ordinary directory: ${displayed(absolute)}`);
 }
 if(expected==="file"&&!stats.isFile()){
  fail("PACKAGE_SOURCE_NOT_REGULAR",`Managed acquisition source is not a regular file: ${displayed(absolute)}`);
 }
 if(rootCanonical&&!within(rootCanonical,canonical)){
  fail("PACKAGE_SOURCE_ESCAPE",`Managed acquisition source escapes the package root: ${displayed(absolute)}`);
 }
 if(expected==="file"&&stats.nlink!==1n){
  fail("PACKAGE_SOURCE_LINKED",`Managed acquisition source must have exactly one link: ${displayed(absolute)}`);
 }
 return {
  absolute,canonical,kind:expected,
  dev:stats.dev,ino:stats.ino,nlink:stats.nlink,mode:stats.mode,size:stats.size,
  mtimeNs:stats.mtimeNs,ctimeNs:stats.ctimeNs,birthtimeNs:stats.birthtimeNs,
 };
}

async function revalidate(item:ObservedPath):Promise<void>;
async function revalidate(item:ObservedPath,rootCanonical:string|undefined):Promise<void>;
async function revalidate(item:ObservedPath,start:number,rootCanonical?:string):Promise<void>;
async function revalidate(
 item:ObservedPath,
 startOrRoot?:number|string,
 explicitRoot?:string,
):Promise<void>{
 const start=typeof startOrRoot==="number"?startOrRoot:performance.now();
 const rootCanonical=typeof startOrRoot==="string"?startOrRoot:explicitRoot;
 try{
  const current=await observe(item.absolute,item.kind,start,rootCanonical);
  if(!same(item,current)){
   fail("PACKAGE_SOURCE_DRIFT",`Managed acquisition path changed during verification: ${displayed(item.absolute)}`);
  }
 }catch(error){
  if(error instanceof ManagedAcquisitionVerificationError&&(
   error.code==="PACKAGE_SOURCE_DRIFT"
   || error.code==="PACKAGE_DEADLINE_EXCEEDED"
   || error.code==="PACKAGE_IDENTITY_UNAVAILABLE"
  ))throw error;
  fail("PACKAGE_SOURCE_DRIFT",`Managed acquisition path changed during verification: ${displayed(item.absolute)}`,error);
 }
}

function descriptorMatches(source:ObservedPath,stats:BigIntStats):boolean{
 return supportedIdentity(stats)
  && stats.isFile()
  && stats.dev===source.dev
  && stats.ino===source.ino
  && stats.nlink===1n
  && stats.mode===source.mode
  && stats.size===source.size
  && stats.mtimeNs===source.mtimeNs
  && stats.ctimeNs===source.ctimeNs
  && stats.birthtimeNs===source.birthtimeNs;
}

async function verifyFile(
 source:ObservedPath,
 file:ManagedAcquisitionFile,
 start:number,
):Promise<void>{
 if(source.size!==BigInt(file.size)){
  fail("PACKAGE_CONTENT_MISMATCH",`Managed acquisition size does not match its declaration: ${file.sourcePath}`);
 }
 const portableFlags=process.platform==="win32"?0:(constants.O_NOFOLLOW|constants.O_NONBLOCK);
 let handle:FileHandle|undefined;
 try{
  await progress(start,async()=>handle=await open(source.absolute,constants.O_RDONLY|portableFlags));
  const opened=await progress(start,()=>handle!.stat({bigint:true}));
  if(!supportedIdentity(opened)){
   fail("PACKAGE_IDENTITY_UNAVAILABLE",`Managed acquisition descriptor identity is unavailable: ${file.sourcePath}`);
  }
  if(!descriptorMatches(source,opened)){
   fail("PACKAGE_SOURCE_DRIFT",`Managed acquisition descriptor identity changed before reading: ${file.sourcePath}`);
  }
  const hash=createHash("sha256");
  const buffer=Buffer.allocUnsafe(Math.min(MANAGED_ACQUISITION_READ_CHUNK_BYTES,file.size+1||1));
  let offset=0;
  while(true){
   const remaining=file.size-offset;
   const length=Math.min(buffer.length,remaining+1);
   const {bytesRead}=await progress(start,()=>handle!.read(buffer,0,length,null));
   if(bytesRead===0){
    if(offset!==file.size){
     fail("PACKAGE_CONTENT_MISMATCH",`Managed acquisition source ended before its declared size: ${file.sourcePath}`);
    }
    break;
   }
   if(bytesRead>remaining){
    fail("PACKAGE_CONTENT_MISMATCH",`Managed acquisition source grew beyond its declared size: ${file.sourcePath}`);
   }
   hash.update(buffer.subarray(0,bytesRead));
   offset+=bytesRead;
  }
  if(hash.digest("hex")!==file.sha256){
   fail("PACKAGE_CONTENT_MISMATCH",`Managed acquisition sha256 does not match its declaration: ${file.sourcePath}`);
  }
 }catch(error){
  if(error instanceof ManagedAcquisitionVerificationError)throw error;
  fail("PACKAGE_READ_FAILED",`Managed acquisition source could not be read: ${file.sourcePath}`,error);
 }finally{
  if(handle){
   try{await handle.close();}
   catch(error){
    checkDeadline(start);
    fail("PACKAGE_READ_FAILED",`Managed acquisition descriptor could not be closed: ${file.sourcePath}`,error);
   }
  }
 }
}

/**
 * Observes declared local package bytes through checked read-only descriptors.
 *
 * The manifest is decoded before filesystem access. Declared input is limited to
 * 64 MiB per file and 256 MiB total; reads use at most 1 MiB and request only
 * remaining declared bytes plus one growth-detection byte. A monotonic 30-second
 * cooperative deadline is checked before and after each progress operation.
 * In-flight kernel calls are not preempted, and owned descriptors are always
 * closed afterward.
 *
 * Root, relevant ancestors, and source metadata are revalidated after each
 * descriptor closes and again in a final pass. Unsupported path or descriptor
 * identities fail closed. These identity, type, size, single-link, containment,
 * hash, and mutation checks remain observations at validation points. This does
 * not provide race-free confinement, an atomic snapshot, simultaneous
 * coexistence, publisher authenticity/provenance, installation ownership,
 * authority, selection, activation, or runtime readiness. Destination metadata
 * is returned as manifest data and is never opened. Failures expose
 * `ManagedAcquisitionVerificationError.code`; decoder failures remain the public
 * managed-install decoder errors.
 */
export async function verifyManagedAcquisitionPackage(
 packageRoot:unknown,
 manifestInput:unknown,
):Promise<ManagedAcquisitionVerificationReport>{
 const manifest:ManagedAcquisitionManifest=decodeManagedAcquisitionManifest(manifestInput);
 const root=checkedRoot(packageRoot);
 let total=0;
 for(const file of manifest.files){
  if(file.size>MANAGED_ACQUISITION_MAX_FILE_BYTES){
   fail("PACKAGE_BOUNDS_EXCEEDED",`Managed acquisition file exceeds ${MANAGED_ACQUISITION_MAX_FILE_BYTES} bytes: ${file.sourcePath}`);
  }
  total+=file.size;
  if(total>MANAGED_ACQUISITION_MAX_TOTAL_BYTES){
   fail("PACKAGE_BOUNDS_EXCEEDED",`Managed acquisition total exceeds ${MANAGED_ACQUISITION_MAX_TOTAL_BYTES} bytes`);
  }
 }
 const start=performance.now();
 checkDeadline(start);
 const observedRoot=await observe(root,"directory",start);
 checkDeadline(start);
 const observations=new Map<string,ObservedPath>([[root,observedRoot]]);
 const files:ManagedAcquisitionVerifiedFile[]=[];
 for(const file of manifest.files){
  const parts=file.sourcePath.split("/");
  const relevant:ObservedPath[]=[observedRoot];
  let ancestor=root;
  for(const part of parts.slice(0,-1)){
   ancestor=path.join(ancestor,part);
   let observed=observations.get(ancestor);
   if(!observed){
    observed=await observe(ancestor,"directory",start,observedRoot.canonical);
    observations.set(ancestor,observed);
    checkDeadline(start);
   }
   relevant.push(observed);
  }
  const absolute=path.join(root,...parts);
  const source=await observe(absolute,"file",start,observedRoot.canonical);
  checkDeadline(start);
  await verifyFile(source,file,start);
  checkDeadline(start);
  await revalidate(source,start,observedRoot.canonical);
  for(const item of relevant){
   checkDeadline(start);
   await revalidate(item,start,item===observedRoot?undefined:observedRoot.canonical);
   checkDeadline(start);
  }
  observations.set(`${absolute}\0${files.length}`,source);
  files.push(Object.freeze({
   ...file,
   contentObservation:"declared-bytes-matched",
   confinementObservation:"contained-at-validation-points",
  }));
 }
 for(const item of observations.values()){
  checkDeadline(start);
  await revalidate(item,start,item===observedRoot?undefined:observedRoot.canonical);
  checkDeadline(start);
 }
 return Object.freeze({
  status:"verified",
  packageRoot:root,
  canonicalPackageRoot:observedRoot.canonical,
  version:manifest.version,
  files:Object.freeze(files),
  bytesRead:total,
  contentObservation:"declared-bytes-matched",
  confinementObservation:"contained-at-validation-points",
  snapshotGuarantee:"none",
  producerAuthenticity:"not-established",
  authority:false,
  runtimeReady:false,
  budgets:Object.freeze({
   perFileBytes:MANAGED_ACQUISITION_MAX_FILE_BYTES,
   totalBytes:MANAGED_ACQUISITION_MAX_TOTAL_BYTES,
   readChunkBytes:MANAGED_ACQUISITION_READ_CHUNK_BYTES,
   cooperativeDeadlineMs:MANAGED_ACQUISITION_DEADLINE_MS,
  }),
 });
}
