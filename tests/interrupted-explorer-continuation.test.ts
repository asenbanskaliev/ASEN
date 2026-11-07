import assert from "node:assert/strict";
import test from "node:test";
import {continueInterruptedExplorer} from "../src/agents/interrupted-explorer-continuation.js";
import type {SessionTodoStore} from "../src/runtime/todo-store.js";

const identity={sessionId:"session-a",projectId:"D:/project"};
const interruptedEntry={record:{id:"parent",state:"interrupted",role:"explorer",sessionId:identity.sessionId,projectId:identity.projectId}} as any;

function blockedTodo(){return {taskId:"todo-a",current:{state:"blocked",revision:3,reason:"Pi session ended while the linked agent was running"}} as any;}

test("interrupted Explorer continuation service preserves the public queued result without a dialog hook",async()=>{
 let queryCount=0,continueCount=0,identityChecks=0;
 const result=await continueInterruptedExplorer({
  agentId:"parent",identity,
  runtime:{query:async()=>{queryCount++;return interruptedEntry;},continue:async()=>{continueCount++;return "child";}},
  resolveCurrentIdentity:async()=>{identityChecks++;return identity;},
 });
 assert.deepEqual(result,{id:"child",state:"queued",continuedFrom:"parent",role:"explorer"});
 assert.equal(queryCount,1);assert.equal(continueCount,1);assert.equal(identityChecks,1);
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
