import assert from "node:assert/strict";
import test from "node:test";
import { accountChainArtifacts, type ChainArtifactAccountingInput, type GeneratedArtifact, type ObservedDiffStat } from "../src/delivery/chain-artifact-accounting.js";
import { planChainDelivery, type ChainPolicyInput, type ChainSliceInput } from "../src/delivery/chain-policy.js";

const commitA = "a".repeat(40), commitB = "b".repeat(40), hashA = `sha256:${"1".repeat(64)}`, hashB = `sha256:${"2".repeat(64)}`;
function slice(overrides: Partial<ChainSliceInput> = {}): ChainSliceInput {
  return {
    id: "S1", purpose: "Account for the complete diff", branch: "feat/one", commits: [commitA], authoredAdditions: 120, authoredDeletions: 20,
    estimatedReviewMinutes: 30, baseBranch: "main", expectedDiffPaths: ["src/a.ts", "tests/a.test.ts"], observedDiffPaths: ["src/a.ts", "tests/a.test.ts"],
    dependencyIds: [], verification: [{ id: "test", command: "npm test", result: "pass" }], docs: { state: "not_applicable", reason: "No docs impact" },
    rollbackBoundary: "Revert the work unit", startState: "Accounting absent", endState: "Accounting present", followUpFacts: [], outOfScopeFacts: ["No publication"],
    independentlyLandable: true, cohesive: true, focused: true, ...overrides,
  };
}
function plan(overrides: Partial<ChainPolicyInput> = {}) {
  return planChainDelivery({
    targetBranch: "feat/one", integrationBranch: "main", candidateCommits: [commitA], authoredAdditions: 120, authoredDeletions: 20,
    chainingRequested: false, integrationMode: "independent", slicingPasses: 1, slices: [slice()], selectedStrategy: "single", trackerBranch: null, ...overrides,
  });
}
const authoredStats = (): ObservedDiffStat[] => [
  { path: "src/a.ts", additions: 100, deletions: 10, classification: "authored" },
  { path: "tests/a.test.ts", additions: 20, deletions: 10, classification: "authored" },
];
const artifact = (overrides: Partial<GeneratedArtifact> = {}): GeneratedArtifact => ({
  path: "dist/a.js", contentIdentity: hashA, additions: 30, deletions: 5,
  classificationEvidence: { identity: "generator-report-1", source: "build manifest" }, ...overrides,
});
function generatedPlan() {
  return plan({ authoredAdditions: 100, authoredDeletions: 10, slices: [slice({ authoredAdditions: 100, authoredDeletions: 10, expectedDiffPaths: ["src/a.ts", "dist/a.js"], observedDiffPaths: ["src/a.ts", "dist/a.js"] })] });
}
function generatedInput(overrides: Partial<ChainArtifactAccountingInput> = {}): ChainArtifactAccountingInput {
  return {
    plan: generatedPlan(), diffStats: [authoredStats()[0]!, { path: "dist/a.js", additions: 30, deletions: 5, classification: "generated" }],
    generatedArtifacts: [artifact()], totalAdditions: 130, totalDeletions: 15, ...overrides,
  };
}

test("no-generated accounting preserves complete immutable pending evidence", () => {
  const input: ChainArtifactAccountingInput = { plan: plan(), diffStats: authoredStats(), generatedArtifacts: [], totalAdditions: 120, totalDeletions: 20 };
  const before = structuredClone(input);
  const result = accountChainArtifacts(input);
  assert.deepEqual(input, before);
  assert.equal(result.accountingStatus, "complete");
  assert.deepEqual(result.totals, { authoredAdditions: 120, authoredDeletions: 20, generatedAdditions: 0, generatedDeletions: 0, completeAdditions: 120, completeDeletions: 20, completeBudget: 140 });
  assert.deepEqual(result.completeSnapshot, { paths: ["src/a.ts", "tests/a.test.ts"], artifactIdentities: [], classificationEvidence: [] });
  assert.deepEqual({ publication: result.publicationStatus, merge: result.mergeStatus }, { publication: "pending", merge: "pending" });
  assert.equal(Object.isFrozen(result) && Object.isFrozen(result.slices) && Object.isFrozen(result.slices[0]!.diffStats), true);
});

