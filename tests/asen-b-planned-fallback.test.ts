import assert from "node:assert/strict";
import test from "node:test";
import {plannedExplorerFallback} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {emptyProfileFallbacks,setProfileFallbackChain} from "../src/runtime/lifecycle/profile-fallback-store.js";
import type {ProfileLayer} from "../src/runtime/lifecycle/profiles.js";
const primary="nvidia/nvidia/modelo-a";
const profiles:ProfileLayer={global:{schema:"asen.runtime-profiles/v1",active:"perfil",profiles:[{name:"perfil",routes:{explorer:{model:primary}}}]}};
const fallbacks=setProfileFallbackChain(emptyProfileFallbacks(),"perfil","explorer",[{model:"nvidia/modelo-a"},{model:"nvidia/modelo-b"},{model:"nvidia/nvidia/modelo-b"}]);
test("Las alternativas del Explorer planificado no cambian permisos ni independencia",()=>{
 const input={role:"explorer",model:primary,profiles,fallbacks};
 assert.deepEqual(plannedExplorerFallback(input),{profile:"perfil",chain:[{model:"nvidia/modelo-b"}]});
 for(const role of ["worker","reviewer","verifier","clarifier"])assert.equal(plannedExplorerFallback({...input,role}),undefined);
 assert.equal(plannedExplorerFallback({...input,independentRecovery:true}),undefined);
 assert.equal(plannedExplorerFallback({...input,model:"nvidia/otro"}),undefined);
});
