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
