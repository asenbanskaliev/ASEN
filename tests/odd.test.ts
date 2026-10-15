import assert from "node:assert/strict";
import test from "node:test";
import { routeOdd } from "../src/flow/odd.js";

test("ODD keeps a bounded simple request direct",()=>{
  const d=routeOdd({filesTouched:1,nonTrivialWrites:1});
  assert.equal(d.route,"direct"); assert.deepEqual(d.reasons,["simple-bounded-request"]);
});
test("ODD keeps a clear multi-file change in the direct route",()=>assert.equal(routeOdd({filesTouched:8,nonTrivialWrites:3}).route,"direct"));
test("ODD routes incidents before ordinary complexity",()=>assert.equal(routeOdd({incident:true,filesTouched:1}).route,"incident"));
test("ODD routes verification commands to verifier",()=>assert.equal(routeOdd({verificationCommand:true,filesTouched:5}).route,"verify"));
test("ODD keeps a long bounded task direct",()=>assert.equal(routeOdd({longSession:true,filesTouched:8}).route,"direct"));
test("unknown scope fails closed to independent verification",()=>{
 const d=routeOdd({unknownScope:true}); assert.equal(d.route,"plan"); assert.equal(d.risk,"unknown"); assert.equal(d.verification,"independent");
});
test("high risk requires planning even when small",()=>assert.equal(routeOdd({securitySensitive:true,filesTouched:1}).route,"plan"));
