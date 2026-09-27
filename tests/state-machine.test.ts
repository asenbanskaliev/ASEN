import assert from "node:assert/strict";
import test from "node:test";
import { transition } from "../src/core/state-machine.js";

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
