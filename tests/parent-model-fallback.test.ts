import assert from "node:assert/strict";
import test from "node:test";
import {
 createParentModelFallback,
 type ParentFallbackIdentity,
 type ParentModelFallbackHost,
} from "../src/runtime/parent-model-fallback.js";
import {
 formatModelFallbackContinuation,
 formatModelFallbackNotice,
 type ModelFallbackChange,
} from "../src/runtime/model-fallback-notice.js";
import {ModelFallbackCooldown} from "../src/runtime/model-fallback-policy.js";

const failure=(message="429 rate limit")=>[{role:"assistant",stopReason:"error",errorMessage:message}];
const identity=(profile="main"):ParentFallbackIdentity=>({sessionId:"session-1",projectId:"/project",profile});

function fixture(overrides:Partial<ParentModelFallbackHost>={}){
 let currentIdentity=identity(),currentModel="provider/primary",thinking:"low"|"high"="high";
 const calls:string[]=[],models=new Map([
  ["provider/backup",{provider:"provider",id:"backup",cost:{input:2,output:4}}],
  ["provider/last",{provider:"provider",id:"last"}],
 ]);
 const host:ParentModelFallbackHost={
  identity:async()=>({...currentIdentity}),
  loadChain:async()=>[{model:"provider/backup",thinking:"low"},{model:"provider/last"}],
  currentModel:()=>currentModel,
  getThinking:()=>thinking,
  findModel:model=>models.get(model),
  setModel:async model=>{calls.push(`set:${model.id}`);currentModel=`${model.provider}/${model.id}`;return true;},
  setThinking:level=>{calls.push(`think:${level}`);thinking=level as typeof thinking;},
  notify:(change,prices)=>{calls.push(`notice:${change.to}:${prices?.to?.input??"unknown"}`);},
  followUp:message=>{calls.push(`follow:${message}`);},
  cooldown:new ModelFallbackCooldown(()=>1_000),
  clock:()=>1_000,
  ...overrides,
 };
 return {host,calls,setIdentity:(value:ParentFallbackIdentity)=>{currentIdentity=value;},setModel:(value:string)=>{currentModel=value;},thinking:()=>thinking};
}

test("fallback-parent waits for settled, uses the last agent_end messages, switches through catalog, applies effort, and follows up once",async()=>{
 const f=fixture(),adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure()});
 assert.equal(f.calls.length,0);
 assert.equal(await adapter.onAgentSettled({aborted:false}),true);
 assert.match(f.calls.at(-1)!,/^follow:/);
 assert.deepEqual(f.calls.slice(0,3),["set:backup","think:low","notice:provider/backup:2"]);
 assert.equal(await adapter.onAgentSettled({aborted:false}),false);
 assert.equal(f.calls.filter(call=>call.startsWith("follow:")).length,1);
});

test("fallback-parent abort and successful turns clear the episode without switching or resuming",async()=>{
 const f=fixture(),adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure("401 unauthorized")});
 assert.equal(await adapter.onAgentSettled({aborted:true}),false);
 assert.deepEqual(f.calls,[]);
 adapter.onAgentEnd({messages:[{role:"assistant",stopReason:"stop"}]});
 assert.equal(await adapter.onAgentSettled(),false);
 assert.deepEqual(f.calls,[]);
 adapter.onAgentEnd({messages:failure("400 invalid request")});
 assert.equal(await adapter.onAgentSettled(),false);
 assert.deepEqual(f.calls,[]);
});

test("fallback-parent leaves unconfigured profiles unchanged and does not require switching APIs",async()=>{
 const host:ParentModelFallbackHost={identity:async()=>identity(),loadChain:async()=>[],currentModel:()=>"provider/primary"};
 const adapter=createParentModelFallback(host);
 adapter.onAgentEnd({messages:failure()});
 assert.equal(await adapter.onAgentSettled(),false);
});

