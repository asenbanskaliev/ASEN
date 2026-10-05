import { createHash } from "node:crypto";
import type { Risk } from "../core/types.js";
import { verificationLevel } from "./risk.js";

export type OddIntent = "implementation" | "analysis" | "incident" | "verification";
export type OddChangeKind = "behavior" | "schema" | "security" | "configuration" | "migration" | "documentation" | "format" | "generated";
export type OddRiskOperation = "destructive_git" | "external_write" | "credential_or_auth" | "security_boundary";
export type OddReviewKind = "none" | "ordinary" | "dual_explicit";
export type OddRoute = "direct" | "plan" | "orchestrate" | "incident" | "verify";
export type OddScope = Readonly<{ kind: "known"; expectedPaths: readonly string[] }> | Readonly<{ kind: "unknown"; reason: string }>;
export type OddTesting = Readonly<{ kind: "required" }> | Readonly<{ kind: "n_a"; reason: string }>;
export interface OddRoutingRequest {
  readonly taskIdentity: string;
  readonly repositoryIdentity: string;
  readonly intent: OddIntent;
  readonly scope: OddScope;
  readonly writes: readonly Readonly<{ path: string; changeKind: OddChangeKind }>[];
  readonly riskOperations: readonly OddRiskOperation[];
  readonly session: Readonly<{ estimatedMinutes: number; continuation: boolean }>;
  readonly testing: OddTesting;
  readonly review: Readonly<{ kind: OddReviewKind; estimatedMinutes: number }>;
  readonly unresolvedDecisions: readonly string[];
}
export interface OddDerivedFacts {
  readonly taskIdentity: string; readonly repositoryIdentity: string; readonly intent: OddIntent;
  readonly scope: OddScope; readonly writes: OddRoutingRequest["writes"]; readonly riskOperations: readonly OddRiskOperation[];
  readonly session: OddRoutingRequest["session"]; readonly testing: OddTesting; readonly review: OddRoutingRequest["review"];
  readonly unresolvedDecisions: readonly string[]; readonly filesTouched: number; readonly nonTrivialWrites: number;
  readonly incident: boolean; readonly verificationIntent: boolean; readonly longSession: boolean; readonly risk: Risk;
}
export interface OddRouteDecision {
  readonly decisionId: string; readonly taskIdentity: string; readonly repositoryIdentity: string;
  readonly route: OddRoute; readonly risk: Risk; readonly verification: "structural" | "tests" | "independent";
  readonly reasons: readonly string[]; readonly requiresSingleWriter: boolean; readonly requiresIsolatedChild: boolean;
}

const requestKeys = ["taskIdentity", "repositoryIdentity", "intent", "scope", "writes", "riskOperations", "session", "testing", "review", "unresolvedDecisions"] as const;
const intents = ["implementation", "analysis", "incident", "verification"] as const;
const changeKinds = ["behavior", "schema", "security", "configuration", "migration", "documentation", "format", "generated"] as const;
const riskOperations = ["destructive_git", "external_write", "credential_or_auth", "security_boundary"] as const;
const reviewKinds = ["none", "ordinary", "dual_explicit"] as const;
const nonTrivialKinds = new Set<OddChangeKind>(["behavior", "schema", "security", "configuration", "migration"]);
const issuedFacts = new WeakSet<object>();
const plannedFacts = new WeakSet<object>();
const issuedDecisions = new WeakSet<object>();
const claimedDecisions = new WeakSet<object>();
const decisionFacts = new WeakMap<object, OddDerivedFacts>();

function record(value: unknown, keys: readonly string[], noun: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${noun} must be exact plain data`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error(`${noun} shape is invalid`);
  return Object.fromEntries(keys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} shape is invalid`);
    return [key, descriptor.value];
  }));
}
function array(value: unknown, noun: string): unknown[] {
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
function count(value: unknown, noun: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${noun} is malformed`);
  return value;
}
function uniqueStrings(value: unknown, noun: string, parse = (item: unknown) => text(item, noun)): string[] {
  const result = array(value, noun).map(parse);
  if (new Set(result).size !== result.length) throw new Error(`${noun} contains duplicates`);
  return result;
}
function member<T extends string>(value: unknown, values: readonly T[], noun: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${noun} is invalid`);
  return value as T;
}
function parseScope(value: unknown): OddScope {
  const kind = typeof value === "object" && value !== null ? Object.getOwnPropertyDescriptor(value, "kind")?.value : undefined;
  if (kind === "known") {
    const input = record(value, ["kind", "expectedPaths"], "scope");
    return Object.freeze({ kind, expectedPaths: Object.freeze(uniqueStrings(input.expectedPaths, "expected paths", path)) });
  }
  const input = record(value, ["kind", "reason"], "scope");
  if (input.kind !== "unknown") throw new Error("scope kind is invalid");
  return Object.freeze({ kind: "unknown", reason: text(input.reason, "unknown scope reason") });
}
function parseTesting(value: unknown): OddTesting {
  const kind = typeof value === "object" && value !== null ? Object.getOwnPropertyDescriptor(value, "kind")?.value : undefined;
  if (kind === "required") { record(value, ["kind"], "testing"); return Object.freeze({ kind }); }
  const input = record(value, ["kind", "reason"], "testing");
  if (input.kind !== "n_a") throw new Error("testing kind is invalid");
  return Object.freeze({ kind: "n_a", reason: text(input.reason, "testing reason") });
}

