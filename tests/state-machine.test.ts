import assert from "node:assert/strict";
import test from "node:test";
import { guardedTransition, transition } from "../src/core/state-machine.js";

test("rejects skipping directly to VERIFIED", () => {
  assert.throws(() => transition("IMPLEMENTING", "VERIFIED"));
});

test("allows canonical engineering path only through privileged gates", () => {
  let phase = transition("DISCOVERING", "PLANNING");
  phase = guardedTransition({from:phase,to:"IMPLEMENTING",gate:{ok:true,reason:"gate passed"}});
  phase = transition(phase, "TESTING");
  phase = transition(phase, "REVIEWING");
  phase = transition(phase, "VERIFYING");
  assert.equal(guardedTransition({from:phase,to:"VERIFIED",gate:{ok:true,reason:"gate passed"}}), "VERIFIED");
});

test("plain transition cannot bypass privileged gates",()=>{
 assert.throws(()=>transition("PLANNING","IMPLEMENTING"),/requires gate authorization/);
 assert.throws(()=>transition("VERIFYING","VERIFIED"),/requires gate authorization/);
});


test("privileged transitions fail closed without gate authorization",()=>{
 assert.throws(()=>guardedTransition({from:"PLANNING",to:"IMPLEMENTING",gate:{ok:false,reason:"blocked transition"}}),/blocked transition/);
 assert.throws(()=>guardedTransition({from:"VERIFYING",to:"VERIFIED",gate:{ok:false,reason:"blocked transition"}}),/blocked transition/);
});

test("privileged transitions succeed only after explicit gate authorization",()=>{
 assert.equal(guardedTransition({from:"PLANNING",to:"IMPLEMENTING",gate:{ok:true,reason:"gate passed"}}),"IMPLEMENTING");
 assert.equal(guardedTransition({from:"VERIFYING",to:"VERIFIED",gate:{ok:true,reason:"gate passed"}}),"VERIFIED");
});

test("authorization cannot make an invalid structural transition valid",()=>{
 assert.throws(()=>guardedTransition({from:"DISCOVERING",to:"VERIFIED",gate:{ok:true,reason:"gate passed"}}),/Invalid ASEN transition/);
});


test("privileged transition consumes a gate result rather than a raw authorization flag",()=>{
 const gate={ok:false,reason:"verification evidence missing"};
 assert.throws(
  ()=>guardedTransition({from:"VERIFYING",to:"VERIFIED",gate}),
  /verification evidence missing/
 );
});
