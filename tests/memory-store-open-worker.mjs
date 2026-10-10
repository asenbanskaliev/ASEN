import {randomUUID} from "node:crypto";
import {closeSync,fsyncSync,openSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {parentPort,workerData} from "node:worker_threads";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.ts";

const gate=new Int32Array(workerData.gate);
if(workerData.mode==="holder"){
 const lock=`${workerData.path}.lock`,token=randomUUID(),fd=openSync(lock,"wx",0o600);
 try{writeFileSync(fd,JSON.stringify({pid:process.pid,token,createdAt:Date.now()}));fsyncSync(fd);}finally{closeSync(fd);}
 parentPort?.postMessage({phase:"holder:acquired"});
 while(Atomics.load(gate,0)===0)Atomics.wait(gate,0,0,10000);
 const owner=JSON.parse(readFileSync(lock,"utf8"));
 if(owner.token===token){const released=`${lock}.release-${token}`;renameSync(lock,released);rmSync(released,{force:true});}
 parentPort?.postMessage({phase:"holder:released"});
}else{
 let phase="startup:waiting";
 if(workerData.mode==="opener"){
  parentPort?.postMessage({phase:"startup:ready"});
  while(Atomics.load(gate,0)===0)Atomics.wait(gate,0,0,10000);
  phase="startup:enter-constructor";parentPort?.postMessage({phase});
 }else{
  Atomics.add(gate,0,1);Atomics.notify(gate,0);
  while(Atomics.load(gate,0)<2)Atomics.wait(gate,0,1,10000);
  phase="startup:enter-constructor";
 }
 try{
  const store=new SqliteMemoryStore(workerData.path);
  phase="write:register-session";store.registerSession("parallel",workerData.id);
  phase="write:save";store.save({id:workerData.id,projectId:"parallel",sessionId:workerData.id,kind:"decision",content:workerData.id,createdAt:workerData.id});
  phase="close";store.close();parentPort?.postMessage({ok:true});
 }catch(error){parentPort?.postMessage({ok:false,phase,error:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:undefined});}
}
