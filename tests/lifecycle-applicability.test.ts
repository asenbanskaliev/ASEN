import assert from "node:assert/strict";
import test from "node:test";
import { decideLifecycleApplicability, claimLifecycleApplicability, type LifecycleApplicabilityInput } from "../src/lifecycle/applicability.js";
import { buildOrchestrationPlan } from "../src/orchestration/orchestrator.js";
import { issueOddDecision } from "./helpers/odd-routing.js";

type Fixture = Parameters<typeof issueOddDecision>[0];
const candidate = { id: "candidate-1", repository: "asen/repository", revision: "abc123", createdAt: "now" };
function prepared(fixture: Partial<Fixture> = {}) {
  const full = { taskId: "GSP-05B1b", repository: candidate.repository, paths: ["src/a.ts"], writes: [{ path: "src/a.ts", changeKind: "behavior" as const }], ...fixture };
  const decision = issueOddDecision(full);
  buildOrchestrationPlan({ taskId: full.taskId, repository: full.repository, prompt: "apply", candidate }, decision);
  return decision;
}
function input(overrides: Partial<LifecycleApplicabilityInput> = {}): LifecycleApplicabilityInput {
  return { taskIdentity: "GSP-05B1b", repositoryIdentity: candidate.repository, candidate: { id: candidate.id, repository: candidate.repository, revision: candidate.revision }, explicitMode: "unspecified", affectedSubsystems: ["lifecycle"], expectedPaths: ["src/a.ts"], requiredArtifacts: [], ...overrides };
}

test("selects bounded organic analysis, documentation, and behavior from original facts", () => {
  const cases = [
    [{ intent: "analysis" as const, paths: [], writes: [] }, [], "analysis"],
    [{ writes: [{ path: "src/a.ts", changeKind: "documentation" as const }] }, ["src/a.ts"], "documentation"],
    [{ writes: [{ path: "src/a.ts", changeKind: "configuration" as const }] }, ["src/a.ts"], "behavior"],
  ] as const;
  for (const [fixture, paths, nature] of cases) {
    const result = decideLifecycleApplicability(prepared(fixture), input({ expectedPaths: paths }));
    assert.equal(result.outcome, "organic");
    assert.equal(result.changeNature, nature);
  }
});

test("selects structured explicitly or from artifacts, orchestration, high risk, schema, security, and migration", () => {
  const cases: [Partial<Fixture>, Partial<LifecycleApplicabilityInput>][] = [
    [{}, { explicitMode: "structured" }],
    [{}, { requiredArtifacts: ["proposal", "design"] }],
    [{ paths: ["a", "b", "c", "d"], writes: [{ path: "a", changeKind: "behavior" }] }, { expectedPaths: ["a", "b", "c", "d"] }],
    [{ riskOperations: ["external_write"] }, {}],
    [{ writes: [{ path: "src/a.ts", changeKind: "schema" }] }, {}],
    [{ writes: [{ path: "src/a.ts", changeKind: "security" }] }, {}],
    [{ writes: [{ path: "src/a.ts", changeKind: "migration" }] }, {}],
  ];
  for (const [fixture, overrides] of cases) assert.equal(decideLifecycleApplicability(prepared(fixture), input(overrides)).outcome, "structured");
});

test("unsafe explicit organic is blocked without structured fallback", () => {
  for (const fixture of [
    { paths: ["a", "b", "c", "d"], writes: [{ path: "a", changeKind: "behavior" as const }] },
    { writes: [{ path: "src/a.ts", changeKind: "schema" as const }] },
    { riskOperations: ["security_boundary" as const] },
  ]) {
    const paths = fixture.paths ?? ["src/a.ts"];
    const result = decideLifecycleApplicability(prepared(fixture), input({ explicitMode: "organic", expectedPaths: paths }));
    assert.equal(result.outcome, "blocked");
    assert.deepEqual(result.reasons, ["explicit-organic-unsafe"]);
  }
  assert.equal(decideLifecycleApplicability(prepared(), input({ explicitMode: "organic", requiredArtifacts: ["task_plan"] })).outcome, "blocked");
});

test("blockers precede explicit structured selection", () => {
  const cases: [Partial<Fixture>, string[], string[]][] = [
    [{ scope: { kind: "unknown", reason: "Mapping pending" }, writes: [], riskOperations: ["external_write"] }, [], ["unknown-scope"]],
    [{ unresolvedDecisions: ["Choose boundary"] }, ["src/a.ts"], ["unresolved-decisions", "unknown-risk"]],
    [{ intent: "incident", paths: [], writes: [] }, [], ["incident-route"]],
    [{ intent: "verification", paths: [], writes: [] }, [], ["verification-route"]],
    [{ intent: "analysis", writes: [{ path: "src/a.ts", changeKind: "behavior" }] }, ["src/a.ts"], ["contradictory-change-facts"]],
  ];
  for (const [fixture, paths, reasons] of cases) {
    const result = decideLifecycleApplicability(prepared(fixture), input({ explicitMode: "structured", expectedPaths: paths }));
    assert.equal(result.outcome, "blocked");
    assert.deepEqual(result.reasons, reasons);
  }
});

