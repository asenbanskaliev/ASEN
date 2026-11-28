import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {performance} from "node:perf_hooks";
import {AgentRuntime} from "../src/agents/agent-runtime.js";

const workload=[
 {prompt:"Estudiar módulo A",output:"Lectura del módulo A completada"},
 {prompt:"Estudiar módulo B",output:"Lectura del módulo B completada"},
] as const;

function barrier(){
 let release!:()=>void;
 const promise=new Promise<void>(resolve=>{release=resolve;});
 return {promise,release};
}

async function guarded<T>(promise:Promise<T>,label:string):Promise<T>{
 // Límite de liveness del fixture, no criterio de rendimiento.
 let alarm:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([promise,new Promise<never>((_,reject)=>{
   alarm=setTimeout(()=>reject(new Error(`Barrera del fixture sin resolver: ${label}`)),5000);
  })]);
 }finally{clearTimeout(alarm);}
}

const fixtureJob=(input:typeof workload[number])=>({...input,started:barrier(),finish:barrier()});

for(const slots of [1,2] as const){
 test(`G49-B / M5 P05: dos Explorers con ${slots} plaza(s) de AgentRuntime local`,async (t:TestContext)=>{
  const root=await mkdtemp(join(tmpdir(),"asen-b-concurrencia-"));
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
  const session={sessionId:"padre-paralelo",projectId:root};
  const jobs=[fixtureJob(workload[0]),fixtureJob(workload[1])] as const;
  const starts:{id:string;prompt:string;at:number}[]=[];
  const finishes:number[]=[];
  const terminals:{id:string;state:string;at:number}[]=[];
  const terminalSignals=new Map<string,ReturnType<typeof barrier>>();
  function terminalSignal(id:string){
   let signal=terminalSignals.get(id);
   if(!signal){signal=barrier();terminalSignals.set(id,signal);}
   return signal;
  }
  let active=0,peak=0;
  const openingAt=performance.now();
  const runtime=await AgentRuntime.open({
   storeFile:join(root,"agents.json"),maxConcurrency:slots,
   runner:{run:async request=>{
    const index=jobs.findIndex(job=>job.prompt===request.prompt);
    const job=jobs[index];
    if(!job)throw new Error("El Explorer debe recibir un input del fixture");
    starts.push({id:request.id,prompt:request.prompt,at:performance.now()});
    active++;
    peak=Math.max(active,peak);
    job.started.release();
    try{
     await guarded(job.finish.promise,"liberación del runner");
     return {id:request.id,ok:true,output:job.output};
    }finally{
     finishes[index]=performance.now();
     active--;
    }
   }},
  });
  const openedAt=performance.now();
  const unsubscribe=runtime.subscribeTerminal(record=>{
   terminals.push({id:record.id,state:record.state,at:performance.now()});
   terminalSignal(record.id).release();
  });
  const ids:string[]=[];
  const waitForTerminals=()=>guarded(Promise.all(ids.map(id=>terminalSignal(id).promise)),"terminales persistidos");
  try{
   const start=(prompt:string)=>runtime.startReadOnly({role:"explorer",prompt,session});
   ids.push(await start(jobs[0].prompt));
   // Mismo orden de admisión en ambos casos; A sigue retenido cuando se admite B.
   await guarded(jobs[0].started.promise,"despacho del primer Explorer");
   ids.push(await start(jobs[1].prompt));
   assert.equal(new Set(ids).size,2);
   if(slots===2)await guarded(jobs[1].started.promise,"despacho concurrente del segundo Explorer");
   const initial=await runtime.list(session);
   assert.equal(initial.length,2);
   assert.deepEqual(ids.map(id=>initial.find(record=>record.id===id)?.state),[
    "running",slots===1?"queued":"running",
   ]);
   assert.equal(active,slots);
   jobs.slice(0,slots).forEach(job=>job.finish.release());
   if(slots===1){
    await guarded(jobs[1].started.promise,"despacho del segundo Explorer tras liberar la plaza");
    jobs[1].finish.release();
   }
   await waitForTerminals();

   assert.equal(peak,slots);
   assert.equal(active,0);
   assert.deepEqual(starts.map(({id,prompt})=>({id,prompt})),workload.map(({prompt},index)=>({id:ids[index],prompt})));
   assert.deepEqual(terminals.map(({id})=>id).sort(),[...ids].sort());
   assert.ok(terminals.every(({state})=>state==="completed"));
   const results=await Promise.all(ids.map(id=>runtime.entry(id,session)));
   assert.deepEqual(results.map(entry=>({
    id:entry?.result?.id,state:entry?.record.state,ok:entry?.result?.ok,output:entry?.result?.output,
   })),workload.map(({output},index)=>({id:ids[index],state:"completed",ok:true,output})));
   const [first,second]=starts;
   if(!first||!second)throw new Error("Faltan mediciones de inicio del fixture");
   assert.equal(await runtime.entry(first.id,{...session,sessionId:"otra-sesion"}),undefined);

   t.diagnostic(JSON.stringify({
    evidence:"local-runtime/fixture",slots,jobs:jobs.length,peak,overlap:peak>1,
    openMs:openedAt-openingAt,firstStartMs:first.at-openingAt,
    terminalMs:Math.max(...terminals.map(({at})=>at))-openingAt,
    overlapMs:Math.max(0,Math.min(...finishes)-second.at),
    costUsd:null,costConclusion:"unknown",globalFull:false,
   }));
  }finally{
   // También desatasca al runner si una aserción o una espera falla antes de liberar su barrera.
   jobs.forEach(job=>job.finish.release());
   await waitForTerminals().catch(()=>{}); // Drenaje acotado sin ocultar el error original.
   unsubscribe();
  }
 });
}
