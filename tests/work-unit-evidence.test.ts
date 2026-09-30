import assert from "node:assert/strict";
import test from "node:test";
import { planWorkUnitBoundary, type BoundaryApplicability, type ReadyWorkUnitBoundary,
  type WorkUnitBoundaryInput } from "../src/delivery/work-unit-policy.js";
import { recordCompletedWorkUnit, type WorkUnitEvidenceInput } from "../src/delivery/work-unit-evidence.js";

const tracker = "odd/tasks/skill-contract-parity.md";
const commit = "a".repeat(40);
const tree = "b".repeat(40);
const parent = "c".repeat(40);
const generatedIdentity = `sha256:${"d".repeat(64)}`;
const required = { kind: "required" } as const;
const na = (reason: string): BoundaryApplicability => ({ kind: "n_a", reason });
const baseBoundary: WorkUnitBoundaryInput = {
  featureIdentity: "GSP-04", taskIdentity: "GSP-04E1b1", taskDocumentPath: tracker,
  purpose: "Record completed work-unit evidence", behaviorIds: ["completion-evidence"],
  currentBranch: "feat/work-unit-evidence", defaultBranch: "main",
  authoredAdditions: 180, authoredDeletions: 4,
  expectedChangedPaths: ["src/delivery/work-unit-evidence.ts", "tests/work-unit-evidence.test.ts", "docs/work-units.md", tracker, "generated/report.json"],
  rollbackBoundaries: ["Revert GSP-04E1b1"],
  generatedArtifacts: [{ path: "generated/report.json", contentIdentity: generatedIdentity }],
  previousReviewedBoundary: null, focusedTests: required, runtimeHarness: required,
  documentation: required, deliveryRelationship: { kind: "single" },
};
function ready(overrides: Partial<WorkUnitBoundaryInput> = {}): ReadyWorkUnitBoundary {
  const result = planWorkUnitBoundary({ ...baseBoundary, ...overrides });
  assert.equal(result.decision, "ready");
  return result;
}
function evidence(boundary: ReadyWorkUnitBoundary): WorkUnitEvidenceInput {
  return {
    featureIdentity: boundary.featureIdentity, taskIdentity: boundary.taskIdentity, taskDocumentPath: tracker,
    boundaryId: boundary.boundaryId, repositoryIdentity: "https://github.com/acme/asen", purpose: boundary.purpose,
    deliveryRelationship: boundary.deliveryRelationship, previousReviewedBoundary: boundary.previousReviewedBoundary,
    rollbackBoundary: boundary.rollbackBoundaries[0]!,
    commit: { identity: commit, treeIdentity: tree, parentIdentity: parent, message: "feat(delivery): record evidence", currentTreeIdentity: tree },
    authoredAdditions: boundary.authoredAdditions, authoredDeletions: boundary.authoredDeletions,
    changedPaths: [...boundary.expectedChangedPaths], behaviorPaths: ["src/delivery/work-unit-evidence.ts"],
    focusedTestPaths: ["tests/work-unit-evidence.test.ts"], documentationPaths: ["docs/work-units.md"],
    generatedArtifacts: boundary.generatedArtifacts.map(item => ({ ...item })),
    focusedTests: { status: "pass", command: "npx tsx --test tests/work-unit-evidence.test.ts", scenario: "focused contract", exitCode: 0, summary: "Focused checks passed" },
    runtimeHarness: { status: "pass", command: "npm run audit:skill-parity", scenario: "runtime harness", exitCode: 0, summary: "Runtime harness passed" },
    documentation: { status: "required", paths: ["docs/work-units.md"] }, taskDocumentCommitIdentity: commit,
  };
}
function reject(change: (value: any) => void, boundary = ready()): void {
  const value = structuredClone(evidence(boundary));
  change(value);
  assert.throws(() => recordCompletedWorkUnit(boundary, value));
}

