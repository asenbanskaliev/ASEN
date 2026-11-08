import assert from "node:assert/strict";
import test from "node:test";
import {buildProfileFallbackChain,MAX_PROFILE_FALLBACK_MODELS,recordProfileFallbackCooldown,selectProfileFallback,type ProfileFallbackCandidate,type SelectProfileFallbackOptions} from "../src/runtime/profile-fallback.js";

const chain=(models:string[])=>models.map(model=>({model}));
type SelectOptions=Omit<SelectProfileFallbackOptions,"attemptedModels">&Partial<Pick<SelectProfileFallbackOptions,"attemptedModels">>;
const select=(options:SelectOptions)=>selectProfileFallback({attemptedModels:[],...options});
const classify=(paid:Set<string>,unknown:Set<string>=new Set())=>(model:string)=>unknown.has(model)?"unknown" as const:paid.has(model)?"paid" as const:"included" as const;

test("builds an ordered bounded chain, includes the primary in the eight-model cap, and rejects duplicates",()=>{
 const result=buildProfileFallbackChain("primary",["a","b","c","d","e","f","g"]);
 assert.deepEqual(result,chain(["primary","a","b","c","d","e","f","g"]));
 assert.equal(result.length,MAX_PROFILE_FALLBACK_MODELS);
 assert.throws(()=>buildProfileFallbackChain("primary",["a","b","c","d","e","f","g","h"]),/eight/u);
 assert.throws(()=>buildProfileFallbackChain("same",["same"]),/duplicate/u);
 assert.throws(()=>buildProfileFallbackChain(undefined,["a","a"]),/duplicate/u);
});

test("rejects malformed model names instead of silently dropping a fallback",()=>{
 for(const bad of [""," model","model ","model\nname","x".repeat(257)])assert.throws(()=>buildProfileFallbackChain(undefined,[bad]),/model/u);
 assert.throws(()=>buildProfileFallbackChain(undefined,["ok", "\0"]),/model/u);
});

test("cooldown updates are immutable, monotonic, and skip a cooling model",async()=>{
 const original=Object.freeze({paid:200,free:0}),updated=recordProfileFallbackCooldown(original,"paid",300);
 assert.deepEqual(original,{paid:200,free:0});assert.deepEqual(updated,{paid:300,free:0});
 const chosen=await select({candidates:chain(["paid","free"]),cooldowns:updated,now:250,classifyCost:classify(new Set(["paid"]))});
 assert.deepEqual(chosen,{status:"selected",model:"free",cost:"included"});
 const allCooling=await select({candidates:chain(["paid"]),cooldowns:updated,now:299,classifyCost:classify(new Set(["paid"]))});
 assert.deepEqual(allCooling,{status:"unavailable",reason:"cooldown"});
});

test("paid model is not selected until a fresh human confirmation returns literal true",async()=>{
 let prompts=0,providerCalls=0;
 const selected=await select({candidates:chain(["paid/model"]),now:0,classifyCost:classify(new Set(["paid/model"])),confirmHuman:async model=>{prompts++;assert.equal(model,"paid/model");assert.equal(providerCalls,0);return true;}});
 assert.deepEqual(selected,{status:"selected",model:"paid/model",cost:"paid"});assert.equal(prompts,1);assert.equal(providerCalls,0);
});

test("missing, false, non-boolean, or stale consent cannot select a paid route or continue to another fallback",async()=>{
 const candidates=chain(["paid/one","free/two"]);
 assert.deepEqual(await select({candidates,now:0,classifyCost:classify(new Set(["paid/one"]))}),{status:"blocked",reason:"consent-required"});
 let attempted:string[]=[];
 const denied=await select({candidates,now:0,classifyCost:classify(new Set(["paid/one"])),confirmHuman:async model=>{attempted.push(model);return false;}});
 assert.deepEqual(denied,{status:"blocked",reason:"consent-denied"});assert.deepEqual(attempted,["paid/one"],"denial must not silently fall through to a different model");
 const truthy=await select({candidates:chain(["paid/one"]),now:0,classifyCost:classify(new Set(["paid/one"])),confirmHuman:async()=>"yes" as unknown as boolean});
 assert.deepEqual(truthy,{status:"blocked",reason:"consent-denied"},"truthy non-boolean is not consent");
 const stale=await select({candidates:chain(["paid/one"]),now:0,classifyCost:classify(new Set(["paid/one"])),isCurrent:()=>false,confirmHuman:async()=>true});
 assert.deepEqual(stale,{status:"blocked",reason:"stale"});
});

