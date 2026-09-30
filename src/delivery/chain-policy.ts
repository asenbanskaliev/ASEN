export type ChainStrategy = "single" | "stacked-main" | "feature-chain" | "exception-required";
export type VerificationEvidence = Readonly<{ id: string; command: string; result: "pass" }>;
export type DocsState =
  | Readonly<{ state: "included"; paths: readonly string[] }>
  | Readonly<{ state: "not_applicable"; reason: string }>;
export interface ChainSliceInput {
  readonly id: string;
  readonly purpose: string;
  readonly branch: string;
  readonly commits: readonly string[];
  readonly authoredAdditions: number;
  readonly authoredDeletions: number;
  readonly estimatedReviewMinutes: number;
  readonly baseBranch: string;
  readonly expectedDiffPaths: readonly string[];
  readonly observedDiffPaths: readonly string[];
  readonly dependencyIds: readonly string[];
  readonly verification: readonly VerificationEvidence[];
  readonly docs: DocsState;
  readonly rollbackBoundary: string;
  readonly startState: string;
  readonly endState: string;
  readonly followUpFacts: readonly string[];
  readonly outOfScopeFacts: readonly string[];
  readonly independentlyLandable: boolean;
  readonly cohesive: boolean;
  readonly focused: boolean;
}
export interface ChainPolicyInput {
  readonly targetBranch: string;
  readonly integrationBranch: string;
  readonly candidateCommits: readonly string[];
  readonly authoredAdditions: number;
  readonly authoredDeletions: number;
  readonly chainingRequested: boolean;
  readonly integrationMode: "independent" | "feature";
  readonly slicingPasses: 1;
  readonly slices: readonly ChainSliceInput[];
  readonly selectedStrategy: ChainStrategy;
  readonly trackerBranch: string | null;
}
export type ChainSlicePlan = Readonly<ChainSliceInput & { authoredBudget: number; dependencyDiagram: string }>;
export interface ChainPolicyPlan {
  readonly strategy: ChainStrategy;
  readonly targetBranch: string;
  readonly integrationBranch: string;
  readonly candidateCommits: readonly string[];
  readonly authoredAdditions: number;
  readonly authoredDeletions: number;
  readonly authoredBudget: number;
  readonly slicingPasses: 1;
  readonly slices: readonly ChainSlicePlan[];
  readonly tracker: Readonly<{ state: "not_applicable" }> | Readonly<{ state: "draft-no-merge"; branch: string }>;
  readonly exception: Readonly<{ state: "not_required" }> | Readonly<{ state: "required"; recommendation: "size:exception"; rationaleRequired: true; publicationDisposition: "prohibited"; mergeDisposition: "prohibited" }>;
  readonly publicationStatus: "pending";
  readonly mergeStatus: "pending";
}
const inputKeys = ["targetBranch", "integrationBranch", "candidateCommits", "authoredAdditions", "authoredDeletions", "chainingRequested", "integrationMode", "slicingPasses", "slices", "selectedStrategy", "trackerBranch"] as const;
const sliceKeys = ["id", "purpose", "branch", "commits", "authoredAdditions", "authoredDeletions", "estimatedReviewMinutes", "baseBranch", "expectedDiffPaths", "observedDiffPaths", "dependencyIds", "verification", "docs", "rollbackBoundary", "startState", "endState", "followUpFacts", "outOfScopeFacts", "independentlyLandable", "cohesive", "focused"] as const;
const verificationKeys = ["id", "command", "result"] as const;
const issuedPlans = new WeakSet<object>();
const claimedPlans = new WeakSet<object>();
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
function exactRecord(value: unknown, keys: readonly string[], noun: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${noun} must be exact plain data`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== "string" || !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${noun} shape is invalid`);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} shape is invalid`);
    result[key] = descriptor.value;
  }
  return result;
}
function exactArray(value: unknown, noun: string, nonempty = false): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${noun} is malformed`);
  const indexes = Array.from({ length: value.length }, (_, index) => String(index));
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== "string" || (key !== "length" && !indexes.includes(key))) || indexes.some(key => !Object.hasOwn(value, key))) throw new Error(`${noun} is malformed`);
  const result = indexes.map(index => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} is malformed`);
    return descriptor.value;
  });
  if (nonempty && result.length === 0) throw new Error(`${noun} must not be empty`);
  return result;
}
function exactText(value: unknown, noun: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value !== value.normalize("NFC") || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`${noun} is malformed`);
  return value;
}
function exactStrings(value: unknown, noun: string, nonempty = false): string[] {
  const result = exactArray(value, noun, nonempty).map(item => exactText(item, noun));
  if (new Set(result).size !== result.length) throw new Error(`${noun} contains duplicates`);
  return result;
}
function exactCount(value: unknown, noun: string, positive = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) throw new Error(`${noun} is malformed`);
  return value;
}
function exactBranch(value: unknown, noun: string): string {
  const result = exactText(value, noun);
  if (result.startsWith("/") || result.endsWith("/") || result.includes("..") || /\s|\\|~|\^|:|\?|\*|\[/u.test(result)) throw new Error(`${noun} is malformed`);
  return result;
}
function exactPaths(value: unknown, noun: string): string[] {
  const result = exactStrings(value, noun, true);
  if (result.some(path => path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === ".."))) throw new Error(`${noun} is polluted`);
  return result;
}
const sameOrdered = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);

function parseDocs(value: unknown): DocsState {
  if (typeof value !== "object" || value === null) throw new Error("docs state is missing");
  const state = Object.getOwnPropertyDescriptor(value, "state");
  if (!state || !("value" in state)) throw new Error("docs state is malformed");
  if (state.value === "included") {
    const record = exactRecord(value, ["state", "paths"], "docs state");
    return Object.freeze({ state: "included", paths: Object.freeze(exactPaths(record.paths, "docs paths")) });
  }
  if (state.value === "not_applicable") {
    const record = exactRecord(value, ["state", "reason"], "docs state");
    return Object.freeze({ state: "not_applicable", reason: exactText(record.reason, "docs reason") });
  }
  throw new Error("docs state is malformed");
}
function parseVerification(value: unknown): readonly VerificationEvidence[] {
  const result = exactArray(value, "verification evidence", true).map(item => {
    const record = exactRecord(item, verificationKeys, "verification evidence");
    if (record.result !== "pass") throw new Error("verification evidence must pass");
    return Object.freeze({ id: exactText(record.id, "verification id"), command: exactText(record.command, "verification command"), result: "pass" as const });
  });
  if (new Set(result.map(item => item.id)).size !== result.length) throw new Error("verification evidence contains duplicates");
  return Object.freeze(result);
}
function parseSlice(value: unknown): ChainSliceInput {
  const record = exactRecord(value, sliceKeys, "slice");
  const expectedPaths = exactPaths(record.expectedDiffPaths, "expected diff paths");
  const observedPaths = exactPaths(record.observedDiffPaths, "observed diff paths");
  if (!sameOrdered(expectedPaths, observedPaths)) throw new Error("Observed diff path pollution");
  if (record.cohesive !== true || record.focused !== true) throw new Error("Every slice must be cohesive and focused");
  if (typeof record.independentlyLandable !== "boolean") throw new Error("Slice landability is malformed");
  return Object.freeze({
    id: exactText(record.id, "slice id"), purpose: exactText(record.purpose, "slice purpose"), branch: exactBranch(record.branch, "slice branch"), commits: Object.freeze(exactStrings(record.commits, "slice commits", true)),
    authoredAdditions: exactCount(record.authoredAdditions, "slice additions"), authoredDeletions: exactCount(record.authoredDeletions, "slice deletions"), estimatedReviewMinutes: exactCount(record.estimatedReviewMinutes, "review estimate", true), baseBranch: exactBranch(record.baseBranch, "slice base"),
    expectedDiffPaths: Object.freeze(expectedPaths), observedDiffPaths: Object.freeze(observedPaths), dependencyIds: Object.freeze(exactStrings(record.dependencyIds, "dependency ids")),
    verification: parseVerification(record.verification), docs: parseDocs(record.docs), rollbackBoundary: exactText(record.rollbackBoundary, "rollback boundary"), startState: exactText(record.startState, "start state"), endState: exactText(record.endState, "end state"),
    followUpFacts: Object.freeze(exactStrings(record.followUpFacts, "follow-up facts")), outOfScopeFacts: Object.freeze(exactStrings(record.outOfScopeFacts, "out-of-scope facts")), independentlyLandable: record.independentlyLandable, cohesive: true, focused: true,
  });
}
const dependencyDiagram = (slices: readonly ChainSliceInput[], current: number) => slices.map((slice, index) => `${index === current ? "📍 " : ""}${slice.id}${slice.dependencyIds.length ? ` <- ${slice.dependencyIds.join(", ")}` : ""}`).join("\n");
export function claimChainPolicyPlan(plan: ChainPolicyPlan): void {
  if (typeof plan !== "object" || plan === null || !issuedPlans.has(plan)) throw new Error("Artifact accounting requires a genuine chain policy plan");
  if (claimedPlans.has(plan)) throw new Error("Chain policy plan already claimed");
  claimedPlans.add(plan);
}

/** Pure planning only: validates one honest slicing pass and performs no repository operation. */
export function planChainDelivery(value: ChainPolicyInput): ChainPolicyPlan {
  const record = exactRecord(value, inputKeys, "chain policy input");
  const targetBranch = exactBranch(record.targetBranch, "target branch");
  const integrationBranch = exactBranch(record.integrationBranch, "integration branch");
  if (targetBranch === integrationBranch) throw new Error("Target and integration branches must be distinct");
  const commits = exactStrings(record.candidateCommits, "candidate commits", true);
  if (commits.some(identity => !shaPattern.test(identity))) throw new Error("Candidate commit identity is invalid");
  if (record.slicingPasses !== 1) throw new Error("Exactly one slicing pass is required");
  if (typeof record.chainingRequested !== "boolean" || (record.integrationMode !== "independent" && record.integrationMode !== "feature")) throw new Error("Chain mode facts are malformed");
  const slices = exactArray(record.slices, "slices", true).map(parseSlice);
  const sliceIds = slices.map(slice => slice.id);
  const sliceBranches = slices.map(slice => slice.branch);
  if (new Set(sliceIds).size !== sliceIds.length || new Set(sliceBranches).size !== sliceBranches.length) throw new Error("Slice IDs and branches must be unique");
  if (slices[0]!.branch !== targetBranch) throw new Error("First slice must use the explicit target branch");

  const commitPartition = slices.flatMap(slice => slice.commits);
  if (!sameOrdered(commitPartition, commits) || new Set(commitPartition).size !== commitPartition.length) throw new Error("Commit partition must be exact and ordered");
  const authoredAdditions = exactCount(record.authoredAdditions, "authored additions");
  const authoredDeletions = exactCount(record.authoredDeletions, "authored deletions");
  if (slices.reduce((total, slice) => total + slice.authoredAdditions, 0) !== authoredAdditions || slices.reduce((total, slice) => total + slice.authoredDeletions, 0) !== authoredDeletions) throw new Error("Authored totals do not match slices");
  const authoredBudget = authoredAdditions + authoredDeletions;
  slices.forEach((slice, index) => {
    for (const dependency of slice.dependencyIds) {
      const dependencyIndex = sliceIds.indexOf(dependency);
      if (dependencyIndex < 0 || dependencyIndex >= index) throw new Error("Dependencies must reference prior slices only");
    }
  });
  const overBudget = slices.some(slice => slice.authoredAdditions + slice.authoredDeletions > 400 || slice.estimatedReviewMinutes > 60);
  let strategy: ChainStrategy;
  if (overBudget) strategy = "exception-required";
  else if (record.integrationMode === "independent" && slices.length === 1 && !record.chainingRequested) strategy = "single";
  else if (record.integrationMode === "independent" && slices.every(slice => slice.independentlyLandable)) strategy = "stacked-main";
  else if (record.integrationMode === "feature") strategy = "feature-chain";
  else throw new Error("Facts do not yield one valid strategy");
  if (record.selectedStrategy !== strategy) throw new Error("Caller-selected strategy is inconsistent with facts");
  const dependent = record.integrationMode === "feature";
  const trackerBranch = record.trackerBranch;
  if (dependent) {
    const tracker = exactBranch(trackerBranch, "tracker branch");
    if (tracker === integrationBranch || tracker === targetBranch || slices.some(slice => slice.branch === tracker)) throw new Error("Tracker branch must be distinct");
    slices.forEach((slice, index) => {
      const expectedBase = index === 0 ? tracker : slices[index - 1]!.branch;
      const expectedDependencies = index === 0 ? [] : [slices[index - 1]!.id];
      if (slice.baseBranch !== expectedBase || !sameOrdered(slice.dependencyIds, expectedDependencies)) throw new Error("Feature-chain bases or dependencies are invalid");
    });
  } else {
    if (trackerBranch !== null) throw new Error("Tracker is only valid for dependent integration");
    slices.forEach(slice => {
      if (slice.baseBranch !== integrationBranch || slice.dependencyIds.length !== 0) throw new Error("Independent slice base or dependencies are invalid");
    });
  }
  const plannedSlices = Object.freeze(slices.map((slice, index) => Object.freeze({
    ...slice,
    authoredBudget: slice.authoredAdditions + slice.authoredDeletions,
    dependencyDiagram: dependencyDiagram(slices, index),
  })));
  const tracker = dependent ? Object.freeze({ state: "draft-no-merge" as const, branch: trackerBranch as string }) : Object.freeze({ state: "not_applicable" as const });
  const exception = strategy === "exception-required" ? Object.freeze({ state: "required" as const, recommendation: "size:exception" as const, rationaleRequired: true as const, publicationDisposition: "prohibited" as const, mergeDisposition: "prohibited" as const }) : Object.freeze({ state: "not_required" as const });
  const plan = Object.freeze({ strategy, targetBranch, integrationBranch, candidateCommits: Object.freeze(commits), authoredAdditions, authoredDeletions, authoredBudget, slicingPasses: 1 as const, slices: plannedSlices, tracker, exception, publicationStatus: "pending" as const, mergeStatus: "pending" as const });
  issuedPlans.add(plan);
  return plan;
}