test("records immutable required evidence without input mutation or deferred surfaces", () => {
  const boundary = ready();
  const input = evidence(boundary);
  const before = structuredClone(input);
  const result = recordCompletedWorkUnit(boundary, input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result) && Object.isFrozen(result.commit) && Object.isFrozen(result.generatedArtifacts[0]), true);
  for (const name of ["ready", "decision", "readiness", "reviewCandidate", "candidate", "authority", "verdict", "mutation", "callback", "publication", "merge"]) {
    assert.equal(name in result, false);
  }
});
test("records a consistent all-64 commit snapshot", () => {
  const boundary = ready();
  const base = evidence(boundary);
  const identity = "a".repeat(64);
  const input = {
    ...base,
    commit: {
      ...base.commit,
      identity,
      treeIdentity: "b".repeat(64),
      parentIdentity: "c".repeat(64),
      currentTreeIdentity: "b".repeat(64),
    },
    taskDocumentCommitIdentity: identity,
  };
  assert.equal(recordCompletedWorkUnit(boundary, input).commit.identity.length, 64);
});
test("rejects mixed SHA widths across the complete commit snapshot", () => {
  reject(value => {
    value.commit.treeIdentity = "b".repeat(64);
    value.commit.currentTreeIdentity = "b".repeat(64);
  });
  reject(value => {
    value.commit.identity = "a".repeat(64);
    value.commit.treeIdentity = "b".repeat(64);
    value.taskDocumentCommitIdentity = value.commit.identity;
  });
});
test("records boundary-authorized N/A evidence and copied chain provenance", () => {
  const reason = "No focused or documentation surface";
  const boundary = ready({ focusedTests: na(reason), runtimeHarness: na(reason), documentation: na(reason),
    deliveryRelationship: { kind: "chain_slice", sliceId: "E1b1" }, previousReviewedBoundary: "GSP-04E1a",
    expectedChangedPaths: ["src/delivery/work-unit-evidence.ts", tracker, "generated/report.json"] });
  const input = { ...evidence(boundary), focusedTestPaths: [], documentationPaths: [],
    focusedTests: { status: "n_a" as const, reason }, runtimeHarness: { status: "n_a" as const, reason },
    documentation: { status: "n_a" as const, reason } };
  const result = recordCompletedWorkUnit(boundary, input);
  assert.equal(result.previousReviewedBoundary, "GSP-04E1a");
  assert.deepEqual(result.focusedTests, { status: "n_a", reason });
});
test("burns malformed attempts and rejects forged or reused boundaries", () => {
  const malformed = ready();
  assert.throws(() => recordCompletedWorkUnit(malformed, { ...evidence(malformed), taskIdentity: "other" }));
  assert.throws(() => recordCompletedWorkUnit(malformed, evidence(malformed)), /already/u);
  const used = ready();
  recordCompletedWorkUnit(used, evidence(used));
  assert.throws(() => recordCompletedWorkUnit(used, evidence(used)), /already/u);
  const forged = structuredClone(ready());
  assert.throws(() => recordCompletedWorkUnit(forged, evidence(forged)), /not issued/u);
});
test("rejects provenance, commit, count, rollback, and exact-shape mismatches", () => {
  for (const change of [
    (value: any) => { value.featureIdentity = "other"; }, (value: any) => { value.repositoryIdentity = ""; },
    (value: any) => { value.previousReviewedBoundary = "other"; }, (value: any) => { value.commit.identity = `x${commit}`; },
    (value: any) => { value.commit.treeIdentity = "B".repeat(64); }, (value: any) => { value.commit.currentTreeIdentity = parent; },
    (value: any) => { value.commit.message = "feature: unsupported"; }, (value: any) => { value.authoredAdditions += 1; },
    (value: any) => { value.rollbackBoundary = "other"; }, (value: any) => { value.taskDocumentCommitIdentity = parent; },
    (value: any) => { value.extra = true; }, (value: any) => { Object.setPrototypeOf(value.commit, { inherited: true }); },
  ]) reject(change);
});
test("rejects partition, generated relabel, applicability, and contradictory observations", () => {
  for (const change of [
    (value: any) => { value.changedPaths.pop(); }, (value: any) => { value.behaviorPaths.push(value.focusedTestPaths[0]); },
    (value: any) => { value.generatedArtifacts[0].contentIdentity = `sha256:${"e".repeat(64)}`; },
    (value: any) => { value.behaviorPaths.push(value.generatedArtifacts.pop().path); },
    (value: any) => { value.focusedTests.exitCode = 1; }, (value: any) => { value.focusedTests.extra = true; },
    (value: any) => { value.focusedTests = { status: "n_a", reason: "no" }; },
    (value: any) => { value.runtimeHarness.command = ""; }, (value: any) => { value.documentation.paths = []; },
  ]) reject(change);
  for (const summary of ["0 passed; 1 error", "tests did not pass", "tests not-passed", "0 errors", "checks complete"]) {
    reject(value => { value.focusedTests.summary = summary; });
  }
});
