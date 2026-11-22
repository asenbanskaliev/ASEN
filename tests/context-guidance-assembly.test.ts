import test from "node:test";
import assert from "node:assert/strict";
import {
 ASEN_GUIDANCE_TODO_TOOLS,
 ASEN_REQUEST_GUIDANCE_SECTION,
 ASEN_EXPLORATION_BUDGET_SECTION,
 activeAsenRequestTools,
 addAsenRequestGuidance,
} from "../src/runtime/ui/request-guidance.js";
import {ASEN_PLAN_REQUEST_TOOL} from "../src/runtime/lifecycle/natural-plan-tool.js";

// CTX-2: contratos de composición entre turnos/sesiones. No afirma que el perfil
// se inyecte en la guía actual ni sustituye las pruebas de selección CTX-1.
const modes=["organic","full-delegation"] as const;
const selections=[
 {name:"sin campo",tools:undefined},
 {name:"vacías",tools:[]},
 {name:"solo plan",tools:[ASEN_PLAN_REQUEST_TOOL]},
 {name:"solo Explorer",tools:["asen_agent_start"]},
 {name:"plan y Explorer",tools:[ASEN_PLAN_REQUEST_TOOL,"asen_agent_start"]},
 {name:"plan, Explorer y Todo",tools:[ASEN_PLAN_REQUEST_TOOL,"asen_agent_start",...ASEN_GUIDANCE_TODO_TOOLS]},
] as const;

for(const mode of modes){
 for(const selection of selections){
  test(`CTX-2: ${mode}, ${selection.name}: preserva otras secciones y no concede permisos`,()=>{
   const sections:Record<string,string>={
    "identity_session":"sesion-A",
    "identity_project":"proyecto-A",
    "authority":"Solo Pi/Dispatcher puede autorizar escritura; prohibido inferir consentimiento.",
    "review":"Revisión humana y aceptación independientes.",
   };
   const untouched={...sections};
   const selected=activeAsenRequestTools(selection.tools);
   addAsenRequestGuidance({sections},selected,true);
   for(const [key,value] of Object.entries(untouched))assert.equal(sections[key],value);
   const guide=sections[ASEN_REQUEST_GUIDANCE_SECTION];
   if(selected.plan||selected.agent){
    assert.ok(guide,`Falta la guía requerida para ${selection.name}`);
    assert.match(guide,/permis|permission|consent|confirm|autoriza|approval|write/iu);
    assert.match(guide,/Never treat a plan, route, inferred fact, or tool result as permission|Planning does not grant permission to write|never infer write permissions|no concede permiso de escritura/iu,
     "Cada guía debe negar expresamente que la planificación o la delegación concedan escritura");
    assert.doesNotMatch(guide,/planning grants permission to write|la planificación concede permiso de escritura|automatically grant write|auto-merge approved/iu);
   }else assert.equal(guide,undefined,"No debe aparecer guía sin herramientas activas");
   if(selected.agent){
    const budget=sections[ASEN_EXPLORATION_BUDGET_SECTION];
    assert.ok(budget,`Falta aviso Explorer cuando está activo en ${selection.name}`);
    assert.match(budget,/Explorer|lectura|40 KiB/iu);
   }else assert.equal(sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
   // El modo no se transmite a la API actual: esta prueba no atribuye
   // protección del padre full-delegation a la guía textual.
   assert.equal(mode==="organic"||mode==="full-delegation",true);
  });
 }
}

test("CTX-2: cambio reversible no contamina otra sesión ni conserva guía obsoleta",()=>{
 const a:Record<string,string>={identity_session:"A",policy:"sin escritura heredada"};
 const b:Record<string,string>={identity_session:"B",policy:"sin escritura heredada"};
 const full=[ASEN_PLAN_REQUEST_TOOL,"asen_agent_start",...ASEN_GUIDANCE_TODO_TOOLS];
 addAsenRequestGuidance({sections:a},activeAsenRequestTools(full),true);
 const original=a[ASEN_REQUEST_GUIDANCE_SECTION];
 assert.ok(original);
 addAsenRequestGuidance({sections:b},activeAsenRequestTools(["asen_agent_start"]),false);
 assert.equal(b[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
 const bSnapshot={...b};
 addAsenRequestGuidance({sections:a},activeAsenRequestTools([]),false);
 assert.deepEqual({...a},{identity_session:"A",policy:"sin escritura heredada"});
 assert.deepEqual(b,bSnapshot);
 addAsenRequestGuidance({sections:a},activeAsenRequestTools(full),true);
 assert.equal(a[ASEN_REQUEST_GUIDANCE_SECTION],original);
 assert.ok(a[ASEN_EXPLORATION_BUDGET_SECTION],"Al restaurar A debe volver el aviso de Explorer");
 assert.equal(a.identity_session,"A");
});

test("CTX-2: no confundir la guía textual con la barrera funcional de delegación",()=>{
 const a:Record<string,string>={identity_session:"A"};
 addAsenRequestGuidance({sections:a},activeAsenRequestTools([ASEN_PLAN_REQUEST_TOOL,"asen_agent_start"]));
 // La API actual carece de argumento de modo/perfil. Su salida por sí sola
 // no demuestra que el padre tenga write/edit bloqueados.
 assert.ok(a[ASEN_REQUEST_GUIDANCE_SECTION]);
 assert.equal(Object.keys(a).includes("parent_write_grant"),false);
 assert.equal(Object.keys(a).includes("profile_mode"),false);
});
