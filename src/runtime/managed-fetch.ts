import {createHash,randomUUID} from "node:crypto";
import {mkdir,open,rename,rm,readdir,stat} from "node:fs/promises";
import path from "node:path";
import {decodeManagedAcquisitionManifest,type ManagedAcquisitionManifest} from "./managed-install.js";
import {MANAGED_MANIFEST_MAX_BYTES,verifyManagedManifestSignature} from "./managed-trust.js";
import {MANAGED_ACQUISITION_MAX_FILE_BYTES,MANAGED_ACQUISITION_MAX_TOTAL_BYTES} from "./managed-acquisition-verification.js";
import type {KeyObject} from "node:crypto";

export const MANAGED_MANIFEST_NAME="asen-manifest.json";
export const MANAGED_SIGNATURE_NAME="asen-manifest.sig.json";
export const MANAGED_DOWNLOAD_TIMEOUT_MS=60_000;
const STALE_DOWNLOAD_MS=24*60*60*1000;

export type ManagedFetchErrorCode="INSECURE_SOURCE"|"INVALID_SOURCE"|"HTTP_FAILURE"|"SIZE_EXCEEDED"|"CONTENT_MISMATCH"|"INTERRUPTED";
export class ManagedFetchError extends Error{
 constructor(readonly code:ManagedFetchErrorCode,message:string,options?:{cause?:unknown}){super(message,{cause:options?.cause});this.name="ManagedFetchError";}
}
const fail=(code:ManagedFetchErrorCode,message:string,cause?:unknown):never=>{throw new ManagedFetchError(code,message,cause===undefined?undefined:{cause});};

export interface ManagedFetchRequest{
 readonly baseUrl:string;
 readonly downloadsRoot:string;
 readonly trustedKeys:readonly KeyObject[];
 readonly timeoutMs?:number;
 readonly signal?:AbortSignal;
 readonly fetchImpl?:typeof fetch;
}
export interface ManagedFetchResult{
 readonly workRoot:string;
 readonly packageRoot:string;
 readonly manifestBytes:Buffer;
 readonly manifest:ManagedAcquisitionManifest;
 readonly keyId:string;
 cleanup():Promise<void>;
}

/** Remote sources must be explicit https URLs; plain http is accepted only for literal loopback addresses. */
export function validateManagedSourceUrl(value:string):URL{
 let url:URL;
 try{url=new URL(value);}catch(error){return fail("INVALID_SOURCE","Source URL is malformed",error);}
 if(url.username||url.password||url.search||url.hash)fail("INVALID_SOURCE","Source URL must not contain credentials, query or fragment");
 const loopback=url.hostname==="127.0.0.1"||url.hostname==="[::1]";
 if(url.protocol!=="https:"&&!(url.protocol==="http:"&&loopback))fail("INSECURE_SOURCE","Source must use https (plain http is limited to loopback)");
 if(!url.pathname.endsWith("/"))url.pathname+="/";
 return url;
}

async function download(fetchImpl:typeof fetch,url:URL,limit:number,timeoutMs:number,signal:AbortSignal|undefined,sink:(chunk:Buffer)=>Promise<void>):Promise<void>{
 const timeout=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 let response:Response;
 try{response=await fetchImpl(url,{redirect:"error",signal:combined,headers:{accept:"application/octet-stream"}});}
 catch(error){return fail("INTERRUPTED","Download failed or was interrupted",error);}
 if(!response.ok||!response.body)return fail("HTTP_FAILURE",`Source returned HTTP ${response.status}`);
 const declared=response.headers.get("content-length");
 if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>limit))return fail("SIZE_EXCEEDED","Source declares more bytes than permitted");
 let total=0;
 try{
  for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){
   total+=chunk.length;
   if(total>limit)return fail("SIZE_EXCEEDED","Source sent more bytes than permitted");
   await sink(Buffer.from(chunk));
  }
 }catch(error){
  if(error instanceof ManagedFetchError)throw error;
  return fail("INTERRUPTED","Download failed or was interrupted",error);
 }
}
async function collect(fetchImpl:typeof fetch,url:URL,limit:number,timeoutMs:number,signal?:AbortSignal):Promise<Buffer>{
 const chunks:Buffer[]=[];
 await download(fetchImpl,url,limit,timeoutMs,signal,async chunk=>{chunks.push(chunk);});
 return Buffer.concat(chunks);
}

