import { createHash } from "node:crypto";
import type { OddRouteDecision } from "../flow/odd-routing.js";
import { claimedOrchestrationRouteContext } from "../orchestration/orchestrator.js";
import { consumeClaimedWorkflowSelection, type WorkflowSelectionChoice, type WorkflowSelectionDescription } from "./workflow-selection.js";

export type LifecycleChangeNature = "unknown" | "analysis" | "documentation" | "behavior" | "schema" | "security" | "migration";
export type LifecycleArtifact = "proposal" | "specification" | "design" | "task_plan";
export interface LifecycleApplicabilityInput {
  readonly taskIdentity: string;
  readonly repositoryIdentity: string;
  readonly candidate: Readonly<{ id: string; repository: string; revision: string }>;
  readonly explicitMode: "organic" | "structured" | "unspecified";
  readonly affectedSubsystems: readonly string[];
  readonly expectedPaths: readonly string[];
  readonly requiredArtifacts: readonly LifecycleArtifact[];
}
export interface LifecycleApplicability {
  readonly applicabilityId: string;
  readonly taskIdentity: string;
  readonly repositoryIdentity: string;
  readonly candidate: Readonly<{ id: string; repository: string; revision: string }>;
  readonly decisionId: string;
  readonly changeNature: LifecycleChangeNature;
  readonly expectedPaths: readonly string[];
  readonly affectedSubsystems: readonly string[];
  readonly requiredArtifacts: readonly LifecycleArtifact[];
  readonly outcome: "organic" | "structured" | "blocked";
  readonly reasons: readonly string[];
}
export interface TddObligation {
  readonly requirementId: string;
  readonly applicabilityId: string;
  readonly taskIdentity: string;
  readonly repositoryIdentity: string;
  readonly candidate: Readonly<{ id: string; repository: string; revision: string }>;
  readonly behaviorPaths: readonly string[];
  readonly mode: "required" | "not-applicable";
  readonly reason: "behavior-testing-required" | "behavior-testing-contradiction" | "no-behavior-writes";
}

const attempted = new WeakSet<object>();
const issued = new WeakSet<object>();
const claimed = new WeakSet<object>();
const obligations = new WeakMap<object, TddObligation>();
const issuedObligations = new WeakSet<object>();
const claimedObligations = new WeakSet<object>();
const selectionDescriptions = new WeakMap<object, WorkflowSelectionDescription>();
const inputKeys = ["taskIdentity", "repositoryIdentity", "candidate", "explicitMode", "affectedSubsystems", "expectedPaths", "requiredArtifacts"] as const;
const artifacts = ["proposal", "specification", "design", "task_plan"] as const;
const modes = ["organic", "structured", "unspecified"] as const;

