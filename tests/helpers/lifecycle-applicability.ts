import type { Candidate } from "../../src/core/types.js";
import { decideLifecycleApplicability, decideLifecycleApplicabilityWithSelection, type LifecycleApplicability, type LifecycleApplicabilityInput } from "../../src/lifecycle/applicability.js";
import { claimWorkflowSelection, readWorkflowSelection, registerWorkflowSelectionCommand, type WorkflowSelectionCommand } from "../../src/lifecycle/workflow-selection.js";
import { createSkillLifecycle, type SkillLifecycle } from "../../src/lifecycle/skill-lifecycle.js";
import { deriveOddFacts, planOddRoute, type OddIntent, type OddRouteDecision } from "../../src/flow/odd-routing.js";
import { buildOrchestrationPlan, claimedOrchestrationRouteContext } from "../../src/orchestration/orchestrator.js";

/** Legacy test-only registration identity; never installs a public product command. */
export function createLegacyWorkflowFixture(repository: string, taskIdentity: string) {
  const commands = new Map<string, WorkflowSelectionCommand>();
  const consumer = registerWorkflowSelectionCommand((name, command) => commands.set(name, command));
  const facade = Object.freeze({decideLifecycleApplicability(decision: OddRouteDecision, input: LifecycleApplicabilityInput) {
    // Derive binding from genuine claimed facts before observing caller input.
    const original = claimedOrchestrationRouteContext(decision);
    const binding = {taskIdentity: original.facts.taskIdentity, repositoryIdentity: original.facts.repositoryIdentity};
    const choice = readWorkflowSelection(consumer, binding);
    if (!choice) return decideLifecycleApplicability(decision, input);
    return decideLifecycleApplicabilityWithSelection(decision, input, claimWorkflowSelection(consumer, choice, binding));
  }});
  return {facade, select: (task = taskIdentity) => commands.get("asen-workflow")!.handler(`sdd ${task}`, {cwd: repository, ui: {notify() {}}})};
}

/** Builds genuine command and candidate-bound orchestration provenance required by B1. */
export async function issueStructuredLifecycleApplicability(
  taskIdentity: string,
  candidate: Candidate,
  expectedPaths: readonly string[] = ["src/feature.ts"],
  testing: "required" | "not-applicable" = "required",
  explicitMode: "organic" | "structured" | "unspecified" = "structured",
  affectedSubsystems:readonly string[]=["lifecycle"],
  intent:OddIntent="implementation",
): Promise<LifecycleApplicability> {
  const {facade, select} = createLegacyWorkflowFixture(candidate.repository, taskIdentity);
  await select();
  const decision = planOddRoute(deriveOddFacts({
    taskIdentity,
    repositoryIdentity: candidate.repository,
    intent,
    scope: { kind: "known", expectedPaths },
    writes: expectedPaths.map(path => ({ path, changeKind: testing === "required" ? "behavior" as const : "documentation" as const })),
    riskOperations: [],
    session: { estimatedMinutes: 15, continuation: false },
    testing: testing === "required" ? { kind: "required" } : { kind: "n_a", reason: "No behavior change" },
    review: { kind: "none", estimatedMinutes: 10 },
    unresolvedDecisions: [],
  }));
  buildOrchestrationPlan({taskId:taskIdentity,repository:candidate.repository,prompt:"run structured lifecycle",candidate},decision);
  return facade.decideLifecycleApplicability(decision,{
    taskIdentity, repositoryIdentity:candidate.repository,
    candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},
    explicitMode,affectedSubsystems,expectedPaths,requiredArtifacts:[],
  });
}

/** Creates a fresh lifecycle through the sole genuine structured-applicability path. */
export async function createTestSkillLifecycle(
  taskIdentity: string,
  candidate: Candidate,
  expectedPaths?: readonly string[],
  testing?: "required" | "not-applicable",
  intent:OddIntent="implementation",
): Promise<SkillLifecycle> {
  return createSkillLifecycle(await issueStructuredLifecycleApplicability(taskIdentity,candidate,expectedPaths,testing,"structured",["lifecycle"],intent));
}