/** Validates exact request records and derives immutable local routing facts. */
export function deriveOddFacts(value: OddRoutingRequest): OddDerivedFacts {
  const input = record(value, requestKeys, "ODD request");
  const scope = parseScope(input.scope);
  const writes = array(input.writes, "writes").map(item => {
    const write = record(item, ["path", "changeKind"], "write");
    return Object.freeze({ path: path(write.path), changeKind: member(write.changeKind, changeKinds, "change kind") });
  });
  const writePaths = writes.map(write => write.path);
  if (new Set(writePaths).size !== writes.length) throw new Error("write paths contain duplicates");
  if (scope.kind !== "known" && writes.length || scope.kind === "known" && writePaths.some(item => !scope.expectedPaths.includes(item))) throw new Error("writes must be unique members of known scope");
  const operations = uniqueStrings(input.riskOperations, "risk operations").map(item => member(item, riskOperations, "risk operation"));
  const sessionInput = record(input.session, ["estimatedMinutes", "continuation"], "session");
  if (typeof sessionInput.continuation !== "boolean") throw new Error("session continuation is invalid");
  const session = Object.freeze({ estimatedMinutes: count(sessionInput.estimatedMinutes, "session estimate"), continuation: sessionInput.continuation });
  const reviewInput = record(input.review, ["kind", "estimatedMinutes"], "review");
  const review = Object.freeze({ kind: member(reviewInput.kind, reviewKinds, "review kind"), estimatedMinutes: count(reviewInput.estimatedMinutes, "review estimate") });
  const unresolvedDecisions = Object.freeze(uniqueStrings(input.unresolvedDecisions, "unresolved decisions"));
  const high = operations.length > 0 || writes.some(write => write.changeKind === "security");
  const unknown = scope.kind === "unknown" || unresolvedDecisions.length > 0;
  const filesTouched = scope.kind === "known" ? scope.expectedPaths.length : 0;
  const risk: Risk = high ? "high" : unknown ? "unknown" : filesTouched >= 3 ? "medium" : "low";
  const facts = Object.freeze({
    taskIdentity: text(input.taskIdentity, "task identity"), repositoryIdentity: text(input.repositoryIdentity, "repository identity"),
    intent: member(input.intent, intents, "intent"), scope, writes: Object.freeze(writes), riskOperations: Object.freeze(operations), session,
    testing: parseTesting(input.testing), review, unresolvedDecisions, filesTouched,
    nonTrivialWrites: writes.filter(write => nonTrivialKinds.has(write.changeKind)).length,
    incident: input.intent === "incident", verificationIntent: input.intent === "verification",
    longSession: session.continuation || session.estimatedMinutes >= 60, risk,
  });
  issuedFacts.add(facts);
  return facts;
}

/** Consumes genuine facts on the first planning attempt and issues no execution authority. */
export function planOddRoute(facts: OddDerivedFacts): OddRouteDecision {
  if (typeof facts !== "object" || facts === null || !issuedFacts.has(facts)) throw new Error("ODD facts were not issued here");
  if (plannedFacts.has(facts)) throw new Error("ODD facts have already been planned");
  plannedFacts.add(facts);
  let route: OddRoute; let reasons: string[];
  if (facts.incident) { route = "incident"; reasons = ["incident-intent"]; }
  else if (facts.verificationIntent) { route = "verify"; reasons = ["verification-intent"]; }
  else if (facts.scope.kind === "unknown" || facts.unresolvedDecisions.length) { route = "plan"; reasons = [...(facts.scope.kind === "unknown" ? ["unknown-scope"] : []), ...(facts.unresolvedDecisions.length ? ["unresolved-decisions"] : [])]; }
  else if (facts.risk === "high") { route = "plan"; reasons = ["high-risk"]; }
  else {
    reasons = [...(facts.filesTouched >= 4 ? ["four-or-more-files"] : []), ...(facts.nonTrivialWrites >= 2 ? ["two-or-more-nontrivial-writes"] : []), ...(facts.longSession ? ["long-session"] : []), ...(facts.review.kind !== "none" ? ["review-requested"] : []), ...(facts.review.estimatedMinutes >= 60 ? ["review-at-least-60-minutes"] : [])];
    route = reasons.length ? "orchestrate" : "direct";
    if (!reasons.length) reasons = ["simple-bounded-request"];
  }
  const payload = { taskIdentity: facts.taskIdentity, repositoryIdentity: facts.repositoryIdentity, route, risk: facts.risk, verification: verificationLevel(facts.risk), reasons, requiresSingleWriter: route === "orchestrate" || route === "incident", requiresIsolatedChild: route === "orchestrate" || route === "incident" || route === "verify" };
  const decision = Object.freeze({ decisionId: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), ...payload, reasons: Object.freeze(reasons) });
  issuedDecisions.add(decision);
  decisionFacts.set(decision, facts);
  return decision;
}

/** Reports genuine claimed provenance without consuming or reissuing the decision. */
export function isClaimedOddRouteDecision(value: unknown): value is OddRouteDecision {
  return typeof value === "object"
    && value !== null
    && issuedDecisions.has(value)
    && claimedDecisions.has(value);
}

/** Burns a genuine issued decision on its first A2 claim attempt. */
export function claimOddRouteDecision(value: unknown): asserts value is OddRouteDecision {
  if (typeof value !== "object" || value === null || !issuedDecisions.has(value)) throw new Error("ODD route decision was not issued here");
  if (claimedDecisions.has(value)) throw new Error("ODD route decision has already been claimed");
  claimedDecisions.add(value);
}

/** Returns immutable original facts only for a genuine claimed decision. */
export function claimedOddRouteFacts(value: unknown): OddDerivedFacts {
  if (!isClaimedOddRouteDecision(value)) {
    throw new Error("ODD route decision is not genuinely claimed");
  }
  const facts = decisionFacts.get(value);
  if (!facts) {
    throw new Error("ODD route decision facts are unavailable");
  }
  return facts;
}