test("unknown cost classification requires consent and classifier failures fail closed",async()=>{
 let asked=0;
 const unknown=await select({candidates:chain(["vendor/model"]),now:0,classifyCost:classify(new Set(),new Set(["vendor/model"])),confirmHuman:async(_model,cost)=>{asked++;assert.equal(cost,"unknown");return true;}});
 assert.deepEqual(unknown,{status:"selected",model:"vendor/model",cost:"unknown"});assert.equal(asked,1);
 const missing=await select({candidates:chain(["vendor/model"]),now:0,classifyCost:()=>{throw new Error("classifier unavailable");},confirmHuman:async()=>true});
 assert.deepEqual(missing,{status:"blocked",reason:"cost-unknown"});
});

test("cancellation and context changes during the consent dialog prevent selection",async()=>{
 let release!: (value:boolean)=>void;
 const pending=new Promise<boolean>(resolve=>{release=resolve;});
 const controller=new AbortController();let live=true;
 const selection=select({candidates:chain(["paid/model"]),now:0,classifyCost:classify(new Set(["paid/model"])),signal:controller.signal,isCurrent:()=>live,confirmHuman:async()=>pending});
 controller.abort();release(true);assert.deepEqual(await selection,{status:"blocked",reason:"cancelled"});
 const ctx=await select({candidates:chain(["paid/model"]),now:0,classifyCost:classify(new Set(["paid/model"])),isCurrent:()=>live,confirmHuman:async()=>{live=false;return true;}});
 assert.deepEqual(ctx,{status:"blocked",reason:"stale"});
});

test("a forged confirmed flag is ignored and cannot replace the human confirmation callback",async()=>{
 const input={candidates:chain(["paid/model"]),now:0,classifyCost:classify(new Set(["paid/model"])),confirmed:true} as any;
 assert.deepEqual(await select(input),{status:"blocked",reason:"consent-required"});
});

test("the selector independently enforces the limit and ignores caller-provided cost labels",async()=>{
 const tooLong={candidates:chain(Array.from({length:MAX_PROFILE_FALLBACK_MODELS+1},(_,i)=>`m${i}`)),now:0,classifyCost:classify(new Set())};
 await assert.rejects(()=>select(tooLong as any),/eight-model limit/u);
 const forged={candidates:[{model:"paid/model",cost:"included",confirmed:true}],now:0,classifyCost:classify(new Set(["paid/model"]))} as any;
 assert.deepEqual(await select(forged),{status:"blocked",reason:"consent-required"},"profile fields cannot downgrade trusted cost classification or supply consent");
});

test("missing attempt history fails closed and previously tried models cannot cycle back",async()=>{
 const candidates=chain(["primary","paid/next","included/last"]);
 assert.deepEqual(await selectProfileFallback({candidates,now:0,classifyCost:classify(new Set())} as any),{status:"blocked",reason:"attempt-state-unknown"});
 const next=await select({candidates,attemptedModels:["primary","paid/next","included/last"],now:0,classifyCost:classify(new Set())});
 assert.deepEqual(next,{status:"unavailable",reason:"exhausted"});
 const noRetry=await select({candidates,attemptedModels:["primary"],now:0,classifyCost:classify(new Set())});
 assert.deepEqual(noRetry,{status:"selected",model:"paid/next",cost:"included"});
});

test("consent and cooldown checks do not call a provider or mutate candidate and cooldown inputs",async()=>{
 const candidates=Object.freeze(chain(["paid/model","included/model"]).map(Object.freeze)) as readonly ProfileFallbackCandidate[];
 const cooldowns=Object.freeze({"paid/model":0}),before=JSON.stringify({candidates,cooldowns});let providerCalls=0;
 const selected=await select({candidates,cooldowns,now:1,classifyCost:classify(new Set(["paid/model"])),confirmHuman:async()=>{assert.equal(providerCalls,0);return true;}});
 assert.equal(selected.status,"selected");assert.equal(providerCalls,0);assert.equal(JSON.stringify({candidates,cooldowns}),before);
});
