import test from "node:test";
import assert from "node:assert/strict";
import {attributeParallelChildWorker} from "../src/runtime/agents/parallel-worker-attribution.js";
import type {SourceTodoRow} from "../src/runtime/agents/parallel-todo-bindings.js";
import type {ParallelChildSessionLink} from "../src/runtime/agents/parallel-todo-session-links.js";
import type {PublicAgentRecord} from "../src/runtime/agents/agent-lifecycle.js";
import type {TaskAgentLink} from "../src/runtime/agents/task-agent-link-store.js";

const root="/work/asen",child="/work/asen-workers/child",sha="a".repeat(40);
const owner:ParallelChildSessionLink={
 batchId:"batch-1",sourceSessionId:"source-pi",sourceProjectId:root,
 sourceTodoId:"source-todo-a",sourceRequestId:"asen-plan:source-a:worker",
 sourceTodoRevision:1,childSessionId:"child-pi",childProjectId:child,
 sourceHead:sha,attachedAt:"2026-11-15T18:00:00.000Z",
 authority:"none",autoDispatch:false,autoMerge:false
} as ParallelChildSessionLink;
const writeSurfaces=["src/a.ts"];
const todo:SourceTodoRow={
 taskId:"child-todo-a",title:"Implement isolated child",requestId:"asen-plan:child-a:worker",
 current:{state:"succeeded",sessionId:"child-pi",projectId:child,revision:5},
 plan:{role:"worker",skillSelection:{phase:"apply"},candidate:{repository:child,revision:sha},
  writeSurfaces:["src/a.ts"]}
} as unknown as SourceTodoRow;
const agent:PublicAgentRecord={
 id:"asen-plan:child-a:worker",role:"worker",owner:{kind:"user",id:"pi:child-pi"},
 sessionId:"child-pi",projectId:child,state:"completed",
 createdAt:"2026-11-15T18:01:00.000Z",updatedAt:"2026-11-15T18:02:00.000Z"
};
const binding:TaskAgentLink={
 taskId:"child-todo-a",agentId:agent.id,sessionId:"child-pi",projectId:child,
 createdAt:"2026-11-15T18:01:00.000Z"
};
const values=()=>({owner,writeSurfaces,todos:[todo],agents:[agent],taskAgentLinks:[binding]});
test("T06 genuinely linked terminal child Worker is only advisory, not integration PASS",()=>{
 const input=values(),before=structuredClone(input);
 const report=attributeParallelChildWorker(input);
 assert.deepEqual(report,{
  sourceTodoId:"source-todo-a",childTodoId:"child-todo-a",agentId:agent.id,
  agentState:"completed",agentUpdatedAt:agent.updatedAt,childTodoState:"succeeded",
  modelActual:"unknown",modelConsumedProven:false,acceptance:"not-accepted",autoMerge:false
 });
 assert.deepEqual(input,before);
});
test("T06 an unrelated worker in the same Pi child session is not attributed to the source Todo",()=>{
 const input=values();
 assert.throws(()=>attributeParallelChildWorker({...input,agents:[{...agent,id:"other-worker"}]}),/lifecycle evidence is absent/u);
});
test("T06 missing durable task-agent relation cannot infer a Worker from role alone",()=>{
 const input=values();
 assert.equal(attributeParallelChildWorker({...input,taskAgentLinks:[]}),undefined);
 assert.equal(attributeParallelChildWorker({...input,todos:[]}),undefined);
});
test("T06 wrong candidate, root, scope, request or task identity cannot attribute a Worker",()=>{
 const input=values();
 const badTodos=[
  {...todo,plan:{...todo.plan!,writeSurfaces:["src/b.ts"]}},
  {...todo,plan:{...todo.plan!,candidate:{...todo.plan!.candidate!,revision:"b".repeat(40)}}},
  {...todo,current:{...todo.current,sessionId:"other-session"}},
  {...todo,requestId:"forged:worker"},
  {...todo,plan:{...todo.plan!,role:"reviewer"}}
 ];
 for(const row of badTodos)
  assert.equal(attributeParallelChildWorker({...input,todos:[row as SourceTodoRow]}),undefined);
});
test("T06 duplicate matching plans or task-agent bindings fail closed",()=>{
 const input=values();
 assert.throws(()=>attributeParallelChildWorker({...input,todos:[todo,{...todo,taskId:"child-todo-b"}]}),/Ambiguous/u);
 assert.throws(()=>attributeParallelChildWorker({...input,taskAgentLinks:[binding,{...binding,agentId:"other"}]}),/Ambiguous/u);
 assert.throws(()=>attributeParallelChildWorker({...input,taskAgentLinks:[{...binding,agentId:"other"}]}),/agent ID/u);
});
test("T06 a failed or interrupted genuine Worker is observed but never marked accepted",()=>{
 const input=values();
 for(const state of ["failed","interrupted","cancelled"] as const){
  const report=attributeParallelChildWorker({...input,agents:[{...agent,state}]});
  assert.equal(report?.agentState,state);
  assert.equal(report?.acceptance,"not-accepted");assert.equal(report?.modelConsumedProven,false);
 }
});
