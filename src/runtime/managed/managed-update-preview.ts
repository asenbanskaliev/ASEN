import {constants,type BigIntStats} from "node:fs";
import {lstat,open,type FileHandle} from "node:fs/promises";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {inspectManagedInstall,type ManagedInstallInspection,type ManagedVersionInventory} from "./managed-install.js";
import {verifyManagedAcquisitionPackage,type ManagedAcquisitionVerificationReport} from "./managed-acquisition-verification.js";

export const MANAGED_UPDATE_MANIFEST_MAX_BYTES=1024*1024;
export const MANAGED_UPDATE_MANIFEST_DEADLINE_MS=30_000;

export class ManagedUpdatePreviewError extends Error{
 constructor(message:string,options?:{cause?:unknown}){super(message,{cause:options?.cause});this.name="ManagedUpdatePreviewError";}
}

type ObservedManifest=Readonly<{
 dev:bigint;ino:bigint;nlink:bigint;mode:bigint;size:bigint;
 mtimeNs:bigint;ctimeNs:bigint;birthtimeNs:bigint;
}>;

export interface ManagedUpdatePreviewReport{
 readonly schema:"asen.managed-update-preview/v1";
 readonly operation:"managed-update-preview";
 readonly executable:false;
 readonly authorized:false;
 readonly manifestPath:string;
 readonly acquisition:ManagedAcquisitionVerificationReport;
 readonly managed:Readonly<{
  prefix:string;
  status:"absent"|"foreign"|"owned";
  selectedVersion:string|null;
  targetVersionState:"not-retained"|"matching-retained"|"conflicting-retained"|"not-observable";
 }>;
 readonly staging:"not-run";
 readonly selection:"not-run";
 readonly activation:"not-run";
 readonly snapshotGuarantee:"none";
 readonly producerAuthenticity:"not-established";
 readonly runtimeReady:false;
}

function fail(message:string,cause?:unknown):never{throw new ManagedUpdatePreviewError(message,cause===undefined?undefined:{cause});}
const supportedIdentity=(stats:{dev:unknown;ino:unknown}):stats is {dev:bigint;ino:bigint}=>typeof stats.dev==="bigint"&&stats.dev>=0n&&typeof stats.ino==="bigint"&&stats.ino>0n;
const checkDeadline=(start:number)=>{if(performance.now()-start>MANAGED_UPDATE_MANIFEST_DEADLINE_MS)fail("Managed update manifest observation exceeded its cooperative deadline");};
function observed(stats:BigIntStats):ObservedManifest{return{dev:stats.dev,ino:stats.ino,nlink:stats.nlink,mode:stats.mode,size:stats.size,mtimeNs:stats.mtimeNs,ctimeNs:stats.ctimeNs,birthtimeNs:stats.birthtimeNs};}
function same(left:ObservedManifest,stats:BigIntStats):boolean{return supportedIdentity(stats)&&stats.isFile()&&!stats.isSymbolicLink()&&stats.nlink===1n&&left.dev===stats.dev&&left.ino===stats.ino&&left.nlink===stats.nlink&&left.mode===stats.mode&&left.size===stats.size&&left.mtimeNs===stats.mtimeNs&&left.ctimeNs===stats.ctimeNs&&left.birthtimeNs===stats.birthtimeNs;}

async function metadata(file:string,start:number):Promise<BigIntStats>{
 checkDeadline(start);
 try{const value=await lstat(file,{bigint:true});checkDeadline(start);return value;}
 catch(error){if(error instanceof ManagedUpdatePreviewError)throw error;return fail("Managed update manifest is unavailable",error);}
}

