import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {selectSkills} from "../src/skills/registry.js";
import {plannedExplorerFallback,plannedExplorerProfileOrigin,assertPlannedExplorerFallbackCurrent,dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {emptyProfileFallbacks,setProfileFallbackChain} from "../src/runtime/lifecycle/profile-fallback-store.js";
import type {ProfileLayer} from "../src/runtime/lifecycle/profiles.js";
const primary="nvidia/nvidia/modelo-a";
const profiles:ProfileLayer={global:{schema:"asen.runtime-profiles/v1",active:"perfil",profiles:[{name:"perfil",routes:{explorer:{model:primary}}}]}};
const fallbacks=setProfileFallbackChain(emptyProfileFallbacks(),"perfil","explorer",[{model:"nvidia/modelo-a"},{model:"nvidia/modelo-b"},{model:"nvidia/nvidia/modelo-b"}]);
test("Las alternativas del Explorer planificado no cambian permisos ni independencia",()=>{
 const input={role:"explorer",model:primary,profiles,origin:{scope:"global" as const,name:"perfil"},fallbacksByScope:{global:fallbacks}};
 assert.deepEqual(plannedExplorerFallback(input),{profile:"perfil",chain:[{model:"nvidia/modelo-b"}]});
 for(const role of ["worker","reviewer","verifier","clarifier"])assert.equal(plannedExplorerFallback({...input,role}),undefined);
 assert.equal(plannedExplorerFallback({...input,independentRecovery:true}),undefined);
 assert.equal(plannedExplorerFallback({...input,model:"nvidia/otro"}),undefined);
});

 test("Las alternativas requieren procedencia exacta y archivo de su ámbito",()=>{
 const global=profiles.global!;
 const project={...global};
 const projectFallbacks=setProfileFallbackChain(emptyProfileFallbacks(),"perfil","explorer",[{model:"nvidia/modelo-proyecto"}]);
 const layers={global,project};
 const origin=plannedExplorerProfileOrigin("explorer",primary,layers);
 assert.deepEqual(origin,{scope:"project",name:"perfil"});
 const input={role:"explorer",model:primary,profiles:layers,origin:origin!,fallbacksByScope:{global:fallbacks,project:projectFallbacks}};
 assert.deepEqual(plannedExplorerFallback(input),{profile:"perfil",chain:[{model:"nvidia/modelo-proyecto"}]});
 assert.equal(plannedExplorerFallback({...input,origin:{scope:"global",name:"perfil"}}),undefined);
 assert.equal(plannedExplorerFallback({...input,origin:{scope:"project",name:"otro"}}),undefined);
 assert.equal(plannedExplorerFallback({...input,fallbacksByScope:{global:fallbacks}}),undefined);
 const {origin:legacyOrigin,...legacy}=input;assert.equal(plannedExplorerFallback(legacy),undefined);
 assert.equal(plannedExplorerProfileOrigin("explorer",primary,{session:global,global}),undefined);
 });

test("B1 comprueba nuevamente las alternativas del perfil antes de ejecutar",async()=>{
 const selection={role:"explorer",model:primary,profiles,origin:{scope:"global" as const,name:"perfil"},fallbacksByScope:{global:fallbacks}};
 const expected=plannedExplorerFallback(selection)!;
 assert.ok(expected);
 await assert.doesNotReject(()=>assertPlannedExplorerFallbackCurrent(expected,selection,async()=>({profiles,fallbacksByScope:{global:fallbacks}})));
 for(const current of [{profiles:{},fallbacksByScope:{global:fallbacks}},
  {profiles:{...profiles,project:profiles.global!},fallbacksByScope:{global:fallbacks}},
  {profiles,fallbacksByScope:{}},
  {profiles,fallbacksByScope:{global:setProfileFallbackChain(emptyProfileFallbacks(),"perfil","explorer",[{model:"nvidia/otro"}])}}])
  await assert.rejects(()=>assertPlannedExplorerFallbackCurrent(expected,selection,async()=>current),/alternativas del perfil cambiaron/u);
 await assert.rejects(()=>assertPlannedExplorerFallbackCurrent(expected,selection,async()=>{throw Error("lectura fallida");}),/lectura fallida/u);
});

for(const changed of [true,false]){
 test("B1 cola efectiva: "+(changed?"bloquea alternativas obsoletas":"conserva alternativas vigentes"),{timeout:30_000},async t=>{
  const home=await mkdtemp(join(tmpdir(),"asen-b-cola-"));
  const identity={sessionId:"b1-cola",projectId:await realpath(process.cwd())};
  const todos=await SessionTodoStore.open(join(home,"todos.json"));
  const links=new TaskAgentLinkStore(join(home,"links.json"));
  let enter!:()=>void,release!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;});
  const hold=new Promise<void>(resolve=>{release=resolve;});
  const seen:AgentRequest[]=[];
  const agents=await AgentRuntime.open({storeFile:join(home,"agents.json"),maxConcurrency:1,runner:{run:async request=>{
   seen.push(request);
   if(request.prompt==="Ocupar plaza"){enter();await hold;}
   return {id:request.id,ok:true,output:"Resultado instrumentado sin modelos"};
  }}});
  const terminal=new Map<string,string>();
  const unsubscribe=agents.subscribeTerminal(record=>{terminal.set(record.id,record.state);});
  const wait=async(predicate:()=>boolean)=>{
   const deadline=Date.now()+10_000;
   while(!predicate()){
    if(Date.now()>deadline)throw Error("No se observó el estado esperado");
    await new Promise<void>(resolve=>setTimeout(resolve,10));
   }
  };
  let blocker:string|undefined,queued:string|undefined;
  try{
   blocker=await agents.startReadOnly({role:"clarifier",prompt:"Ocupar plaza",session:identity});
   await entered;
   const selection={phase:"explore" as const,risk:"low" as const,codeChange:false,behaviorChange:false,filesTouched:0};
   const [task]=await todos.addPlan([{title:"Explorar",requestId:"asen-plan:b1-cola:explorer",dependsOn:[],description:"Exploración en cola",
    plan:{role:"explorer",skillPaths:selectSkills(selection).map(skill=>skill.path),skillSelection:selection,
     model:primary,explorerProfileOrigin:{scope:"global",name:"perfil"}}}],identity);
   assert.ok(task);
   let current=fallbacks;
   const result=await dispatchNextPlanTask({todos,agents,links,identity,autoApproveReadOnly:true,expectedTodoId:task.taskId,
    runtimeProfiles:profiles,profileFallbacksByScope:{global:fallbacks},validateIdentity:async()=>{},
    readCurrentExplorerFallbackConfig:async()=>({profiles,fallbacksByScope:{global:current}}),confirm:async()=>true});
   assert.equal(result.status,"dispatched");
   if(result.status!=="dispatched")throw Error("No se vinculó el Explorer");
   queued=result.agentId;
   assert.equal((await agents.query(queued,identity))?.record.state,"queued");
   assert.equal(seen.length,1);
   assert.equal((await links.list(identity)).find(link=>link.taskId===task.taskId)?.agentId,queued);
   if(changed)current=setProfileFallbackChain(emptyProfileFallbacks(),"perfil","explorer",[{model:"nvidia/otro"}]);
   release();
   await wait(()=>terminal.has(queued!)&&terminal.has(blocker!));
   assert.equal(terminal.get(queued),changed?"failed":"completed");
   if(changed){
    assert.equal(seen.length,1,"La configuración revocada no debe llegar al ejecutor");
    assert.match((await agents.query(queued,identity))?.record.summary??"",/alternativas del perfil cambiaron/u);
   }else{
    assert.equal(seen.length,2);
    assert.equal(seen[1]?.id,queued);
    assert.deepEqual(seen[1]?.modelFallback,{profile:"perfil",chain:[{model:"nvidia/modelo-b"}]});
    assert.equal(seen[1]?.writeSurfaces,undefined);
   }
  }finally{
   release();
   try{await wait(()=>(!blocker||terminal.has(blocker))&&(!queued||terminal.has(queued)));}finally{
    unsubscribe();await rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100});
   }
  }
 });
}
