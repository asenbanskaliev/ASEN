import {
  claimReadyWorkUnitBoundary,
  count as readCount,
  relationship as readDeliveryRelationship,
  exactArray as readExactArray,
  exactRecord as readExactRecord,
  path as readPath,
  text as readText,
  type DeliveryRelationship,
  type ReadyWorkUnitBoundary,
} from "./work-unit-policy.js";

export type ObservedEvidence =
  | Readonly<{ status: "pass"; command: string; scenario: string; exitCode: 0; summary: string }>
  | Readonly<{ status: "n_a"; reason: string }>;
export type DocumentationEvidence =
  | Readonly<{ status: "required"; paths: readonly string[] }>
  | Readonly<{ status: "n_a"; reason: string }>;
export interface WorkUnitEvidenceInput {
  readonly featureIdentity: string;
  readonly taskIdentity: string;
  readonly taskDocumentPath: string;
  readonly boundaryId: string;
  readonly repositoryIdentity: string;
  readonly purpose: string;
  readonly deliveryRelationship: DeliveryRelationship;
  readonly previousReviewedBoundary: string | null;
  readonly rollbackBoundary: string;
  readonly commit: Readonly<{
    identity: string; treeIdentity: string; parentIdentity: string; message: string; currentTreeIdentity: string;
  }>;
  readonly authoredAdditions: number;
  readonly authoredDeletions: number;
  readonly changedPaths: readonly string[];
  readonly behaviorPaths: readonly string[];
  readonly focusedTestPaths: readonly string[];
  readonly documentationPaths: readonly string[];
  readonly generatedArtifacts: readonly Readonly<{ path: string; contentIdentity: string }>[];
  readonly focusedTests: ObservedEvidence;
  readonly runtimeHarness: ObservedEvidence;
  readonly documentation: DocumentationEvidence;
  readonly taskDocumentCommitIdentity: string;
}
export type CompletedWorkUnit = Readonly<WorkUnitEvidenceInput>;

const completedRecords = new WeakSet<object>();
const claimedCompletedRecords = new WeakSet<object>();

/** Consumes genuine completed provenance on the first review-candidate attempt. */
export function claimCompletedWorkUnit(value: unknown): asserts value is CompletedWorkUnit {
  if (typeof value !== "object" || value === null || !completedRecords.has(value)) {
    throw new Error("completed work unit was not recorded here");
  }
  if (claimedCompletedRecords.has(value)) throw new Error("completed work unit has already been claimed");
  claimedCompletedRecords.add(value);
}

const inputKeys = [
  "featureIdentity", "taskIdentity", "taskDocumentPath", "boundaryId", "repositoryIdentity", "purpose",
  "deliveryRelationship", "previousReviewedBoundary", "rollbackBoundary", "commit", "authoredAdditions",
  "authoredDeletions", "changedPaths", "behaviorPaths", "focusedTestPaths", "documentationPaths",
  "generatedArtifacts", "focusedTests", "runtimeHarness", "documentation", "taskDocumentCommitIdentity",
] as const;
const commitKeys = ["identity", "treeIdentity", "parentIdentity", "message", "currentTreeIdentity"] as const;
const sha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const conventional = /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-z0-9][a-z0-9._/-]*\))?!?: [^\r\n]+$/u;

