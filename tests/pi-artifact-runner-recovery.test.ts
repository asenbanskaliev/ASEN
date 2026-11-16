import assert from "node:assert/strict";
import test from "node:test";
import {bindPiArtifactIdentity,extractPiArtifact,extractSettledPiArtifact,PiArtifactRunner} from "../src/agents/pi-artifact-runner.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";

const id="recuperacion-lectura";
const finalText=JSON.stringify({content:"artefacto final"});
const emit=(rows:readonly unknown[])=>rows.map(row=>JSON.stringify(row)).join("\n");
const msg=(text:string,stopReason="stop")=>({
 type:"message_end",message:{role:"assistant",stopReason,content:[{type:"text",text}]}
});
const attempt=(text:string,retry:boolean,reason="stop")=>[
 {type:"agent_start"},msg(text,reason),{type:"agent_end",willRetry:retry}
];
const sample=(first=attempt("",true,"error"),second=attempt(finalText,false))=>[
 {type:"response",id,success:true},...first,...second,{type:"agent_settled",aborted:false}
];
test("La recuperación estricta admite solo el último artefacto tras Pi settled",()=>{
 const output=emit(sample());
 assert.equal(extractSettledPiArtifact(output,id),finalText);
 assert.throws(()=>extractPiArtifact(output,id),/finish exactly once/u);
 const request:AgentRequest={id,role:"explorer",repository:"/repo",prompt:"Prueba",
  candidate:{id:"c",repository:"/repo",revision:"r",createdAt:"now"}};
 assert.deepEqual(JSON.parse(bindPiArtifactIdentity(output,request,{requireFinalSettlement:true})),
  {repository:"/repo",candidateId:"c",revision:"r",content:"artefacto final"});
});
test("No se admite ningún intento ambiguo, falso o abortado",()=>{
 const valid=sample();
 const cases=[
  valid.filter(row=>(row as {type?:string}).type!=="agent_settled"),
  [...valid,{type:"agent_settled"}],
  valid.map(row=>(row as {type?:string}).type==="agent_settled"?
   {type:"agent_settled",aborted:true}:row),
  valid.map(row=>(row as {type?:string;willRetry?:boolean}).type==="agent_end"&&
   (row as {willRetry?:boolean}).willRetry===true?
   {type:"agent_end",willRetry:false}:row),
  valid.map(row=>(row as {type?:string;willRetry?:boolean}).type==="agent_end"&&
   (row as {willRetry?:boolean}).willRetry===false?
   {type:"agent_end",willRetry:true}:row),
  valid.map(row=>(row as {type?:string;id?:string}).id===id?
   {type:"response",id:"otra-tarea",success:true}:row),
  [...valid.slice(0,-1),{type:"tool_execution_start"},...valid.slice(-1)],
  [...valid.slice(0,-1),{type:"message_end",message:{role:"assistant",
   stopReason:"stop",content:[{type:"text",text:"inyectado"}]}},...valid.slice(-1)],
  [...valid,{type:"agent_start"}],
  [...valid,{type:"agent_end",willRetry:false}],
  [valid[0],...valid.slice(2)]
 ];
 for(const records of cases)
  assert.throws(()=>extractSettledPiArtifact(emit(records),id));
});
test("Se rechazan herramientas y contenido vacío incluso durante la recuperación",()=>{
 const tools:unknown[]=sample();
 tools.splice(2,1,{type:"message_end",message:{role:"assistant",
  stopReason:"error",content:[{type:"toolCall",name:"bash"}]}});
 assert.throws(()=>extractSettledPiArtifact(emit(tools),id),/tools/u);
 assert.throws(()=>extractSettledPiArtifact(emit(sample(undefined,attempt("  ",false))),id),/non-empty/u);
});
test("El adaptador bloquea Writer y configuraciones sin cierre estricto antes de iniciar Pi",async()=>{
 let calls=0;
 const fake={supportsStrictReadOnlySettlement:()=>false,
  run:async()=>{calls++;return {id,ok:true,output:emit(sample())};}
 } as unknown as PiProcessRunner;
 const strict=new PiArtifactRunner(fake,{allowSettledReadOnlyRecovery:true});
 const read:AgentRequest={id,role:"explorer",repository:"/repo",prompt:"Prueba"};
 assert.equal((await strict.run(read)).ok,false);
 assert.equal(calls,0);
 const admitted={supportsStrictReadOnlySettlement:()=>true,
  run:async()=>{calls++;return {id,ok:true,output:emit(sample())};}
 } as unknown as PiProcessRunner;
 const adapter=new PiArtifactRunner(admitted,{allowSettledReadOnlyRecovery:true});
 for(const disallowed of [
  {...read,role:"worker" as const},
  {...read,writeSurfaces:["x.ts"]},
  {...read,modelFallback:{chain:[{model:"nvidia/modelo"}]}}
 ]){
  const result=await adapter.run(disallowed);
  assert.equal(result.ok,false);
 }
 assert.equal(calls,0);
 const result=await adapter.run({...read,candidate:{id:"c",repository:"/repo",
  revision:"r",createdAt:"now"}});
 assert.equal(result.ok,true,result.output);
 assert.equal(calls,1);
});
