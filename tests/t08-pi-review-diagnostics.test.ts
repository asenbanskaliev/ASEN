import test from "node:test";
import assert from "node:assert/strict";
import {describeT08ReviewFailure} from "../src/runtime/agents/t08-pi-review-diagnostics.js";
const observations={textEvents:0,observedCharacters:0,toolEvents:0};
const message=(data:Record<string,unknown>)=>JSON.stringify({
 type:"message_end",message:{role:"assistant",...data}
});
test("T08 distingue respuesta Pi vacía sin inferir un dictamen",()=>{
 const output=[JSON.stringify({type:"response",id:"t08-judge-1",success:true}),
  message({content:[],stopReason:"stop",usage:{output:0}}),
  JSON.stringify({type:"agent_end"})].join("\n");
 const diagnostic=describeT08ReviewFailure(output,observations);
 assert.match(diagnostic,/bloquesFinales=0/u);
 assert.match(diagnostic,/fragmentosTexto=0/u);
 assert.match(diagnostic,/tokensSalida=0/u);
 assert.match(diagnostic,/finAgente=true/u);
 assert.match(diagnostic,/motivoFinal=stop/u);
});
test("T08 registra texto transmitido pero no lo sustituye por el resultado final",()=>{
 const secret="CLAVE_NO_DIVULGABLE_ejemplo_123456";
 const output=[message({content:[],stopReason:"length",errorMessage:secret,
  usage:{outputTokens:73}}),JSON.stringify({type:"agent_end"})].join("\n");
 const diagnostic=describeT08ReviewFailure(output,{
  textEvents:3,observedCharacters:71,toolEvents:0
 });
 assert.match(diagnostic,/fragmentosTexto=3; caracteresObservados=71/u);
 assert.match(diagnostic,/motivoFinal=length/u);
 assert.match(diagnostic,/errorDelModelo=true/u);
 assert.match(diagnostic,/tokensSalida=73/u);
 assert.ok(!diagnostic.includes(secret));
 assert.ok(!diagnostic.includes("message_end"));
});
test("T08 no refleja el contenido de modelos ni claves aunque haya datos inválidos",()=>{
 const secret="NVIDIA_API_KEY_NO_REVELAR";
 for(const output of [
  secret,
  JSON.stringify({type:"message_end",message:{role:"assistant",
   content:[{type:"text",text:secret}],stopReason:secret,errorMessage:secret,
   usage:{outputTokens:secret}}}),
  "{not-json}",
  "x".repeat(512_001)
 ]){
  const diagnostic=describeT08ReviewFailure(output,observations);
  assert.ok(!diagnostic.includes(secret));
 }
});
test("T08 los contadores externos inválidos no se aceptan ni convierten en contenido",()=>{
 const diagnostic=describeT08ReviewFailure(
  message({content:[],stopReason:"stop"}),
  {textEvents:-1,observedCharacters:Infinity,toolEvents:100_000_000}
 );
 assert.match(diagnostic,/fragmentosTexto=-1/u);
 assert.match(diagnostic,/caracteresObservados=-1/u);
 assert.match(diagnostic,/eventosHerramienta=1000000/u);
});
