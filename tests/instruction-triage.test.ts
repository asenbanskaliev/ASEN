import assert from "node:assert/strict";
import test from "node:test";
import {controlledInstructionPlanCommand} from "../src/runtime/route-command.js";

test("ECO-06 plain instruction triage does not mint a route or execution authority",()=>{
 const result=JSON.parse(controlledInstructionPlanCommand("Inspect the repository and propose a safe fix","/repo"));
 assert.equal(result.status,"needs-verified-facts");
 assert.equal(result.repository,"/repo");
 assert.equal(result.execution.started,false);
 assert.equal(result.execution.authorized,false);
 assert.ok(result.missingFacts.includes("writes"));
 assert.equal(Object.hasOwn(result,"delegatedAgents"),false);
 assert.equal(Object.hasOwn(result,"selectedSkills"),false);
});
test("ECO-06 instruction triage rejects control characters and oversized text",()=>{
 assert.throws(()=>controlledInstructionPlanCommand("bad\u0000instruction","/repo"),/invalid/);
 assert.throws(()=>controlledInstructionPlanCommand("a".repeat(8193),"/repo"),/invalid/);
});

const oddInput=(overrides:Record<string,unknown>={})=>JSON.stringify({
 instruction:"Implement the bounded change and verify it",
 taskIdentity:"ECO-06-A1",intent:"implementation",scope:{kind:"known",expectedPaths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"]},
 writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],session:{estimatedMinutes:20,continuation:false},
 testing:{kind:"required"},review:{kind:"ordinary",estimatedMinutes:15},unresolvedDecisions:[],...overrides,
});
test("ECO-06 exact ODD input compiles to an immutable ordered task DAG without granting execution",()=>{
 const value=JSON.parse(controlledInstructionPlanCommand(oddInput(),"/repo"));
 const graph=value.executablePlan;
 assert.equal(graph.taskId,"ECO-06-A1");assert.equal(graph.route,"orchestrate");
 assert.deepEqual(graph.tasks.map((task:{role:string})=>task.role),["explorer","worker","reviewer","verifier"]);
 assert.deepEqual(graph.tasks.map((task:{dependsOn:string[]})=>task.dependsOn.length),[0,1,1,2]);
 assert.deepEqual(graph.topologicalOrder,graph.tasks.map((task:{id:string})=>task.id));
 assert.equal(graph.tasks[0].status,"ready");assert.equal(graph.tasks[1].status,"waiting");
 assert.equal(graph.execution,"not_started");assert.equal(graph.authorization,"required_before_dispatch");
 assert.ok(graph.tasks.every((task:{execution:string;authorization:string})=>task.execution==="not_started"&&task.authorization==="required_before_dispatch"));
});
test("ECO-06 plan route creates a clarification gate instead of fabricating agent work",()=>{
 const value=JSON.parse(controlledInstructionPlanCommand(oddInput({scope:{kind:"unknown",reason:"Paths unknown"},writes:[]}),"/repo"));
 assert.equal(value.executablePlan.route,"plan");assert.equal(value.executablePlan.tasks.length,1);
 assert.equal(value.executablePlan.tasks[0].role,"clarifier");assert.equal(value.executablePlan.tasks[0].status,"clarification_required");
 assert.deepEqual(value.executablePlan.tasks[0].dependsOn,[]);
});
