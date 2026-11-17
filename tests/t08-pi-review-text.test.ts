import test from "node:test";
import assert from "node:assert/strict";
import {parseT08NativeReviewText} from "../src/runtime/agents/t08-pi-review-text.js";

const sample=JSON.stringify({
 verdict:"fail",summary:"La función no valida los elementos del array",
 findings:[{id:"validacion",severity:"high",path:"t08-fix.mjs",
  description:"Acepta elementos que no son números enteros finitos"}]
});
const final=(blocks:readonly unknown[])=>
 JSON.stringify({type:"message_end",message:{role:"assistant",content:blocks}});
const text=(value:string)=>({type:"text",text:value});
const reasoning=(value:string)=>({type:"thinking",thinking:value});
const flow=(...events:string[])=>events.join("\n");

test("T08 lee el JSON del juez Pi con razonamiento separado, sin divulgarlo",()=>{
 const secret="razonamiento privado de la prueba";
 const output=flow(
  JSON.stringify({type:"message_start",message:{role:"assistant"}}),
  final([reasoning(secret),text(sample)]),
  JSON.stringify({type:"agent_end"})
 );
 assert.equal(parseT08NativeReviewText(output),sample);
 assert.equal(parseT08NativeReviewText(final([text(sample)])),sample);
 assert.equal(parseT08NativeReviewText(final([
  reasoning("interno"),text(sample.slice(0,23)),text(sample.slice(23))
 ])),sample);
 assert.equal(parseT08NativeReviewText(final([text(""),reasoning("pensamiento"),text(sample)])),sample);
});

test("T08 no confunde razonamiento privado con un dictamen verificable",()=>{
 for(const blocks of [
  [reasoning(sample)],
  [reasoning(""),text("")],
  [text("")],
  [{type:"image",data:sample}],
  [{type:"toolCall",name:"write",arguments:{path:"t08-fix.mjs"}}],
  [{type:"file",text:sample}],
  [{type:"thinking",thinking:0},text(sample)],
  [reasoning("a".repeat(128_001)),text(sample)],
  [text("a".repeat(24_001))]
 ]){
  assert.throws(()=>parseT08NativeReviewText(final(blocks)),/T08:/u);
 }
});

test("T08 cualquier evento de herramienta o respuesta adicional bloquea la revisión",()=>{
 for(const event of [
  {type:"tool_execution_start",toolName:"read"},
  {type:"tool_execution_end",toolName:"write"},
  {type:"toolcall_requested"},
  {type:"tool_call",name:"bash"},
  {type:"tool_result"},
  {type:"tool_use"}
 ]){
  assert.throws(()=>parseT08NativeReviewText(
   flow(JSON.stringify(event),final([text(sample)]))
  ),/herramientas/u);
 }
 assert.throws(()=>parseT08NativeReviewText(
  flow(final([text(sample)]),final([text(sample)]))
 ),/un solo dictamen/u);
 assert.throws(()=>parseT08NativeReviewText(
  flow(final([text(sample)]),JSON.stringify({type:"tool_execution_start",toolName:"write"}))
 ),/herramientas/u);
});

test("T08 salida incompleta, incorrecta o excesiva nunca se toma por éxito",()=>{
 for(const output of [
  "", "{", "no es JSON", JSON.stringify({type:"agent_end"}),
  JSON.stringify({type:"message_end",message:{role:"user",content:[text(sample)]}}),
  final(Array.from({length:65},()=>text("x"))),
  "x".repeat(512_001),
  flow(final([text(sample)]),"no-json"),
  final([reasoning("sin dictamen")])
 ]){
  assert.throws(()=>parseT08NativeReviewText(output),/T08:/u);
 }
});

test("T08 acepta varios fragmentos de razonamiento Pi sin relajar tamaño ni autoridad",()=>{
 const many:Array<{type:string;thinking?:string;text?:string}>=Array.from({length:63},()=>reasoning("pensamiento privado"));
 many.push(text(sample));
 assert.equal(parseT08NativeReviewText(final(many)),sample);
 const sixtyFive:Array<{type:string;thinking?:string;text?:string}>=Array.from({length:65},()=>reasoning("fragmento"));
 sixtyFive[64]=text(sample);
 assert.throws(()=>parseT08NativeReviewText(final(sixtyFive)),/más de 64 bloques/u);
 const tooMuchReasoning:Array<{type:string;thinking?:string;text?:string}>=Array.from({length:4},()=>reasoning("r".repeat(34_000)));
 tooMuchReasoning.push(text(sample));
 assert.throws(()=>parseT08NativeReviewText(final(tooMuchReasoning)),/límite total/u);
});
test("T08 distingue mensajes sin bloques y estructuras malformadas sin registrar datos del modelo",()=>{
 for(const [body,reason] of [
  [{type:"message_end",message:{role:"assistant",content:[]}},/sin bloques \(0\)/u],
  [{type:"message_end",message:{role:"assistant",content:"texto privado"}},/sin lista de bloques/u],
  [{type:"message_end",message:{role:"assistant"}},/sin lista de bloques/u],
  [{type:"message_end",message:{role:"assistant",content:65}},/sin lista de bloques/u]
 ] as const){
  assert.throws(()=>parseT08NativeReviewText(JSON.stringify(body)),reason);
 }
 const unsupported=final([{type:"toolCall",arguments:"clave-privada"},text(sample)]);
 assert.throws(()=>parseT08NativeReviewText(unsupported),error=>
  error instanceof Error&&!error.message.includes("clave-privada")&&
  /contenido Pi no permitido/u.test(error.message));
});

test("T08 un mensaje Pi intermedio con herramienta no puede validar la recuperación",()=>{
 for(const kind of ["toolCall","tool_call"]){
  const candidate=flow(
   final([{type:kind,name:"bash",arguments:{}}]),
   JSON.stringify({type:"agent_end",willRetry:true}),
   final([text(sample)]),
   JSON.stringify({type:"agent_end",willRetry:false}),
   JSON.stringify({type:"agent_settled"})
  );
  assert.throws(()=>parseT08NativeReviewText(candidate,{requireFinalSettlement:true}),
   /intermedio contiene una llamada a herramienta/u);
 }
});
