import {randomUUID} from "node:crypto";
import type {Stats} from "node:fs";
import {lstat,open,readFile,realpath,unlink} from "node:fs/promises";
import path from "node:path";
import {inspectManagedInstall} from "./managed-install.js";

export interface ManagedMaintenanceLockRequest {
 readonly prefix:string;
 readonly confirmed:boolean;
 /** Acquisition wait only; never a deadline for the active operation. */
 readonly timeoutMs?:number;
 readonly signal?:AbortSignal;
}
export type ManagedMaintenanceLockErrorCode="CONFIRMATION_REQUIRED"|"INVALID_REQUEST"|"OWNED_ROOT_REQUIRED"|"ROOT_CHANGED"|"LOCK_TIMEOUT"|"LOCK_CANCELLED"|"LOCK_INIT_FAILED"|"LOCK_RETAINED";
export class ManagedMaintenanceLockError extends Error {
 constructor(readonly code:ManagedMaintenanceLockErrorCode,message:string,readonly lockPath?:string,options?:ErrorOptions){super(message,options);this.name="ManagedMaintenanceLockError";}
}
const fail=(code:ManagedMaintenanceLockErrorCode,message:string,lockPath?:string,cause?:unknown):never=>{throw new ManagedMaintenanceLockError(code,message,lockPath,{cause});};
const canonical=(value:string)=>process.platform==="win32"?path.resolve(value).toLowerCase():path.resolve(value);
const same=(a:Stats,b:Stats)=>a.dev===b.dev&&a.ino===b.ino&&a.birthtimeMs===b.birthtimeMs;
function cancelled(signal?:AbortSignal):void{if(signal?.aborted)fail("LOCK_CANCELLED","Managed maintenance lock wait cancelled");}
function wait(ms:number,signal?:AbortSignal):Promise<void>{
 cancelled(signal);
 return new Promise((resolve,reject)=>{
  const done=()=>{signal?.removeEventListener("abort",abort);resolve();};
  const timer=setTimeout(done,ms);
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(new ManagedMaintenanceLockError("LOCK_CANCELLED","Managed maintenance lock wait cancelled"));};
  signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
 });
}
async function physicalRoot(root:string):Promise<Stats>{
 const info=await lstat(root);
 if(!info.isDirectory()||info.isSymbolicLink()||canonical(await realpath(root))!==canonical(root))fail("ROOT_CHANGED","Managed maintenance root is not a canonical regular directory");
 return info;
}
async function unchangedRoot(root:string,expected:Stats):Promise<void>{
 if(!same(expected,await physicalRoot(root)))fail("ROOT_CHANGED","Managed maintenance root identity changed");
}
async function stillOwned(prefix:string,root:string,expected:Stats):Promise<void>{
 await unchangedRoot(root,expected);
 const inventory=await inspectManagedInstall({prefix});
 if(inventory.status!=="owned"||canonical(inventory.managedRoot)!==canonical(root))fail("OWNED_ROOT_REQUIRED","Managed maintenance requires an existing owned installation");
 await unchangedRoot(root,expected);
}
async function ownMarker(root:string,rootIdentity:Stats,lock:string,fileIdentity:Stats,bytes:string):Promise<boolean>{
 try{
  await unchangedRoot(root,rootIdentity);
  const before=await lstat(lock);
  if(!before.isFile()||before.isSymbolicLink()||!same(before,fileIdentity)||canonical(await realpath(lock))!==canonical(lock))return false;
  if(await readFile(lock,"utf8")!==bytes)return false;
  const after=await lstat(lock);
  await unchangedRoot(root,rootIdentity);
  return after.isFile()&&!after.isSymbolicLink()&&same(after,fileIdentity)&&before.size===after.size&&before.mtimeMs===after.mtimeMs;
 }catch{return false;}
}

/** Cooperative owned-install mutex. Existing markers are never reclaimed, even for dead PIDs. */
export async function withManagedMaintenanceLock<T>(request:ManagedMaintenanceLockRequest,operation:()=>Promise<T>):Promise<T>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed maintenance requires explicit caller confirmation");
 const timeoutMs=request.timeoutMs??2000;
 if(typeof request.prefix!=="string"||!path.isAbsolute(request.prefix)||typeof operation!=="function"||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail("INVALID_REQUEST","Invalid managed maintenance lock request");
 cancelled(request.signal);
 const prefix=path.resolve(request.prefix),root=path.join(prefix,"install");
 const inventory=await inspectManagedInstall({prefix});
 if(inventory.status!=="owned")fail("OWNED_ROOT_REQUIRED","Managed maintenance requires an existing owned installation");
 const rootIdentity=await physicalRoot(root);
 await stillOwned(prefix,root,rootIdentity);
 const bytes=JSON.stringify({schema:"asen.managed-maintenance-lock/v1",pid:process.pid,token:randomUUID(),createdAt:Date.now()})+"\n";
 const lock=path.join(root,".asen-maintenance.lock"),deadline=performance.now()+timeoutMs;
 let handle:Awaited<ReturnType<typeof open>>;
 for(;;){
  cancelled(request.signal);await unchangedRoot(root,rootIdentity);
  try{handle=await open(lock,"wx",0o600);break;}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;
   const remaining=deadline-performance.now();
   if(remaining<=0)fail("LOCK_TIMEOUT","Timed out waiting for managed maintenance lock",lock);
   await wait(Math.min(10,remaining),request.signal);
   if(performance.now()>=deadline)fail("LOCK_TIMEOUT","Timed out waiting for managed maintenance lock",lock);
  }
 }
 let fileIdentity:Stats|undefined,initializationError:unknown,initializationFailed=false;
 try{fileIdentity=await handle.stat();await handle.writeFile(bytes);await handle.sync();}
 catch(error){initializationFailed=true;initializationError=error;}
 try{await handle.close();}catch(error){initializationError=initializationFailed?new AggregateError([initializationError,error],"Maintenance marker initialization and close failed"):error;initializationFailed=true;}
 if(initializationFailed||!fileIdentity)throw new ManagedMaintenanceLockError("LOCK_INIT_FAILED","Managed maintenance marker initialization failed; marker retained",lock,{cause:initializationError});
 let result:T|undefined,operationError:unknown,operationFailed=false;
 try{
  await stillOwned(prefix,root,rootIdentity);
  if(!await ownMarker(root,rootIdentity,lock,fileIdentity,bytes))fail("LOCK_RETAINED","Managed maintenance marker changed before operation; marker retained",lock);
  cancelled(request.signal);result=await operation();
 }catch(error){operationError=error;operationFailed=true;}
 let releaseError:unknown;
 try{
  if(!await ownMarker(root,rootIdentity,lock,fileIdentity,bytes))fail("LOCK_RETAINED","Managed maintenance marker ownership is uncertain; marker retained",lock);
  await unlink(lock);
 }catch(error){releaseError=new ManagedMaintenanceLockError("LOCK_RETAINED","Managed maintenance marker was not safely released; marker retained or uncertain",lock,{cause:error});}
 if(releaseError){if(operationFailed)throw new AggregateError([operationError,releaseError],"Managed maintenance operation failed and marker release is uncertain",{cause:operationError});throw releaseError;}
 if(operationFailed)throw operationError;
 return result as T;
}
