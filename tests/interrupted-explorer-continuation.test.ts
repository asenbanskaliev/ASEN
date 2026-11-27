import assert from "node:assert/strict";
import test from "node:test";
import {continueInterruptedExplorer} from "../src/agents/interrupted-explorer-continuation.js";
import type {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";

const identity={sessionId:"session-a",projectId:"D:/project"};
const interruptedEntry={record:{id:"parent",state:"interrupted",role:"explorer",sessionId:identity.sessionId,projectId:identity.projectId}} as any;

function blockedTodo(){return {taskId:"todo-a",current:{state:"blocked",revision:3,reason:"Pi session ended while the linked agent was running"}} as any;}

test("interrupted Explorer continuation service preserves the public queued result without a dialog hook",async()=>{
 let queryCount=0,continueCount=0,identityChecks=0;
 const result=await continueInterruptedExplorer({
  agentId:"parent",identity,
  runtime:{query:async()=>{queryCount++;return interruptedEntry;},continue:async(_id,_identity,_signal,_onQueued,validateStart)=>{continueCount++;assert.ok(validateStart);await validateStart();return "child";}},
  resolveCurrentIdentity:async()=>{identityChecks++;return identity;},
 });
 assert.deepEqual(result,{id:"child",state:"queued",continuedFrom:"parent",role:"explorer"});
 assert.equal(queryCount,1);assert.equal(continueCount,1);assert.equal(identityChecks,5);
});

test("interrupted Explorer continuation service rejects other lifecycle states without coordination or dispatch",async()=>{
 let continuationCount=0,linkReads=0,todoReads=0,binderReads=0,identityChecks=0;
 await assert.rejects(()=>continueInterruptedExplorer({
  agentId:"parent",identity,
  runtime:{query:async()=>({...interruptedEntry,record:{...interruptedEntry.record,state:"failed"}}),continue:async()=>{continuationCount++;return "unused";}},
  todo:{links:async()=>{linkReads++;return {list:async()=>[]};},todos:async()=>{todoReads++;return {list:async()=>[],update:async()=>{throw new Error("unused");}};},binder:async()=>{binderReads++;return {launch:async()=>{}};}},
  resolveCurrentIdentity:async()=>{identityChecks++;return identity;},
 }),/Only an interrupted read-only explorer/u);
 assert.deepEqual({continuationCount,linkReads,todoReads,binderReads,identityChecks},{continuationCount:0,linkReads:0,todoReads:0,binderReads:0,identityChecks:0});
});

test("linked interrupted Explorer continuation keeps Todo claim, binder and dispatch ordering",async()=>{
 const order:string[]=[],todo=blockedTodo();let current=todo;
 const result=await continueInterruptedExplorer({
  agentId:"parent",identity,
  runtime:{query:async()=>interruptedEntry,continue:async(_id,_identity,_signal,onQueued)=>{await onQueued?.("child",()=>{order.push("dispatch");});return "child";}},
  todo:{
   links:async()=>({list:async()=>[{taskId:todo.taskId,agentId:"parent",...identity,createdAt:new Date(0).toISOString()}]}),
   todos:async()=>({list:async()=>[current],update:async(...[taskId,_identity,revision,state,reason]:Parameters<SessionTodoStore["update"]>)=>{order.push(`todo:${state}`);current={...current,taskId,current:{state,revision:revision+1,reason}};return current;}} as any),
   binder:async()=>({launch:async(_taskId,_agentId,_identity,dispatch,validate)=>{await validate?.();order.push("bind");dispatch();}}),
  },
  resolveCurrentIdentity:async()=>identity,
 });
 assert.deepEqual(order,["todo:running","bind","dispatch"]);
 assert.deepEqual(result,{id:"child",state:"queued",continuedFrom:"parent",role:"explorer",todoId:"todo-a"});
});

test("linked continuation restores the current running Todo to blocked when dispatch fails",async()=>{
 const updates:string[]=[],todo=blockedTodo();let current=todo;
 await assert.rejects(()=>continueInterruptedExplorer({
  agentId:"parent",identity,
  runtime:{query:async()=>interruptedEntry,continue:async()=>{throw new Error("dispatch failed");}},
  todo:{
   links:async()=>({list:async()=>[{taskId:todo.taskId,agentId:"parent",...identity,createdAt:new Date(0).toISOString()}]}),
   todos:async()=>({list:async()=>[current],update:async(...[taskId,_identity,revision,state,reason]:Parameters<SessionTodoStore["update"]>)=>{updates.push(`${state}:${reason}`);current={...current,taskId,current:{state,revision:revision+1,reason}};return current;}} as any),
   binder:async()=>({launch:async()=>{throw new Error("unused");}}),
  },
  resolveCurrentIdentity:async()=>identity,
 }),/dispatch failed/u);
 assert.equal(updates.length,2);assert.match(updates[0]!,/^running:User asked ASEN/u);assert.equal(updates[1],"blocked:Linked agent continuation was not dispatched; review is required");
});

// UFC-M2-03c negative pin (external review §4): the guard behavior already ships, so the honest
// RED here is the missing assertion, not a faked functional failure. The state:"failed" refusal
// above never exercised the role clause; these refusals carry state:"interrupted" with matching
// session and project, so ONLY `role!=="explorer"` can throw. The first test in this file remains
// the positive control: an interrupted explorer still continues.
test("interrupted Explorer continuation refuses an interrupted worker target on the role clause alone",async()=>{
 let continuationCount=0,linkReads=0,todoReads=0,binderReads=0;
 await assert.rejects(()=>continueInterruptedExplorer({
  agentId:"parent",identity,
  runtime:{query:async()=>({...interruptedEntry,record:{...interruptedEntry.record,role:"worker"}}),continue:async()=>{continuationCount++;return "unused";}},
  todo:{links:async()=>{linkReads++;return {list:async()=>[]};},todos:async()=>{todoReads++;return {list:async()=>[],update:async()=>{throw new Error("unused");}};},binder:async()=>{binderReads++;return {launch:async()=>{}};}},
 }),/Only an interrupted read-only explorer/u);
 assert.deepEqual({continuationCount,linkReads,todoReads,binderReads},{continuationCount:0,linkReads:0,todoReads:0,binderReads:0},"a worker refusal must be side-effect-free before any coordination read");
});

test("interrupted Explorer continuation refuses an ended explorer without dispatch",async()=>{
 let continuationCount=0;
 await assert.rejects(()=>continueInterruptedExplorer({
  agentId:"parent",identity,
  runtime:{query:async()=>({...interruptedEntry,record:{...interruptedEntry.record,state:"completed"}}),continue:async()=>{continuationCount++;return "unused";}},
 }),/Only an interrupted read-only explorer/u);
 assert.equal(continuationCount,0,"an ended agent is never continued automatically");
});

test("UFC-M2-03c shipped request guidance and tool description keep the same no-worker vocabulary as the guard",async()=>{
 const {readFileSync}=await import("node:fs");
 const guidance=readFileSync(new URL("../src/runtime/ui/request-guidance.ts",import.meta.url),"utf8");
 assert.match(guidance,/Never call asen_agent_continue for a worker/u,"the guidance forbids the exact conflation this pin guards");
 const tools=readFileSync(new URL("../src/agents/pi-agent-tools.ts",import.meta.url),"utf8");
 assert.match(tools,/resume only an interrupted read-only explorer/u,"the public tool description matches the guard clause");
 assert.match(tools,/Never use this for failed, cancelled, reviewer, verifier, or writer tasks/u,"the description names every non-explorer target");
});

test("B1 rechaza alternativas retiradas al continuar Explorer antes de reclamar el intento",async()=>{
 const saved={profile:"perfil",chain:[{model:"nvidia/modelo-b"}],origin:{scope:"global" as const,name:"perfil",model:"nvidia/modelo-a"}};
 let started=0;
 const runtime={query:async()=>({...interruptedEntry,spec:{model:"nvidia/modelo-a",modelFallback:saved}}),continue:async()=>{started++;return "unused";}};
 await assert.rejects(()=>continueInterruptedExplorer({runtime,agentId:"parent",identity,readCurrentDirectFallback:async()=>undefined}),/alternativas del perfil cambiaron/u);
 assert.equal(started,0);
 let validated=false;
 const result=await continueInterruptedExplorer({runtime:{...runtime,continue:async(_id,_identity,_signal,_onQueued,validateStart)=>{assert.ok(validateStart);await validateStart();validated=true;return "child";}},agentId:"parent",identity,readCurrentDirectFallback:async()=>saved});
 assert.equal(result.id,"child");assert.equal(validated,true);
});


test("B1 conserva la causa de interrupción si se retira la alternativa antes del encolado",async()=>{
 const saved={profile:"perfil",chain:[{model:"nvidia/modelo-b"}]};
 const plan={role:"explorer",model:"nvidia/modelo-a",explorerProfileOrigin:{scope:"global",name:"perfil"}} as const;
 const todo={...blockedTodo(),plan};let current=todo,reads=0,enqueued=0;const transitions:string[]=[];
 const runtime={query:async()=>({...interruptedEntry,spec:{model:plan.model,modelFallback:saved}}),continue:async(_id:any,_identity:any,_signal:any,onQueued:any,validateStart:any)=>{await validateStart();enqueued++;await onQueued("child",()=>{});return "child";}};
 const coordination={links:async()=>({list:async()=>[{taskId:todo.taskId,agentId:"parent",...identity,createdAt:new Date(0).toISOString()}]}),todos:async()=>({list:async()=>[current],update:async(...[taskId,_identity,revision,state,reason]:Parameters<SessionTodoStore["update"]>)=>{transitions.push(state);current={...current,taskId,current:{state,revision:revision+1,reason}};return current;}} as any),binder:async()=>({launch:async(_taskId:string,_agentId:string,_identity:any,dispatch:()=>void)=>{dispatch();}})};
 // La configuración real se obtiene de los constructores de perfiles usados por B1.
 const {emptyProfileFallbacks,setProfileFallbackChain}=await import("../src/runtime/lifecycle/profile-fallback-store.js");
 const config={profiles:{global:{schema:"asen.runtime-profiles/v1" as const,active:"perfil",profiles:[{name:"perfil",routes:{explorer:{model:plan.model}}}]}},fallbacksByScope:{global:setProfileFallbackChain(emptyProfileFallbacks(),"perfil","explorer",saved.chain)}};
 const read=async()=>++reads===2?{profiles:config.profiles,fallbacksByScope:{}}:config;
 const input={runtime,agentId:"parent",identity,todo:coordination,readCurrentExplorerFallbackConfig:read};
 await assert.rejects(()=>continueInterruptedExplorer(input),/alternativas del perfil cambiaron/u);
 assert.equal(enqueued,0);assert.equal(current.current.state,"blocked");assert.equal(current.current.reason,todo.current.reason);assert.deepEqual(transitions,["running","blocked"]);
 const result=await continueInterruptedExplorer(input);assert.equal(result.id,"child");assert.equal(enqueued,1);
});


test("M2: una alternativa directa antigua o de otro ámbito no autoriza reanudar",async()=>{
 const chain=[{model:"nvidia/modelo-b"}],model="nvidia/modelo-a",origin={scope:"project" as const,name:"perfil",model};
 let starts=0;
 for(const saved of [{profile:"perfil",chain},{profile:"perfil",chain,origin}]){
  const runtime={query:async()=>({...interruptedEntry,spec:{model,modelFallback:saved}}),continue:async()=>{starts++;return "child";}};
  await assert.rejects(()=>continueInterruptedExplorer({runtime,agentId:"parent",identity,readCurrentDirectFallback:async()=>({profile:"perfil",chain,origin:{...origin,scope:"global"}})}),/alternativas del perfil cambiaron/u);
 }
 assert.equal(starts,0);
});


test("M2: no reanudar un Explorer sin alternativas tras cambiar la sesión en cola",async()=>{
 let current=identity;
 await assert.rejects(()=>continueInterruptedExplorer({agentId:"parent",identity,runtime:{query:async()=>interruptedEntry,continue:async(_id,_identity,_signal,_onQueued,validateStart)=>{current={...identity,sessionId:"otra"};assert.ok(validateStart);await validateStart();assert.fail("No debe iniciar el agente");}},resolveCurrentIdentity:async()=>current}),/session or project changed before agent continuation dispatch/u);
});


test("M2: la retirada de alternativa durante la última comprobación de identidad impide reanudar",async()=>{
 const model="nvidia/modelo-a",saved={profile:"perfil",chain:[{model:"nvidia/modelo-b"}],origin:{scope:"global" as const,name:"perfil",model}};
 let reads=0,started=0;let active:typeof saved|undefined=saved;
 await assert.rejects(()=>continueInterruptedExplorer({agentId:"parent",identity,runtime:{query:async()=>({...interruptedEntry,spec:{model,modelFallback:saved}}),continue:async()=>{started++;return "unused";}},resolveCurrentIdentity:async()=>{if(++reads===3)active=undefined;return identity;},readCurrentDirectFallback:async()=>active}),/alternativas del perfil cambiaron/u);
 assert.equal(started,0);
});


test("M2: un cambio de sesión durante la lectura de alternativas impide reanudar",async()=>{
 const model="nvidia/modelo-a",saved={profile:"perfil",chain:[{model:"nvidia/modelo-b"}],origin:{scope:"global" as const,name:"perfil",model}};
 let current=identity,started=0;
 await assert.rejects(()=>continueInterruptedExplorer({agentId:"parent",identity,runtime:{query:async()=>({...interruptedEntry,spec:{model,modelFallback:saved}}),continue:async()=>{started++;return "unused";}},resolveCurrentIdentity:async()=>current,readCurrentDirectFallback:async()=>{current={...identity,sessionId:"otra"};return saved;}}),/session or project changed before agent continuation dispatch/u);
 assert.equal(started,0);
});
