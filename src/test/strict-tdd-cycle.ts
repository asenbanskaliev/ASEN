import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Candidate } from "../core/types.js";
import { assertExactGitCandidate } from "../evidence/execution.js";
import { assertDirectGitParent } from "../evidence/git-lineage.js";
import { claimTddObligation, type TddObligation } from "../lifecycle/applicability.js";
import { claimTestObservation, type TestObservation } from "./tdd-observation.js";

export interface StrictTddPlan {
  readonly expectedFailingCaseIds: readonly string[];
}
export interface StrictRedResult {
  readonly cycleId: string;
  readonly requirementId: string;
  readonly planHash: string;
  readonly state: "red-recorded";
  readonly candidate: Readonly<{ id: string; repository: string; revision: string }>;
  readonly adapterId: "node-test";
  readonly commandFingerprint: string;
  readonly executedCaseIds: readonly string[];
  readonly failingCaseIds: readonly string[];
  readonly assertionFingerprint: string;
  readonly failureKind: "assertion";
}
export interface StrictTddCycle {
  readonly cycleId: string;
  readonly requirementId: string;
  readonly planHash: string;
  readonly state: "awaiting-red";
  readonly plan: StrictTddPlan;
  recordRed(redCandidate: Candidate, first: TestObservation, second: TestObservation): StrictRedResult;
}

const planKeys = ["expectedFailingCaseIds"] as const;
const candidateKeys = ["id", "repository", "revision", "createdAt"] as const;

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
function text(value: unknown, noun: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value !== value.normalize("NFC") || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`${noun} is malformed`);
  return value;
}
function path(value: unknown): string {
  const result = text(value, "test path");
  if (result.startsWith("/") || result.includes("\\") || result.includes(":") || result.split("/").some(part => !part || part === "." || part === "..")) throw new Error("test path is not canonical relative data");
  return result;
}
function list(value: unknown, noun: string, parse: (item: unknown) => string): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length === 0) throw new Error(`${noun} must be a nonempty exact array`);
  const indexes = Array.from({ length: value.length }, (_, index) => String(index));
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== "string" || key !== "length" && !indexes.includes(key))) throw new Error(`${noun} must be a nonempty exact array`);
  const result = indexes.map(index => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} must be a nonempty exact array`);
    return parse(descriptor.value);
  });
  if (new Set(result).size !== result.length) throw new Error(`${noun} contains duplicates`);
  return result;
}
function same(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}
function changedPaths(repository: string, baseline: string, red: string): string[] {
  let raw: Buffer;
  try {
    raw = execFileSync("git", ["--no-replace-objects", "-C", repository, "diff", "--name-only", "--no-renames", "-z", baseline, red, "--"], { stdio: ["ignore", "pipe", "ignore"] });
  } catch { throw new Error("RED Git diff could not be inspected"); }
  return raw.toString("utf8").split("\0").filter(Boolean).map(path);
}

/** Claims the genuine requirement before parsing any caller-controlled plan data. */
export function beginStrictTddCycle(obligation: TddObligation, value: StrictTddPlan): StrictTddCycle {
  claimTddObligation(obligation);
  if (obligation.mode !== "required") throw new Error("strict TDD requires an applicable obligation");
  const data = exact(value, planKeys, "strict TDD plan");
  const plan = Object.freeze({
    expectedFailingCaseIds: Object.freeze(list(data.expectedFailingCaseIds, "expected failing case ids", item => text(item, "expected failing case id"))),
  });
  const binding = JSON.stringify({ requirementId: obligation.requirementId, plan });
  const planHash = createHash("sha256").update(`plan\0${binding}`).digest("hex");
  const cycleId = createHash("sha256").update(`cycle\0${binding}`).digest("hex");
  let attempted = false;
  let cycle: StrictTddCycle;
  const recordRed = function(this: unknown, candidateValue: Candidate, first: TestObservation, second: TestObservation): StrictRedResult {
    if (this !== cycle) throw new Error("strict TDD cycle method requires the exact issued cycle");
    if (attempted) throw new Error("strict TDD cycle was already attempted");
    attempted = true;
    let firstProof: ReturnType<typeof claimTestObservation> | undefined;
    let secondProof: ReturnType<typeof claimTestObservation> | undefined;
    let claimError: unknown;
    try { firstProof = claimTestObservation(first); } catch (error) { claimError = error; }
    try { secondProof = claimTestObservation(second); } catch (error) { claimError ??= error; }
    if (claimError || !firstProof || !secondProof) throw claimError;
    const candidateData = exact(candidateValue, candidateKeys, "RED candidate");
    const candidate = { id: text(candidateData.id, "candidate id"), repository: text(candidateData.repository, "candidate repository"), revision: text(candidateData.revision, "candidate revision"), createdAt: text(candidateData.createdAt, "candidate creation time") };
    if (candidate.id !== obligation.candidate.id || candidate.repository !== obligation.candidate.repository || candidate.repository !== obligation.repositoryIdentity) throw new Error("RED candidate identity mismatch");
    assertExactGitCandidate(candidate, candidate.repository);
    assertDirectGitParent(candidate.repository, obligation.candidate.revision, candidate.revision);
    const changed = changedPaths(candidate.repository, obligation.candidate.revision, candidate.revision);
    if (!changed.length || changed.some(item => !first.testPaths.includes(item))) throw new Error("RED diff must be nonempty and limited to executed strict test paths");
    if (firstProof === secondProof) throw new Error("RED requires two different execution proofs");
    for (const proof of [firstProof, secondProof]) if (proof.candidateRepository !== candidate.repository || proof.candidateId !== candidate.id || proof.candidateRevision !== candidate.revision || proof.exitCode === 0) throw new Error("RED observation execution mismatch");
    if (first.adapterId !== second.adapterId || first.commandFingerprint !== second.commandFingerprint || !same(first.testPaths, second.testPaths) || !same(first.executedCaseIds, second.executedCaseIds) || !same(first.failingCaseIds, second.failingCaseIds) || first.assertionFingerprint !== second.assertionFingerprint || first.failureKind !== "assertion" || second.failureKind !== "assertion") throw new Error("RED observations are nondeterministic");
    if (!same(first.failingCaseIds, plan.expectedFailingCaseIds)) throw new Error("RED failing cases do not match the plan");
    return Object.freeze({ cycleId, requirementId: obligation.requirementId, planHash, state: "red-recorded" as const,
      candidate: Object.freeze({ id: candidate.id, repository: candidate.repository, revision: candidate.revision }), adapterId: first.adapterId,
      commandFingerprint: first.commandFingerprint, executedCaseIds: Object.freeze([...first.executedCaseIds]), failingCaseIds: Object.freeze([...first.failingCaseIds]),
      assertionFingerprint: first.assertionFingerprint, failureKind: "assertion" as const });
  };
  cycle = Object.freeze({ cycleId, requirementId: obligation.requirementId, planHash, state: "awaiting-red" as const, plan, recordRed });
  return cycle;
}
