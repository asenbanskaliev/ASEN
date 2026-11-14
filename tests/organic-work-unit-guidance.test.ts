import assert from "node:assert/strict";
import test from "node:test";
import {controlledInstructionPlanCommand} from "../src/runtime/route-command.js";
import {getSkillContract,selectSkills} from "../src/skills/registry.js";

test("small organic planning stays inline without changing work-unit or delivery admission",()=>{
 const request={
  instruction:"Fix one bounded behavior",taskIdentity:"organic-inline-guidance",intent:"implementation",
  scope:{kind:"known",expectedPaths:["src/a.ts"]},writes:[{path:"src/a.ts",changeKind:"behavior"}],
  riskOperations:[],session:{estimatedMinutes:5,continuation:false},testing:{kind:"required"},
  review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[],
 };
 const plan=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(request),"/repo"));
 assert.equal(plan.route,"direct");
 assert.deepEqual(plan.requiredAgentRoles,[],"inline work requires no delegated agents");
 assert.equal(plan.executablePlan.tasks.length,1);
 assert.equal(plan.executablePlan.tasks[0].role,"primary");
 assert.equal(plan.executablePlan.tasks[0].authorization,"required_before_dispatch");
 assert.deepEqual(plan.execution,{started:false,authorized:false});
 assert.deepEqual(plan.actions,{informationRetrieved:false,reviewRequested:false});
 for(const id of ["asen-work-unit","asen-safe-change","asen-apply"])assert.ok(plan.selectedSkills.includes(id));
 assert.equal(plan.selectedSkills.includes("asen-tdd"),false);
 assert.ok(selectSkills({phase:"delivery-chain"}).some(skill=>skill.id==="asen-work-unit"));
 assert.deepEqual(getSkillContract("asen-work-unit").evidence,["work-unit"]);
 assert.deepEqual(getSkillContract("asen-work-unit").blocks,["mutation"]);
});
