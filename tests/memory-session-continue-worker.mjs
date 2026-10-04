import {parentPort,workerData} from "node:worker_threads";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.ts";

const gate=new Int32Array(workerData.gate);
const store=new SqliteMemoryStore(workerData.path);
Atomics.add(gate,0,1);Atomics.notify(gate,0);
while(Atomics.load(gate,0)<2)Atomics.wait(gate,0,1,10000);
try{
 const sessionId=store.continueSession("project-race","root-race",workerData.proposedSessionId);
 store.close();parentPort?.postMessage({ok:true,sessionId});
}catch(error){try{store.close();}catch{/* Preserve the continuation failure. */}parentPort?.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
