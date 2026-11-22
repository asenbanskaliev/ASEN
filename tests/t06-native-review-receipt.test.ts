import test from "node:test";
import assert from "node:assert/strict";
import {parseT06NativeReviewReceipt,observeT06ReviewStream} from "../src/runtime/agents/t06-native-review-receipt.js";

const shaA="a".repeat(64),shaB="b".repeat(64);
const sha={"t06-writer-a.mjs":shaA,"t06-writer-b.mjs":shaB};
const good={
 verdict:"pass",summary:"Código revisado sin errores detectados",
 findings:[],
 reviewedFiles:[{path:"t06-writer-a.mjs",sha256:shaA},{path:"t06-writer-b.mjs",sha256:shaB}]
};
const stream=(value:unknown)=>JSON.stringify({
 type:"message_end",message:{role:"assistant",content:[{type:"text",text:JSON.stringify(value)}]}
});
test("T06 recibe revisión Pi de dos archivos y no crea aceptación automática",()=>{
 const result=parseT06NativeReviewReceipt(stream(good),sha);
 assert.equal(result.verdict,"pass");
 assert.equal(result.findingCount,0);
 assert.deepEqual(result.reviewedPaths,["t06-writer-a.mjs","t06-writer-b.mjs"]);
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.writerAuthority,false);
 assert.equal(Object.isFrozen(result),true);
});
test("T06 bloquea revisiones con ámbitos, huellas, hallazgos o respuestas manipuladas",()=>{
 const invalid=[
  {...good,reviewedFiles:good.reviewedFiles.slice(0,1)},
  {...good,reviewedFiles:[good.reviewedFiles[0],good.reviewedFiles[0]]},
  {...good,reviewedFiles:[{...good.reviewedFiles[0],sha256:"0".repeat(64)},good.reviewedFiles[1]]},
  {...good,reviewedFiles:[{path:".env",sha256:shaA},good.reviewedFiles[1]]},
  {...good,findings:[{path:"t06-writer-a.mjs",severity:"high",description:"Error"}]},
  {...good,verdict:"fail"},
  {...good,autorizaWriter:true},
  {...good,summary:"texto\ncon caracteres prohibidos"},
  {...good,findings:[{path:".env",severity:"medium",description:"Riesgo"}]}
 ];
 for(const altered of invalid){
  assert.throws(()=>parseT06NativeReviewReceipt(stream(altered),sha),/T06 independent/u);
 }
});
test("T06 revisiones sin mensaje Pi final o con herramientas no se aceptan",()=>{
 for(const output of [
  "", "no es JSON",JSON.stringify({type:"tool_execution_start",toolName:"write"}),
  JSON.stringify({type:"message_end",message:{role:"assistant",content:[{type:"toolCall"}]}}),
  JSON.stringify({type:"tool_execution_start",toolName:"write"})+"\n"+stream(good),
  stream(good)+"\n"+stream(good)
 ]){
  assert.throws(()=>parseT06NativeReviewReceipt(output,sha),/T06 independent/u);
 }
});

test("T06 acepta solo el último dictamen después de un intento Pi fallido",()=>{
 const previous=JSON.stringify({type:"message_end",message:{
  role:"assistant",stopReason:"error",errorMessage:"fallo de modelo",
  content:[{type:"text",text:JSON.stringify({...good,verdict:"fail"})}]
 }});
 const recovered=JSON.stringify({type:"message_end",message:{
  role:"assistant",stopReason:"stop",
  content:[{type:"text",text:JSON.stringify(good)}]
 }});
 const report=parseT06NativeReviewReceipt(previous+"\n"+recovered,sha);
 assert.equal(report.verdict,"pass");
 assert.equal(report.acceptance,"not-accepted");
 assert.equal(report.writerAuthority,false);
});
test("T06 no disimula dos dictámenes exitosos ni errores finales",()=>{
 const success=JSON.stringify({type:"message_end",message:{
  role:"assistant",stopReason:"stop",content:[{type:"text",text:JSON.stringify(good)}]
 }});
 const failed=JSON.stringify({type:"message_end",message:{
  role:"assistant",stopReason:"error",content:[{type:"text",text:"error"}]
 }});
 for(const output of [success+"\n"+success,
  success+"\n"+failed,
  failed+"\n"+JSON.stringify({type:"tool_execution_start"})+"\n"+success]){
  assert.throws(()=>parseT06NativeReviewReceipt(output,sha),/T06 independent/u);
 }
 assert.equal(parseT06NativeReviewReceipt(failed+"\n"+success,sha).verdict,"pass");
});

