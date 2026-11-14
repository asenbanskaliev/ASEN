import assert from "node:assert/strict";
import test from "node:test";
import {buildProfileFallbackChain,MAX_PROFILE_FALLBACK_MODELS,recordProfileFallbackCooldown,selectProfileFallback,type ProfileFallbackCandidate,type SelectProfileFallbackOptions} from "../src/runtime/profile-fallback.js";

for(const thinking of ["off","minimal","low","medium","high","xhigh","max",undefined] as const){
 test(`effort parity fallback selection preserves ${thinking??"inherit"}`,async()=>{
  const candidate=thinking===undefined?{model:"backup"}:{model:"backup",thinking};
  const candidates=buildProfileFallbackChain("primary",[candidate]);
  assert.deepEqual(await selectProfileFallback({candidates,attemptedModels:["primary"],now:0}),{status:"selected",...candidate,cost:"unknown"});
 });
}

const chain=(models:string[])=>models.map(model=>({model}));
type SelectOptions=Omit<SelectProfileFallbackOptions,"attemptedModels">&Partial<Pick<SelectProfileFallbackOptions,"attemptedModels">>;
const select=(options:SelectOptions)=>selectProfileFallback({attemptedModels:[],...options});

// Replaces the former paid-consent contract: a configured route is authorization
// to select paid and unknown-price models, but this selector still never invokes a provider.
test("configured paid and unknown-price fallbacks are selected automatically",async()=>{
 let providerCalls=0,confirmCalls=0;
 const paid=await select({candidates:chain(["paid/model"]),now:0,classifyCost:()=>"paid",confirmHuman:async()=>{confirmCalls++;return false;}} as SelectOptions);
 assert.deepEqual(paid,{status:"selected",model:"paid/model",cost:"paid"});
 const unknown=await select({candidates:chain(["unknown/model"]),now:0,classifyCost:()=>"unknown"});
 assert.deepEqual(unknown,{status:"selected",model:"unknown/model",cost:"unknown"});
 assert.equal(confirmCalls,0,"legacy per-switch consent is intentionally ignored");
 assert.equal(providerCalls,0,"selection is not provider execution consent");
});

test("bounds the configured chain to eight without counting an outside primary",()=>{
 const fallbacks=Array.from({length:MAX_PROFILE_FALLBACK_MODELS},(_,index)=>index===0?{model:`fallback-${index}`,thinking:"high" as const}:{model:`fallback-${index}`});
 const result=buildProfileFallbackChain("outside-primary",fallbacks);
 assert.equal(result.length,MAX_PROFILE_FALLBACK_MODELS+1);
 assert.deepEqual(result[0],{model:"outside-primary"});
 assert.deepEqual(result[1],{model:"fallback-0",thinking:"high"});
 assert.throws(()=>buildProfileFallbackChain("primary",[...fallbacks,{model:"overflow"}]),/eight/u);
 assert.deepEqual(buildProfileFallbackChain("same",[{model:"same"},{model:"next"}]),[{model:"same"},{model:"next"}],"a configured primary entry is skipped like the reference picker");
});

test("rejects malformed model names, thinking levels, duplicates, and attempt state",async()=>{
 for(const bad of [""," model","model ","model\nname","x".repeat(257)])assert.throws(()=>buildProfileFallbackChain(undefined,[{model:bad}]),/model/u);
 assert.throws(()=>buildProfileFallbackChain(undefined,[{model:"ok",thinking:"extreme" as any}]),/thinking/u);
 assert.throws(()=>buildProfileFallbackChain(undefined,[{model:"a"},{model:"a"}]),/duplicate/u);
 assert.deepEqual(await selectProfileFallback({candidates:chain(["a"]),now:0} as any),{status:"blocked",reason:"attempt-state-unknown"});
 assert.deepEqual(await select({candidates:chain(["a"]),attemptedModels:["a","a"],now:0}),{status:"blocked",reason:"attempt-state-unknown"});
});

test("cooldown updates remain immutable and selector skips cooling or already-tried models",async()=>{
 const original=Object.freeze({paid:200,free:0}),updated=recordProfileFallbackCooldown(original,"paid",300);
 assert.deepEqual(original,{paid:200,free:0});assert.deepEqual(updated,{paid:300,free:0});
 assert.deepEqual(await select({candidates:chain(["paid","free"]),attemptedModels:["primary"],cooldowns:updated,now:250}),{status:"selected",model:"free",cost:"unknown"});
 assert.deepEqual(await select({candidates:chain(["paid"]),cooldowns:updated,now:299}),{status:"unavailable",reason:"cooldown"});
 assert.deepEqual(await select({candidates:chain(["primary","next"]),attemptedModels:["primary"],now:0}),{status:"selected",model:"next",cost:"unknown"});
 assert.deepEqual(await select({candidates:chain(["primary"]),attemptedModels:["primary"],now:0}),{status:"unavailable",reason:"exhausted"});
});

test("preserves cancellation, freshness, and caller-owned decision snapshots",async()=>{
 const controller=new AbortController();controller.abort();
 assert.deepEqual(await select({candidates:chain(["next"]),now:0,signal:controller.signal}),{status:"blocked",reason:"cancelled"});
 assert.deepEqual(await select({candidates:chain(["next"]),now:0,isCurrent:()=>false}),{status:"blocked",reason:"stale"});
 const candidates=chain(["next"]),attemptedModels:string[]=[],cooldowns:Record<string,number>={};
 const mutated=await select({candidates,attemptedModels,cooldowns,now:0,classifyCost:()=>{candidates[0]!.model="other";attemptedModels.push("next");cooldowns.next=10;return "paid";}});
 assert.deepEqual(mutated,{status:"blocked",reason:"stale"});
});

test("final freshness callback cannot mutate decision state or abort and still select",async()=>{
 for(const mutation of ["candidate","attempt","cooldown","abort"] as const){
  const candidates=chain(["next"]),attemptedModels:string[]=[],cooldowns:Record<string,number>={};
  const controller=new AbortController();let freshnessCalls=0,classifyCalls=0;
  const result=await select({candidates,attemptedModels,cooldowns,now:0,signal:controller.signal,
   classifyCost:()=>{classifyCalls++;return "paid";},
   isCurrent:()=>{freshnessCalls++;if(freshnessCalls===3){
    if(mutation==="candidate")candidates[0]!.model="changed";
    if(mutation==="attempt")attemptedModels.push("next");
    if(mutation==="cooldown")cooldowns.next=10;
    if(mutation==="abort")controller.abort();
   }return true;}});
  assert.deepEqual(result,{status:"blocked",reason:mutation==="abort"?"cancelled":"stale"},mutation);
  assert.equal(freshnessCalls,3,`${mutation}: final boundary must not recurse`);
  assert.equal(classifyCalls,1,`${mutation}: no further decision effects`);
 }
});

test("carries optional thinking and never mutates route inputs",async()=>{
 const candidates=Object.freeze([{model:"vendor/model",thinking:"medium" as const}]) as readonly ProfileFallbackCandidate[];
 const cooldowns=Object.freeze({"vendor/model":0});
 const before=JSON.stringify({candidates,cooldowns});
 assert.deepEqual(await select({candidates,cooldowns,now:1,classifyCost:()=>{throw new Error("catalog unavailable");}}),{status:"selected",model:"vendor/model",thinking:"medium",cost:"unknown"});
 assert.equal(JSON.stringify({candidates,cooldowns}),before);
});