test("generated paths remain in per-slice and complete snapshot accounting", () => {
  const result = accountChainArtifacts(generatedInput());
  assert.deepEqual(result.slices[0], {
    id: "S1", diffStats: [{ path: "src/a.ts", additions: 100, deletions: 10, classification: "authored" }, { path: "dist/a.js", additions: 30, deletions: 5, classification: "generated" }],
    generatedArtifacts: [artifact()], authoredAdditions: 100, authoredDeletions: 10, generatedAdditions: 30, generatedDeletions: 5,
    completeAdditions: 130, completeDeletions: 15, completeBudget: 145,
  });
  assert.deepEqual(result.completeSnapshot, { paths: ["src/a.ts", "dist/a.js"], artifactIdentities: [hashA], classificationEvidence: [{ identity: "generator-report-1", source: "build manifest" }] });
  assert.equal(Object.isFrozen(result.slices[0]!.generatedArtifacts[0]!.classificationEvidence), true);
});

test("accounting is path-bound per slice", () => {
  const second = slice({ id: "S2", branch: "feat/two", commits: [commitB], authoredAdditions: 40, authoredDeletions: 4, expectedDiffPaths: ["src/b.ts", "dist/b.js"], observedDiffPaths: ["src/b.ts", "dist/b.js"] });
  const sourcePlan = plan({ candidateCommits: [commitA, commitB], authoredAdditions: 160, authoredDeletions: 24, chainingRequested: true, slices: [slice(), second], selectedStrategy: "stacked-main" });
  const result = accountChainArtifacts({ plan: sourcePlan, diffStats: [...authoredStats(), { path: "src/b.ts", additions: 40, deletions: 4, classification: "authored" }, { path: "dist/b.js", additions: 8, deletions: 2, classification: "generated" }], generatedArtifacts: [artifact({ path: "dist/b.js", contentIdentity: hashB, additions: 8, deletions: 2 })], totalAdditions: 168, totalDeletions: 26 });
  assert.deepEqual(result.slices.map(item => ({ id: item.id, additions: item.completeAdditions, deletions: item.completeDeletions })), [{ id: "S1", additions: 120, deletions: 20 }, { id: "S2", additions: 48, deletions: 6 }]);
});

test("authored lines cannot be relabeled as generated", () => {
  const input = generatedInput({ diffStats: [{ path: "src/a.ts", additions: 90, deletions: 10, classification: "authored" }, { path: "dist/a.js", additions: 40, deletions: 5, classification: "generated" }], generatedArtifacts: [artifact({ additions: 40 })] });
  assert.throws(() => accountChainArtifacts(input), /authored stat counts/u);
});

test("generated artifact path, counts, identities, and evidence fail closed", () => {
  const cases: Partial<ChainArtifactAccountingInput>[] = [
    { generatedArtifacts: [artifact({ path: "dist/other.js" })] }, { generatedArtifacts: [artifact({ additions: 29 })] },
    { generatedArtifacts: [artifact({ contentIdentity: "sha256:ABC" })] }, { generatedArtifacts: [artifact({ contentIdentity: `sha256:${"A".repeat(64)}` })] },
    { generatedArtifacts: [artifact({ classificationEvidence: { identity: "", source: "build" } })] },
    { generatedArtifacts: [artifact({ classificationEvidence: { identity: "report", source: "" } })] },
  ];
  for (const changes of cases) assert.throws(() => accountChainArtifacts(generatedInput(changes)));
  const duplicateInput = (evidenceIdentity: string, secondHash: string): ChainArtifactAccountingInput => ({
    plan: plan({ authoredAdditions: 0, authoredDeletions: 0, slices: [slice({ authoredAdditions: 0, authoredDeletions: 0, expectedDiffPaths: ["dist/a.js", "dist/b.js"], observedDiffPaths: ["dist/a.js", "dist/b.js"] })] }),
    diffStats: [{ path: "dist/a.js", additions: 1, deletions: 0, classification: "generated" }, { path: "dist/b.js", additions: 1, deletions: 0, classification: "generated" }],
    generatedArtifacts: [artifact({ additions: 1, deletions: 0 }), artifact({ path: "dist/b.js", contentIdentity: secondHash, additions: 1, deletions: 0, classificationEvidence: { identity: evidenceIdentity, source: "build manifest" } })], totalAdditions: 2, totalDeletions: 0,
  });
  assert.throws(() => accountChainArtifacts(duplicateInput("generator-report-2", hashA)), /artifact identities/u);
  assert.throws(() => accountChainArtifacts(duplicateInput("generator-report-1", hashB)), /evidence identities/u);
});