test("T06 rechaza lista en lugar de un dictamen o gravedad de texto",()=>{
 for(const output of [
  {...good,verdict:["pass"]},
  {...good,verdict:["fail"],findings:[{path:"t06-writer-a.mjs",severity:"high",description:"Error"}]},
  {...good,verdict:"pass",findings:[{path:"t06-writer-a.mjs",severity:["high"],description:"Error"}]},
  {...good,verdict:"fail",findings:[{path:"t06-writer-a.mjs",severity:["low"],description:"Error"}]}
 ]){
  assert.throws(()=>parseT06NativeReviewReceipt(stream(output),sha),/T06 independent/u);
 }
});

test("T06 admite texto JSON final con bloques de razonamiento no publicados",()=>{
 const json=JSON.stringify(good),middle=Math.floor(json.length/2);
 const output=JSON.stringify({type:"message_end",message:{
  role:"assistant",stopReason:"stop",content:[
   {type:"thinking",thinking:"Analizo reglas sin herramientas"},
   {type:"text",text:json.slice(0,middle)},
   {type:"thinking",thinking:"Verifico casos límite"},
   {type:"text",text:json.slice(middle)}
  ]
 }});
 const report=parseT06NativeReviewReceipt(output,sha);
 assert.equal(report.verdict,"pass");
 assert.equal(report.reviewerSummary,good.summary);
 assert.equal(JSON.stringify(report).includes("Analizo"),false);
});
test("T06 nunca acepta herramientas, razonamiento ilegible ni respuestas vacías",()=>{
 const candidate=(blocks:unknown[])=>JSON.stringify({type:"message_end",
  message:{role:"assistant",stopReason:"stop",content:blocks}});
 for(const blocks of [
  [{type:"thinking",thinking:"solo esto"}],
  [{type:"thinking",thinking:12},{type:"text",text:JSON.stringify(good)}],
  [{type:"thinking",thinking:"a".repeat(128001)},{type:"text",text:JSON.stringify(good)}],
  [{type:"text",text:JSON.stringify(good)},{type:"toolCall",name:"write"}],
  [{type:"text",text:JSON.stringify(good)+"\nNO JSON"}],
  Array.from({length:65},()=>({type:"text",text:"a"}))
 ]){
  assert.throws(()=>parseT06NativeReviewReceipt(candidate(blocks),sha),/T06 independent/u);
 }
});

test("T06 separa la respuesta cortada, el error terminal y dos finales independientes",()=>{
 const end=(reason:string)=>JSON.stringify({type:"message_end",message:{
  role:"assistant",stopReason:reason,content:[{type:"text",text:JSON.stringify(good)}]
 }});
 assert.throws(()=>parseT06NativeReviewReceipt(end("length"),sha),/truncated/u);
 assert.throws(()=>parseT06NativeReviewReceipt(end("error"),sha),/assistant error/u);
 assert.throws(()=>parseT06NativeReviewReceipt(end("stop")+"\n"+end("stop"),sha),
  /multiple completed/u);
 assert.throws(()=>parseT06NativeReviewReceipt(JSON.stringify({type:"agent_settled"}),sha),
  /no assistant message/u);
});

test("T06 cuenta solo eventos seguros, nunca texto de Pi ni secretos",()=>{
 const secret="clave-proveedor-privada";
 const streamValue=[
  JSON.stringify({type:"message_end",message:{role:"assistant",
   stopReason:"length",content:[{type:"thinking",thinking:secret},
    {type:"text",text:secret}]}}),
  JSON.stringify({type:"agent_settled",data:{secret}})
 ].join("\n");
 const seen=observeT06ReviewStream(streamValue);
 assert.deepEqual(seen,{assistantMessages:1,settledEvents:1,textBlocks:1,
  finalReason:"length"});
 assert.equal(JSON.stringify(seen).includes(secret),false);
 assert.deepEqual(observeT06ReviewStream("{texto-inválido"),{
  assistantMessages:0,settledEvents:0,textBlocks:0,finalReason:"unknown"});
});

test("T06 no convierte listas u objetos en causas de cierre válidas",()=>{
 for(const reason of [["stop"],["length"],{valor:"stop"},null,5]){
  const event=JSON.stringify({type:"message_end",message:{
   role:"assistant",stopReason:reason,content:[{type:"text",text:"información privada"}]
  }});
  const evidence=observeT06ReviewStream(event);
  assert.equal(evidence.finalReason,"unknown");
  assert.equal(JSON.stringify(evidence).includes("información privada"),false);
 }
});
