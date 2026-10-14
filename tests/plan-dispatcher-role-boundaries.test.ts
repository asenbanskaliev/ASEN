import assert from "node:assert/strict";
import test from "node:test";
import {dispatchNextPlanTask} from "../src/runtime/plan-dispatcher.js";

test("ECO-06 primary and clarification roles fail closed without agent launch",async()=>{
 for(const role of ["primary","clarifier"] as const){
  let confirmations=0,agentStarts=0;
  const input={
   todos:{list:async()=>[{taskId:`todo-${role}`,requestId:`asen-plan:${role}`,current:{state:"planned",revision:1},dependsOn:[],description:"Do not dispatch this unsupported role",plan:{role,priority:1,skillPaths:[]}}]},
   agents:{startReadOnly:async()=>{agentStarts++;return"unexpected";},startControlledWorker:async()=>{agentStarts++;return"unexpected";}},
   links:{},identity:{sessionId:"eco06-role-boundary",projectId:"/tmp/eco06-role-boundary"},
   validateIdentity:async()=>{},confirm:async()=>{confirmations++;return true;},
  } as unknown as Parameters<typeof dispatchNextPlanTask>[0];

  const result=await dispatchNextPlanTask(input);
  assert.equal(result.status,"blocked",role);
  if(result.status==="blocked")assert.match(result.reason,new RegExp(`controlled ${role} lifecycle dispatcher`));
  assert.equal(confirmations,0,`${role} must not ask for a misleading execution approval`);
  assert.equal(agentStarts,0,`${role} must not start a Pi agent`);
 }
});
