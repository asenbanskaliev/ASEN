import assert from "node:assert/strict";
import test from "node:test";
import { isGenuineReadyWorkUnitBoundary, planWorkUnitBoundary,
  type WorkUnitBoundaryInput } from "../src/delivery/work-unit-policy.js";
const tracker = "odd/tasks/skill-contract-parity.md";
function input(overrides: Partial<WorkUnitBoundaryInput> = {}): WorkUnitBoundaryInput {
  return {
    featureIdentity: "GSP-04",
    taskIdentity: "GSP-04E1a",
    taskDocumentPath: tracker,
    purpose: "Classify one work-unit boundary",
    behaviorIds: ["boundary-classification"],
    currentBranch: "feat/work-unit-policy",
    defaultBranch: "main",
    authoredAdditions: 80,
    authoredDeletions: 20,
    expectedChangedPaths: ["src/delivery/work-unit-policy.ts", "tests/work-unit-policy.test.ts", tracker],
    rollbackBoundaries: ["Revert E1a"],
    deliveryRelationship: { kind: "single" },
    ...overrides,
  };
}
test("returns an exact immutable genuine ready boundary without mutating input", () => {
  const source = input();
  const before = structuredClone(source);
  const result = planWorkUnitBoundary(source);
  assert.deepEqual(source, before);
  assert.equal(result.decision, "ready");
  assert.match(result.boundaryId, /^[0-9a-f]{64}$/u);
  assert.equal(isGenuineReadyWorkUnitBoundary(result), true);
  assert.equal(isGenuineReadyWorkUnitBoundary(structuredClone(result)), false);
  assert.equal(Object.isFrozen(result) && Object.isFrozen(result.behaviorIds), true);
});
test("requires a feature branch from explicit branch facts", () => {
  const result = planWorkUnitBoundary(input({ currentBranch: "main" }));
  assert.deepEqual(result, { decision: "branch_required", currentBranch: "main", defaultBranch: "main" });
  assert.throws(() => planWorkUnitBoundary({ ...input(), defaultBranch: undefined } as unknown as WorkUnitBoundaryInput));
});
test("splits multiple coherent behavior and rollback boundaries", () => {
  const result = planWorkUnitBoundary(input({
    behaviorIds: ["classification", "recording"],
    rollbackBoundaries: ["Revert classification", "Revert recording"],
  }));
  assert.deepEqual(result, {
    decision: "split_required",
    behaviorIds: ["classification", "recording"],
    rollbackBoundaries: ["Revert classification", "Revert recording"],
  });
  assert.throws(() => planWorkUnitBoundary(input({ behaviorIds: ["one", "two"] })), /one-to-one/u);
});
test("accepts exactly 400 authored lines and chains at 401", () => {
  assert.equal(planWorkUnitBoundary(input({ authoredAdditions: 380 })).decision, "ready");
  assert.deepEqual(planWorkUnitBoundary(input({ authoredAdditions: 381 })), {
    decision: "chain_required",
    authoredAdditions: 381,
    authoredDeletions: 20,
    authoredTotal: 401,
  });
});
test("rejects an unsafe aggregate from individually safe authored counts", () => {
  assert.throws(() => planWorkUnitBoundary(input({
    authoredAdditions: Number.MAX_SAFE_INTEGER,
    authoredDeletions: 1,
  })), /aggregate authored total/u);
});
test("applies branch, split, then chain precedence", () => {
  const mixed = { behaviorIds: ["one", "two"], rollbackBoundaries: ["one", "two"], authoredAdditions: 500 };
  assert.equal(planWorkUnitBoundary(input({ ...mixed, currentBranch: "main" })).decision, "branch_required");
  assert.equal(planWorkUnitBoundary(input(mixed)).decision, "split_required");
});
test("rejects extras, inherited records, and symbol properties", () => {
  assert.throws(() => planWorkUnitBoundary({ ...input(), extra: true } as unknown as WorkUnitBoundaryInput));
  assert.throws(() => planWorkUnitBoundary(Object.assign(Object.create({ inherited: true }), input())));
  const withSymbol = input();
  Object.defineProperty(withSymbol, Symbol("hidden"), { value: true });
  assert.throws(() => planWorkUnitBoundary(withSymbol));
});
test("rejects accessors without invoking them", () => {
  const withAccessor = input();
  let reads = 0;
  Object.defineProperty(withAccessor, "purpose", {
    enumerable: true,
    get() {
      reads += 1;
      return "unsafe";
    },
  });
  assert.throws(() => planWorkUnitBoundary(withAccessor));
  assert.equal(reads, 0);
});
test("rejects sparse arrays, duplicates, and malformed relationships", () => {
  assert.throws(() => planWorkUnitBoundary(input({ behaviorIds: new Array(1) })));
  assert.throws(() => planWorkUnitBoundary(input({ behaviorIds: ["same", "same"], rollbackBoundaries: ["a", "b"] })));
  assert.throws(() => planWorkUnitBoundary(input({ deliveryRelationship: { kind: "chain_slice", sliceId: "" } })));
});
test("requires canonical NFC paths including the task document", () => {
  assert.throws(() => planWorkUnitBoundary(input({ expectedChangedPaths: ["src/a.ts"] })), /task document/u);
  for (const path of ["../tasks.md", "C:/tasks.md", "e\u0301.md"]) {
    assert.throws(() => planWorkUnitBoundary(input({ taskDocumentPath: path })));
  }
});
test("exposes no completion, review, authority, mutation, or readiness surface", async () => {
  const module = await import("../src/delivery/work-unit-policy.js");
  for (const name of ["recordCompletedWorkUnit", "complete", "review", "authority", "mutation", "readiness"]) {
    assert.equal(name in module, false);
  }
  const result = planWorkUnitBoundary(input());
  assert.equal(result.decision, "ready");
  for (const name of ["commit", "evidence", "reviewCandidate", "authority", "mutation", "readiness"]) {
    assert.equal(name in result, false);
  }
});
