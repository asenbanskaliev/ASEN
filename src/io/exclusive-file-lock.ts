import {randomUUID} from "node:crypto";
import {open,readFile,rm,stat} from "node:fs/promises";

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function alive(pid:number):boolean{try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==="EPERM";}}

/** A bounded cross-process lock for small private JSON transactions. */
export async function withExclusiveFileLock<T>(target:string,operation:()=>Promise<T>,timeoutMs=5000):Promise<T>{
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error("Invalid file lock timeout");
 const lock=`${target}.lock`,token=randomUUID(),deadline=Date.now()+timeoutMs;let held=false,inspectionPermissionError:NodeJS.ErrnoException|undefined;
 while(!held){
  try{const handle=await open(lock,"wx",0o600);try{await handle.writeFile(JSON.stringify({pid:process.pid,token,createdAt:Date.now()}));await handle.sync();}finally{await handle.close();}held=true;}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;
   try{
    const raw=await readFile(lock,"utf8"),owner=JSON.parse(raw) as {pid?:unknown;createdAt?:unknown};
    if(Number.isSafeInteger(owner.pid)&&(owner.pid as number)>0&&Number.isSafeInteger(owner.createdAt)&&Date.now()-(owner.createdAt as number)>30000&&!alive(owner.pid as number)){
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
   await delay(10);
  }
 }
 try{return await operation();}
 finally{try{const owner=JSON.parse(await readFile(lock,"utf8")) as {token?:unknown};if(owner.token===token)await rm(lock,{force:true});}catch{}}
}