test("fallback-parent skips missing and refused catalog candidates once and retains episode effort for an implicit step",async()=>{
 let attempts=0;
 const f=fixture({
  loadChain:async()=>[{model:"provider/missing"},{model:"provider/refused"},{model:"provider/last"}],
  findModel:model=>model==="provider/missing"?undefined:{provider:"provider",id:model.slice(model.indexOf("/")+1)},
  setModel:async model=>{attempts++;f.calls.push(`set:${model.id}`);if(model.id==="refused")return false;f.setModel(`provider/${model.id}`);return true;},
 });
 const adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure("fetch failed")});
 assert.equal(await adapter.onAgentSettled(),true);
 assert.equal(attempts,2);
 assert.ok(f.calls.includes("think:high"));
 adapter.onAgentEnd({messages:failure("fetch failed")});
 assert.equal(await adapter.onAgentSettled(),false,"all configured candidates were tried once in the episode");
 assert.equal(attempts,2);
});

test("fallback-parent success clears tried candidates for the next episode",async()=>{
 const f=fixture(),adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure()});assert.equal(await adapter.onAgentSettled(),true);
 adapter.onAgentEnd({messages:[{role:"assistant",stopReason:"stop"}]});assert.equal(await adapter.onAgentSettled(),false);
 f.setModel("provider/primary");
 adapter.onAgentEnd({messages:failure()});assert.equal(await adapter.onAgentSettled(),true);
 assert.equal(f.calls.filter(call=>call==="set:backup").length,2);
});

test("fallback-parent adapters honor one shared cooldown registry",async()=>{
 const cooldown=new ModelFallbackCooldown(()=>1_000),first=fixture({cooldown,loadChain:async()=>[{model:"provider/backup"}]}),firstAdapter=createParentModelFallback(first.host);
 first.setModel("provider/shared-primary");firstAdapter.onAgentEnd({messages:failure("429 quota")});assert.equal(await firstAdapter.onAgentSettled(),true);
 const second=fixture({cooldown,loadChain:async()=>[{model:"provider/shared-primary"},{model:"provider/last"}]}),secondAdapter=createParentModelFallback(second.host);
 secondAdapter.onAgentEnd({messages:failure("fetch failed")});assert.equal(await secondAdapter.onAgentSettled(),true);
 assert.equal(second.calls.some(call=>call==="set:shared-primary"),false);assert.ok(second.calls.includes("set:last"));
});

test("fallback-parent freezes profile and chain for an episode",async()=>{
 let loads=0;
 const f=fixture({loadChain:async profile=>{loads++;return profile==="main"?[{model:"provider/backup"},{model:"provider/last"}]:[{model:"provider/other"}];}});
 const adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure()});
 assert.equal(await adapter.onAgentSettled(),true);
 f.setIdentity(identity("other"));
 adapter.onAgentEnd({messages:failure()});
 assert.equal(await adapter.onAgentSettled(),false,"identity drift blocks the frozen episode");
 assert.equal(loads,1);
 assert.equal(f.calls.some(call=>call.includes("other")),false);
});

test("fallback-parent guards identity before and after awaited setModel and before followUp",async()=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const f=fixture({setModel:async model=>{f.calls.push(`set:${model.id}`);await gate;f.setModel(`provider/${model.id}`);return true;}});
 const adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure()});
 const pending=adapter.onAgentSettled();
 await new Promise(resolve=>setImmediate(resolve));
 f.setIdentity({...identity(),sessionId:"session-2"});release();
 assert.equal(await pending,false);
 assert.deepEqual(f.calls,["set:backup"]);
});

test("fallback-parent abort invalidates an awaited setModel before effort, notice, or continuation",async()=>{
 let release!:(value:boolean)=>void;
 const switched=new Promise<boolean>(resolve=>{release=resolve;});
 const f=fixture({setModel:async model=>{f.calls.push(`set:${model.id}`);const accepted=await switched;if(accepted)f.setModel(`provider/${model.id}`);return accepted;}});
 const adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure()});
 const pending=adapter.onAgentSettled();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await adapter.onAgentSettled({aborted:true}),false);
 release(true);assert.equal(await pending,false);
 assert.deepEqual(f.calls,["set:backup"]);
 f.setModel("provider/primary");adapter.onAgentEnd({messages:failure()});assert.equal(await adapter.onAgentSettled(),true,"a later valid run remains available");
});

