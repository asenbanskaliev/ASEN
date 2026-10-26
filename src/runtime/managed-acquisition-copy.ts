import {createHash} from "node:crypto";
import {constants,type BigIntStats} from "node:fs";
import {lstat,mkdir,open,realpath,type FileHandle} from "node:fs/promises";
import path from "node:path";
import {performance} from "node:perf_hooks";
import type {ManagedAcquisitionManifest} from "./managed-install.js";
import {
 MANAGED_ACQUISITION_DEADLINE_MS,
 MANAGED_ACQUISITION_MAX_FILE_BYTES,
 MANAGED_ACQUISITION_MAX_TOTAL_BYTES,
 MANAGED_ACQUISITION_READ_CHUNK_BYTES,
} from "./managed-acquisition-verification.js";

export class ManagedAcquisitionCopyError extends Error {
 constructor(message:string,options?:ErrorOptions){
  super(message,options);
  this.name="ManagedAcquisitionCopyError";
 }
}

type Seen={
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

export type ManagedAcquisitionDestinationDirectoryClaim=Readonly<{
 canonicalPath:string;
 dev:bigint;
 ino:bigint;
 mode:bigint;
 nlink:bigint;
}>;
export type ManagedAcquisitionDestinationClaim=Readonly<{
 canonicalPath:string;
 dev:bigint;
 ino:bigint;
 mode:bigint;
 nlink:bigint;
 bytesWritten:number;
 sha256:string;
}>;

function fail(message:string,cause?:unknown):never{
 throw new ManagedAcquisitionCopyError(message,cause===undefined?undefined:{cause});
}

function supported(stats:{dev:unknown;ino:unknown}):stats is {dev:bigint;ino:bigint}{
 return typeof stats.dev==="bigint"&&stats.dev>=0n&&typeof stats.ino==="bigint"&&stats.ino>0n;
}

function within(root:string,value:string):boolean{
 const relative=path.relative(root,value);
 return relative===""||(!path.isAbsolute(relative)&&relative!==".."&&!relative.startsWith(`..${path.sep}`));
}

function same(left:Seen,right:Seen):boolean{
 return left.absolute===right.absolute
  &&left.canonical===right.canonical
  &&left.kind===right.kind
  &&left.dev===right.dev
  &&left.ino===right.ino
  &&left.nlink===right.nlink
  &&left.mode===right.mode
  &&left.size===right.size
  &&left.mtimeNs===right.mtimeNs
  &&left.ctimeNs===right.ctimeNs
  &&left.birthtimeNs===right.birthtimeNs;
}

function checkDeadline(start:number):void{
 if(performance.now()-start>MANAGED_ACQUISITION_DEADLINE_MS){
  fail("Managed acquisition copy exceeded its cooperative deadline");
 }
}

async function progress<T>(start:number,operation:()=>Promise<T>):Promise<T>{
 checkDeadline(start);
 try{
  const value=await operation();
  checkDeadline(start);
  return value;
 }catch(error){
  checkDeadline(start);
  throw error;
 }
}

async function observe(absolute:string,kind:"directory"|"file",start:number,root?:string):Promise<Seen>{
 let stats:BigIntStats;
 let canonical:string;
 try{
  stats=await progress(start,()=>lstat(absolute,{bigint:true}));
  if(stats.isSymbolicLink())fail(`Managed acquisition copy path is linked: ${absolute}`);
  canonical=await progress(start,()=>realpath(absolute));
 }catch(error){
  if(error instanceof ManagedAcquisitionCopyError)throw error;
  return fail(`Managed acquisition copy path is unavailable: ${absolute}`,error);
 }
 if(!supported(stats))fail(`Managed acquisition copy identity is unavailable: ${absolute}`);
 if(kind==="directory"&&!stats.isDirectory())fail(`Managed acquisition copy ancestor is not a directory: ${absolute}`);
 if(kind==="file"&&(!stats.isFile()||stats.nlink!==1n))fail(`Managed acquisition copy source is not an unlinked regular file: ${absolute}`);
 if(root&&!within(root,canonical))fail(`Managed acquisition copy path escapes its root: ${absolute}`);
 return {
  absolute,canonical,kind,
  dev:stats.dev,ino:stats.ino,nlink:stats.nlink,mode:stats.mode,size:stats.size,
  mtimeNs:stats.mtimeNs,ctimeNs:stats.ctimeNs,birthtimeNs:stats.birthtimeNs,
 };
}

async function sourceUnchanged(item:Seen,start:number,root?:string):Promise<void>{
 if(!same(item,await observe(item.absolute,item.kind,start,root))){
  fail(`Managed acquisition copy path changed: ${item.absolute}`);
 }
}

async function destinationUnchanged(item:Seen,start:number,root?:string):Promise<void>{
 const current=await observe(item.absolute,item.kind,start,root);
 if(item.absolute!==current.absolute
  ||item.canonical!==current.canonical
  ||item.kind!==current.kind
  ||item.dev!==current.dev
  ||item.ino!==current.ino
  ||item.nlink!==current.nlink
  ||item.mode!==current.mode){
  fail(`Managed acquisition copy destination ancestor changed: ${item.absolute}`);
 }
}

function descriptorMatches(item:Seen,stats:BigIntStats):boolean{
 return supported(stats)
  &&stats.isFile()
  &&stats.dev===item.dev
  &&stats.ino===item.ino
  &&stats.nlink===1n
  &&stats.mode===item.mode
  &&stats.size===item.size
  &&stats.mtimeNs===item.mtimeNs
  &&stats.ctimeNs===item.ctimeNs
  &&stats.birthtimeNs===item.birthtimeNs;
}

async function close(handle:FileHandle|undefined,noun:string,start:number):Promise<void>{
 if(!handle)return;
 try{await handle.close();}
 catch(error){fail(`Managed acquisition ${noun} descriptor could not be closed`,error);}
 try{checkDeadline(start);}
 catch(error){fail(`Managed acquisition copy exceeded its cooperative deadline after ${noun} descriptor closed`,error);}
}

async function revalidateAncestors(
 sourceAncestors:ReadonlyMap<string,Seen>,
 destinationAncestors:ReadonlyMap<string,Seen>,
 sourceRoot:Seen,
 destinationRoot:Seen,
 start:number,
):Promise<void>{
 for(const item of sourceAncestors.values()){
  await sourceUnchanged(item,start,item===sourceRoot?undefined:sourceRoot.canonical);
 }
 for(const item of destinationAncestors.values()){
  await destinationUnchanged(item,start,item===destinationRoot?undefined:destinationRoot.canonical);
 }
}

export async function verifyManagedAcquisitionDestinationDirectoryClaim(
 absolute:string,
 claim:ManagedAcquisitionDestinationDirectoryClaim,
):Promise<boolean>{
 try{
  const item=await observe(absolute,"directory",performance.now());
  return item.canonical===claim.canonicalPath&&item.dev===claim.dev&&item.ino===claim.ino&&item.mode===claim.mode&&item.nlink===claim.nlink;
 }catch{return false;}
}

/** Rechecks only the bounded prefix that the copier proved it wrote. */
export async function verifyManagedAcquisitionDestinationClaim(
 absolute:string,
 claim:ManagedAcquisitionDestinationClaim,
):Promise<boolean>{
 if(!Number.isSafeInteger(claim.bytesWritten)||claim.bytesWritten<0||claim.bytesWritten>MANAGED_ACQUISITION_MAX_FILE_BYTES)return false;
 const start=performance.now();
 let handle:FileHandle|undefined;
 let failure:unknown;
 let matched=false;
 try{
  const item=await observe(absolute,"file",start);
  if(item.canonical!==claim.canonicalPath||item.dev!==claim.dev||item.ino!==claim.ino||item.mode!==claim.mode||item.nlink!==claim.nlink)return false;
  await progress(start,async()=>{handle=await open(absolute,constants.O_RDONLY|(process.platform==="win32"?0:(constants.O_NOFOLLOW|constants.O_NONBLOCK)));});
  const opened=await progress(start,()=>handle!.stat({bigint:true}));
  if(!supported(opened)||!opened.isFile()||opened.dev!==claim.dev||opened.ino!==claim.ino||opened.mode!==claim.mode||opened.nlink!==claim.nlink)throw new Error("Managed acquisition cleanup descriptor identity changed");
  const hash=createHash("sha256"),buffer=Buffer.allocUnsafe(Math.min(MANAGED_ACQUISITION_READ_CHUNK_BYTES,claim.bytesWritten+1||1));
  let offset=0;
  for(;;){
   const remaining=claim.bytesWritten-offset;
   const {bytesRead}=await progress(start,()=>handle!.read(buffer,0,Math.min(buffer.length,remaining+1),null));
   if(bytesRead===0){matched=offset===claim.bytesWritten;break;}
   if(bytesRead>remaining){matched=false;break;}
   hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;
  }
  matched=matched&&hash.digest("hex")===claim.sha256;
 }catch(error){failure=error;}
 try{await close(handle,"cleanup source",start);}catch(error){failure=failure?new AggregateError([failure,error],"Managed acquisition cleanup verification failed",{cause:failure}):error;}
 if(failure||!matched)return false;
 try{
  const after=await observe(absolute,"file",start);
  return after.canonical===claim.canonicalPath&&after.dev===claim.dev&&after.ino===claim.ino&&after.mode===claim.mode&&after.nlink===claim.nlink&&after.size===BigInt(claim.bytesWritten);
 }catch{return false;}
}

/** Copies only declared bytes into a fresh private stage; it grants no install authority. */
export async function copyManagedAcquisitionToStage(
 packageRoot:string,
 stageRoot:string,
 manifest:ManagedAcquisitionManifest,
 onDestinationProgress?:(absolute:string,claim:ManagedAcquisitionDestinationClaim)=>void,
 onDestinationDirectoryOwned?:(absolute:string,claim:ManagedAcquisitionDestinationDirectoryClaim)=>void,
):Promise<void>{
 let total=0;
 for(const file of manifest.files){
  if(file.size>MANAGED_ACQUISITION_MAX_FILE_BYTES){
   fail(`Managed acquisition file exceeds ${MANAGED_ACQUISITION_MAX_FILE_BYTES} bytes: ${file.sourcePath}`);
  }
  total+=file.size;
  if(total>MANAGED_ACQUISITION_MAX_TOTAL_BYTES){
   fail(`Managed acquisition total exceeds ${MANAGED_ACQUISITION_MAX_TOTAL_BYTES} bytes`);
  }
 }

 const start=performance.now();
 const sourceRoot=await observe(packageRoot,"directory",start);
 const destinationRoot=await observe(stageRoot,"directory",start);
 const sourceAncestors=new Map<string,Seen>([[packageRoot,sourceRoot]]);
 const destinationAncestors=new Map<string,Seen>([[stageRoot,destinationRoot]]);
 onDestinationDirectoryOwned?.(stageRoot,{canonicalPath:destinationRoot.canonical,dev:destinationRoot.dev,ino:destinationRoot.ino,mode:destinationRoot.mode,nlink:destinationRoot.nlink});
 const portable=process.platform==="win32"?0:(constants.O_NOFOLLOW|constants.O_NONBLOCK);

 for(const file of manifest.files){
  const source=path.join(packageRoot,...file.sourcePath.split("/"));
  const destination=path.join(stageRoot,...file.destinationPath.split("/"));
  let sourceParent=packageRoot;
  let destinationParent=stageRoot;

  for(const part of file.sourcePath.split("/").slice(0,-1)){
   sourceParent=path.join(sourceParent,part);
   if(!sourceAncestors.has(sourceParent)){
    sourceAncestors.set(sourceParent,await observe(sourceParent,"directory",start,sourceRoot.canonical));
   }
  }
  for(const part of file.destinationPath.split("/").slice(0,-1)){
   destinationParent=path.join(destinationParent,part);
   if(!destinationAncestors.has(destinationParent)){
    await progress(start,()=>mkdir(destinationParent));
    const owned=await observe(destinationParent,"directory",start,destinationRoot.canonical);
    destinationAncestors.set(destinationParent,owned);
    onDestinationDirectoryOwned?.(destinationParent,{canonicalPath:owned.canonical,dev:owned.dev,ino:owned.ino,mode:owned.mode,nlink:owned.nlink});
   }
  }

  const sourceSeen=await observe(source,"file",start,sourceRoot.canonical);
  if(sourceSeen.size!==BigInt(file.size)){
   fail(`Managed acquisition size does not match its declaration: ${file.sourcePath}`);
  }

  let input:FileHandle|undefined;
  let output:FileHandle|undefined;
  let operationError:unknown;
  try{
   await progress(start,async()=>{input=await open(source,constants.O_RDONLY|portable);});
   const inputStats=await progress(start,()=>input!.stat({bigint:true}));
   if(!supported(inputStats))fail(`Managed acquisition source descriptor identity is unavailable: ${file.sourcePath}`);
   if(!descriptorMatches(sourceSeen,inputStats))fail(`Managed acquisition source changed before copy: ${file.sourcePath}`);

   await progress(start,async()=>{output=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|portable,0o600);});
   const outputInitial=await progress(start,()=>output!.stat({bigint:true}));
   if(!supported(outputInitial)||!outputInitial.isFile()||outputInitial.nlink!==1n){
    fail(`Managed acquisition destination descriptor identity is unavailable: ${file.destinationPath}`);
   }
   const baseClaim={canonicalPath:path.resolve(destination),dev:outputInitial.dev,ino:outputInitial.ino,mode:outputInitial.mode,nlink:outputInitial.nlink};
   const buffer=Buffer.allocUnsafe(Math.min(MANAGED_ACQUISITION_READ_CHUNK_BYTES,file.size+1||1));
   const hash=createHash("sha256"),destinationHash=createHash("sha256");
   let offset=0,destinationBytes=0;
   onDestinationProgress?.(destination,{...baseClaim,bytesWritten:0,sha256:destinationHash.copy().digest("hex")});
   for(;;){
    const remaining=file.size-offset;
    const {bytesRead}=await progress(start,()=>input!.read(buffer,0,Math.min(buffer.length,remaining+1),null));
    if(bytesRead===0){
     if(offset!==file.size)fail(`Managed acquisition source ended before its declared size: ${file.sourcePath}`);
     break;
    }
    if(bytesRead>remaining)fail(`Managed acquisition source grew beyond its declared size: ${file.sourcePath}`);
    hash.update(buffer.subarray(0,bytesRead));
    let written=0;
    while(written<bytesRead){
     const result=await progress(start,()=>output!.write(buffer,written,bytesRead-written,null));
     if(result.bytesWritten<1)fail(`Managed acquisition destination made no write progress: ${file.destinationPath}`);
     destinationHash.update(buffer.subarray(written,written+result.bytesWritten));
     destinationBytes+=result.bytesWritten;
     onDestinationProgress?.(destination,{...baseClaim,bytesWritten:destinationBytes,sha256:destinationHash.copy().digest("hex")});
     written+=result.bytesWritten;
    }
    offset+=bytesRead;
   }
   if(hash.digest("hex")!==file.sha256){
    fail(`Managed acquisition sha256 does not match its declaration: ${file.sourcePath}`);
   }
   await progress(start,()=>output!.sync());
   const outputAfter=await progress(start,()=>output!.stat({bigint:true}));
   if(!supported(outputAfter)
    ||!outputAfter.isFile()
    ||outputAfter.nlink!==1n
    ||outputAfter.dev!==outputInitial.dev
    ||outputAfter.ino!==outputInitial.ino
    ||outputAfter.size!==BigInt(file.size)){
    fail(`Managed acquisition destination changed during copy: ${file.destinationPath}`);
   }
  }catch(error){operationError=error;}
  const closeErrors:unknown[]=[];
  try{await close(output,"destination",start);}catch(error){closeErrors.push(error);}
  try{await close(input,"source",start);}catch(error){closeErrors.push(error);}
  if(operationError&&closeErrors.length)throw new AggregateError([operationError,...closeErrors],"Managed acquisition copy and descriptor closure failed",{cause:operationError});
  if(operationError)throw operationError;
  if(closeErrors.length===1)throw closeErrors[0];
  if(closeErrors.length>1)throw new AggregateError(closeErrors,"Managed acquisition descriptors could not be closed",{cause:closeErrors[0]});

  await sourceUnchanged(sourceSeen,start,sourceRoot.canonical);
  await revalidateAncestors(sourceAncestors,destinationAncestors,sourceRoot,destinationRoot,start);
  const installed=await observe(destination,"file",start,destinationRoot.canonical);
  if(installed.size!==BigInt(file.size)||(installed.dev===sourceSeen.dev&&installed.ino===sourceSeen.ino)){
   fail(`Managed acquisition destination identity is invalid: ${file.destinationPath}`);
  }
 }
 await revalidateAncestors(sourceAncestors,destinationAncestors,sourceRoot,destinationRoot,start);
}
