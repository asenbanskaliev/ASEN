import {parentPort,workerData} from "node:worker_threads";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.ts";

const gate=new Int32Array(workerData.gate);
Atomics.add(gate,0,1);Atomics.notify(gate,0);
while(Atomics.load(gate,0)<2)Atomics.wait(gate,0,1,10000);
try{
 const store=new SqliteMemoryStore(workerData.path);
 store.registerSession("parallel",workerData.id);
 store.save({id:workerData.id,projectId:"parallel",sessionId:workerData.id,kind:"decision",content:workerData.id,createdAt:workerData.id});
 store.close();parentPort?.postMessage({ok:true});
}catch(error){parentPort?.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
