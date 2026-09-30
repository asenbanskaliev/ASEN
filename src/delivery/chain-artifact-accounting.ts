import { claimChainPolicyPlan, type ChainPolicyPlan } from "./chain-policy.js";

export type DiffClassification = "authored" | "generated";
export interface ObservedDiffStat { readonly path: string; readonly additions: number; readonly deletions: number; readonly classification: DiffClassification }
export interface ClassificationEvidence { readonly identity: string; readonly source: string }
export interface GeneratedArtifact { readonly path: string; readonly contentIdentity: string; readonly additions: number; readonly deletions: number; readonly classificationEvidence: ClassificationEvidence }
export interface ChainArtifactAccountingInput {
  readonly plan: ChainPolicyPlan;
  readonly diffStats: readonly ObservedDiffStat[];
  readonly generatedArtifacts: readonly GeneratedArtifact[];
  readonly totalAdditions: number;
  readonly totalDeletions: number;
}
export interface ChainArtifactAccounting {
  readonly accountingStatus: "complete" | "replan_required";
  readonly slices: readonly Readonly<{
    id: string; diffStats: readonly ObservedDiffStat[]; generatedArtifacts: readonly GeneratedArtifact[];
    authoredAdditions: number; authoredDeletions: number; generatedAdditions: number; generatedDeletions: number;
    completeAdditions: number; completeDeletions: number; completeBudget: number;
  }>[];
  readonly totals: Readonly<{
    authoredAdditions: number; authoredDeletions: number; generatedAdditions: number; generatedDeletions: number;
    completeAdditions: number; completeDeletions: number; completeBudget: number;
  }>;
  readonly completeSnapshot: Readonly<{
    paths: readonly string[]; artifactIdentities: readonly string[]; classificationEvidence: readonly ClassificationEvidence[];
  }>;
  readonly publicationStatus: "pending";
  readonly mergeStatus: "pending";
}

const inputKeys = ["plan", "diffStats", "generatedArtifacts", "totalAdditions", "totalDeletions"] as const;
const statKeys = ["path", "additions", "deletions", "classification"] as const;
const artifactKeys = ["path", "contentIdentity", "additions", "deletions", "classificationEvidence"] as const;
const evidenceKeys = ["identity", "source"] as const;
const contentPattern = /^sha256:[0-9a-f]{64}$/u;

