import test from "node:test";
import assert from "node:assert/strict";
import {validateT06PiReply} from "../src/runtime/agents/t06-pi-receipt-validator.js";

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
