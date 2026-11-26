import test from "node:test";
import assert from "node:assert/strict";
import {normalizarSolicitudNvidia} from "../extensions/nvidia-review-compat.js";
const modelo="nvidia/nemotron-3.5-bolt-e4b";
const base=()=>({model:modelo,stream:true,stream_options:{include_usage:true},
 max_completion_tokens:4096,reasoning_effort:"high",tools:[],
 messages:[{role:"user",content:[{type:"text",text:"Primera línea"},{type:"text",text:"Segunda línea"}]}]});
test("NVIDIA: solo texto, sin esfuerzos o parámetros que el modelo rechaza",()=>{
 const request=base();
 assert.equal(normalizarSolicitudNvidia(request,"nvidia",modelo),true);
 assert.equal(request.messages[0]?.content,"Primera línea\nSegunda línea");
 assert.equal(Object.getOwnPropertyDescriptor(request,"max_tokens")?.value,1200);
 assert.equal(request.stream,true);
 for(const key of ["reasoning_effort","stream_options","max_completion_tokens","tools"])
  assert.equal(Object.hasOwn(request,key),false,key);
});
test("NVIDIA: modelos o proveedores no autorizados no se modifican",()=>{
 for(const [provider,id] of [["otro",modelo],["nvidia","nvidia/no-autorizado"]] as const){
  const request=base();const before=JSON.stringify(request);
  assert.equal(normalizarSolicitudNvidia(request,provider,id),false);
  assert.equal(JSON.stringify(request),before);
 }
});
test("NVIDIA: no convierte imágenes, código inesperado ni herramientas en texto",()=>{
 for(const invalid of [
  {model:modelo,messages:[]},
  {...base(),tools:[{name:"shell"}]},
  {...base(),messages:[{role:"user",content:[{type:"image",data:"privada"}]}]},
  {...base(),messages:[{role:"assistant",content:null}]},
  {...base(),max_tokens:-1}
 ]){
  assert.throws(()=>normalizarSolicitudNvidia(invalid,"nvidia",modelo),/NVIDIA:/u);
 }
});
