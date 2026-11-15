/**
 * Immutable Cryptographic Review Receipts for ASEN.
 * Generates and verifies receipts linking commit SHA, tree SHA, test outcomes and verdict.
 *
 * Two signature modes:
 * - Legacy (unkeyed SHA-256 content checksum): tamper-evident but forgeable by anyone.
 * - HMAC-SHA-256 keyed (preferred): authenticates the receipt with a local secret key,
 *   so a forged "PASSED" receipt cannot be produced without the key. Follows the same
 *   pattern as the agent store receipt key (agent-store.ts).
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface TestSuiteOutcome {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly durationMs: number;
  readonly runner: string;
}

export interface ReviewReceiptInput {
  readonly commitSha: string;
  readonly treeSha: string;
  readonly oddTask: string;
  readonly testSuite: TestSuiteOutcome;
  readonly verdict: "PASSED" | "FAILED";
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface ReviewReceipt {
  readonly schemaVersion: "1.0.0";
  readonly receiptId: string;
  readonly commitSha: string;
  readonly treeSha: string;
  readonly oddTask: string;
  readonly timestamp: string;
  readonly testSuite: TestSuiteOutcome;
  readonly verdict: "PASSED" | "FAILED";
  readonly metadata?: Record<string, unknown> | undefined;
  readonly signature: string;
}

const SIGNING_KEY_FILE = "receipt-signing.key";
const SIGNING_KEY_BYTES = 32;
const HMAC_PREFIX = "hmac-sha256:";

/**
 * Load (or create on first use) the local HMAC signing key for review receipts.
 * The key is a 32-byte random secret stored with owner-only permissions (0o600),
 * created atomically ("wx") to avoid races. Follows the agent-store.ts receipt-key pattern.
 */
export async function loadReceiptSigningKey(storageDir: string): Promise<Buffer> {
  await mkdir(storageDir, { recursive: true });
  const keyPath = join(storageDir, SIGNING_KEY_FILE);

  // Fast path: existing key.
  try {
    const existing = await readFile(keyPath);
    if (existing.length === SIGNING_KEY_BYTES) {
      return existing;
    }
    throw new Error(
      `Invalid ASEN receipt signing key: expected ${SIGNING_KEY_BYTES} bytes, got ${existing.length}`
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw err;
    }
  }

  // Create atomically; if a concurrent creator wins the race, read theirs.
  try {
    const handle = await open(keyPath, "wx", 0o600);
    try {
      const key = randomBytes(SIGNING_KEY_BYTES);
      await handle.writeFile(key);
      await handle.sync();
      return key;
    } finally {
      await handle.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
      const existing = await readFile(keyPath);
      if (existing.length === SIGNING_KEY_BYTES) {
        return existing;
      }
    }
    throw err;
  }
}

function computeReceiptSignature(
  treeSha: string,
  passed: number,
  verdict: "PASSED" | "FAILED",
  commitSha: string
): string {
  return createHash("sha256")
    .update(`${treeSha}:${passed}:${verdict}:${commitSha}`)
    .digest("hex");
}

/**
 * Compute the keyed HMAC-SHA-256 signature over the canonical receipt payload.
 * Unlike the legacy checksum, this cannot be recomputed by anyone lacking the key.
 */
/** Canonical domain-separated payload: all outcome fields, metadata and identity. */
function canonicalMetadata(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalMetadata);
  if (typeof value === "object" && value !== null &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => [key, canonicalMetadata(entry)]));
  }
  throw new Error("Receipt metadata must contain plain JSON values");
}
function fullHmacPayload(r: ReviewReceipt): string {
  return JSON.stringify([
    "asen.review-receipt.full.v2", r.schemaVersion, r.receiptId, r.commitSha,
    r.treeSha, r.oddTask, r.timestamp, r.testSuite.total, r.testSuite.passed,
    r.testSuite.failed, r.testSuite.durationMs, r.testSuite.runner, r.verdict,
    canonicalMetadata(r.metadata ?? null)
  ]);
}
function computeReceiptHmac(key: Buffer, receipt: ReviewReceipt): string {
  return createHmac("sha256", key).update(fullHmacPayload(receipt)).digest("hex");
}

