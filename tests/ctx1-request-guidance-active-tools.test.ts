import test from "node:test";
import assert from "node:assert/strict";
import {ASEN_PLAN_REQUEST_TOOL} from "../src/runtime/lifecycle/natural-plan-tool.js";
import {
 ASEN_REQUEST_GUIDANCE_SECTION,
 ASEN_EXPLORATION_BUDGET_SECTION,
 addAsenRequestGuidance,
 hasActiveAsenRequestTools,
} from "../src/runtime/ui/request-guidance.js";

// CTX-1: Pi puede registrar herramientas sin seleccionarlas para un turno.
// Solo la lista de herramientas activas autoriza instrucciones que las nombren.
const cases=[
 {name:"campo ausente",selected:undefined,visible:false},
 {name:"lista vacía",selected:[],visible:false},
 {name:"solo lectura",selected:["read"],visible:false},
 {name:"solo planificador",selected:[ASEN_PLAN_REQUEST_TOOL],visible:false},
 {name:"solo agente",selected:["asen_agent_start"],visible:false},
 {name:"ambas activas",selected:[ASEN_PLAN_REQUEST_TOOL,"asen_agent_start"],visible:true},
 {name:"ambas con lectura",selected:["read","asen_agent_start",ASEN_PLAN_REQUEST_TOOL],visible:true},
] as const;

for(const row of cases){
 test("CTX-1: guía condicionada por herramientas activas: "+row.name,()=>{
  const sections:Record<string,string>={original:"Sección previa"};
  const active=hasActiveAsenRequestTools(row.selected);
  assert.equal(active,row.visible);
  addAsenRequestGuidance({sections},active,true);
  assert.equal(sections.original,"Sección previa");
  assert.equal(Object.hasOwn(sections,ASEN_REQUEST_GUIDANCE_SECTION),row.visible);
  assert.equal(Object.hasOwn(sections,ASEN_EXPLORATION_BUDGET_SECTION),row.visible);
 });
}

test("CTX-1: desactivar herramientas elimina guía y aviso anteriores",()=>{
 const sections:Record<string,string>={original:"Intacto"};
 const selected=[ASEN_PLAN_REQUEST_TOOL,"asen_agent_start"];
 addAsenRequestGuidance({sections},hasActiveAsenRequestTools(selected),true);
 assert.ok(sections[ASEN_REQUEST_GUIDANCE_SECTION]);
 assert.ok(sections[ASEN_EXPLORATION_BUDGET_SECTION]);
 addAsenRequestGuidance({sections},hasActiveAsenRequestTools(["read"]),false);
 assert.deepEqual(sections,{original:"Intacto"});
});

test("CTX-1: la disponibilidad de registro no sustituye selectedTools",()=>{
 const puedeRegistrar=true;
 const seleccion:readonly string[]=[];
 assert.equal(puedeRegistrar,true);
 assert.equal(hasActiveAsenRequestTools(seleccion),false);
});
