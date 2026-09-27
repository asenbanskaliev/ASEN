import assert from "node:assert/strict";
import test from "node:test";
import { routeOdd } from "../src/flow/odd.js";

test("ODD keeps a bounded simple request direct",()=>{
  const d=routeOdd({filesTouched:1,nonTrivialWrites:1});
  assert.equal(d.route,"direct"); assert.deepEqual(d.reasons,["simple-bounded-request"]);
});
test("ODD orchestrates four or more files",()=>assert.equal(routeOdd({filesTouched:4}).route,"orchestrate"));
test("ODD orchestrates two non-trivial writes",()=>assert.equal(routeOdd({nonTrivialWrites:2}).route,"orchestrate"));
test("ODD routes incidents before ordinary complexity",()=>assert.equal(routeOdd({incident:true,filesTouched:1}).route,"incident"));
test("ODD routes verification commands to verifier",()=>assert.equal(routeOdd({verificationCommand:true,filesTouched:5}).route,"verify"));
test("ODD routes long sessions to orchestration",()=>assert.equal(routeOdd({longSession:true}).route,"orchestrate"));
test("unknown scope fails closed to independent verification",()=>{
 const d=routeOdd({unknownScope:true}); assert.equal(d.route,"plan"); assert.equal(d.risk,"unknown"); assert.equal(d.verification,"independent");
});
test("high risk requires planning even when small",()=>assert.equal(routeOdd({securitySensitive:true,filesTouched:1}).route,"plan"));
