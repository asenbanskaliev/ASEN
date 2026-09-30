import { createHash } from "node:crypto";
export type DeliveryRelationship =
  | Readonly<{ kind: "single" }>
  | Readonly<{ kind: "chain_slice"; sliceId: string }>;
export interface WorkUnitBoundaryInput {
  readonly featureIdentity: string;
  readonly taskIdentity: string;
  readonly taskDocumentPath: string;
  readonly purpose: string;
  readonly behaviorIds: readonly string[];
  readonly currentBranch: string;
  readonly defaultBranch: string;
  readonly authoredAdditions: number;
  readonly authoredDeletions: number;
  readonly expectedChangedPaths: readonly string[];
  readonly rollbackBoundaries: readonly string[];
  readonly deliveryRelationship: DeliveryRelationship;
}
export type ReadyWorkUnitBoundary = Readonly<WorkUnitBoundaryInput & {
  decision: "ready";
  boundaryId: string;
}>;
export type WorkUnitBoundaryDecision =
  | Readonly<{ decision: "branch_required"; currentBranch: string; defaultBranch: string }>
  | Readonly<{ decision: "split_required"; behaviorIds: readonly string[]; rollbackBoundaries: readonly string[] }>
  | Readonly<{ decision: "chain_required"; authoredAdditions: number; authoredDeletions: number; authoredTotal: number }>
  | ReadyWorkUnitBoundary;
const inputKeys = [
  "featureIdentity", "taskIdentity", "taskDocumentPath", "purpose", "behaviorIds",
  "currentBranch", "defaultBranch", "authoredAdditions", "authoredDeletions",
  "expectedChangedPaths", "rollbackBoundaries", "deliveryRelationship",
] as const;
const issuedBoundaries = new WeakSet<object>();
function exactRecord(value: unknown, keys: readonly string[], noun: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${noun} must be exact plain data`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${noun} must be exact plain data`);
  }
  const ownKeys = Reflect.ownKeys(value);
  const invalid = ownKeys.length !== keys.length
    || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    || keys.some((key) => !Object.hasOwn(value, key));
  if (invalid) throw new Error(`${noun} shape is invalid`);
  return Object.fromEntries(keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(`${noun} shape is invalid`);
    }
    return [key, descriptor.value];
  }));
}
function exactArray(value: unknown, noun: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${noun} must be an exact array`);
  }
  const indexes = Array.from({ length: value.length }, (_, index) => String(index));
  const ownKeys = Reflect.ownKeys(value);
  const invalid = ownKeys.some((key) => typeof key !== "string" || (key !== "length" && !indexes.includes(key)))
    || indexes.some((index) => !Object.hasOwn(value, index));
  if (invalid) throw new Error(`${noun} must be an exact array`);
  return indexes.map((index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(`${noun} must be an exact array`);
    }
    return descriptor.value;
  });
}
function text(value: unknown, noun: string): string {
  const malformed = typeof value !== "string" || !value || value.trim() !== value
    || value !== value.normalize("NFC") || /[\u0000-\u001f\u007f-\u009f]/u.test(value);
  if (malformed) throw new Error(`${noun} is malformed`);
  return value;
}
function path(value: unknown): string {
  const result = text(value, "path");
  const invalidSegment = result.split("/").some((part) => !part || part === "." || part === "..");
  if (result.startsWith("/") || result.includes("\\") || result.includes(":") || invalidSegment) {
    throw new Error("path is not canonical relative data");
  }
  return result;
}
function strings(value: unknown, noun: string, parser: (item: unknown) => string): string[] {
  const result = exactArray(value, noun).map(parser);
  if (!result.length) throw new Error(`${noun} must not be empty`);
  if (new Set(result).size !== result.length) throw new Error(`${noun} contains duplicates`);
  return result;
}
function count(value: unknown, noun: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${noun} is malformed`);
  }
  return value;
}
function relationship(value: unknown): DeliveryRelationship {
  const kind = typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, "kind")?.value
    : undefined;
  if (kind === "single") {
    exactRecord(value, ["kind"], "delivery relationship");
    return Object.freeze({ kind });
  }
  const record = exactRecord(value, ["kind", "sliceId"], "delivery relationship");
  if (record.kind !== "chain_slice") throw new Error("delivery relationship is malformed");
  return Object.freeze({ kind: "chain_slice", sliceId: text(record.sliceId, "slice ID") });
}
/** Pure boundary classification; it performs no repository operation or authority issuance. */
export function planWorkUnitBoundary(value: WorkUnitBoundaryInput): WorkUnitBoundaryDecision {
  const input = exactRecord(value, inputKeys, "work-unit input");
  const behaviorIds = strings(input.behaviorIds, "behavior IDs", (item) => text(item, "behavior ID"));
  const rollbackBoundaries = strings(input.rollbackBoundaries, "rollback boundaries", (item) => text(item, "rollback boundary"));
  if (behaviorIds.length !== rollbackBoundaries.length) {
    throw new Error("behavior and rollback facts must map one-to-one");
  }
  const taskDocumentPath = path(input.taskDocumentPath);
  const expectedChangedPaths = strings(input.expectedChangedPaths, "expected changed paths", path);
  if (!expectedChangedPaths.includes(taskDocumentPath)) {
    throw new Error("expected paths must include the task document");
  }
  const boundary = {
    featureIdentity: text(input.featureIdentity, "feature identity"),
    taskIdentity: text(input.taskIdentity, "task identity"),
    taskDocumentPath,
    purpose: text(input.purpose, "purpose"),
    behaviorIds: Object.freeze(behaviorIds),
    currentBranch: text(input.currentBranch, "current branch"),
    defaultBranch: text(input.defaultBranch, "default branch"),
    authoredAdditions: count(input.authoredAdditions, "authored additions"),
    authoredDeletions: count(input.authoredDeletions, "authored deletions"),
    expectedChangedPaths: Object.freeze(expectedChangedPaths),
    rollbackBoundaries: Object.freeze(rollbackBoundaries),
    deliveryRelationship: relationship(input.deliveryRelationship),
  };
  if (boundary.currentBranch === boundary.defaultBranch) {
    return Object.freeze({
      decision: "branch_required",
      currentBranch: boundary.currentBranch,
      defaultBranch: boundary.defaultBranch,
    });
  }
  if (behaviorIds.length > 1) {
    return Object.freeze({
      decision: "split_required",
      behaviorIds: boundary.behaviorIds,
      rollbackBoundaries: boundary.rollbackBoundaries,
    });
  }
  const authoredTotal = boundary.authoredAdditions + boundary.authoredDeletions;
  if (!Number.isSafeInteger(authoredTotal)) {
    throw new Error("aggregate authored total is not a safe integer");
  }
  if (authoredTotal > 400) {
    return Object.freeze({
      decision: "chain_required",
      authoredAdditions: boundary.authoredAdditions,
      authoredDeletions: boundary.authoredDeletions,
      authoredTotal,
    });
  }
  const boundaryId = createHash("sha256").update(JSON.stringify(boundary)).digest("hex");
  const ready = Object.freeze({ ...boundary, decision: "ready" as const, boundaryId });
  issuedBoundaries.add(ready);
  return ready;
}
export function isGenuineReadyWorkUnitBoundary(value: unknown): value is ReadyWorkUnitBoundary {
  return typeof value === "object" && value !== null && issuedBoundaries.has(value);
}
