import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {writeProfilesFile} from "../src/runtime/lifecycle/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/lifecycle/profiles.js";
import {
 applyStartupOrchestratorModel,catalogListsZeroCost,
 type StartupModelRequest,
} from "../src/runtime/lifecycle/startup-orchestrator-model.js";

const FREE={provider:"local",id:"modelo-gratuito",cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
const PAID={provider:"cloud",id:"modelo-pago",cost:{input:1,output:1,cacheRead:0,cacheWrite:0}};
const UNKNOWN={provider:"cloud",id:"modelo-no-tarifado"};
const request=(overrides:Partial<StartupModelRequest>={}):StartupModelRequest=>{
 let current:import("../src/runtime/lifecycle/parent-model-fallback.js").ParentCatalogModel={provider:"local",id:"modelo-anterior",cost:FREE.cost};
 return {
  reason:"new",isChild:false,entries:()=>[],choice:{model:"local/modelo-gratuito",thinking:"low"},
  currentModel:()=>current,findModel:()=>FREE,
  setModel:async model=>{current=model;return true;},stillOwned:()=>true,
  ...overrides,
 };
};

test("A4: el inicio nuevo elige el modelo gratuito comprobado sin inferencia",async()=>{
 const levels:string[]=[];
 assert.equal(await applyStartupOrchestratorModel(request({setThinking:value=>levels.push(value)})),"applied");
 assert.deepEqual(levels,["low"]);
 assert.equal(catalogListsZeroCost(FREE),true);
 for(const model of [PAID,UNKNOWN,{...FREE,cost:{input:0,output:0}},{...FREE,cost:{input:-1,output:0,cacheRead:0,cacheWrite:0}},{...FREE,cost:{...FREE.cost,surcharge:0}}])
  assert.equal(catalogListsZeroCost(model),false);
});

test("A4: reanudar, recargar, bifurcar o tener historial conserva el modelo",async()=>{
 for(const reason of ["resume","reload","fork",undefined,"unknown"]){
  let called=0;
  assert.equal(await applyStartupOrchestratorModel(request({reason,setModel:()=>{called++;return true;}})),"not-new");
  assert.equal(called,0);
 }
 let called=0;
 assert.equal(await applyStartupOrchestratorModel(request({isChild:true,setModel:()=>{called++;return true;}})),"child");
 assert.equal(await applyStartupOrchestratorModel(request({entries:()=>["historial"],setModel:()=>{called++;return true;}})),"not-empty");
 assert.equal(await applyStartupOrchestratorModel(request({entries:()=>undefined,setModel:()=>{called++;return true;}})),"not-empty");
 assert.equal(called,0);
});

test("E1A: un modelo configurado puede tener precio cero, positivo o desconocido",async()=>{
 for(const model of [FREE,PAID,UNKNOWN]){
  const choice={model:`${model.provider}/${model.id}`};
  assert.equal(await applyStartupOrchestratorModel(request({choice,findModel:()=>model})),"applied");
 }
});

test("E1A: modelo ajeno, inválido o sin credenciales no cambia la sesión",async()=>{
 let called=0;const setModel=()=>{called++;return true;};
 assert.equal(await applyStartupOrchestratorModel(request({findModel:()=>undefined,setModel})),"model-missing");
 assert.equal(await applyStartupOrchestratorModel(request({findModel:()=>PAID,setModel})),"model-missing");
 assert.equal(await applyStartupOrchestratorModel(request({choice:{model:"sin-separador"},setModel})),"invalid-model");
 assert.equal(await applyStartupOrchestratorModel(request({choice:{thinking:"low"},setModel})),"unavailable");
 assert.equal(called,0);
 assert.equal(await applyStartupOrchestratorModel(request({setModel:()=>false})),"credentials-refused");
 assert.equal(await applyStartupOrchestratorModel(request({setModel:()=>{throw new Error("sin credenciales");}})),"credentials-refused");
});

test("A4: cambios de sesión y modelos no observables nunca se anuncian como aplicados",async()=>{
 let owned=true,thinking=0;
 assert.equal(await applyStartupOrchestratorModel(request({
  stillOwned:()=>owned,
  setModel:async()=>{owned=false;return true;},
  setThinking:()=>{thinking++;},
 })),"session-changed");
 assert.equal(thinking,0);
 assert.equal(await applyStartupOrchestratorModel(request({
  setModel:async()=>true,setThinking:()=>{thinking++;},
 })),"host-accepted-unverified");
 assert.equal(thinking,0);
});

test("A4: integración real con el inicio Pi y perfiles guardados",async t=>{
 const home=await mkdtemp(path.join(tmpdir(),"asen-a4-"));
 const calls:any[]=[];const events=new Map<string,Array<(event:any,context:any)=>unknown>>();
 const model={provider:"local",id:"modelo-viejo",cost:FREE.cost};
 const ctx:any={
  cwd:home,mode:"rpc",hasUI:true,model,
  sessionManager:{getSessionId:()=>"sesion-principal",getEntries:()=>[]},
  modelRegistry:{find:(provider:string,id:string)=>provider===FREE.provider&&id===FREE.id?FREE:undefined},
  ui:{notify(){},setWidget(){},setStatus(){}},
 };
 const pi={
  on(name:string,handler:(event:any,context:any)=>unknown){events.set(name,[...(events.get(name)??[]),handler]);},
  registerCommand(){},registerTool(){},
  setModel:async(next:typeof FREE)=>{calls.push(["modelo",next.id]);ctx.model=next;return true;},
  setThinkingLevel:(level:string)=>{calls.push(["esfuerzo",level]);},
 };
 await writeProfilesFile(path.join(home,".asen","profiles.json"),{
  schema:ASEN_PROFILES_SCHEMA,active:"normal",profiles:[{
   name:"normal",routes:{orchestrator:{model:"local/modelo-gratuito",thinking:"low"}},
  }],
 });
 createAsenExtension({
  homeDir:()=>home,profilesFile:path.join(home,".asen","profiles.json"),
  enableAgentRuntime:false,enableTodoRuntime:false,enableMemoryRuntime:false,enableWorkspaceRuntime:false,
 })(pi as any);
 t.after(async()=>{
  try{for(const handler of events.get("session_shutdown")??[])await handler({},ctx);}
  finally{await rm(home,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 for(const start of events.get("session_start")??[])await start({reason:"new"},ctx);
 assert.deepEqual(calls,[["modelo","modelo-gratuito"],["esfuerzo","low"]]);
 assert.equal(ctx.model.id,"modelo-gratuito");
 // Una sesión reanudada no reemplaza el modelo aunque el mismo perfil exista.
 calls.length=0;ctx.model=model;
 for(const start of events.get("session_start")??[])await start({reason:"resume"},ctx);
 assert.deepEqual(calls,[]);
 assert.equal(ctx.model.id,"modelo-viejo");
});
