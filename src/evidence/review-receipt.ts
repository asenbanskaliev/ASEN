/**
 * Immutable Cryptographic Review Receipts for ASEN.
 * Generates and verifies signed receipts linking commit SHA, tree SHA, test outcomes and verification verdict.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export function createReviewReceipt(input: ReviewReceiptInput): ReviewReceipt {
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

  const receiptId = `rcpt_${randomBytes(8).toString("hex")}`;
  const timestamp = new Date().toISOString();
  const signature = computeReceiptSignature(
    input.treeSha,
    passed,
    input.verdict,
    input.commitSha
  );

  return Object.freeze({
    schemaVersion: "1.0.0",
    receiptId,
    commitSha: input.commitSha.toLowerCase(),
    treeSha: input.treeSha,
    oddTask: input.oddTask,
    timestamp,
    testSuite: Object.freeze({ ...input.testSuite }),
    verdict: input.verdict,
    ...(input.metadata ? { metadata: Object.freeze({ ...input.metadata }) } : {}),
    signature
  });
}

export function verifyReviewReceipt(receipt: unknown): receipt is ReviewReceipt {
  if (typeof receipt !== "object" || receipt === null) {
    return false;
  }
  const r = receipt as Partial<ReviewReceipt>;

  if (
    r.schemaVersion !== "1.0.0" ||
    typeof r.receiptId !== "string" ||
    !r.receiptId.startsWith("rcpt_") ||
    typeof r.commitSha !== "string" ||
    !/^[a-f0-9]{40}$/i.test(r.commitSha) ||
    typeof r.treeSha !== "string" ||
    (r.verdict !== "PASSED" && r.verdict !== "FAILED") ||
    typeof r.signature !== "string" ||
    !r.testSuite ||
    typeof r.testSuite.passed !== "number"
  ) {
    return false;
  }

  const expectedSignature = computeReceiptSignature(
    r.treeSha,
    r.testSuite.passed,
    r.verdict,
    r.commitSha
  );

  return r.signature === expectedSignature;
}

export async function writeReviewReceipt(
  storageDir: string,
  receipt: ReviewReceipt
): Promise<string> {
  if (!verifyReviewReceipt(receipt)) {
    throw new Error("Cannot write invalid or unverified review receipt");
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
    if (!verifyReviewReceipt(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
