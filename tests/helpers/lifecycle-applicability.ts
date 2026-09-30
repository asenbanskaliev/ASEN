import type { Candidate } from "../../src/core/types.js";
import {
  decideLifecycleApplicability,
  type LifecycleApplicability,
} from "../../src/lifecycle/applicability.js";
import {
  createSkillLifecycle,
  type SkillLifecycle,
} from "../../src/lifecycle/skill-lifecycle.js";
import { deriveOddFacts, planOddRoute } from "../../src/flow/odd-routing.js";
import { buildOrchestrationPlan } from "../../src/orchestration/orchestrator.js";

/** Builds the genuine ODD and candidate-bound orchestration facts required by B1. */
export function issueStructuredLifecycleApplicability(
  taskIdentity: string,
  candidate: Candidate,
  expectedPaths: readonly string[] = ["src/feature.ts"],
): LifecycleApplicability {
  const decision = planOddRoute(deriveOddFacts({
    taskIdentity,
    repositoryIdentity: candidate.repository,
    intent: "implementation",
    scope: { kind: "known", expectedPaths },
    writes: expectedPaths.map(path => ({ path, changeKind: "behavior" as const })),
    riskOperations: [],
    session: { estimatedMinutes: 15, continuation: false },
    testing: { kind: "required" },
    review: { kind: "none", estimatedMinutes: 10 },
    unresolvedDecisions: [],
  }));
  buildOrchestrationPlan({
    taskId: taskIdentity,
    repository: candidate.repository,
    prompt: "run structured lifecycle",
    candidate,
  }, decision);
  return decideLifecycleApplicability(decision, {
    taskIdentity,
    repositoryIdentity: candidate.repository,
    candidate: {
      id: candidate.id,
      repository: candidate.repository,
      revision: candidate.revision,
    },
    explicitMode: "structured",
    affectedSubsystems: ["lifecycle"],
    expectedPaths,
    requiredArtifacts: [],
  });
}

/** Creates a fresh lifecycle through the sole genuine structured-applicability path. */
export function createTestSkillLifecycle(
  taskIdentity: string,
  candidate: Candidate,
  expectedPaths?: readonly string[],
): SkillLifecycle {
  return createSkillLifecycle(issueStructuredLifecycleApplicability(taskIdentity, candidate, expectedPaths));
}
