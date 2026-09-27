import assert from "node:assert/strict";
import test from "node:test";
import { guardedTransition, transition } from "../src/core/state-machine.js";

test("rejects skipping directly to VERIFIED", () => {
  assert.throws(() => transition("IMPLEMENTING", "VERIFIED"));
});

test("allows canonical engineering path", () => {
  let phase = transition("DISCOVERING", "PLANNING");
  phase = transition(phase, "IMPLEMENTING");
  phase = transition(phase, "TESTING");
  phase = transition(phase, "REVIEWING");
  phase = transition(phase, "VERIFYING");
  assert.equal(transition(phase, "VERIFIED"), "VERIFIED");
});


test("privileged transitions fail closed without gate authorization",()=>{
 assert.throws(()=>guardedTransition({from:"PLANNING",to:"IMPLEMENTING",authorized:false}),/blocked transition/);
 assert.throws(()=>guardedTransition({from:"VERIFYING",to:"VERIFIED",authorized:false}),/blocked transition/);
});

test("privileged transitions succeed only after explicit gate authorization",()=>{
 assert.equal(guardedTransition({from:"PLANNING",to:"IMPLEMENTING",authorized:true}),"IMPLEMENTING");
 assert.equal(guardedTransition({from:"VERIFYING",to:"VERIFIED",authorized:true}),"VERIFIED");
});

test("authorization cannot make an invalid structural transition valid",()=>{
 assert.throws(()=>guardedTransition({from:"DISCOVERING",to:"VERIFIED",authorized:true}),/Invalid ASEN transition/);
});
