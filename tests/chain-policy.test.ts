import assert from "node:assert/strict";
import test from "node:test";
import { planChainDelivery, type ChainPolicyInput, type ChainSliceInput } from "../src/delivery/chain-policy.js";

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);
function slice(overrides: Partial<ChainSliceInput> = {}): ChainSliceInput {
  return {
    id: "S1", purpose: "Focused policy", branch: "feat/policy-1", commits: [commitA],
    authoredAdditions: 120, authoredDeletions: 20, estimatedReviewMinutes: 30, baseBranch: "main",
    expectedDiffPaths: ["src/policy.ts", "tests/policy.test.ts"], observedDiffPaths: ["src/policy.ts", "tests/policy.test.ts"],
    dependencyIds: [], verification: [{ id: "focused-test", command: "npx tsx --test tests/policy.test.ts", result: "pass" }],
    docs: { state: "included", paths: ["docs/policy.md"] }, rollbackBoundary: "Revert this work unit",
    startState: "Policy absent", endState: "Policy verified", followUpFacts: ["Publish later"], outOfScopeFacts: ["No publication"],
    independentlyLandable: true, cohesive: true, focused: true, ...overrides,
  };
}
function second(overrides: Partial<ChainSliceInput> = {}): ChainSliceInput {
  return slice({
    id: "S2", purpose: "Second cohesive policy", branch: "feat/policy-2", commits: [commitB], authoredAdditions: 180,
    expectedDiffPaths: ["src/second.ts"], observedDiffPaths: ["src/second.ts"],
    verification: [{ id: "second-test", command: "npm test -- second", result: "pass" }], ...overrides,
  });
}
function input(overrides: Partial<ChainPolicyInput> = {}): ChainPolicyInput {
  return {
    targetBranch: "feat/policy-1", integrationBranch: "main", candidateCommits: [commitA],
    authoredAdditions: 120, authoredDeletions: 20, chainingRequested: false, integrationMode: "independent",
    slicingPasses: 1, slices: [slice()], selectedStrategy: "single", trackerBranch: null, ...overrides,
  };
}
function stack(overrides: Partial<ChainPolicyInput> = {}): ChainPolicyInput {
  return input({
    candidateCommits: [commitA, commitB], authoredAdditions: 300, authoredDeletions: 40,
    chainingRequested: true, slices: [slice(), second()], selectedStrategy: "stacked-main", ...overrides,
  });
}
test("single plan preserves complete slice evidence in an immutable pending-status output", () => {
  const source = input();
  const before = structuredClone(source);
  const plan = planChainDelivery(source);
  assert.deepEqual(source, before);
  assert.equal(plan.strategy, "single");
  assert.equal(plan.authoredBudget, 140);
  assert.deepEqual(plan.slices[0], { ...source.slices[0], authoredBudget: 140, dependencyDiagram: "📍 S1" });
  assert.deepEqual({ publication: plan.publicationStatus, merge: plan.mergeStatus }, { publication: "pending", merge: "pending" });
  assert.equal(Object.isFrozen(plan) && Object.isFrozen(plan.slices) && Object.isFrozen(plan.slices[0]), true);
  assert.equal(Object.isFrozen(plan.slices[0]!.verification) && Object.isFrozen(plan.slices[0]!.docs), true);
});
test("requested and aggregate-over-budget independent work uses integration-based stacks", () => {
  const aggregateLarge = stack({ chainingRequested: false, authoredAdditions: 430, slices: [slice({ authoredAdditions: 230 }), second({ authoredAdditions: 200 })] });
  for (const source of [stack(), aggregateLarge]) {
    const plan = planChainDelivery(source);
    assert.equal(plan.strategy, "stacked-main");
    assert.deepEqual(plan.slices.map(item => item.baseBranch), ["main", "main"]);
  }
});
test("dependent integration requires a distinct draft tracker and immediate chain bases", () => {
  const slices = [slice({ baseBranch: "feat/tracker", independentlyLandable: false }), second({ baseBranch: "feat/policy-1", dependencyIds: ["S1"], independentlyLandable: false })];
  const plan = planChainDelivery(stack({ integrationMode: "feature", trackerBranch: "feat/tracker", slices, selectedStrategy: "feature-chain" }));
  assert.deepEqual(plan.tracker, { state: "draft-no-merge", branch: "feat/tracker" });
  assert.throws(() => planChainDelivery(stack({ integrationMode: "feature", trackerBranch: "main", slices, selectedStrategy: "feature-chain" })));
});
test("one honest cohesive pass produces an exception for authored or review excess", () => {
  for (const oversized of [slice({ authoredAdditions: 381 }), slice({ estimatedReviewMinutes: 61 })]) {
    const plan = planChainDelivery(input({ authoredAdditions: oversized.authoredAdditions, slices: [oversized], selectedStrategy: "exception-required" }));
    assert.deepEqual(plan.exception, { state: "required", recommendation: "size:exception", rationaleRequired: true, publicationDisposition: "prohibited", mergeDisposition: "prohibited" });
  }
});
test("unfocused or non-cohesive slices reject every strategy including exception", () => {
  const feature = stack({ integrationMode: "feature", trackerBranch: "feat/tracker", selectedStrategy: "feature-chain", slices: [slice({ baseBranch: "feat/tracker", focused: false }), second({ baseBranch: "feat/policy-1", dependencyIds: ["S1"] })] });
  const cases = [input({ slices: [slice({ focused: false })] }), stack({ slices: [slice(), second({ cohesive: false })] }), feature, input({ authoredAdditions: 401, slices: [slice({ authoredAdditions: 401, cohesive: false })], selectedStrategy: "exception-required" })];
  for (const source of cases) assert.throws(() => planChainDelivery(source), /cohesive and focused/u);
});
test("exactly one slicing pass is mandatory", () => {
  assert.throws(() => planChainDelivery({ ...input(), slicingPasses: 2 } as never), /one slicing pass/u);
});
test("purpose, start, end, and out-of-scope facts must be nonempty exact text", () => {
  for (const bad of [slice({ purpose: "" }), slice({ startState: "" }), slice({ endState: "" }), slice({ outOfScopeFacts: [""] })]) assert.throws(() => planChainDelivery(input({ slices: [bad] })));
});
test("strategy, explicit branches, tracker, and bases cannot be mixed or inferred", () => {
  for (const source of [input({ selectedStrategy: "stacked-main" }), input({ integrationBranch: "feat/policy-1" }), stack({ trackerBranch: "feat/tracker" }), stack({ slices: [slice(), second({ baseBranch: "feat/policy-1" })] }), { ...input(), integrationBranch: undefined }]) assert.throws(() => planChainDelivery(source as ChainPolicyInput));
});
test("commit partition and authored totals must be exact, ordered, unique, and valid", () => {
  for (const source of [input({ candidateCommits: ["short"] }), stack({ candidateCommits: [commitB, commitA] }), stack({ candidateCommits: [commitA, commitA] }), input({ authoredAdditions: 119 }), input({ slices: [slice({ commits: [commitA, commitB] })] })]) assert.throws(() => planChainDelivery(source));
});
test("dependencies reject self, forward, unknown, and duplicate references", () => {
  for (const slices of [[slice({ dependencyIds: ["S1"] })], [slice({ dependencyIds: ["S2"] }), second()], [slice(), second({ dependencyIds: ["S1", "S1"] })]]) {
    const source = input({ candidateCommits: slices.flatMap(item => item.commits), authoredAdditions: slices.reduce((sum, item) => sum + item.authoredAdditions, 0), authoredDeletions: slices.reduce((sum, item) => sum + item.authoredDeletions, 0), slices });
    assert.throws(() => planChainDelivery(source));
  }
});
test("polluted diffs and missing verification, docs, rollback, or facts reject", () => {
  const bad = [slice({ observedDiffPaths: ["src/policy.ts", "vendor/leak.js"] }), slice({ expectedDiffPaths: ["../secret"] }), slice({ verification: [] }), slice({ docs: { state: "not_applicable", reason: "" } }), slice({ rollbackBoundary: "" }), slice({ followUpFacts: [""] })];
  for (const item of bad) assert.throws(() => planChainDelivery(input({ slices: [item] })));
});
test("every dependency diagram pins its own current slice", () => {
  const plan = planChainDelivery(stack());
  assert.equal(plan.slices[0]!.dependencyDiagram, "📍 S1\nS2");
  assert.equal(plan.slices[1]!.dependencyDiagram, "S1\n📍 S2");
});

test("exact shape rejects extras, accessors, inheritance, sparse arrays, and mutation surfaces", () => {
  assert.throws(() => planChainDelivery({ ...input(), extra: true } as never));
  const accessor = { ...input() };
  let reads = 0;
  Object.defineProperty(accessor, "targetBranch", { enumerable: true, get() { reads += 1; return "feat/stolen"; } });
  assert.throws(() => planChainDelivery(accessor));
  assert.equal(reads, 0);
  assert.throws(() => planChainDelivery(Object.assign(Object.create({}), input())));
  assert.throws(() => planChainDelivery({ ...input(), candidateCommits: new Array(1) }));
  for (const forbidden of ["ready", "authority", "push", "commit", "publish", "remote"]) assert.equal(Object.keys(planChainDelivery(input())).includes(forbidden), false);
});
