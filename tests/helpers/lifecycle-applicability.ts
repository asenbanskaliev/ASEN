import type { Candidate } from "../../src/core/types.js";
import { createAsenExtension } from "../../extensions/asen.js";
import type { LifecycleApplicability } from "../../src/lifecycle/applicability.js";
import { createSkillLifecycle, type SkillLifecycle } from "../../src/lifecycle/skill-lifecycle.js";
import { deriveOddFacts, planOddRoute, type OddIntent } from "../../src/flow/odd-routing.js";
import { buildOrchestrationPlan } from "../../src/orchestration/orchestrator.js";

type Command={handler:(args:string|undefined,context:{cwd:string;ui:{notify(message:string,level:"info"|"error"):void}})=>unknown};

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
  const commands=new Map<string,Command>();
  const facade=createAsenExtension()({registerCommand:(name,command)=>commands.set(name,command as Command)});
  await commands.get("asen-workflow")!.handler(`sdd ${taskIdentity}`,{cwd:candidate.repository,ui:{notify:()=>{}}});
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
