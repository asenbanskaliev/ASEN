import test from "node:test";
import assert from "node:assert/strict";
import {
 ASEN_REQUEST_GUIDANCE,
 ASEN_REQUEST_GUIDANCE_SECTION,
 ASEN_EXPLORATION_BUDGET_SECTION,
 ASEN_EXPLORATION_BUDGET_GUIDANCE,
 addAsenRequestGuidance,
} from "../src/runtime/ui/request-guidance.js";

// CTX-0: línea base sintética, sin proveedor ni estimación de tokens facturados.
// No modificar la guía de producción ni interpretar registerTool como selectedTools.
const bytes=(value:string)=>Buffer.byteLength(value,"utf8");
const cases=[
 {name:"sin herramienta, presupuesto normal",available:false,over:false,request:false,budget:false},
 {name:"sin herramienta, presupuesto excedido",available:false,over:true,request:false,budget:false},
 {name:"con herramienta, presupuesto normal",available:true,over:false,request:true,budget:false},
 {name:"con herramienta, presupuesto excedido",available:true,over:true,request:true,budget:true},
] as const;

for(const scenario of cases){
 test("CTX-0 composición sintética: "+scenario.name,()=>{
  const sections:Record<string,string>={
   preexisting:"contenido previo sintético",
   [ASEN_EXPLORATION_BUDGET_SECTION]:"presupuesto anterior",
  };
  const before=Object.keys(sections);
  addAsenRequestGuidance({sections},scenario.available,scenario.over);
  assert.deepEqual(before,["preexisting",ASEN_EXPLORATION_BUDGET_SECTION]);
  assert.equal(sections.preexisting,"contenido previo sintético");
  assert.equal(Object.hasOwn(sections,ASEN_REQUEST_GUIDANCE_SECTION),scenario.request);
  assert.equal(Object.hasOwn(sections,ASEN_EXPLORATION_BUDGET_SECTION),scenario.budget);
  if(scenario.request)assert.equal(sections[ASEN_REQUEST_GUIDANCE_SECTION],ASEN_REQUEST_GUIDANCE);
  if(scenario.budget)assert.equal(sections[ASEN_EXPLORATION_BUDGET_SECTION],ASEN_EXPLORATION_BUDGET_GUIDANCE);
  const expected=bytes("contenido previo sintético")
   +(scenario.request?bytes(ASEN_REQUEST_GUIDANCE):0)
   +(scenario.budget?bytes(ASEN_EXPLORATION_BUDGET_GUIDANCE):0);
  assert.equal(Object.values(sections).reduce((n,s)=>n+bytes(s),0),expected);
 });
}

test("CTX-0: sin secciones no se crean ni se modifican secciones",()=>{
 const options:{}={};
 addAsenRequestGuidance(options,false,false);
 addAsenRequestGuidance(options,true,true);
 assert.deepEqual(options,{});
});

test("CTX-0: medición de bytes UTF-8, no tokens ni coste",()=>{
 assert.ok(bytes(ASEN_REQUEST_GUIDANCE)>0);
 assert.ok(bytes(ASEN_EXPLORATION_BUDGET_GUIDANCE)>0);
 assert.ok(bytes("á")>1);
});
