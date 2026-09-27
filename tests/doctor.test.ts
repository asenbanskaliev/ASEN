import assert from "node:assert/strict";
import test from "node:test";
import { runDoctor } from "../src/lifecycle/doctor.js";
test("doctor is diagnostic",()=> {
  const checks=runDoctor({piAvailable:true,gitAvailable:true,registryAvailable:false});
  assert.equal(checks.find(x=>x.name==="Registry")?.ok,false);
});
