import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReviewReceipt,
  verifyReviewReceipt,
  writeReviewReceipt,
  readReviewReceipt,
  type ReviewReceiptInput
} from "../src/evidence/review-receipt.js";

const sampleCommitSha = "f4bc7a90" + "0".repeat(32);
const sampleTreeSha = "a1b2c3d4" + "1".repeat(32);

function sampleInput(overrides: Partial<ReviewReceiptInput> = {}): ReviewReceiptInput {
  return {
    commitSha: sampleCommitSha,
    treeSha: sampleTreeSha,
    oddTask: "pi-capability-completion",
    testSuite: {
      total: 459,
      passed: 459,
      failed: 0,
      durationMs: 1240,
      runner: "node:test"
    },
    verdict: "PASSED",
    ...overrides
  };
}

test("createReviewReceipt creates a valid signed receipt with schemaVersion 1.0.0", () => {
  const receipt = createReviewReceipt(sampleInput());

  assert.equal(receipt.schemaVersion, "1.0.0");
  assert.match(receipt.receiptId, /^rcpt_[a-f0-9]{16}$/);
  assert.equal(receipt.commitSha, sampleCommitSha);
  assert.equal(receipt.treeSha, sampleTreeSha);
  assert.equal(receipt.verdict, "PASSED");
  assert.equal(receipt.testSuite.total, 459);
  assert.match(receipt.signature, /^[a-f0-9]{64}$/);
  assert.equal(verifyReviewReceipt(receipt), true);
});

test("createReviewReceipt rejects invalid commitSha or mismatched test counts", () => {
  assert.throws(
    () => createReviewReceipt(sampleInput({ commitSha: "invalid-sha" })),
    /Invalid commitSha/
  );

  assert.throws(
    () =>
      createReviewReceipt(
        sampleInput({
          testSuite: {
            total: 10,
            passed: 8,
            failed: 0, // total != passed + failed
            durationMs: 100,
            runner: "node:test"
          }
        })
      ),
    /TestSuite total must equal passed \+ failed/
  );
});

test("verifyReviewReceipt returns false if any cryptographic field was tampered", () => {
  const receipt = createReviewReceipt(sampleInput());

  // Tamper with verdict
  const tamperedVerdict = { ...receipt, verdict: "FAILED" as const };
  assert.equal(verifyReviewReceipt(tamperedVerdict), false);

  // Tamper with treeSha
  const tamperedTree = { ...receipt, treeSha: "b".repeat(40) };
  assert.equal(verifyReviewReceipt(tamperedTree), false);

  // Tamper with testSuite passed count
  const tamperedTests = {
    ...receipt,
    testSuite: { ...receipt.testSuite, passed: 458 }
  };
  assert.equal(verifyReviewReceipt(tamperedTests), false);

  // Tamper with signature
  const tamperedSig = { ...receipt, signature: "0".repeat(64) };
  assert.equal(verifyReviewReceipt(tamperedSig), false);
});

test("writeReviewReceipt and readReviewReceipt store and load receipts atomically", async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), "asen-receipt-test-"));
  t.after(() => rm(tempDir, { recursive: true, force: true }));

  const receipt = createReviewReceipt(sampleInput());
  const filePath = await writeReviewReceipt(tempDir, receipt);

  assert.match(filePath, new RegExp(`${sampleCommitSha}\\.json$`));

  const loaded = await readReviewReceipt(tempDir, sampleCommitSha);
  assert.ok(loaded);
  assert.equal(loaded.commitSha, sampleCommitSha);
  assert.equal(loaded.signature, receipt.signature);
  assert.equal(verifyReviewReceipt(loaded), true);

  // Reading nonexistent returns null
  const missing = await readReviewReceipt(tempDir, "0".repeat(40));
  assert.equal(missing, null);
});
