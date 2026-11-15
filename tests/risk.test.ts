import test from "node:test";
import assert from "node:assert/strict";
import { assessRisk, verificationLevel } from "../src/flow/risk.js";

test("risk triage reserves independent verification for sensitive or unknown work", () => {
 assert.equal(assessRisk({ securitySensitive: true }), "high");
 assert.equal(verificationLevel("unknown"), "independent");
 assert.equal(verificationLevel("low"), "structural");
});