/** Removes only abandoned asen download work directories (never a fresh one that may belong to another process). */
export async function pruneStaleManagedDownloads(downloadsRoot:string,now=Date.now()):Promise<string[]>{
 const removed:string[]=[];
 let names:string[];
 try{names=await readdir(downloadsRoot);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return removed;throw error;}
 for(const name of names){
  if(!/^dl-[0-9a-f-]{36}$/u.test(name))continue;
  const target=path.join(downloadsRoot,name);
  const info=await stat(target).catch(()=>undefined);
  if(info?.isDirectory()&&now-info.mtimeMs>STALE_DOWNLOAD_MS){await rm(target,{recursive:true,force:true});removed.push(target);}
 }
 return removed;
}

/**
 * Fetches a signed manifest first, authenticates it against the explicit trust anchor, and only then
 * downloads declared files. Files land as private `.part` data and are published (renamed) only
 * after exact size and SHA-256 agreement. Any failure removes the whole private work directory.
 */
export async function fetchManagedAcquisition(request:ManagedFetchRequest):Promise<ManagedFetchResult>{
 const base=validateManagedSourceUrl(request.baseUrl),fetchImpl=request.fetchImpl??fetch,timeoutMs=request.timeoutMs??MANAGED_DOWNLOAD_TIMEOUT_MS;
 if(!path.isAbsolute(request.downloadsRoot))fail("INVALID_SOURCE","Downloads root must be absolute");
 await mkdir(request.downloadsRoot,{recursive:true,mode:0o700});
 await pruneStaleManagedDownloads(request.downloadsRoot);
 const workRoot=path.join(request.downloadsRoot,`dl-${randomUUID()}`),packageRoot=path.join(workRoot,"package");
 await mkdir(packageRoot,{recursive:true,mode:0o700});
 const cleanup=async()=>{await rm(workRoot,{recursive:true,force:true});};
 try{
  const manifestBytes=await collect(fetchImpl,new URL(MANAGED_MANIFEST_NAME,base),MANAGED_MANIFEST_MAX_BYTES,timeoutMs,request.signal);
  const signatureText=(await collect(fetchImpl,new URL(MANAGED_SIGNATURE_NAME,base),64*1024,timeoutMs,request.signal)).toString("utf8");
  const authentic=verifyManagedManifestSignature({manifestBytes,signatureText,trustedKeys:request.trustedKeys});
  const manifest=decodeManagedAcquisitionManifest(JSON.parse(manifestBytes.toString("utf8")));
  let declaredTotal=0;
  for(const file of manifest.files){
   if(file.size>MANAGED_ACQUISITION_MAX_FILE_BYTES)fail("SIZE_EXCEEDED","Declared file exceeds the per-file bound");
   declaredTotal+=file.size;
  }
  if(declaredTotal>MANAGED_ACQUISITION_MAX_TOTAL_BYTES)fail("SIZE_EXCEEDED","Declared package exceeds the total bound");
  for(const file of manifest.files){
   const target=path.join(packageRoot,...file.sourcePath.split("/")),part=`${target}.${randomUUID()}.part`;
   await mkdir(path.dirname(target),{recursive:true,mode:0o700});
   const url=new URL(file.sourcePath.split("/").map(encodeURIComponent).join("/"),base);
   if(!url.pathname.startsWith(base.pathname))fail("INVALID_SOURCE","File URL escaped the source prefix");
   const hash=createHash("sha256"),handle=await open(part,"wx",0o600);
   let written=0;
   try{
    await download(fetchImpl,url,file.size,timeoutMs,request.signal,async chunk=>{hash.update(chunk);written+=chunk.length;await handle.write(chunk);});
    await handle.sync();
   }finally{await handle.close();}
   if(written!==file.size||hash.digest("hex")!==file.sha256)fail("CONTENT_MISMATCH",`Downloaded bytes do not match the signed manifest: ${file.sourcePath}`);
   await rename(part,target);
  }
  return Object.freeze({workRoot,packageRoot,manifestBytes,manifest,keyId:authentic.keyId,cleanup});
 }catch(error){
  await cleanup();
  throw error;
 }
}
