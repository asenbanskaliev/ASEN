import assert from "node:assert/strict";
import test from "node:test";
import { assessReviewPolicy } from "../src/review/review-assessment-policy.js";

// U2 planning only: no native operations, consent, profiles, IO or production wiring.
for (const nativeRisk of ["passive", "medium", "high", "unassessable"] as const) {
  test(`${nativeRisk}: preserve observation, use reference verification fallback`, () => {
    const plan = assessReviewPolicy({ nativeRisk, mode: "off" });
    assert.equal(plan.nativeRisk, nativeRisk);
    assert.equal(plan.verificationRisk, nativeRisk === "passive" ? "passive" : "medium");
    assert.equal(plan.writerSelfVerification, nativeRisk !== "passive");
    assert.equal(plan.structuralReadbackOnly, nativeRisk === "passive");
    assert.equal(plan.independentVerifier, false);
    assert.equal(plan.reviewRecommendation, "assessment-only");
    assert.equal("reviewDue" in plan, false); // Older reference binary: absent, not false.
    assert.equal(plan.lifecycleAuthority, false);
    assert.ok(Object.isFrozen(plan));
  });
}

test("all six named escalations require a verifier, even with RDD off", () => {
  for (const item of [1, 2, 3, 4, 5, 6] as const) {
    const escalation = { item, reason: "Named risk applies" };
    const plan = assessReviewPolicy({ nativeRisk: "passive", mode: "off", escalation });
    assert.equal(plan.verificationRisk, "high");
    assert.equal(plan.writerSelfVerification, true);
    assert.equal(plan.structuralReadbackOnly, false);
    assert.equal(plan.independentVerifier, true);
    assert.deepEqual(plan.escalation, escalation);
    assert.notEqual(plan.escalation, escalation);
    assert.ok(Object.isFrozen(plan.escalation));
    assert.equal(Object.isFrozen(escalation), false); // No mutation of caller data.
  }
});

for (const mode of ["on", "off", "unavailable"] as const) {
  test(`${mode}: review metadata never grants authority or replaces verification`, () => {
    for (const reviewDue of [true, false, undefined]) {
      const plan = assessReviewPolicy({ nativeRisk: "high", mode, reviewDue,
        escalation: { item: 2, reason: "Security contract" } });
      assert.equal(plan.mode, mode);
      assert.equal(plan.reviewRecommendation, mode === "off" ? "assessment-only"
        : mode === "unavailable" ? "unavailable"
        : reviewDue === undefined ? "unknown" : reviewDue ? "due" : "not-due");
      assert.equal(plan.reviewDue, reviewDue);
      assert.equal("reviewDue" in plan, reviewDue !== undefined);
      assert.equal(plan.lifecycleAuthority, false);
      assert.equal(plan.independentVerifier, true);
      assert.equal(plan.writerSelfVerification, true);
    }
  });
}

test("bounded reasons preserve reference's original text", () => {
  for (const reason of ["x", " x ", "x".repeat(500)]) {
    assert.equal(assessReviewPolicy({ nativeRisk: "medium", mode: "on",
      escalation: { item: 1, reason } }).escalation?.reason, reason);
  }
});

test("reject malformed shapes and explicit invalid values rather than invent evidence", () => {
  const base = { nativeRisk: "medium", mode: "off" };
  for (const input of [null, [], true, {}, { ...base, nativeRisk: "low" },
    { ...base, nativeRisk: undefined }, { ...base, mode: "unknown" },
    { ...base, mode: undefined }, { ...base, mode: true },
    { ...base, reviewDue: null }, { ...base, reviewDue: "true" },
    { ...base, writerProfile: "small" }, { ...base, consent: true }]) {
    assert.throws(() => assessReviewPolicy(input as never), TypeError);
  }
  for (const escalation of [null, [], {}, { item: "1", reason: "x" },
    { item: 0, reason: "x" }, { item: 7, reason: "x" }, { item: 1.5, reason: "x" },
    { item: 1, reason: "" }, { item: 1, reason: " \n " },
    { item: 1, reason: "x".repeat(501) }, { item: 1, reason: 4 },
    { item: 1, reason: "x", authority: true }]) {
    assert.throws(() => assessReviewPolicy({ ...base, escalation } as never), TypeError);
  }
});
