import assert from "node:assert/strict";
import test from "node:test";
import {
 COOLDOWN_MS,
 ModelFallbackCooldown,
 ModelFallbackEpisode,
 classifyAssistantError,
 classifyLastAssistantFailure,
 getProcessModelFallbackCooldown,
 pickFallbackModel,
 shouldFallback,
 type TerminalErrorCategory,
} from "../src/runtime/model-fallback-policy.js";

for(const thinking of ["off","minimal","low","medium","high","xhigh","max",undefined] as const){
 test(`effort parity policy preserves ${thinking??"inherit"}`,()=>{
  const candidate=thinking===undefined?{model:"backup"}:{model:"backup",thinking};
  const episode=new ModelFallbackEpisode("main","primary",[candidate],{cooldown:new ModelFallbackCooldown(()=>0)});
  episode.markTried("primary");assert.deepEqual(episode.pick(),{...candidate,fallback:true});
 });
}

const eligible:TerminalErrorCategory[]=["quota","auth","rate_limit","provider_unavailable","timeout","network"];

test("classifies bounded structured assistant failures with specific causes before statuses",()=>{
 const cases:Array<[Record<string,unknown>,TerminalErrorCategory]>=[
  [{stopReason:"error",errorMessage:'429 {"type":"rate_limit_error"}'},"rate_limit"],
  [{stopReason:"error",errorMessage:"429 exceeded current quota"},"quota"],
  [{stopReason:"error",errorMessage:"401 invalid x-api-key"},"auth"],
  [{stopReason:"error",errorMessage:"400 prompt is too long"},"context_length"],
  [{stopReason:"error",rawStopReason:"model_context_window_exceeded"},"context_length"],
  [{stopReason:"error",diagnostics:[{error:{code:"ETIMEDOUT"}}]},"timeout"],
  [{stopReason:"error",errorMessage:"read ECONNRESET"},"network"],
  [{stopReason:"error",errorMessage:"502: bad gateway"},"provider_unavailable"],
  [{stopReason:"error",errorMessage:"400 invalid_request_error"},"invalid_request"],
  [{stopReason:"error",errorMessage:"content filter"},"unavailable"],
 ];
 for(const [message,expected] of cases)assert.equal(classifyAssistantError(message),expected);
 assert.equal(classifyAssistantError({stopReason:"aborted",errorMessage:"429 rate limit"}),undefined);
 assert.equal(classifyAssistantError({stopReason:"error",errorMessage:`${"x".repeat(5000)} rate limit`}),"unavailable");
});

test("only the last assistant message decides fallback and raw provider text is not retained",()=>{
 const secret="sk-never-retain";
 assert.equal(classifyLastAssistantFailure([
  {role:"assistant",stopReason:"error",errorMessage:"429 quota"},
  {role:"toolResult"},
  {role:"assistant",stopReason:"error",errorMessage:`fetch failed ${secret}`},
 ]),"network");
 assert.equal(classifyLastAssistantFailure([{role:"assistant",stopReason:"error",errorMessage:"429 quota"},{role:"assistant",stopReason:"aborted"}]),undefined);
 const cooldown=new ModelFallbackCooldown(()=>0);
 cooldown.mark("provider/model",classifyAssistantError({stopReason:"error",errorMessage:`429 quota ${secret}`})!);
 assert.doesNotMatch(JSON.stringify(cooldown.snapshot()),/never-retain|sk-/u);
});

test("fallback eligibility is closed and excludes abort, context, invalid request, and unknown",()=>{
 for(const category of eligible)assert.equal(shouldFallback(category),true,category);
 for(const category of [undefined,"context_length","invalid_request","unavailable"] as const)assert.equal(shouldFallback(category),false,String(category));
});

test("cooldowns use injected time, never shorten, expire in memory, and distinguish exhausted from transient",()=>{
 let now=1_000;
 const cooldown=new ModelFallbackCooldown(()=>now);
 cooldown.mark("quota/model","quota");
 cooldown.mark("quota/model","network");
 cooldown.mark("net/model","network");
 assert.equal(cooldown.available("quota/model"),false);
 assert.equal(cooldown.reason("quota/model"),"quota");
 assert.equal(cooldown.remaining("quota/model"),COOLDOWN_MS.exhausted);
 assert.equal(cooldown.remaining("net/model"),COOLDOWN_MS.transient);
 now+=COOLDOWN_MS.transient;
 assert.equal(cooldown.available("net/model"),true);
 assert.equal(cooldown.reason("net/model"),undefined);
 now=1_000+COOLDOWN_MS.exhausted;
 assert.equal(cooldown.available("quota/model"),true);
 assert.deepEqual(cooldown.snapshot(),{});
});

test("process cooldown accessor returns one shared registry while isolated instances remain independent",()=>{
 assert.strictEqual(getProcessModelFallbackCooldown(),getProcessModelFallbackCooldown());
 const isolated=new ModelFallbackCooldown(()=>0);
 isolated.mark("isolated/model","auth");
 assert.equal(isolated.available("isolated/model"),false);
 assert.equal(getProcessModelFallbackCooldown().available("isolated/model",0),true);
});

test("picks primary first, then each configured chain step once without capping primary plus eight fallbacks",()=>{
 const cooldown=new ModelFallbackCooldown(()=>0);
 const chain=Array.from({length:8},(_,index)=>({model:`m${index}`,...(index===0?{thinking:"high" as const}:{})}));
 assert.deepEqual(pickFallbackModel("outside-primary",chain,{cooldown,tried:new Set()}),{model:"outside-primary",fallback:false});
 const tried=new Set(["outside-primary"]);
 assert.deepEqual(pickFallbackModel("outside-primary",chain,{cooldown,tried}),{model:"m0",thinking:"high",fallback:true});
 tried.add("m0");cooldown.mark("m1","network");
 assert.deepEqual(pickFallbackModel("outside-primary",chain,{cooldown,tried}),{model:"m2",fallback:true});
 assert.throws(()=>pickFallbackModel("primary",[...chain,{model:"m8"}],{cooldown,tried:new Set()}),/eight/u);
});

test("episode freezes profile identity, tracks tried models, and clears on success or abort",()=>{
 const cooldown=new ModelFallbackCooldown(()=>0);
 const episode=new ModelFallbackEpisode("frozen-profile","primary",[{model:"backup",thinking:"low"}],{cooldown});
 assert.equal(episode.profile,"frozen-profile");
 assert.throws(()=>{(episode as {profile:string}).profile="mutated";},TypeError);
 assert.equal(episode.profile,"frozen-profile");
 assert.deepEqual(episode.pick(),{model:"primary",fallback:false});
 episode.markTried("primary");
 assert.deepEqual(episode.pick(),{model:"backup",thinking:"low",fallback:true});
 episode.markTried("backup");
 assert.equal(episode.pick(),undefined);
 episode.clear("success");
 assert.deepEqual(episode.triedModels(),[]);
 assert.deepEqual(episode.pick(),{model:"primary",fallback:false});
 episode.markTried("primary");episode.clear("aborted");
 assert.deepEqual(episode.triedModels(),[]);
});
