import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  claimLifecycleApplicability,
  claimTddObligation,
  decideLifecycleApplicability,
  tddObligationFor,
  type LifecycleApplicabilityInput,
} from "../src/lifecycle/applicability.js";
import { createSkillLifecycle } from "../src/lifecycle/skill-lifecycle.js";
import { buildOrchestrationPlan } from "../src/orchestration/orchestrator.js";
import { issueOddDecision } from "./helpers/odd-routing.js";

type ChangeKind = NonNullable<Parameters<typeof issueOddDecision>[0]["writes"]>[number]["changeKind"];
type Setup = {
  task?: string;
  repository?: string;
  candidateId?: string;
  revision?: string;
  paths?: readonly string[];
  writes?: readonly Readonly<{ path: string; changeKind: ChangeKind }>[];
  testingRequired?: boolean;
  explicitMode?: LifecycleApplicabilityInput["explicitMode"];
  riskOperations?: Parameters<typeof issueOddDecision>[0]["riskOperations"];
};

function issue(setup: Setup = {}) {
  const task = setup.task ?? "GSP-05C1";
  const repository = setup.repository ?? "asen/repository";
  const paths = setup.paths ?? ["src/a.ts"];
  const writes = setup.writes ?? [{ path: paths[0]!, changeKind: "behavior" as const }];
  const candidate = { id: setup.candidateId ?? "candidate-1", repository, revision: setup.revision ?? "abc123", createdAt: "now" };
  const decision = issueOddDecision({
    taskId: task, repository, paths, writes,
    ...(setup.testingRequired === undefined ? {} : { testingRequired: setup.testingRequired }),
    ...(setup.riskOperations === undefined ? {} : { riskOperations: setup.riskOperations }),
  });
  buildOrchestrationPlan({ taskId: task, repository, prompt: "apply", candidate }, decision);
  const applicability = decideLifecycleApplicability(decision, {
    taskIdentity: task,
    repositoryIdentity: repository,
    candidate: { id: candidate.id, repository, revision: candidate.revision },
    explicitMode: setup.explicitMode ?? "unspecified",
    affectedSubsystems: ["lifecycle"],
    expectedPaths: paths,
    requiredArtifacts: [],
  });
  return { applicability, obligation: tddObligationFor(applicability) };
}

test("requires TDD only for exact behavior writes and preserves their order", () => {
  const { applicability, obligation } = issue({
    paths: ["docs/readme.md", "src/b.ts", "src/a.ts"],
    writes: [
      { path: "docs/readme.md", changeKind: "documentation" },
      { path: "src/b.ts", changeKind: "behavior" },
      { path: "src/a.ts", changeKind: "behavior" },
    ],
  });
  assert.equal(obligation.mode, "required");
  assert.equal(obligation.reason, "behavior-testing-required");
  assert.deepEqual(obligation.behaviorPaths, ["src/b.ts", "src/a.ts"]);
  assert.equal(obligation.applicabilityId, applicability.applicabilityId);
});

test("non-behavior writes remain not applicable regardless lifecycle mode or risk", () => {
  for (const changeKind of ["documentation", "configuration", "schema", "security", "migration", "format", "generated"] as const) {
    const { obligation } = issue({
      writes: [{ path: "src/a.ts", changeKind }],
      testingRequired: false,
      explicitMode: changeKind === "documentation" ? "organic" : "structured",
      riskOperations: changeKind === "configuration" ? ["external_write"] : [],
    });
    assert.deepEqual({ mode: obligation.mode, reason: obligation.reason, paths: obligation.behaviorPaths }, {
      mode: "not-applicable", reason: "no-behavior-writes", paths: [],
    });
  }
});

test("behavior declared testing N/A blocks before structured or high-risk selection", () => {
  for (const setup of [
    { explicitMode: "structured" as const },
    { riskOperations: ["external_write" as const] },
  ]) {
    const { applicability, obligation } = issue({ ...setup, testingRequired: false });
    assert.equal(applicability.outcome, "blocked");
    assert.deepEqual(applicability.reasons, ["behavior-testing-contradiction"]);
    assert.deepEqual({ mode: obligation.mode, reason: obligation.reason }, {
      mode: "not-applicable", reason: "behavior-testing-contradiction",
    });
  }
});

test("binds deterministic requirement identity to exact applicability, task, repository, candidate, revision, and paths", () => {
  const first = issue();
  const repeated = issue();
  assert.equal(first.obligation.requirementId, repeated.obligation.requirementId);
  const payload = {
    applicabilityId: first.applicability.applicabilityId,
    taskIdentity: first.obligation.taskIdentity,
    repositoryIdentity: first.obligation.repositoryIdentity,
    candidate: first.obligation.candidate,
    behaviorPaths: first.obligation.behaviorPaths,
    mode: first.obligation.mode,
    reason: first.obligation.reason,
  };
  assert.equal(first.obligation.requirementId, createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
  assert.match(first.obligation.requirementId, /^[0-9a-f]{64}$/u);

  for (const variant of [
    issue({ task: "GSP-05C1-other" }),
    issue({ repository: "asen/other" }),
    issue({ candidateId: "candidate-2" }),
    issue({ revision: "def456" }),
    issue({ paths: ["src/b.ts", "src/a.ts"], writes: [{ path: "src/b.ts", changeKind: "behavior" }, { path: "src/a.ts", changeKind: "behavior" }] }),
  ]) assert.notEqual(variant.obligation.requirementId, first.obligation.requirementId);
});

test("is deeply immutable and retrievable only from the exact issued applicability", () => {
  const { applicability, obligation } = issue();
  assert.ok(Object.isFrozen(obligation));
  assert.ok(Object.isFrozen(obligation.candidate));
  assert.ok(Object.isFrozen(obligation.behaviorPaths));
  assert.equal(tddObligationFor(applicability), obligation);
  assert.throws(() => tddObligationFor({ ...applicability }), /exact issued applicability/);
  assert.throws(() => tddObligationFor({}), /exact issued applicability/);
  assert.throws(() => tddObligationFor(undefined), /exact issued applicability/);
});

test("claims genuine obligations once while clones, forgeries, and unissued values reject", () => {
  const { obligation } = issue();
  assert.throws(() => claimTddObligation({ ...obligation }), /not issued here/);
  assert.throws(() => claimTddObligation({}), /not issued here/);
  assert.throws(() => claimTddObligation(undefined), /not issued here/);
  claimTddObligation(obligation);
  assert.throws(() => claimTddObligation(obligation), /already been claimed/);
});

test("the obligation grants no lifecycle, phase, cycle, mutation, review, or delivery authority", () => {
  const { obligation } = issue();
  assert.throws(() => claimLifecycleApplicability(obligation), /not issued here/);
  assert.throws(() => createSkillLifecycle(obligation as never), /not issued here/);
  assert.deepEqual(Object.keys(obligation).sort(), [
    "applicabilityId", "behaviorPaths", "candidate", "mode", "reason", "repositoryIdentity", "requirementId", "taskIdentity",
  ].sort());
  assert.equal(JSON.stringify(obligation).match(/authority|phase|cycle|mutation|review|release|delivery|grant|callback/giu), null);
});
