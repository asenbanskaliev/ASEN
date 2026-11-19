import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";

test("G49-B dos exploraciones independientes comienzan de verdad en paralelo y terminan separadas",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-b-concurrencia-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 const session={sessionId:"padre-paralelo",projectId:root};
 let active=0,maxActive=0,started=0;
 let bothStarted!:(value:void)=>void,release!:(value:void)=>void;
 const concurrent=new Promise<void>(resolve=>{bothStarted=resolve;});
 const stop=new Promise<void>(resolve=>{release=resolve;});
 const received:string[]=[];
 const runtime=await AgentRuntime.open({
  storeFile:join(root,"agents.json"),maxConcurrency:2,
  runner:{run:async(request:{id:string;prompt:string})=>{
   received.push(request.prompt);
   active++;maxActive=Math.max(active,maxActive);
   if(++started===2)bothStarted();
   try{await stop;return{id:request.id,ok:true,output:"Lectura completada en su sesión propia"};}
   finally{active--;}
  }} as never,
 });
 t.after(()=>release());
 const [first,second]=await Promise.all([
  runtime.startReadOnly({role:"explorer",prompt:"Estudiar módulo A",session}),
  runtime.startReadOnly({role:"explorer",prompt:"Estudiar módulo B",session}),
 ]);
 assert.notEqual(first,second);
 await Promise.race([concurrent,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Dos agentes no se ejecutaron en paralelo")),5000))]);
 assert.equal(maxActive,2);
 assert.deepEqual(received.sort(),["Estudiar módulo A","Estudiar módulo B"]);
 const running=await runtime.list(session);
 assert.equal(running.filter(r=>r.state==="running").length,2);
 release();
 for(let attempt=0;attempt<200;attempt++){
  const states=(await runtime.list(session)).map(r=>r.state);
  if(states.length===2&&states.every(s=>s==="completed"))break;
  await new Promise(resolve=>setTimeout(resolve,15));
 }
 assert.deepEqual((await runtime.list(session)).map(r=>r.state),["completed","completed"]);
 assert.equal(active,0);
 assert.equal(maxActive,2,"el despachador ejecutó dos hijos a la vez, no dos simulaciones consecutivas");
});
