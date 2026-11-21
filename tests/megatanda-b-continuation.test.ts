import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {selectSkills} from "../src/skills/registry.js";

async function fixture(t:import("node:test").TestContext){
 const dir=await mkdtemp(join(tmpdir(),"asen-g49-b-"));
 t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 const identity={sessionId:"sesion-b",projectId:dir};
 const todos=await SessionTodoStore.open(join(dir,"todos.json"));
 const links=new TaskAgentLinkStore(join(dir,"links.json"));
 const requests:unknown[]=[];
 const agents=await AgentRuntime.open({storeFile:join(dir,"agents.json"),runner:{
  run:async(request:{id:string})=>{requests.push(request);return{id:request.id,ok:true,output:"Hallazgos de solo lectura"};}
 } as never});
 const explorer={phase:"explore"} as const,worker={phase:"apply"} as const;
 const [blocked,writer,paid,free]=await todos.addPlan([
  {title:"Worker que falló",requestId:"asen-plan:primero:worker",dependsOn:[],description:"Aplicar antes de la incidencia",
   plan:{role:"worker",priority:1,skillSelection:worker,skillPaths:selectSkills(worker).map(s=>s.path)}},
  {title:"Worker distinto",requestId:"asen-plan:segundo:worker",dependsOn:[],description:"No se puede autorizar automáticamente",
   plan:{role:"worker",priority:1,skillSelection:worker,skillPaths:selectSkills(worker).map(s=>s.path)}},
  {title:"Exploración con coste",requestId:"asen-plan:tercero:explorer",dependsOn:[],description:"Explorar con un modelo de precio desconocido",
   plan:{role:"explorer",priority:2,model:"cloud/pago",skillSelection:explorer,skillPaths:selectSkills(explorer).map(s=>s.path)}},
  {title:"Exploración independiente",requestId:"asen-plan:cuarto:explorer",dependsOn:[],description:"Inspeccionar únicamente la parte independiente",
   plan:{role:"explorer",priority:3,model:"local/gratis",skillSelection:explorer,skillPaths:selectSkills(explorer).map(s=>s.path)}},
 ],identity);
 assert.ok(blocked&&writer&&paid&&free);
 await todos.update(blocked.taskId,identity,1,"running","Inicio anterior");
 await todos.update(blocked.taskId,identity,2,"blocked","Fallo confirmado sin repetición");
 return {identity,todos,links,agents,requests,blocked,writer,paid,free};
}

test("G49-B: un fallo no arranca otros Writers ni modelos de pago, pero sí una lectura independiente gratuita",async t=>{
 const f=await fixture(t);let prompts=0;
 const result=await dispatchNextPlanTask({
  ...f,identity:f.identity,
  independentReadOnly:{blockedTodoId:f.blocked.taskId,verifiedConfiguredModel:(role,model)=>role==="explorer"&&model==="local/gratis"},
  autoApproveReadOnly:true,validateIdentity:async()=>{},
  confirm:async()=>{prompts++;return true;}
 });
 assert.equal(result.status,"dispatched");
 if(result.status==="dispatched"){
  assert.equal(result.role,"explorer");
  assert.equal(result.todoId,f.free.taskId);
 }
 assert.equal(prompts,0,"el modo independiente no debe preguntar por otra escritura");
 const rows=await f.todos.list(f.identity);
 assert.equal(rows.find(r=>r.taskId===f.writer.taskId)?.current.state,"planned");
 assert.equal(rows.find(r=>r.taskId===f.paid.taskId)?.current.state,"planned");
 assert.equal(rows.find(r=>r.taskId===f.blocked.taskId)?.current.state,"blocked");
 assert.equal((await f.links.list(f.identity)).length,1);
 assert.equal((await f.agents.list(f.identity)).length,1);
});

test("E1A/E2B: si ningún modelo del perfil está disponible, se detiene sin agentes ni permisos",async t=>{
 const f=await fixture(t);let confirms=0;
 const result=await dispatchNextPlanTask({
  ...f,independentReadOnly:{blockedTodoId:f.blocked.taskId,verifiedConfiguredModel:()=>false},
  autoApproveReadOnly:true,validateIdentity:async()=>{},
  confirm:async()=>{confirms++;return true;}
 });
 assert.equal(result.status,"blocked");
 if(result.status==="blocked")assert.match(result.reason,/exact configured profile model/u);
 assert.equal(confirms,0);
 assert.equal((await f.agents.list(f.identity)).length,0);
});

test("G49-B: el bloqueo ajeno o no persistido nunca sirve para continuar otras tareas",async t=>{
 const f=await fixture(t);
 for(const id of ["tarea-inventada",f.writer.taskId]){
  const result=await dispatchNextPlanTask({
   ...f,independentReadOnly:{blockedTodoId:id,verifiedConfiguredModel:()=>true},
   autoApproveReadOnly:true,validateIdentity:async()=>{},
   confirm:async()=>true
  });
  assert.equal(result.status,"blocked");
  if(result.status==="blocked")assert.match(result.reason,/verified, persisted blocked ODD task/u);
 }
 assert.equal((await f.agents.list(f.identity)).length,0);
});

test("E1A/E2B: si el modelo deja de estar configurado antes de admitir el hijo, se aborta",async t=>{
 const f=await fixture(t);let calls=0;
 await assert.rejects(()=>dispatchNextPlanTask({
  ...f,independentReadOnly:{blockedTodoId:f.blocked.taskId,verifiedConfiguredModel:()=>{
   calls++;return calls===1;
  }},
  autoApproveReadOnly:true,validateIdentity:async()=>{},
  confirm:async()=>true
 }),/lost its exact configured profile model/u);
 assert.equal(calls>=2,true);
 assert.equal(f.requests.length,0,"el proceso hijo no debe llegar al ejecutor");
 assert.equal((await f.links.list(f.identity)).length,0);
});

test("G49-B: el supervisor de un Todo concreto nunca acepta el filtro de recuperación independiente",async t=>{
 const f=await fixture(t);
 const result=await dispatchNextPlanTask({
  ...f,expectedTodoId:f.free.taskId,
  independentReadOnly:{blockedTodoId:f.blocked.taskId,verifiedConfiguredModel:()=>true},
  autoApproveReadOnly:true,validateIdentity:async()=>{},
  confirm:async()=>true
 });
 assert.equal(result.status,"blocked");
 if(result.status==="blocked")assert.match(result.reason,/cannot override the exact child Todo/u);
 assert.equal((await f.agents.list(f.identity)).length,0);
});


test("E1A/E2B: una lectura pagada del perfil puede continuar sin habilitar escritura",async t=>{
 const f=await fixture(t);let comprobaciones=0;
 const result=await dispatchNextPlanTask({
  ...f,independentReadOnly:{blockedTodoId:f.blocked.taskId,verifiedConfiguredModel:(role,model)=>{
   comprobaciones++;return role==="explorer"&&model==="cloud/pago";
  }},autoApproveReadOnly:true,validateIdentity:async()=>{},confirm:async()=>{throw new Error("No se autoriza edición");}
 });
 assert.equal(result.status,"dispatched");
 if(result.status==="dispatched")assert.equal(result.todoId,f.paid.taskId);
 assert.ok(comprobaciones>=2);
 assert.equal((await f.agents.list(f.identity)).length,1);
 assert.equal((await f.todos.list(f.identity)).find(r=>r.taskId===f.writer.taskId)?.current.state,"planned");
});