function paths(value: unknown, noun: string, required = false): string[] {
  const result = readExactArray(value, noun).map(readPath);
  if ((required && result.length === 0) || new Set(result).size !== result.length) {
    throw new Error(`${noun} is incomplete or duplicated`);
  }
  return result;
}
function sameRelationship(left: DeliveryRelationship, right: DeliveryRelationship): boolean {
  return left.kind === right.kind && (left.kind === "single" || (right.kind === "chain_slice" && left.sliceId === right.sliceId));
}
function observed(value: unknown, expected: ReadyWorkUnitBoundary["focusedTests"], noun: string): ObservedEvidence {
  if (expected.kind === "n_a") {
    const item = readExactRecord(value, ["status", "reason"], noun);
    if (item.status !== "n_a" || item.reason !== expected.reason) throw new Error(`${noun} N/A is not boundary-authorized`);
    return Object.freeze({ status: "n_a", reason: expected.reason });
  }
  const item = readExactRecord(value, ["status", "command", "scenario", "exitCode", "summary"], noun);
  if (item.status !== "pass" || item.exitCode !== 0) throw new Error(`${noun} pass is malformed`);
  const command = readText(item.command, `${noun} command`);
  const scenario = readText(item.scenario, `${noun} scenario`);
  const summary = readText(item.summary, `${noun} summary`);
  const contradiction = /\b(?:fail(?:ed|ure|ures|ing)?|errors?|n[\/_-]?a|not applicable)\b/iu;
  const positive = /\b(?:pass(?:ed|es|ing)?|success(?:ful(?:ly)?)?|succeed(?:ed|s|ing)?)\b/iu;
  if (contradiction.test(summary) || /\bnot[\s_-]+pass(?:ed|ing)?\b/iu.test(summary) || !positive.test(summary)) {
    throw new Error(`${noun} pass summary is ambiguous or contradictory`);
  }
  return Object.freeze({ status: "pass", command, scenario, exitCode: 0, summary });
}
function documentation(value: unknown, expected: ReadyWorkUnitBoundary["documentation"], documentedPaths: string[]): DocumentationEvidence {
  if (expected.kind === "n_a") {
    const item = readExactRecord(value, ["status", "reason"], "documentation evidence");
    if (item.status !== "n_a" || item.reason !== expected.reason || documentedPaths.length) throw new Error("documentation N/A is not boundary-authorized");
    return Object.freeze({ status: "n_a", reason: expected.reason });
  }
  const item = readExactRecord(value, ["status", "paths"], "documentation evidence");
  const stated = paths(item.paths, "documented paths", true);
  if (item.status !== "required" || stated.length !== documentedPaths.length || stated.some((item, index) => item !== documentedPaths[index])) {
    throw new Error("documentation path evidence mismatch");
  }
  return Object.freeze({ status: "required", paths: Object.freeze(stated) });
}