async function readManifest(manifestPath:string):Promise<unknown>{
 const start=performance.now(),file=path.resolve(manifestPath),before=await metadata(file,start);
 if(before.isSymbolicLink()||!before.isFile())fail("Managed update manifest must be an ordinary unlinked file");
 if(!supportedIdentity(before))fail("Managed update manifest identity is unavailable");
 if(before.nlink!==1n)fail("Managed update manifest must have exactly one link");
 if(before.size>BigInt(MANAGED_UPDATE_MANIFEST_MAX_BYTES))fail(`Managed update manifest exceeds ${MANAGED_UPDATE_MANIFEST_MAX_BYTES} bytes`);
 const initial=observed(before),portable=process.platform==="win32"?0:(constants.O_NOFOLLOW|constants.O_NONBLOCK);
 let handle:FileHandle|undefined;
 try{
  checkDeadline(start);
  try{handle=await open(file,constants.O_RDONLY|portable);}catch(error){fail("Managed update manifest could not be opened",error);}
  checkDeadline(start);
  if(!handle)fail("Managed update manifest descriptor ownership was not established");
  const owned=handle;
  const descriptor=await owned.stat({bigint:true});checkDeadline(start);
  if(!supportedIdentity(descriptor))fail("Managed update manifest descriptor identity is unavailable");
  if(!same(initial,descriptor))fail("Managed update manifest changed before reading");
  const chunks:Buffer[]=[],buffer=Buffer.allocUnsafe(Math.min(64*1024,MANAGED_UPDATE_MANIFEST_MAX_BYTES+1));let total=0;
  while(total<=MANAGED_UPDATE_MANIFEST_MAX_BYTES){
   checkDeadline(start);const length=Math.min(buffer.length,MANAGED_UPDATE_MANIFEST_MAX_BYTES+1-total);
   let bytesRead=0;try{({bytesRead}=await owned.read(buffer,0,length,null));}catch(error){fail("Managed update manifest could not be read",error);}
   checkDeadline(start);if(bytesRead===0)break;chunks.push(Buffer.from(buffer.subarray(0,bytesRead)));total+=bytesRead;
  }
  if(total>MANAGED_UPDATE_MANIFEST_MAX_BYTES)fail(`Managed update manifest exceeds ${MANAGED_UPDATE_MANIFEST_MAX_BYTES} bytes`);
  const descriptorAfter=await owned.stat({bigint:true});checkDeadline(start);
  if(!same(initial,descriptorAfter))fail("Managed update manifest changed while reading");
  const after=await metadata(file,start);if(!same(initial,after))fail("Managed update manifest changed while reading");
  const text=(()=>{try{return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,total));}catch(error){return fail("Managed update manifest is not valid UTF-8",error);}})();
  try{return JSON.parse(text) as unknown;}catch(error){return fail("Managed update manifest is not valid JSON",error);}
 }finally{
  if(handle){try{await handle.close();}catch(error){fail("Managed update manifest descriptor could not be closed",error);}}
 }
}

function sameInventory(version:ManagedVersionInventory,acquisition:ManagedAcquisitionVerificationReport):boolean{
 return version.files.length===acquisition.files.length&&version.files.every((file,index)=>{
  const declared=acquisition.files[index];return declared!==undefined&&file.path===declared.destinationPath&&file.size===declared.size&&file.sha256===declared.sha256;
 });
}
function targetState(inspection:ManagedInstallInspection,acquisition:ManagedAcquisitionVerificationReport):ManagedUpdatePreviewReport["managed"]["targetVersionState"]{
 if(inspection.status==="foreign")return "not-observable";
 if(inspection.status==="absent")return "not-retained";
 const retained=inspection.versions.find(item=>item.version===acquisition.version);
 if(!retained)return "not-retained";
 return sameInventory(retained,acquisition)?"matching-retained":"conflicting-retained";
}

/**
 * Observes one finite caller-declared manifest, its declared local package bytes,
 * and existing managed metadata. It never stages, selects, activates, executes,
 * downloads, repairs, adopts, or grants authority. Manifest reads are limited to
 * 1 MiB plus one growth-detection byte under a cooperative monotonic deadline.
 * Package verification retains its separate 64 MiB/file and 256 MiB total limits.
 * inspectManagedInstall may additionally read existing receipts, catalogs, and
 * installed content; those existing reads are not covered by the new budgets.
 */
export async function createManagedUpdatePreview(input:Readonly<{manifestPath:string;packageRoot:string;prefix:string}>):Promise<ManagedUpdatePreviewReport>{
 const manifest=await readManifest(input.manifestPath);
 const acquisition=await verifyManagedAcquisitionPackage(input.packageRoot,manifest);
 const prefix=path.resolve(input.prefix),inspection=await inspectManagedInstall({prefix});
 return Object.freeze({
  schema:"asen.managed-update-preview/v1",operation:"managed-update-preview",executable:false,authorized:false,
  manifestPath:path.resolve(input.manifestPath),acquisition,
  managed:Object.freeze({prefix,status:inspection.status,selectedVersion:inspection.status==="owned"?inspection.activeVersion:null,targetVersionState:targetState(inspection,acquisition)}),
  staging:"not-run",selection:"not-run",activation:"not-run",snapshotGuarantee:"none",producerAuthenticity:"not-established",runtimeReady:false,
 });
}