/** Constant-time hex comparison (both strings must be valid equal-length hex). */
function safeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function validateReceiptInput(input: ReviewReceiptInput): void {
  if (
    !input.commitSha ||
    typeof input.commitSha !== "string" ||
    !/^[a-f0-9]{40}$/i.test(input.commitSha)
  ) {
    throw new Error(`Invalid commitSha: must be 40-character hex string (${input.commitSha})`);
  }

  if (!input.treeSha || typeof input.treeSha !== "string") {
    throw new Error(`Invalid treeSha: must be a non-empty string`);
  }

  const { total, passed, failed } = input.testSuite;
  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(passed) ||
    !Number.isSafeInteger(failed) ||
    total !== passed + failed
  ) {
    throw new Error(
      `Invalid test counts: TestSuite total must equal passed + failed (total: ${total}, passed: ${passed}, failed: ${failed})`
    );
  }
}

function buildReceipt(input: ReviewReceiptInput, signature: string): ReviewReceipt {
  const { passed } = input.testSuite;
  void passed;
  return Object.freeze({
    schemaVersion: "1.0.0",
    receiptId: `rcpt_${randomBytes(8).toString("hex")}`,
    commitSha: input.commitSha.toLowerCase(),
    treeSha: input.treeSha,
    oddTask: input.oddTask,
    timestamp: new Date().toISOString(),
    testSuite: Object.freeze({ ...input.testSuite }),
    verdict: input.verdict,
    ...(input.metadata ? { metadata: Object.freeze({ ...input.metadata }) } : {}),
    signature
  });
}

export function createReviewReceipt(input: ReviewReceiptInput): ReviewReceipt {
  validateReceiptInput(input);
  const signature = computeReceiptSignature(
    input.treeSha,
    input.testSuite.passed,
    input.verdict,
    input.commitSha
  );
  return buildReceipt(input, signature);
}

/**
 * Create a receipt authenticated with the local HMAC key (preferred over the
 * legacy unkeyed checksum). The signature is prefixed with `hmac-sha256:` so
 * verifiers can distinguish it from a legacy plain-hash receipt.
 */
export function createReviewReceiptSigned(
  input: ReviewReceiptInput,
  key: Buffer
): ReviewReceipt {
  if (!Buffer.isBuffer(key) || key.length !== SIGNING_KEY_BYTES) {
    throw new Error(`Signing key must be a Buffer of ${SIGNING_KEY_BYTES} bytes`);
  }
  validateReceiptInput(input);
  const unsigned = buildReceipt(input, "");
  const signature = HMAC_PREFIX + computeReceiptHmac(key, unsigned);
  return Object.freeze({ ...unsigned, signature });
}

/** Validate structural shape (without checking the cryptographic signature). */
function hasValidReceiptShape(receipt: unknown): receipt is ReviewReceipt {
  if (typeof receipt !== "object" || receipt === null) {
    return false;
  }
  const r = receipt as Partial<ReviewReceipt>;

  return (
    r.schemaVersion === "1.0.0" &&
    typeof r.receiptId === "string" &&
    r.receiptId.startsWith("rcpt_") &&
    typeof r.commitSha === "string" &&
    /^[a-f0-9]{40}$/i.test(r.commitSha) &&
    typeof r.treeSha === "string" &&
    (r.verdict === "PASSED" || r.verdict === "FAILED") &&
    typeof r.signature === "string" &&
    !!r.testSuite &&
    typeof r.testSuite.passed === "number"
  );
}

export function verifyReviewReceipt(receipt: unknown): receipt is ReviewReceipt {
  if (!hasValidReceiptShape(receipt)) {
    return false;
  }
  const r = receipt as ReviewReceipt;

  // Legacy receipts carry a plain 64-hex checksum. HMAC receipts are verified
  // only by verifyReviewReceiptSigned (they require the key); here they fail.
  if (r.signature.startsWith(HMAC_PREFIX)) {
    return false;
  }

  const expectedSignature = computeReceiptSignature(
    r.treeSha,
    r.testSuite.passed,
    r.verdict,
    r.commitSha
  );

  return safeHexEqual(r.signature, expectedSignature);
}

/**
 * Strictly verify an HMAC-authenticated receipt with the local signing key.
 * Returns true only when the receipt carries a valid `hmac-sha256:` signature
 * produced with this exact key. Legacy (unkeyed) receipts are rejected here —
 * use verifyReviewReceipt for the permissive legacy path.
 */
