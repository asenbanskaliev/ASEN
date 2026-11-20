import test from "node:test";
import assert from "node:assert/strict";
import {normalizeT06PiChildSelection,validateT06PiReply} from "../src/runtime/agents/t06-pi-receipt-validator.js";

const expectedModel="nvidia/nemotron-3.5-lightning-30b-a3b";
const expectedMarker="ASEN_PI_NVIDIA_A_OK";
const message=(text:string,options:Record<string,unknown>={})=>JSON.stringify({
 type:"message_end",message:{
  role:"assistant",provider:"nvidia",model:"nemotron-3.5-lightning-30b-a3b",
  content:[{type:"text",text}],...options
 }
});
const call=(output:string,modelObservedByRunner:string|null=expectedModel)=>validateT06PiReply({
 output,expectedMarker,expectedModel,modelObservedByRunner
});

test("T06 valida únicamente un mensaje exacto de Pi junto a selección real NVIDIA",()=>{
 const result=call([JSON.stringify({type:"message_start"}),message(expectedMarker)].join("\n"));
 assert.equal(result.verified,true);
 assert.equal(result.reason,"verified");
 assert.equal(result.modelActual,expectedModel);
});
test("T06 valida un proveedor y modelo configurados sin rebajar el recibo exacto",()=>{
 const model="openai-codex/gpt-5.6-sol",marker="ASEN_PI_OPENAI_A_OK";
 const output=JSON.stringify({type:"message_end",message:{
  role:"assistant",provider:"openai-codex",model:"gpt-5.6-sol",
  content:[{type:"text",text:marker}]
 }});
 const result=validateT06PiReply({output,expectedMarker:marker,expectedModel:model,
  modelObservedByRunner:model});
 assert.equal(result.verified,true);
 assert.equal(result.modelActual,model);
});
test("T06 un texto que menciona el marcador NO acredita ejecución",()=>{
 for(const value of [
  "No puedo responder "+expectedMarker,
  expectedMarker+" y además otro texto",
  "El marcador era "+expectedMarker,
  "ASEN_PI_NVIDIA_B_OK",
  ""
 ]){
  const result=call(message(value));
  assert.equal(result.verified,false,value);
  assert.equal(result.reason,"unexpected-reply");
  assert.equal(result.modelActual,"unknown");
 }
});
test("T06 requiere coincidencia entre evento de Pi y metadatos de respuesta",()=>{
 for(const model of [null,"unknown","openrouter/otro","nvidia/modelo-distinto"]){
  const result=call(message(expectedMarker),model);
  assert.equal(result.verified,false);
  assert.equal(result.reason,"missing-selection");
 }
 for(const changes of [{provider:"otro"},{model:"distinto"},{provider:"openrouter",model:"nemotron-3.5-lightning-30b-a3b"}]){
  const result=call(message(expectedMarker,changes));
  assert.equal(result.verified,false);
  assert.equal(result.reason,"model-mismatch");
 }
});
test("T06 rechaza un cierre erróneo aunque el mensaje y modelo sean exactos",()=>{
 for(const options of [
  {stopReason:"error",errorMessage:"límite de peticiones"},
  {stopReason:"length"},
  {stopReason:"aborted"},
  {stopReason:"toolUse"},
  {stopReason:null},
  {stopReason:"stop",errorMessage:"fallo informado por el proveedor"}
 ]){
  const result=call(message(expectedMarker,options));
  assert.equal(result.verified,false,JSON.stringify(options));
  assert.equal(result.reason,"unexpected-reply");
  assert.equal(result.modelActual,"unknown");
  assert.equal(result.piReportedUsage,null);
 }
 assert.equal(call(message(expectedMarker,{stopReason:"stop"})).verified,true);
});

test("T06 mensajes duplicados, parciales o falsos nunca son recibos válidos",()=>{
 for(const data of [
  message(expectedMarker)+"\n"+message(expectedMarker),
  JSON.stringify({type:"message_end",message:{role:"user",content:[{type:"text",text:expectedMarker}]}}),
  message(expectedMarker).slice(0,-2),
  message(expectedMarker,{content:[{type:"text",text:expectedMarker},{type:"toolCall",name:"write"}]}),
  JSON.stringify({type:"message_end",message:{role:"assistant",provider:"nvidia",model:expectedModel,content:[]}})
 ]){
  const result=call(data);
  assert.equal(result.verified,false);
  assert.equal(result.modelActual,"unknown");
 }
});

test("T02/T05 reporta tokens y coste únicamente como cifras informadas por Pi",()=>{
 const result=call(message(expectedMarker,{usage:{
  input:12,output:7,totalTokens:19,cost:{total:0.003}
 }}));
 assert.equal(result.verified,true);
 assert.deepEqual(result.piReportedUsage,{
  inputTokens:12,outputTokens:7,totalTokens:19,
  costUsd:0.003,billingVerified:false
 });
});
test("T02/T05 nunca inventa consumo si faltan datos o son inválidos",()=>{
 for(const usage of [
  undefined,null,{input:"12",output:7},{input:-1,output:7},
  {input:Infinity,output:7},{input:3,output:-1},
  {input:3.1,output:7}
 ]){
  const result=call(message(expectedMarker,{usage}));
  assert.equal(result.verified,true);
  assert.equal(result.piReportedUsage,null);
 }
 const valid=call(message(expectedMarker,{usage:{input:12,output:7,
  totalTokens:"desconocido",cost:{total:-45}}}));
 assert.equal(valid.verified,true);
 assert.deepEqual(valid.piReportedUsage,{
  inputTokens:12,outputTokens:7,totalTokens:null,
  costUsd:null,billingVerified:false
 });
});
test("T02/T05 un recibo de modelo falso no puede presentar métricas verificadas",()=>{
 const result=call(message(expectedMarker,{provider:"inventado",
  usage:{input:20,output:30,cost:{total:0}}}));
 assert.equal(result.verified,false);
 assert.equal(result.modelActual,"unknown");
 assert.equal(result.piReportedUsage,null);
});

test("T06 normaliza el ID completo real de NVIDIA sin duplicar el proveedor",()=>{
 const full={provider:"nvidia",id:"nvidia/nemotron-3.5-lightning-30b-a3b"};
 const short={provider:"nvidia",id:"nemotron-3.5-lightning-30b-a3b"};
 assert.equal(normalizeT06PiChildSelection(full,expectedModel),expectedModel);
 assert.equal(normalizeT06PiChildSelection(short,expectedModel),expectedModel);
 const receipt=call(message(expectedMarker),normalizeT06PiChildSelection(full,expectedModel));
 assert.equal(receipt.reason,"verified");
 assert.equal(receipt.modelActual,expectedModel);
});
test("T06 no atribuye el modelo NVIDIA a otro proveedor o selección distinta",()=>{
 for(const actual of [
  {provider:"nvidia",id:"nvidia/otro-modelo"},
  {provider:"openrouter",id:"nvidia/nemotron-3.5-lightning-30b-a3b"},
  {provider:"nvidia",id:"nvidia/nvidia/nemotron-3.5-lightning-30b-a3b"},
  null
 ]){
  const selected=normalizeT06PiChildSelection(actual,expectedModel);
  assert.notEqual(selected,expectedModel);
  assert.equal(call(message(expectedMarker),selected).verified,false);
 }
});
