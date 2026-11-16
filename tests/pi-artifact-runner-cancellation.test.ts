import test from "node:test";
import assert from "node:assert/strict";
import {PiArtifactRunner,isIssuedAgentArtifactProof} from "../src/agents/pi-artifact-runner.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
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
 const runner=new PiArtifactRunner(new PiProcessRunner({
  command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],
  noTools:true,timeoutMs:4_000
 }));
 const controller=new AbortController();
 const pending=runner.run({id:"tarea-cancelada",role:"explorer",
  prompt:"No respondas",repository:fixture.repository},controller.signal);
 const cancel=setTimeout(()=>controller.abort(),250);
 t.after(()=>clearTimeout(cancel));
 const result=await pending;
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
  run:async(request,signal)=>{
   if(request.id==="tarea-sana")return {
    id:request.id,ok:true,output:[
     JSON.stringify({type:"response",id:request.id,success:true}),
     JSON.stringify({type:"message_end",message:{role:"assistant",
      stopReason:"stop",content:[{type:"text",
       text:JSON.stringify({content:"completado"})}]}}),
     JSON.stringify({type:"agent_end"})
    ].join("\\n")
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
