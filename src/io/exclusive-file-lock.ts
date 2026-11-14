import {randomUUID} from "node:crypto";
import {closeSync,fsyncSync,linkSync,lstatSync,openSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from "node:fs";
import {link,lstat,open,readFile,rename,rm,stat} from "node:fs/promises";

const delay=(ms:number):Promise<void>=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function abortError():Error{const error=new Error("File lock wait cancelled");error.name="AbortError";return error;}
function throwIfAborted(signal?:AbortSignal):void{if(signal?.aborted)throw abortError();}
function abortableDelay(ms:number,signal?:AbortSignal):Promise<void>{
 if(!signal)return delay(ms);
 throwIfAborted(signal);
 return new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>{signal.removeEventListener("abort",onAbort);resolve();},ms);
  const onAbort=()=>{clearTimeout(timer);signal.removeEventListener("abort",onAbort);reject(abortError());};
  signal.addEventListener("abort",onAbort,{once:true});
  if(signal.aborted)onAbort();
 });
}
const syncDelayState=new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const syncDelay=(ms:number)=>Atomics.wait(syncDelayState,0,0,ms);
function alive(pid:number):boolean{try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==="EPERM";}}
function validateTimeout(timeoutMs:number):void{if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error("Invalid file lock timeout");}
function staleDeadOwner(raw:string):boolean{
 try{const owner=JSON.parse(raw) as {pid?:unknown;createdAt?:unknown};return Number.isSafeInteger(owner.pid)&&(owner.pid as number)>0&&Number.isSafeInteger(owner.createdAt)&&Date.now()-(owner.createdAt as number)>30000&&!alive(owner.pid as number);}catch{return false;}
}
const unsupportedHardLinkDiagnostic="Atomic file locking requires hard-link support from the storage filesystem";
const definitiveUnsupportedHardLinkCodes=new Set(["ENOSYS","ENOTSUP","EOPNOTSUPP","EXDEV"]);
function unsupportedHardLinkError(cause:unknown):Error{return new Error(unsupportedHardLinkDiagnostic,{cause});}
async function classifyClaimError(error:Error,temporary:string,lock:string):Promise<Error>{
 const code=(error as NodeJS.ErrnoException).code;
 if(definitiveUnsupportedHardLinkCodes.has(code??""))return unsupportedHardLinkError(error);
 if(process.platform!=="win32"||code!=="EISDIR")return error;
 try{
  if(!(await lstat(temporary)).isFile())return error;
  try{await lstat(lock);return error;}catch(destinationError){return (destinationError as NodeJS.ErrnoException).code==="ENOENT"?unsupportedHardLinkError(error):error;}
 }catch{return error;}
}
function classifyClaimErrorSync(error:Error,temporary:string,lock:string):Error{
 const code=(error as NodeJS.ErrnoException).code;
 if(definitiveUnsupportedHardLinkCodes.has(code??""))return unsupportedHardLinkError(error);
 if(process.platform!=="win32"||code!=="EISDIR")return error;
 try{
  if(!lstatSync(temporary).isFile())return error;
  try{lstatSync(lock);return error;}catch(destinationError){return (destinationError as NodeJS.ErrnoException).code==="ENOENT"?unsupportedHardLinkError(error):error;}
 }catch{return error;}
}
async function createAndClaim(lock:string,token:string):Promise<void>{
 const temporary=`${lock}.claim-${token}-${randomUUID()}`;let handle:Awaited<ReturnType<typeof open>>|undefined,created=false,closed=false;
 try{
  handle=await open(temporary,"wx",0o600);created=true;
  await handle.writeFile(JSON.stringify({pid:process.pid,token,createdAt:Date.now()}));await handle.sync();await handle.close();closed=true;
 }catch(error){if(handle&&!closed)try{await handle.close();}catch{/* Preserve the initialization failure. */}if(created)try{await rm(temporary,{force:true});}catch{/* Preserve the initialization failure. */}throw error;}
 try{await link(temporary,lock);}catch(error){const claimError=await classifyClaimError(error as Error,temporary,lock);try{await rm(temporary,{force:true});}catch{/* Preserve the claim failure. */}throw claimError;}
 try{await rm(temporary,{force:true});}catch{/* An owned orphan cannot block the canonical lock. */}
}
function createAndClaimSync(lock:string,token:string):void{
 const temporary=`${lock}.claim-${token}-${randomUUID()}`;let fd:number|undefined,created=false,closed=false;
 try{
  fd=openSync(temporary,"wx",0o600);created=true;
  writeFileSync(fd,JSON.stringify({pid:process.pid,token,createdAt:Date.now()}));fsyncSync(fd);closeSync(fd);closed=true;
 }catch(error){if(fd!==undefined&&!closed)try{closeSync(fd);}catch{/* Preserve the initialization failure. */}if(created)try{rmSync(temporary,{force:true});}catch{/* Preserve the initialization failure. */}throw error;}
 try{linkSync(temporary,lock);}catch(error){const claimError=classifyClaimErrorSync(error as Error,temporary,lock);try{rmSync(temporary,{force:true});}catch{/* Preserve the claim failure. */}throw claimError;}
 try{rmSync(temporary,{force:true});}catch{/* An owned orphan cannot block the canonical lock. */}
}

