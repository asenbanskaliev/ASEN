import {
  deriveOddFacts,
  planOddRoute,
  type OddChangeKind,
  type OddIntent,
  type OddReviewKind,
  type OddRiskOperation,
  type OddRouteDecision,
  type OddScope,
} from "../../src/flow/odd-routing.js";

interface OddDecisionFixture {
  taskId: string;
  repository: string;
  intent?: OddIntent;
  paths?: readonly string[];
  scope?: OddScope;
  writes?: readonly Readonly<{ path: string; changeKind: OddChangeKind }>[];
  riskOperations?: readonly OddRiskOperation[];
  estimatedMinutes?: number;
  continuation?: boolean;
  testingRequired?: boolean;
  reviewKind?: OddReviewKind;
  reviewMinutes?: number;
  unresolvedDecisions?: readonly string[];
}

/** Issues a genuine A1 decision from readable task and repository-bound request facts. */
export function issueOddDecision(fixture: OddDecisionFixture): OddRouteDecision {
  const scope = fixture.scope ?? { kind: "known" as const, expectedPaths: fixture.paths ?? ["src/feature.ts"] };
  return planOddRoute(deriveOddFacts({
    taskIdentity: fixture.taskId,
    repositoryIdentity: fixture.repository,
    intent: fixture.intent ?? "implementation",
    scope,
    writes: fixture.writes ?? [],
    riskOperations: fixture.riskOperations ?? [],
    session: { estimatedMinutes: fixture.estimatedMinutes ?? 15, continuation: fixture.continuation ?? false },
    testing: fixture.testingRequired === false ? { kind: "n_a", reason: "No behavior change" } : { kind: "required" },
    review: { kind: fixture.reviewKind ?? "none", estimatedMinutes: fixture.reviewMinutes ?? 10 },
    unresolvedDecisions: fixture.unresolvedDecisions ?? [],
  }));
}