test("omitted, extra, duplicate, and cross-slice paths fail closed", () => {
  assert.throws(() => accountChainArtifacts({ plan: plan(), diffStats: authoredStats().slice(0, 1), generatedArtifacts: [], totalAdditions: 120, totalDeletions: 20 }));
  assert.throws(() => accountChainArtifacts({ plan: plan(), diffStats: [...authoredStats(), { path: "extra.ts", additions: 0, deletions: 0, classification: "authored" }], generatedArtifacts: [], totalAdditions: 120, totalDeletions: 20 }));
  assert.throws(() => accountChainArtifacts({ plan: plan(), diffStats: [authoredStats()[0]!, authoredStats()[0]!], generatedArtifacts: [], totalAdditions: 120, totalDeletions: 20 }));
  const reused = slice({ id: "S2", branch: "feat/two", commits: [commitB] });
  const reusedPlan = plan({ candidateCommits: [commitA, commitB], authoredAdditions: 240, authoredDeletions: 40, chainingRequested: true, slices: [slice(), reused], selectedStrategy: "stacked-main" });
  assert.throws(() => accountChainArtifacts({ plan: reusedPlan, diffStats: authoredStats(), generatedArtifacts: [], totalAdditions: 240, totalDeletions: 40 }), /reused across slices/u);
});

test("full totals must include authored and generated lines exactly", () => {
  assert.throws(() => accountChainArtifacts(generatedInput({ totalAdditions: 100 })), /full candidate totals/u);
});

test("canonical exact data rejects traversal, accessors, symbols, and sparse arrays without mutation", () => {
  for (const polluted of ["../dist/a.js", "C:/dist/a.js"]) assert.throws(() => accountChainArtifacts({ ...generatedInput(), diffStats: [{ path: polluted, additions: 100, deletions: 10, classification: "authored" }, { path: "dist/a.js", additions: 30, deletions: 5, classification: "generated" }] }));
  assert.throws(() => accountChainArtifacts(Object.assign(Object.create({ inherited: true }), generatedInput())));
  const accessor = generatedInput(); let reads = 0;
  Object.defineProperty(accessor.diffStats[0]!, "path", { enumerable: true, get() { reads += 1; return "src/a.ts"; } });
  assert.throws(() => accountChainArtifacts(accessor)); assert.equal(reads, 0);
  const symbolInput = generatedInput(); Object.defineProperty(symbolInput.generatedArtifacts[0]!, Symbol("hidden"), { value: true });
  assert.throws(() => accountChainArtifacts(symbolInput));
  const sparse = generatedInput({ diffStats: new Array(2) }); assert.throws(() => accountChainArtifacts(sparse));
});

test("forged and reused D1a plans fail before accounting", () => {
  const genuine = plan();
  assert.throws(() => accountChainArtifacts({ plan: structuredClone(genuine), diffStats: authoredStats(), generatedArtifacts: [], totalAdditions: 120, totalDeletions: 20 }));
  accountChainArtifacts({ plan: genuine, diffStats: authoredStats(), generatedArtifacts: [], totalAdditions: 120, totalDeletions: 20 });
  assert.throws(() => accountChainArtifacts({ plan: genuine, diffStats: authoredStats(), generatedArtifacts: [], totalAdditions: 120, totalDeletions: 20 }), /already claimed/u);
});

test("complete slice budget over 400 requires replanning without authority", () => {
  const result = accountChainArtifacts(generatedInput({ diffStats: [authoredStats()[0]!, { path: "dist/a.js", additions: 271, deletions: 20, classification: "generated" }], generatedArtifacts: [artifact({ additions: 271, deletions: 20 })], totalAdditions: 371, totalDeletions: 30 }));
  assert.equal(result.slices[0]!.completeBudget, 401);
  assert.deepEqual({ accounting: result.accountingStatus, publication: result.publicationStatus, merge: result.mergeStatus }, { accounting: "replan_required", publication: "pending", merge: "pending" });
  for (const forbidden of ["ready", "readiness", "authority", "exception", "publish", "mergeAuthority"]) assert.equal(Object.keys(result).includes(forbidden), false);
});
