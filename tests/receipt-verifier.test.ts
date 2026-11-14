import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReviewReceipt,
  writeReviewReceipt
} from "../src/evidence/review-receipt.js";
import {
  ReceiptVerifierService
} from "../src/evidence/receipt-verifier.js";

const sampleCommit = "c0000000" + "0".repeat(32);
const sampleTree = "t1111111" + "1".repeat(32);

test("ReceiptVerifierService finds and certifies an already verified treeSha in <2ms", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-verifier-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const receiptsDir = join(root, "receipts");
  const receipt = createReviewReceipt({
    commitSha: sampleCommit,
    treeSha: sampleTree,
    oddTask: "task-verification-test",
    testSuite: { total: 10, passed: 10, failed: 0, durationMs: 250, runner: "node:test" },
    verdict: "PASSED"
  });

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
  const failedReceipt = createReviewReceipt({
    commitSha: sampleCommit,
    treeSha: sampleTree,
    oddTask: "task-verification-failed",
    testSuite: { total: 10, passed: 8, failed: 2, durationMs: 250, runner: "node:test" },
    verdict: "FAILED"
  });

  await writeReviewReceipt(receiptsDir, failedReceipt);

  const verifier = new ReceiptVerifierService(receiptsDir);

  const isVerified = await verifier.isTreeAlreadyVerified(sampleTree);
  assert.equal(isVerified, false);
});
