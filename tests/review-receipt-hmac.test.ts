import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReviewReceipt,
  createReviewReceiptSigned,
  verifyReviewReceipt,
  verifyReviewReceiptSigned,
  loadReceiptSigningKey,
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

test("loadReceiptSigningKey creates and reuses a 32-byte private key", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "asen-receipt-key-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const k1 = await loadReceiptSigningKey(dir);
  assert.equal(k1.length, 32);

  // Reuses the same key on second load (does not rotate)
  const k2 = await loadReceiptSigningKey(dir);
  assert.deepEqual(k2, k1);
});

test("signed receipt authenticates with HMAC key and resists forgery without it", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "asen-receipt-signed-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await loadReceiptSigningKey(dir);

  const receipt = createReviewReceiptSigned(sampleInput(), key);

  // Signature carries an explicit algorithm marker
  assert.match(receipt.signature, /^hmac-sha256:[a-f0-9]{64}$/);

  // Verifies with the correct key
  assert.equal(verifyReviewReceiptSigned(receipt, key), true);

  // A different key does NOT verify (proves it is keyed, not a plain checksum)
  const otherKey = Buffer.alloc(32, 0xab);
  assert.equal(verifyReviewReceiptSigned(receipt, otherKey), false);

  // Tampering with the verdict breaks HMAC verification
  const tampered = { ...receipt, verdict: "FAILED" as const };
  assert.equal(verifyReviewReceiptSigned(tampered, key), false);
});

test("a forged receipt with a recomputed plain SHA-256 cannot pass as an HMAC-signed receipt", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "asen-receipt-forge-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await loadReceiptSigningKey(dir);

  // Attacker creates a legacy (unkeyed) receipt with verdict PASSED, recomputing the public checksum
  const legacy = createReviewReceipt(sampleInput({ verdict: "PASSED" }));
  assert.equal(legacy.signature.length, 64); // plain hex, no algorithm marker

  // The strict signed verifier must reject it: it is not an HMAC receipt
  assert.equal(verifyReviewReceiptSigned(legacy, key), false);

  // But the permissive verifier still accepts it as a legacy receipt (backward compat)
  assert.equal(verifyReviewReceipt(legacy), true);
});

test("verifyReviewReceiptSigned rejects malformed or missing signatures", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "asen-receipt-malformed-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await loadReceiptSigningKey(dir);

  const receipt = createReviewReceiptSigned(sampleInput(), key);

  assert.equal(verifyReviewReceiptSigned({ ...receipt, signature: "0".repeat(64) }, key), false);
  assert.equal(verifyReviewReceiptSigned({ ...receipt, signature: "hmac-sha256:zzzz" }, key), false);
  assert.equal(verifyReviewReceiptSigned({ ...receipt, signature: "" }, key), false);
});


test("full HMAC covers reviewer identity, metadata, timestamp and every test outcome field", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "asen-receipt-full-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await loadReceiptSigningKey(dir);
  const receipt = createReviewReceiptSigned({ ...sampleInput(), metadata: { review: "human", scope: ["a.ts"] } }, key);
  assert.equal(verifyReviewReceiptSigned(receipt, key), true);
  const variants = [
    { ...receipt, oddTask: "other-task" },
    { ...receipt, receiptId: "rcpt_fake12345678" },
    { ...receipt, timestamp: "2025-01-01T00:00:00.000Z" },
    { ...receipt, testSuite: { ...receipt.testSuite, failed: 1 } },
    { ...receipt, testSuite: { ...receipt.testSuite, runner: "fake" } },
    { ...receipt, testSuite: { ...receipt.testSuite, durationMs: 0 } },
    { ...receipt, metadata: { review: "robot", scope: ["a.ts"] } },
    { ...receipt, metadata: { review: "human", scope: ["other.ts"] } },
    { ...receipt, injectedPermission: true },
  ];
  for (const forged of variants) assert.equal(verifyReviewReceiptSigned(forged, key), false);
});

test("persistence rejects HMAC receipts with a forged verdict or metadata", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "asen-receipt-disk-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await loadReceiptSigningKey(dir);
  const { writeReviewReceipt, readReviewReceipt } = await import("../src/evidence/review-receipt.js");
  const receipt = createReviewReceiptSigned({ ...sampleInput(), metadata: { owner: "reviewer-1" } }, key);
  await assert.rejects(() => writeReviewReceipt(dir, { ...receipt, metadata: { owner: "attacker" } }), /unauthenticated/);
  await writeReviewReceipt(dir, receipt);
  assert.equal((await readReviewReceipt(dir, receipt.commitSha))?.signature, receipt.signature);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(dir, receipt.commitSha + ".json"), JSON.stringify({ ...receipt, verdict: "FAILED" }));
  assert.equal(await readReviewReceipt(dir, receipt.commitSha), null);
});