test("fallback-parent clear invalidates an awaited chain load before switching or continuation",async()=>{
 let release!:(chain:readonly {model:string}[])=>void;
 const chain=new Promise<readonly {model:string}[]>(resolve=>{release=resolve;});
 const f=fixture({loadChain:async()=>chain}),adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure()});
 const pending=adapter.onAgentSettled();await new Promise(resolve=>setImmediate(resolve));
 adapter.clear();release([{model:"provider/backup"}]);
 assert.equal(await pending,false);assert.deepEqual(f.calls,[]);
 adapter.onAgentEnd({messages:failure()});assert.equal(await adapter.onAgentSettled(),true,"clear does not disable future valid runs");
});

test("fallback-parent coalesces duplicate in-flight settled events",async()=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const f=fixture({setModel:async model=>{f.calls.push(`set:${model.id}`);await gate;f.setModel(`provider/${model.id}`);return true;}});
 const adapter=createParentModelFallback(f.host);
 adapter.onAgentEnd({messages:failure()});
 const first=adapter.onAgentSettled(),duplicate=adapter.onAgentSettled();
 release();
 assert.deepEqual(await Promise.all([first,duplicate]),[true,false]);
 assert.equal(f.calls.filter(call=>call.startsWith("follow:")).length,1);
});

test("fallback-parent rejects stale event scopes before caching or abort invalidation",async()=>{
 const scopeA={sessionId:"session-a",projectId:"/project"},scopeB={sessionId:"session-b",projectId:"/project"};
 let loads=0;
 const f=fixture({loadChain:async()=>++loads===1?[{model:"provider/backup"},{model:"provider/last"}]:[]}),adapter:any=createParentModelFallback(f.host);
 f.setIdentity({sessionId:scopeB.sessionId,projectId:scopeB.projectId,profile:"main"});adapter.activate?.(scopeB);
 adapter.onAgentEnd({messages:failure()},scopeA);
 assert.equal(await adapter.onAgentSettled({},undefined,scopeB),false,"a delayed A end cannot feed B settled");
 assert.deepEqual(f.calls,[]);
 adapter.onAgentEnd({messages:failure()},scopeB);assert.equal(await adapter.onAgentSettled({},undefined,scopeB),true);
 adapter.onAgentSettled({aborted:true},undefined,scopeA);
 adapter.onAgentEnd({messages:failure("fetch failed")},scopeB);
 assert.equal(await adapter.onAgentSettled({},undefined,scopeB),true,"a stale A abort cannot clear B episode");
 assert.equal(loads,1);assert.ok(f.calls.map(String).includes("set:last"));
});

test("fallback-parent invalidated chain rejections resolve inertly after clear or abort",async()=>{
 for(const mode of ["clear","abort"] as const){
  let reject!:(error:Error)=>void;
  const chain=new Promise<readonly {model:string}[]>((_resolve,rejectPromise)=>{reject=rejectPromise;});
  const f=fixture({loadChain:async()=>chain}),adapter:any=createParentModelFallback(f.host),scope={sessionId:"session-1",projectId:"/project"};
  adapter.activate?.(scope);adapter.onAgentEnd({messages:failure()},scope);
  const pending=adapter.onAgentSettled({},undefined,scope);await new Promise(resolve=>setImmediate(resolve));
  if(mode==="clear")adapter.clear();else await adapter.onAgentSettled({aborted:true},undefined,scope);
  reject(new Error("PRIVATE deferred chain failure"));
  assert.equal(await pending,false,mode);assert.deepEqual(f.calls,[]);
 }
});

test("fallback-parent notice and continuation are bounded, structured, and do not claim actual billing",()=>{
 const change:ModelFallbackChange={agent:"parent",from:"provider/primary",to:"provider/backup",category:"quota"};
 const known=formatModelFallbackNotice(change,{from:{input:1,output:2},to:{input:2,output:4}});
 assert.match(known,/catalog/i);assert.match(known,/actual billing and subscription inclusion are unknown/i);assert.doesNotMatch(known,/\bfree\b|\bpaid\b/i);
 const unknown=formatModelFallbackNotice(change,{from:{input:1}});
 assert.match(unknown,/catalog pricing is unavailable/i);assert.ok(unknown.length<800);
 const continuation=formatModelFallbackContinuation({...change,to:"provider/"+"x".repeat(500)});
 assert.ok(continuation.length<800);assert.doesNotMatch(continuation,/429|secret|raw/i);
});