test("derives precedence solely from writes and rejects caller relabeling", () => {
  const decision = prepared({ paths: ["a", "b", "c"], writes: [{ path: "a", changeKind: "schema" }, { path: "b", changeKind: "migration" }, { path: "c", changeKind: "security" }] });
  assert.equal(decideLifecycleApplicability(decision, input({ expectedPaths: ["a", "b", "c"] })).changeNature, "security");
  const relabeled = { ...input(), changeNature: "documentation" };
  assert.throws(() => decideLifecycleApplicability(prepared(), relabeled as LifecycleApplicabilityInput), /shape/);
});

test("exact binding and path mismatches burn the first attempt", () => {
  const variants: Partial<LifecycleApplicabilityInput>[] = [
    { taskIdentity: "other" }, { repositoryIdentity: "other" },
    { candidate: { ...input().candidate, id: "other" } },
    { candidate: { ...input().candidate, repository: "other" } },
    { candidate: { ...input().candidate, revision: "other" } },
    { expectedPaths: [] }, { expectedPaths: ["src/a.ts", "extra.ts"] },
  ];
  for (const overrides of variants) {
    const decision = prepared();
    assert.throws(() => decideLifecycleApplicability(decision, input(overrides)), /mismatch/);
    assert.throws(() => decideLifecycleApplicability(decision, input()), /already attempted/);
  }
  const ordered = prepared({ paths: ["a", "b"], writes: [{ path: "a", changeKind: "behavior" }] });
  assert.throws(() => decideLifecycleApplicability(ordered, input({ expectedPaths: ["b", "a"] })), /paths mismatch/);
});

test("requires successful candidate-bound orchestration and genuine unconsumed decisions", () => {
  const raw = issueOddDecision({ taskId: "GSP-05B1b", repository: candidate.repository });
  assert.throws(() => decideLifecycleApplicability(raw, input()), /not genuinely claimed/);
  buildOrchestrationPlan({ taskId: "GSP-05B1b", repository: candidate.repository, prompt: "p", candidate }, raw);
  assert.throws(() => decideLifecycleApplicability(raw, input()), /already attempted/);
  const candidateLess = issueOddDecision({ taskId: "GSP-05B1b", repository: candidate.repository });
  buildOrchestrationPlan({ taskId: "GSP-05B1b", repository: candidate.repository, prompt: "p" }, candidateLess);
  assert.throws(() => decideLifecycleApplicability(candidateLess, input()), /no successful candidate-bound/);
  const genuine = prepared();
  assert.throws(() => decideLifecycleApplicability({ ...genuine }, input()), /not genuinely claimed/);
  decideLifecycleApplicability(genuine, input());
  assert.throws(() => decideLifecycleApplicability(genuine, input()), /already attempted/);
});

test("rejects malformed exact data, Unicode, controls, duplicates, accessors, symbols, and prototypes", () => {
  const invalid: unknown[] = [
    { ...input(), extra: true }, { ...input(), affectedSubsystems: ["e\u0301"] }, { ...input(), affectedSubsystems: ["bad\nname"] },
    { ...input(), affectedSubsystems: ["same", "same"] }, { ...input(), affectedSubsystems: [] }, { ...input(), requiredArtifacts: ["proposal", "proposal"] },
    { ...input(), expectedPaths: ["../bad"] }, Object.assign(Object.create({ extra: true }), input()),
  ];
  const symbolic = input() as LifecycleApplicabilityInput & { [key: symbol]: boolean }; symbolic[Symbol("x")] = true; invalid.push(symbolic);
  let reads = 0; const accessor = input() as unknown as Record<string, unknown>;
  Object.defineProperty(accessor, "taskIdentity", { enumerable: true, get: () => { reads += 1; return "GSP-05B1b"; } }); invalid.push(accessor);
  for (const value of invalid) assert.throws(() => decideLifecycleApplicability(prepared(), value as LifecycleApplicabilityInput));
  assert.equal(reads, 0);
});

test("is deterministic, deeply frozen, nonmutating, opaque, and claimable once", () => {
  const firstInput = input({ affectedSubsystems: ["lifecycle", "routing"], requiredArtifacts: ["specification"] });
  const before = structuredClone(firstInput);
  const first = decideLifecycleApplicability(prepared(), firstInput);
  const second = decideLifecycleApplicability(prepared(), structuredClone(firstInput));
  assert.deepEqual(firstInput, before);
  assert.equal(first.applicabilityId, second.applicabilityId);
  assert.match(first.applicabilityId, /^[0-9a-f]{64}$/u);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.candidate) && Object.isFrozen(first.expectedPaths) && Object.isFrozen(first.affectedSubsystems) && Object.isFrozen(first.requiredArtifacts) && Object.isFrozen(first.reasons));
  assert.deepEqual(Object.keys(first).sort(), ["applicabilityId", "taskIdentity", "repositoryIdentity", "candidate", "decisionId", "changeNature", "expectedPaths", "affectedSubsystems", "requiredArtifacts", "outcome", "reasons"].sort());
  assert.equal(JSON.stringify(first).match(/authority|readiness|verdict|callback|adapter|phase/giu), null);
  assert.throws(() => claimLifecycleApplicability({ ...first }), /not issued/);
  claimLifecycleApplicability(first);
  assert.throws(() => claimLifecycleApplicability(first), /already been claimed/);
});
