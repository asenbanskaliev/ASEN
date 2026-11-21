import test from "node:test";
import assert from "node:assert/strict";
import {ASEN_PLAN_REQUEST_TOOL} from "../src/runtime/lifecycle/natural-plan-tool.js";
import {
 ASEN_REQUEST_GUIDANCE,
 ASEN_PLAN_ONLY_GUIDANCE,
 ASEN_AGENT_ONLY_GUIDANCE,
 ASEN_REQUEST_GUIDANCE_SECTION,
 ASEN_EXPLORATION_BUDGET_GUIDANCE,
 ASEN_EXPLORATION_BUDGET_SECTION,
 activeAsenRequestTools,
 addAsenRequestGuidance,
 hasActiveAsenRequestTools,
} from "../src/runtime/ui/request-guidance.js";

// CTX-1: la lista efectiva del turno, no la capacidad de registro, determina el mensaje.
const cases=[
 {name:"campo ausente",selected:undefined,kind:"none",budget:false},
 {name:"lista vacía",selected:[],kind:"none",budget:false},
 {name:"solo lectura",selected:["read"],kind:"none",budget:false},
 {name:"solo planificador",selected:[ASEN_PLAN_REQUEST_TOOL],kind:"plan",budget:false},
 {name:"solo agente",selected:["asen_agent_start"],kind:"agent",budget:true},
 {name:"ambas activas",selected:[ASEN_PLAN_REQUEST_TOOL,"asen_agent_start"],kind:"full",budget:true},
 {name:"ambas con lectura",selected:["read","asen_agent_start",ASEN_PLAN_REQUEST_TOOL],kind:"full",budget:true},
] as const;

for(const row of cases){
 test("CTX-1: guía según herramientas activas: "+row.name,()=>{
  const sections:Record<string,string>={original:"Sección previa"};
  const active=activeAsenRequestTools(row.selected);
  assert.equal(hasActiveAsenRequestTools(row.selected),row.kind==="full");
  assert.deepEqual(active,{
   plan:row.kind==="plan"||row.kind==="full",
   agent:row.kind==="agent"||row.kind==="full",
  });
  addAsenRequestGuidance({sections},active,true);
  assert.equal(sections.original,"Sección previa");
  const guide=row.kind==="full"?ASEN_REQUEST_GUIDANCE:
   row.kind==="plan"?ASEN_PLAN_ONLY_GUIDANCE:
   row.kind==="agent"?ASEN_AGENT_ONLY_GUIDANCE:undefined;
  assert.equal(sections[ASEN_REQUEST_GUIDANCE_SECTION],guide);
  assert.equal(sections[ASEN_EXPLORATION_BUDGET_SECTION],
   row.budget?ASEN_EXPLORATION_BUDGET_GUIDANCE:undefined);
  if(row.kind==="plan")assert.doesNotMatch(guide!,/asen_agent_start|asen_todo_inspect_interrupted_write/u);
  if(row.kind==="agent")assert.doesNotMatch(guide!,/asen_plan_request/u);
 });
}

test("CTX-1: al cambiar la selección se elimina la guía antigua sin afectar otras secciones",()=>{
 const sections:Record<string,string>={original:"Intacto"};
 addAsenRequestGuidance({sections},activeAsenRequestTools([ASEN_PLAN_REQUEST_TOOL,"asen_agent_start"]),true);
 assert.ok(sections[ASEN_REQUEST_GUIDANCE_SECTION]);
 assert.ok(sections[ASEN_EXPLORATION_BUDGET_SECTION]);
 addAsenRequestGuidance({sections},activeAsenRequestTools(["read"]),false);
 assert.deepEqual(sections,{original:"Intacto"});
});

test("CTX-1: registrar herramientas no demuestra que el modelo las tenga activas",()=>{
 const puedeRegistrar=true;
 const seleccion:readonly string[]=[];
 assert.equal(puedeRegistrar,true);
 assert.deepEqual(activeAsenRequestTools(seleccion),{plan:false,agent:false});
 assert.equal(hasActiveAsenRequestTools(seleccion),false);
});

test("CTX-1: un planificador aislado no aconseja lanzar Explorer",()=>{
 const sections:Record<string,string>={};
 addAsenRequestGuidance({sections},activeAsenRequestTools([ASEN_PLAN_REQUEST_TOOL]),true);
 assert.equal(sections[ASEN_REQUEST_GUIDANCE_SECTION],ASEN_PLAN_ONLY_GUIDANCE);
 assert.equal(sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
});