function exact(value: unknown, keys: readonly string[], noun: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${noun} must be exact plain data`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error(`${noun} shape is invalid`);
  return Object.fromEntries(keys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} shape is invalid`);
    return [key, descriptor.value];
  }));
}
function list(value: unknown, noun: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${noun} must be an exact array`);
  const indexes = Array.from({ length: value.length }, (_, index) => String(index));
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== "string" || (key !== "length" && !indexes.includes(key))) || indexes.some(index => !Object.hasOwn(value, index))) throw new Error(`${noun} must be an exact array`);
  return indexes.map(index => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} must be an exact array`);
    return descriptor.value;
  });
}
function text(value: unknown, noun: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value !== value.normalize("NFC") || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`${noun} is malformed`);
  return value;
}
function path(value: unknown): string {
  const result = text(value, "path");
  if (result.startsWith("/") || result.includes("\\") || result.includes(":") || result.split("/").some(part => !part || part === "." || part === "..")) throw new Error("path is not canonical relative data");
  return result;
}
function unique<T extends string>(value: unknown, noun: string, parse: (item: unknown) => T): T[] {
  const result = list(value, noun).map(parse);
  if (new Set(result).size !== result.length) throw new Error(`${noun} contains duplicates`);
  return result;
}
function member<T extends string>(value: unknown, values: readonly T[], noun: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${noun} is invalid`);
  return value as T;
}
function nature(writes: readonly Readonly<{ changeKind: string }>[], analysis: boolean): LifecycleChangeNature | undefined {
  const kinds = new Set(writes.map(write => write.changeKind));
  if (kinds.has("security")) return "security";
  if (kinds.has("migration")) return "migration";
  if (kinds.has("schema")) return "schema";
  if (kinds.has("behavior") || kinds.has("configuration")) return "behavior";
  if (kinds.size && [...kinds].every(kind => ["documentation", "format", "generated"].includes(kind))) return "documentation";
  return analysis && !writes.length ? "analysis" : undefined;
}

function decide(claimedOddDecision:OddRouteDecision,value:LifecycleApplicabilityInput,selection?:WorkflowSelectionChoice):LifecycleApplicability {
  if (typeof claimedOddDecision !== "object" || claimedOddDecision === null) throw new Error("Applicability requires an exact decision object");
  if (attempted.has(claimedOddDecision)) throw new Error("Lifecycle applicability was already attempted");
  attempted.add(claimedOddDecision);
  const context = claimedOrchestrationRouteContext(claimedOddDecision);
  const input = exact(value, inputKeys, "applicability input");
  const candidateInput = exact(input.candidate, ["id", "repository", "revision"], "candidate");
  const taskIdentity = text(input.taskIdentity, "task identity");
  const repositoryIdentity = text(input.repositoryIdentity, "repository identity");
  const candidate = Object.freeze({ id: text(candidateInput.id, "candidate id"), repository: text(candidateInput.repository, "candidate repository"), revision: text(candidateInput.revision, "candidate revision") });
  if (taskIdentity !== context.facts.taskIdentity || taskIdentity !== claimedOddDecision.taskIdentity) throw new Error("Applicability task mismatch");
  if (repositoryIdentity !== context.facts.repositoryIdentity || repositoryIdentity !== claimedOddDecision.repositoryIdentity) throw new Error("Applicability repository mismatch");
  if (selection && (selection.taskIdentity !== context.facts.taskIdentity || selection.repositoryIdentity !== context.facts.repositoryIdentity)) throw new Error("Workflow selection route binding mismatch");
  if (candidate.id !== context.candidate.id || candidate.repository !== context.candidate.repository || candidate.revision !== context.candidate.revision) throw new Error("Applicability candidate mismatch");
  const mode = member(input.explicitMode, modes, "explicit mode");
  const subsystems = unique(input.affectedSubsystems, "affected subsystems", item => text(item, "affected subsystem"));
  if (!subsystems.length) throw new Error("affected subsystems must be nonempty");
  const suppliedPaths = unique(input.expectedPaths, "expected paths", path);
  const expectedPaths = context.facts.scope.kind === "known" ? [...context.facts.scope.expectedPaths] : [];
  if (suppliedPaths.length !== expectedPaths.length || suppliedPaths.some((item, index) => item !== expectedPaths[index])) throw new Error("Applicability paths mismatch");
  const requiredArtifacts = unique(input.requiredArtifacts, "required artifacts", item => member(item, artifacts, "required artifact"));
  const derivedNature = nature(context.facts.writes, context.facts.intent === "analysis");
  const changeNature: LifecycleChangeNature = derivedNature ?? "unknown";
  const contradictory = context.facts.intent === "analysis" && context.facts.writes.length > 0
    || context.facts.intent === "implementation" && context.facts.scope.kind === "known" && !context.facts.writes.length;
  const reasons: string[] = [];
  if (context.facts.incident || claimedOddDecision.route === "incident") reasons.push("incident-route");
  if (context.facts.verificationIntent || claimedOddDecision.route === "verify") reasons.push("verification-route");
  if (context.facts.scope.kind === "unknown") reasons.push("unknown-scope");
  if (context.facts.unresolvedDecisions.length) reasons.push("unresolved-decisions");
  if (context.facts.risk === "unknown") reasons.push("unknown-risk");
  if (contradictory) reasons.push("contradictory-change-facts");
  const behaviorPaths = context.facts.writes.filter(write => write.changeKind === "behavior").map(write => write.path);
  const testingContradiction = behaviorPaths.length > 0 && context.facts.testing.kind === "n_a";
  let outcome: LifecycleApplicability["outcome"];
  if (reasons.length) outcome = "blocked";
  else if (testingContradiction) { outcome = "blocked"; reasons.push("behavior-testing-contradiction"); }
  else if (selection && mode === "organic") { outcome = "blocked"; reasons.push("workflow-selection-contradiction"); }
  else if (selection) { outcome = "structured"; reasons.push("explicit-structured"); }
  else if (mode === "structured" || requiredArtifacts.length > 0) { outcome = "blocked"; reasons.push("sdd-selection-required"); }
  else { outcome = "organic"; reasons.push(mode === "organic" ? "explicit-organic" : "bounded-organic"); }
  const payload = { taskIdentity, repositoryIdentity, candidate, decisionId: claimedOddDecision.decisionId, changeNature, expectedPaths, affectedSubsystems: subsystems, requiredArtifacts, outcome, reasons };
  const result = Object.freeze({ applicabilityId: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), ...payload, expectedPaths: Object.freeze(expectedPaths), affectedSubsystems: Object.freeze(subsystems), requiredArtifacts: Object.freeze(requiredArtifacts), reasons: Object.freeze(reasons) });
  const obligationPayload = {
    applicabilityId: result.applicabilityId, taskIdentity, repositoryIdentity, candidate,
    behaviorPaths: Object.freeze(behaviorPaths),
    mode: behaviorPaths.length > 0 && context.facts.testing.kind === "required" ? "required" as const : "not-applicable" as const,
    reason: behaviorPaths.length === 0 ? "no-behavior-writes" as const : testingContradiction ? "behavior-testing-contradiction" as const : "behavior-testing-required" as const,
  };
  const obligation = Object.freeze({ requirementId: createHash("sha256").update(JSON.stringify(obligationPayload)).digest("hex"), ...obligationPayload });
  issued.add(result);
  issuedObligations.add(obligation);
  obligations.set(result, obligation);
  if (selection && outcome === "structured") selectionDescriptions.set(result, Object.freeze({ schemaVersion: 1, workflow: selection.workflow, source: selection.source, taskIdentity: selection.taskIdentity, repositoryIdentity: selection.repositoryIdentity }));
  return result;
}

/** Consumes the exact route decision before validating caller data and returns no lifecycle authority. */
export function decideLifecycleApplicability(claimedOddDecision:OddRouteDecision,value:LifecycleApplicabilityInput):LifecycleApplicability{return decide(claimedOddDecision,value);}
/** Extension-only integration path: burns genuine claimed command provenance before caller data validation. */
export function decideLifecycleApplicabilityWithSelection(claimedOddDecision:OddRouteDecision,value:LifecycleApplicabilityInput,selection:unknown):LifecycleApplicability{return decide(claimedOddDecision,value,consumeClaimedWorkflowSelection(selection));}

/** Reads private command provenance by exact applicability identity without inspecting caller data. */
export function workflowSelectionDescriptionForApplicability(value: unknown): WorkflowSelectionDescription | undefined {
  return typeof value === "object" && value !== null ? selectionDescriptions.get(value) : undefined;
}

/** Retrieves the immutable TDD requirement paired with this exact issued applicability. */
export function tddObligationFor(applicability: unknown): TddObligation {
  if (typeof applicability !== "object" || applicability === null || !issued.has(applicability)) throw new Error("TDD obligation requires an exact issued applicability");
  const obligation = obligations.get(applicability);
  if (!obligation) throw new Error("TDD obligation is unavailable");
  return obligation;
}

/** Burns a genuine TDD obligation on its first claim attempt. */
export function claimTddObligation(value: unknown): asserts value is TddObligation {
  if (typeof value !== "object" || value === null || !issuedObligations.has(value)) throw new Error("TDD obligation was not issued here");
  if (claimedObligations.has(value)) throw new Error("TDD obligation has already been claimed");
  claimedObligations.add(value);
}

/** Burns a genuine applicability result on its first B2 claim attempt. */
export function claimLifecycleApplicability(value: unknown): asserts value is LifecycleApplicability {
  if (typeof value !== "object" || value === null || !issued.has(value)) throw new Error("Lifecycle applicability was not issued here");
  if (claimed.has(value)) throw new Error("Lifecycle applicability has already been claimed");
  claimed.add(value);
}
