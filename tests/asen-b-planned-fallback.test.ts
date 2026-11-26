import assert from "node:assert/strict";
import test from "node:test";
import {plannedExplorerFallback,plannedExplorerProfileOrigin,assertPlannedExplorerFallbackCurrent} from "../src/runtime/lifecycle/plan-dispatcher.js";
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