export function verifyReviewReceiptSigned(
  receipt: unknown,
  key: Buffer
): receipt is ReviewReceipt {
  if (!Buffer.isBuffer(key) || key.length !== SIGNING_KEY_BYTES) {
    return false;
  }
  if (!hasValidReceiptShape(receipt)) {
    return false;
  }
  const r = receipt as ReviewReceipt;
  if (!r.signature.startsWith(HMAC_PREFIX)) {
    return false;
  }

  const actualHex = r.signature.slice(HMAC_PREFIX.length);
  if (!/^[a-f0-9]{64}$/i.test(actualHex)) return false;
  // Signed receipts reject unexpected fields and must authenticate every field
  // that can affect claims, audit identity or test outcome.
  const expected = ["schemaVersion", "receiptId", "commitSha", "treeSha", "oddTask",
    "timestamp", "testSuite", "verdict", ...(Object.hasOwn(r, "metadata") ? ["metadata"] : []), "signature"];
  if (Object.keys(r).length !== expected.length || expected.some(key => !Object.hasOwn(r, key))) return false;
  const suiteKeys = ["total", "passed", "failed", "durationMs", "runner"];
  if (!r.testSuite || Object.keys(r.testSuite).length !== suiteKeys.length ||
      suiteKeys.some(key => !Object.hasOwn(r.testSuite, key))) return false;
  if (typeof r.oddTask !== "string" || r.oddTask.length === 0 ||
      !Number.isFinite(Date.parse(r.timestamp)) ||
      !Number.isSafeInteger(r.testSuite.total) || r.testSuite.total < 0 ||
      !Number.isSafeInteger(r.testSuite.passed) || r.testSuite.passed < 0 ||
      !Number.isSafeInteger(r.testSuite.failed) || r.testSuite.failed < 0 ||
      r.testSuite.total !== r.testSuite.passed + r.testSuite.failed ||
      !Number.isFinite(r.testSuite.durationMs) || r.testSuite.durationMs < 0 ||
      typeof r.testSuite.runner !== "string") return false;
  try { return safeHexEqual(actualHex, computeReceiptHmac(key, r)); }
  catch { return false; }
}

/**
 * Structural + internally-consistent check for persistence: accepts a legacy
 * receipt whose checksum matches, or an HMAC receipt whose signature is
 * well-formed. Key authentication happens at verify time, not at write time.
 */
function isPersistableReceipt(receipt: unknown): receipt is ReviewReceipt {
  if (!hasValidReceiptShape(receipt)) return false;
  const r = receipt as ReviewReceipt;
  if (r.signature.startsWith(HMAC_PREFIX)) {
    // Well-formed HMAC signature (prefix + 64 hex). Cannot authenticate here
    // without the key, but it is a structurally valid signed receipt.
    return /^[a-f0-9]{64}$/i.test(r.signature.slice(HMAC_PREFIX.length));
  }
  return verifyReviewReceipt(receipt);
}

export async function writeReviewReceipt(
  storageDir: string,
  receipt: ReviewReceipt
): Promise<string> {
  if (!isPersistableReceipt(receipt)) {
    throw new Error("Cannot write invalid or unverified review receipt");
  }
  if (receipt.signature.startsWith(HMAC_PREFIX)) {
    const key = await loadReceiptSigningKey(storageDir);
    if (!verifyReviewReceiptSigned(receipt, key)) {
      throw new Error("Cannot persist an unauthenticated HMAC review receipt");
    }
  }

  await mkdir(storageDir, { recursive: true });
  const targetPath = join(storageDir, `${receipt.commitSha}.json`);
  const content = JSON.stringify(receipt, null, 2) + "\n";
  await writeFile(targetPath, content, { encoding: "utf8", mode: 0o644 });
  return targetPath;
}

export async function readReviewReceipt(
  storageDir: string,
  commitSha: string
): Promise<ReviewReceipt | null> {
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) {
    return null;
  }

  const targetPath = join(storageDir, `${commitSha.toLowerCase()}.json`);
  try {
    const raw = await readFile(targetPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isPersistableReceipt(parsed)) return null;
    if (parsed.signature.startsWith(HMAC_PREFIX) &&
        !verifyReviewReceiptSigned(parsed, await loadReceiptSigningKey(storageDir))) return null;
    return parsed;
  } catch {
    return null;
  }
}
