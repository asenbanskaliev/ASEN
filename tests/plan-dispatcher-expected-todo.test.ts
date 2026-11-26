import test from "node:test";
import assert from "node:assert/strict";
import {dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {confirmWithAbort} from "../src/agents/pi-agent-tools.js";

test("T06 el supervisor no puede lanzar otro Todo listo del proyecto hijo",async()=>{
 let confirmations=0,agents=0,identities=0;
 const rows=[
  {taskId:"worker-ajeno",requestId:"asen-plan:otro:worker",
   current:{state:"planned"},dependsOn:[],plan:{role:"worker",priority:1}},
  {taskId:"worker-autorizado",requestId:"asen-plan:correcto:worker",
   current:{state:"planned"},dependsOn:[],plan:{role:"worker",priority:2}}
 ];
 const result=await dispatchNextPlanTask({
  todos:{list:async()=>rows} as any,
  agents:{startControlledWorker:async()=>{agents++;throw Error("No lanzar");}} as any,
  links:{} as any,
  identity:{sessionId:"hijo",projectId:"/repo-hijo"},
  expectedTodoId:"worker-autorizado",
  validateIdentity:async()=>{identities++;},
  confirm:async()=>{confirmations++;return true;}
 });
 assert.equal(result.status,"blocked");
 assert.match(result.status==="blocked"?result.reason:"",/not the next dependency-ready Todo/u);
 assert.equal(confirmations,0,"No pedir consentimiento para un Worker distinto");
 assert.equal(agents,0,"No arrancar agentes ajenos");
 assert.equal(identities,0,"No avanzar al despacho si la selección es incorrecta");
});

test("T06 un Todo hijo ausente o que no está listo no puede provocar otro lanzamiento",async()=>{
 let confirmations=0;
 const rows=[{taskId:"otro",requestId:"asen-plan:otro:worker",
  current:{state:"planned"},dependsOn:[],plan:{role:"worker",priority:0}}];
 const result=await dispatchNextPlanTask({
  todos:{list:async()=>rows} as any,agents:{} as any,links:{} as any,
  identity:{sessionId:"hijo",projectId:"/repo-hijo"},
  expectedTodoId:"desaparecido",validateIdentity:async()=>{},
  confirm:async()=>{confirmations++;return true;}
 });
 assert.equal(result.status,"blocked");
 assert.equal(confirmations,0);
});


test("E0 consentimiento Pi: solo true autoriza, también con cancelación vigilada",async()=>{
 const values:unknown[]=[false,undefined,null,"true","sí",1,{approved:true},[]];
 for(const value of values){
  const confirm=async()=>value as boolean;
  assert.equal(await confirmWithAbort(confirm),false);
  assert.equal(await confirmWithAbort(confirm,new AbortController().signal),false);
 }
 assert.equal(await confirmWithAbort(async()=>true),true);
 assert.equal(await confirmWithAbort(async()=>true,new AbortController().signal),true);
 const controller=new AbortController();controller.abort();
 await assert.rejects(confirmWithAbort(async()=>true,controller.signal),{name:"AbortError"});
});

test("E0 consentimiento Pi: una respuesta parecida a sí no inicia un agente",async()=>{
 const row={taskId:"pregunta-controlada",requestId:"asen-plan:pregunta:clarifier",
  title:"Aclarar alcance",description:"Aclarar el objetivo",
  current:{state:"planned",revision:1},dependsOn:[],
  plan:{role:"clarifier",priority:1,skillPaths:[]}};
 let launches=0,validations=0;
 const run=async(answer:unknown)=>dispatchNextPlanTask({
  todos:{list:async()=>[row]} as any,links:{} as any,
  agents:{startReadOnly:async()=>{launches++;return "agente-prueba";}} as any,
  identity:{sessionId:"sesion",projectId:"/proyecto"},
  validateIdentity:async()=>{validations++;},
  confirm:async()=>answer as boolean,
 });
 for(const answer of [{accepted:true},"sí",1,[],null,false,undefined]){
  const result=await run(answer);
  assert.equal(result.status,"blocked",String(answer));
  assert.equal(launches,0,"Un permiso ambiguo no puede iniciar ningún agente");
  assert.equal(validations,0,"La respuesta dudosa no pasa al despacho");
 }
 const accepted=await run(true);
 assert.equal(accepted.status,"dispatched");
 assert.equal(launches,1);
 assert.equal(validations>0,true);
});
