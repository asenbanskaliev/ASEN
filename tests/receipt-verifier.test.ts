import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReviewReceipt,
  createReviewReceiptSigned,
  loadReceiptSigningKey,
  writeReviewReceipt
} from "../src/evidence/review-receipt.js";
import {
  ReceiptVerifierService
} from "../src/evidence/receipt-verifier.js";

const sampleCommit = "c0000000" + "0".repeat(32);
const sampleTree = "t1111111" + "1".repeat(32);

function signedInput(verdict: "PASSED" | "FAILED", passed: number, failed: number) {
  return {
    commitSha: sampleCommit,
    treeSha: sampleTree,
    oddTask: "task-verification-test",
    testSuite: { total: passed + failed, passed, failed, durationMs: 250, runner: "node:test" },
    verdict
  };
}

test("ReceiptVerifierService certifies a treeSha with an authentic HMAC-signed PASSED receipt", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-verifier-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const receiptsDir = join(root, "receipts");
  const key = await loadReceiptSigningKey(receiptsDir);
  const receipt = createReviewReceiptSigned(signedInput("PASSED", 10, 0), key);

  await writeReviewReceipt(receiptsDir, receipt);

  const verifier = new ReceiptVerifierService(receiptsDir);

  const isVerified = await verifier.isTreeAlreadyVerified(sampleTree);
  assert.equal(isVerified, true);

  const unverified = await verifier.isTreeAlreadyVerified("nonexistent-tree-sha");
  assert.equal(unverified, false);
});

test("ReceiptVerifierService ignores FAILED receipts when checking verification status", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-verifier-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const receiptsDir = join(root, "receipts");
  const key = await loadReceiptSigningKey(receiptsDir);
  const failedReceipt = createReviewReceiptSigned(signedInput("FAILED", 8, 2), key);

  await writeReviewReceipt(receiptsDir, failedReceipt);

  const verifier = new ReceiptVerifierService(receiptsDir);

  const isVerified = await verifier.isTreeAlreadyVerified(sampleTree);
  assert.equal(isVerified, false);
});

test("a forged legacy (unkeyed) PASSED receipt no longer certifies via isTreeAlreadyVerified", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-verifier-forge-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const receiptsDir = join(root, "receipts");
  // Attacker writes a legacy receipt with a recomputed public SHA-256 checksum.
  const forged = createReviewReceipt(signedInput("PASSED", 10, 0));
  await writeReviewReceipt(receiptsDir, forged);

  const verifier = new ReceiptVerifierService(receiptsDir);

  // Strict path: the forgeable legacy receipt must NOT certify.
  assert.equal(await verifier.isTreeAlreadyVerified(sampleTree), false);
  // Permissive path still reports it (informational only, not a security boundary).
  assert.equal(await verifier.isTreeVerifiedLegacy(sampleTree), true);
});
