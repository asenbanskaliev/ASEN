import test from "node:test";
import assert from "node:assert/strict";
import {dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";

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
