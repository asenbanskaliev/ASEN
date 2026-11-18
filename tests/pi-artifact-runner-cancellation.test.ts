import test from "node:test";
import assert from "node:assert/strict";
import {PiArtifactRunner,isIssuedAgentArtifactProof} from "../src/agents/pi-artifact-runner.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";
import {createPiRpcFixture} from "./helpers/pi-rpc-fixture.js";

const scenario=`
const emit=x=>process.stdout.write(JSON.stringify(x)+"\\n");
let buffer="";
process.stdin.on("data",chunk=>{
 buffer+=String(chunk);
 let end;
 while((end=buffer.indexOf("\\n"))>=0){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line.trim())continue;
  const request=JSON.parse(line);
  if(request.type!=="prompt")continue;
  emit({type:"response",id:request.id,success:true,command:"prompt"});
  if(request.id==="tarea-sana"){
   emit({type:"message_end",message:{role:"assistant",stopReason:"stop",
    content:[{type:"text",text:JSON.stringify({content:"completado"})}]}});
   emit({type:"agent_end"});
  }else{
   // El proceso solo terminará por cancelación del supervisor o por timeout.
   setInterval(()=>{},1000);
  }
 }
});
process.stdin.on("end",()=>process.exit(0));
`;

test("El adaptador de artefactos propaga la cancelación a Pi real",async t=>{
 const fixture=await createPiRpcFixture(t,scenario);
 let started!:()=>void;
 const processStarted=new Promise<void>(resolve=>{started=resolve;});
 const runner=new PiArtifactRunner(new PiProcessRunner({
  command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],
  noTools:true,timeoutMs:4_000,onProcessStart:()=>started()
 }));
 const controller=new AbortController();
 const pending=runner.run({id:"tarea-cancelada",role:"explorer",
  prompt:"No respondas",repository:fixture.repository},controller.signal);
 let deadline:ReturnType<typeof setTimeout>|undefined;
 const wait=<T>(promise:Promise<T>,ms:number):Promise<T>=>Promise.race([
  promise,new Promise<never>((_resolve,reject)=>{
   deadline=setTimeout(()=>reject(new Error("Pi no canceló antes del timeout")),ms);
  })
 ]);
 t.after(()=>{if(deadline)clearTimeout(deadline);});
 await wait(processStarted,2_500);
 if(deadline)clearTimeout(deadline);
 controller.abort();
 const result=await wait(pending,3_000);
 if(deadline)clearTimeout(deadline);
 assert.equal(result.ok,false);
 assert.equal(result.id,"tarea-cancelada");
 assert.match(result.output,/cancel/u);
 assert.equal(result.artifactProof,undefined);
});

test("Cancelar una sesión no cancela otra y no autoriza artefactos tardíos",async t=>{
 const fixture=await createPiRpcFixture(t,scenario);
 // El proceso auténtico se prueba por separado. Aquí aislamos la
 // concurrencia y la procedencia del artefacto con dos resultados simulados.
 const adapter=new PiArtifactRunner({
  run:async(request:AgentRequest,signal?:AbortSignal)=>{
   if(request.id==="tarea-sana")return {
    id:request.id,ok:true,output:[
     JSON.stringify({type:"response",id:request.id,success:true}),
     JSON.stringify({type:"message_end",message:{role:"assistant",
      stopReason:"stop",content:[{type:"text",
       text:JSON.stringify({content:"completado"})}]}}),
     JSON.stringify({type:"agent_end"})
    ].join("\n")
   };
   return new Promise<{id:string;ok:boolean;output:string}>(resolve=>{
    const cancel=()=>resolve({id:request.id,ok:false,output:"pi process cancelled"});
    if(signal?.aborted)cancel();
    else signal?.addEventListener("abort",cancel,{once:true});
   });
  }
 } as unknown as PiProcessRunner);
 const cancelOne=new AbortController(),keepOther=new AbortController();
 const revision="a".repeat(40);
 const bad=adapter.run({id:"tarea-cancelada",role:"explorer",
  prompt:"No respondas",repository:fixture.repository,
  candidate:{id:"c",repository:fixture.repository,revision,createdAt:"now"}
 },cancelOne.signal);
 const good=adapter.run({id:"tarea-sana",role:"explorer",
  prompt:"Entrega un artefacto",repository:fixture.repository,
  candidate:{id:"c",repository:fixture.repository,revision,createdAt:"now"}
 },keepOther.signal);
 const cancel=setTimeout(()=>cancelOne.abort(),350);
 t.after(()=>clearTimeout(cancel));
 const [blocked,success]=await Promise.all([bad,good]);
 assert.equal(blocked.ok,false);
 assert.match(blocked.output,/cancel/u);
 assert.equal(blocked.artifactProof,undefined);
 assert.equal(keepOther.signal.aborted,false);
 assert.equal(success.ok,true,success.output);
 assert.deepEqual(JSON.parse(success.output),{
  repository:fixture.repository,candidateId:"c",revision,content:"completado"
 });
 assert.equal(isIssuedAgentArtifactProof(success.artifactProof),true);
});

test("Un resultado tardío no revive una sesión de artefactos cancelada",async()=>{
 let finish:(value:{id:string;ok:boolean;output:string})=>void=()=>{};
 const fake=new PiArtifactRunner({
  run:async()=>new Promise(resolve=>{finish=resolve;})
 } as unknown as PiProcessRunner);
 const controller=new AbortController();
 const request={id:"retrasada",role:"explorer" as const,
  prompt:"prueba",repository:"/repo",
  candidate:{id:"c",repository:"/repo",revision:"a".repeat(40),createdAt:"now"}
 };
 const resultPromise=fake.run(request,controller.signal);
 controller.abort();
 finish({id:request.id,ok:true,output:[
  JSON.stringify({type:"response",id:request.id,success:true}),
  JSON.stringify({type:"message_end",message:{role:"assistant",
   stopReason:"stop",content:[{type:"text",text:"resultado tardío"}]}}),
  JSON.stringify({type:"agent_end"})
 ].join("\n")});
 const outcome=await resultPromise;
 assert.equal(outcome.ok,false);
 assert.equal(outcome.artifactProof,undefined);
 assert.match(outcome.output,/cancellation requested/u);
});

test("B: dos procesos Pi RPC aislados, cancelar uno no interrumpe al otro",{timeout:process.platform==="win32"?60_000:30_000},async t=>{
 const fixture=await createPiRpcFixture(t,scenario);
 let pidA:number|undefined,pidB:number|undefined;
 const options={command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],
  noTools:true,timeoutMs:12_000};
 const slow=new PiProcessRunner({...options,onProcessStart:pid=>{pidA=pid;}});
 const fast=new PiProcessRunner({...options,onProcessStart:pid=>{pidB=pid;}});
 const controller=new AbortController();
 const cancelled=slow.run({id:"tarea-cancelada",role:"explorer",
  repository:fixture.repository,prompt:"Esperar cancelación"},controller.signal);
 const completed=fast.run({id:"tarea-sana",role:"explorer",
  repository:fixture.repository,prompt:"Finalizar sin afectar a la otra"});
 const timer=setTimeout(()=>controller.abort(),750);
 t.after(()=>clearTimeout(timer));
 const [a,b]=await Promise.all([cancelled,completed]);
 assert.equal(a.ok,false);
 assert.match(a.output,/cancel/u);
 assert.equal(b.ok,true,b.output);
 assert.match(b.output,/completado/u);
 assert.ok(pidA&&pidB&&pidA!==pidB,"Pi debe usar procesos independientes");
});