/** Consumes one genuine boundary and records evidence without repository or review operations. */
export function recordCompletedWorkUnit(ready: ReadyWorkUnitBoundary, evidence: WorkUnitEvidenceInput): CompletedWorkUnit {
  claimReadyWorkUnitBoundary(ready);
  const input = readExactRecord(evidence, inputKeys, "work-unit evidence");
  for (const key of ["featureIdentity", "taskIdentity", "taskDocumentPath", "boundaryId", "purpose"] as const) {
    if (input[key] !== ready[key]) throw new Error(`${key} does not match ready boundary`);
  }
  const repositoryIdentity = readText(input.repositoryIdentity, "repository identity");
  const deliveryRelationship = readDeliveryRelationship(input.deliveryRelationship);
  if (!sameRelationship(deliveryRelationship, ready.deliveryRelationship)) throw new Error("delivery relationship mismatch");
  if (input.previousReviewedBoundary !== ready.previousReviewedBoundary) throw new Error("previous reviewed boundary mismatch");
  const rollbackBoundary = readText(input.rollbackBoundary, "rollback boundary");
  if (rollbackBoundary !== ready.rollbackBoundaries[0]) throw new Error("rollback boundary mismatch");

  const snapshot = readExactRecord(input.commit, commitKeys, "commit snapshot");
  const identity = readText(snapshot.identity, "commit identity");
  const treeIdentity = readText(snapshot.treeIdentity, "tree identity");
  const parentIdentity = readText(snapshot.parentIdentity, "parent identity");
  const currentTreeIdentity = readText(snapshot.currentTreeIdentity, "current tree identity");
  const message = readText(snapshot.message, "commit message");
  const identities = [identity, treeIdentity, parentIdentity, currentTreeIdentity];
  if (!identities.every(value => sha.test(value))) throw new Error("commit identities must be isolated lowercase SHA values");
  if (identities.some(value => value.length !== identity.length)) throw new Error("commit snapshot identities must use one SHA width");
  if (treeIdentity !== currentTreeIdentity) throw new Error("current tree does not match frozen commit tree");
  if (!conventional.test(message)) throw new Error("commit message is not supported Conventional Commit syntax");
  if (input.taskDocumentCommitIdentity !== identity) throw new Error("task document commit identity mismatch");

  const authoredAdditions = readCount(input.authoredAdditions, "authored additions");
  const authoredDeletions = readCount(input.authoredDeletions, "authored deletions");
  if (authoredAdditions !== ready.authoredAdditions || authoredDeletions !== ready.authoredDeletions) throw new Error("authored line counts mismatch");
  const changedPaths = paths(input.changedPaths, "changed paths", true);
  const behaviorPaths = paths(input.behaviorPaths, "behavior paths", true);
  const focusedTestPaths = paths(input.focusedTestPaths, "focused-test paths");
  const documentationPaths = paths(input.documentationPaths, "documentation paths");
  if ((ready.focusedTests.kind === "required") !== (focusedTestPaths.length > 0)) throw new Error("focused-test path applicability mismatch");
  const generatedArtifacts = readExactArray(input.generatedArtifacts, "generated artifacts").map((value, index) => {
    const item = readExactRecord(value, ["path", "contentIdentity"], "generated artifact");
    const artifact = Object.freeze({ path: readPath(item.path), contentIdentity: readText(item.contentIdentity, "generated content identity") });
    const declared = ready.generatedArtifacts[index];
    if (!/^sha256:[0-9a-f]{64}$/u.test(artifact.contentIdentity) || artifact.path !== declared?.path || artifact.contentIdentity !== declared.contentIdentity) {
      throw new Error("generated artifact does not match boundary declaration");
    }
    return artifact;
  });
  if (generatedArtifacts.length !== ready.generatedArtifacts.length) throw new Error("generated artifacts do not match boundary declarations");
  const partition = [...behaviorPaths, ...focusedTestPaths, ...documentationPaths, ready.taskDocumentPath, ...generatedArtifacts.map(item => item.path)];
  const partitionInvalid = new Set(partition).size !== partition.length || changedPaths.length !== partition.length || changedPaths.some(item => !partition.includes(item));
  const scopeMismatch = changedPaths.length !== ready.expectedChangedPaths.length || changedPaths.some((item, index) => item !== ready.expectedChangedPaths[index]);
  if (partitionInvalid || scopeMismatch) throw new Error("paths must exactly partition boundary scope");

  const commit = Object.freeze({ identity, treeIdentity, parentIdentity, message, currentTreeIdentity });
  const completed = Object.freeze({
    featureIdentity: ready.featureIdentity, taskIdentity: ready.taskIdentity, taskDocumentPath: ready.taskDocumentPath,
    boundaryId: ready.boundaryId, repositoryIdentity, purpose: ready.purpose, deliveryRelationship,
    previousReviewedBoundary: ready.previousReviewedBoundary, rollbackBoundary, commit, authoredAdditions, authoredDeletions,
    changedPaths: Object.freeze(changedPaths), behaviorPaths: Object.freeze(behaviorPaths),
    focusedTestPaths: Object.freeze(focusedTestPaths), documentationPaths: Object.freeze(documentationPaths),
    generatedArtifacts: Object.freeze(generatedArtifacts),
    focusedTests: observed(input.focusedTests, ready.focusedTests, "focused-test evidence"),
    runtimeHarness: observed(input.runtimeHarness, ready.runtimeHarness, "runtime-harness evidence"),
    documentation: documentation(input.documentation, ready.documentation, documentationPaths),
    taskDocumentCommitIdentity: identity,
  });
  completedRecords.add(completed);
  return completed;
}