function record(value: unknown, keys: readonly string[], noun: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${noun} must be exact plain data`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error(`${noun} shape is invalid`);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${noun} shape is invalid`);
    result[key] = descriptor.value;
  }
  return result;
}
function array(value: unknown, noun: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${noun} must be an exact array`);
  const indexes = Array.from({ length: value.length }, (_, index) => String(index));
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== "string" || (key !== "length" && !indexes.includes(key))) || indexes.some(key => !Object.hasOwn(value, key))) throw new Error(`${noun} must be an exact array`);
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
function freezeStat(value: unknown): ObservedDiffStat {
  const item = record(value, statKeys, "diff stat");
  if (item.classification !== "authored" && item.classification !== "generated") throw new Error("diff classification is malformed");
  return Object.freeze({ path: path(item.path), additions: count(item.additions, "additions"), deletions: count(item.deletions, "deletions"), classification: item.classification });
}
function freezeArtifact(value: unknown): GeneratedArtifact {
  const item = record(value, artifactKeys, "generated artifact");
  const evidence = record(item.classificationEvidence, evidenceKeys, "classification evidence");
  const contentIdentity = text(item.contentIdentity, "content identity");
  if (!contentPattern.test(contentIdentity)) throw new Error("content identity is malformed");
  return Object.freeze({
    path: path(item.path), contentIdentity, additions: count(item.additions, "artifact additions"), deletions: count(item.deletions, "artifact deletions"),
    classificationEvidence: Object.freeze({ identity: text(evidence.identity, "evidence identity"), source: text(evidence.source, "evidence source") }),
  });
}
const sum = (items: readonly ObservedDiffStat[], field: "additions" | "deletions") => items.reduce((total, item) => total + item[field], 0);

/** Pure accounting only: consumes one genuine D1a plan and performs no repository operation. */
export function accountChainArtifacts(value: ChainArtifactAccountingInput): ChainArtifactAccounting {
  const input = record(value, inputKeys, "artifact accounting input");
  const plan = input.plan as ChainPolicyPlan;
  claimChainPolicyPlan(plan);

  const observedPaths = plan.slices.flatMap(slice => slice.observedDiffPaths);
  if (new Set(observedPaths).size !== observedPaths.length) throw new Error("D1a paths are reused across slices");
  const stats = array(input.diffStats, "diff stats").map(freezeStat);
  if (new Set(stats.map(item => item.path)).size !== stats.length) throw new Error("diff stats contain duplicate paths");
  const expected = new Set(observedPaths);
  if (stats.length !== expected.size || stats.some(item => !expected.has(item.path))) throw new Error("diff stats must exactly partition D1a observed paths");
  const byPath = new Map(stats.map(item => [item.path, item]));

  const artifacts = array(input.generatedArtifacts, "generated artifacts").map(freezeArtifact);
  if (new Set(artifacts.map(item => item.path)).size !== artifacts.length) throw new Error("generated artifacts contain duplicate paths");
  if (new Set(artifacts.map(item => item.contentIdentity)).size !== artifacts.length) throw new Error("generated artifact identities must be unique");
  if (new Set(artifacts.map(item => item.classificationEvidence.identity)).size !== artifacts.length) throw new Error("classification evidence identities must be unique");
  const artifactByPath = new Map(artifacts.map(item => [item.path, item]));
  const generatedStats = stats.filter(item => item.classification === "generated");
  if (artifacts.length !== generatedStats.length) throw new Error("generated stats and artifacts must map exactly");
  for (const stat of generatedStats) {
    const artifact = artifactByPath.get(stat.path);
    if (!artifact || artifact.additions !== stat.additions || artifact.deletions !== stat.deletions) throw new Error("generated artifact path or counts mismatch");
  }
  if (artifacts.some(item => byPath.get(item.path)?.classification !== "generated")) throw new Error("artifact does not map to a generated stat");

  const slices = plan.slices.map(slice => {
    const sliceStats = slice.observedDiffPaths.map(item => byPath.get(item)!);
    const authored = sliceStats.filter(item => item.classification === "authored");
    if (sum(authored, "additions") !== slice.authoredAdditions || sum(authored, "deletions") !== slice.authoredDeletions) throw new Error("authored stat counts do not match D1a slice");
    const generated = sliceStats.filter(item => item.classification === "generated");
    const generatedAdditions = sum(generated, "additions"), generatedDeletions = sum(generated, "deletions");
    const completeAdditions = slice.authoredAdditions + generatedAdditions, completeDeletions = slice.authoredDeletions + generatedDeletions;
    return Object.freeze({
      id: slice.id, diffStats: Object.freeze(sliceStats), generatedArtifacts: Object.freeze(generated.map(item => artifactByPath.get(item.path)!)),
      authoredAdditions: slice.authoredAdditions, authoredDeletions: slice.authoredDeletions, generatedAdditions, generatedDeletions,
      completeAdditions, completeDeletions, completeBudget: completeAdditions + completeDeletions,
    });
  });
  const generatedAdditions = sum(generatedStats, "additions"), generatedDeletions = sum(generatedStats, "deletions");
  const completeAdditions = plan.authoredAdditions + generatedAdditions, completeDeletions = plan.authoredDeletions + generatedDeletions;
  if (count(input.totalAdditions, "total additions") !== completeAdditions || count(input.totalDeletions, "total deletions") !== completeDeletions) throw new Error("full candidate totals do not match complete accounting");
  const totals = Object.freeze({ authoredAdditions: plan.authoredAdditions, authoredDeletions: plan.authoredDeletions, generatedAdditions, generatedDeletions, completeAdditions, completeDeletions, completeBudget: completeAdditions + completeDeletions });
  const completeSnapshot = Object.freeze({ paths: Object.freeze([...observedPaths]), artifactIdentities: Object.freeze(artifacts.map(item => item.contentIdentity)), classificationEvidence: Object.freeze(artifacts.map(item => item.classificationEvidence)) });
  return Object.freeze({ accountingStatus: slices.some(slice => slice.completeBudget > 400) ? "replan_required" : "complete", slices: Object.freeze(slices), totals, completeSnapshot, publicationStatus: "pending", mergeStatus: "pending" });
}