/** A bounded cross-process lock for small private JSON transactions. */
export async function withExclusiveFileLock<T>(target:string,operation:()=>Promise<T>,timeoutMs=30000,signal?:AbortSignal):Promise<T>{
 validateTimeout(timeoutMs);
 const lock=`${target}.lock`,token=randomUUID(),deadline=Date.now()+timeoutMs;let held=false,sawContention=false,createRaceRetried=false,inspectionPermissionError:NodeJS.ErrnoException|undefined;
 while(!held){
  throwIfAborted(signal);
  try{await createAndClaim(lock,token);held=true;}
  catch(error){
   const code=(error as NodeJS.ErrnoException).code;
   if(code!=="EEXIST"){
    if((code==="EPERM"||code==="EACCES")&&sawContention&&!createRaceRetried){
     try{await lstat(lock);}catch(metadataError){
      if((metadataError as NodeJS.ErrnoException).code==="ENOENT"){createRaceRetried=true;await abortableDelay(10,signal);continue;}
     }
    }
    throw error;
   }
   sawContention=true;
   try{
    const raw=await readFile(lock,"utf8");
    if(staleDeadOwner(raw)){
     const before=await stat(lock),again=await readFile(lock,"utf8");
     if(raw===again){const after=await stat(lock);if(before.ino===after.ino&&before.mtimeMs===after.mtimeMs)await rm(lock,{force:true});}
    }
   }catch(error){
    const code=(error as NodeJS.ErrnoException).code;
    if(code==="EPERM"||code==="EACCES"){
     if(inspectionPermissionError)throw inspectionPermissionError;
     inspectionPermissionError=error as NodeJS.ErrnoException;
    }else if(code!=="ENOENT"&&!(error instanceof SyntaxError))throw error;
   }
   if(Date.now()>=deadline)throw new Error("Timed out waiting for private store lock");
   await abortableDelay(10,signal);
  }
 }
 try{throwIfAborted(signal);return await operation();}
 finally{try{const owner=JSON.parse(await readFile(lock,"utf8")) as {token?:unknown};if(owner.token===token){const released=`${lock}.release-${token}`;await rename(lock,released);await rm(released,{force:true});}}catch(error){void error;}}
}

/** Synchronous counterpart for constructor-time transitions that cannot yield a partially initialized object. */
export function withExclusiveFileLockSync<T>(target:string,operation:()=>T,timeoutMs=5000):T{
 validateTimeout(timeoutMs);
 const lock=`${target}.lock`,token=randomUUID(),deadline=Date.now()+timeoutMs;let held=false,sawContention=false,createRaceRetried=false,inspectionPermissionError:NodeJS.ErrnoException|undefined;
 while(!held){
  try{createAndClaimSync(lock,token);held=true;}catch(error){
   const code=(error as NodeJS.ErrnoException).code;
   if(code!=="EEXIST"){
    if((code==="EPERM"||code==="EACCES")&&sawContention&&!createRaceRetried){
     try{lstatSync(lock);}catch(metadataError){if((metadataError as NodeJS.ErrnoException).code==="ENOENT"){createRaceRetried=true;syncDelay(10);continue;}}
    }
    throw error;
   }
   sawContention=true;
   try{
    const raw=readFileSync(lock,"utf8");
    if(staleDeadOwner(raw)){
     const before=statSync(lock),again=readFileSync(lock,"utf8");
     if(raw===again){const after=statSync(lock);if(before.ino===after.ino&&before.mtimeMs===after.mtimeMs)rmSync(lock,{force:true});}
    }
   }catch(error){
    const code=(error as NodeJS.ErrnoException).code;
    if(code==="EPERM"||code==="EACCES"){
     if(inspectionPermissionError)throw inspectionPermissionError;
     inspectionPermissionError=error as NodeJS.ErrnoException;
    }else if(code!=="ENOENT"&&!(error instanceof SyntaxError))throw error;
   }
   if(Date.now()>=deadline)throw new Error("Timed out waiting for private store lock");
   syncDelay(10);
  }
 }
 try{return operation();}
 finally{try{const owner=JSON.parse(readFileSync(lock,"utf8")) as {token?:unknown};if(owner.token===token){const released=`${lock}.release-${token}`;renameSync(lock,released);rmSync(released,{force:true});}}catch(error){void error;}}
}
