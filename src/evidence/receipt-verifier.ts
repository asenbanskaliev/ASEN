/**
 * Receipt Verifier Service for ASEN.
 * Accelerates verification pipelines by checking if a treeSha has already been
 * certified with an authentic, HMAC-signed PASSED receipt.
 *
 * Security boundary: only receipts authenticated with the local HMAC key count
 * as verification. A legacy unkeyed checksum receipt is tamper-evident but
 * forgeable by anyone, so it is NEVER accepted here to justify skipping tests.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadReceiptSigningKey,
  verifyReviewReceipt,
  verifyReviewReceiptSigned,
  type ReviewReceipt
} from "./review-receipt.js";

export class ReceiptVerifierService {
  private readonly storageDir: string;
  private readonly memoryCache = new Map<string, boolean>();
  private keyPromise: Promise<Buffer> | null = null;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  /** Lazily load (or create) the HMAC signing key once, caching the promise. */
  private signingKey(): Promise<Buffer> {
    if (!this.keyPromise) {
      this.keyPromise = loadReceiptSigningKey(this.storageDir);
    }
    return this.keyPromise;
  }

  /**
   * Fast check: determine if a git treeSha already has an authentic, HMAC-signed
   * PASSED receipt in storage. Legacy (unkeyed) receipts do NOT certify.
   * Resolves in ~2ms after the key is loaded.
   */
  public async isTreeAlreadyVerified(treeSha: string): Promise<boolean> {
    if (!treeSha || typeof treeSha !== "string") return false;
    const normTree = treeSha.trim();

    if (this.memoryCache.has(normTree)) {
      return this.memoryCache.get(normTree)!;
    }

    if (!existsSync(this.storageDir)) {
      this.memoryCache.set(normTree, false);
      return false;
    }

    const key = await this.signingKey();

    try {
      const files = await readdir(this.storageDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(join(this.storageDir, file), "utf8");
          const receipt = JSON.parse(content) as ReviewReceipt;
          if (
            receipt.treeSha === normTree &&
            receipt.verdict === "PASSED" &&
            verifyReviewReceiptSigned(receipt, key)
          ) {
            this.memoryCache.set(normTree, true);
            return true;
          }
        } catch {
          // ignore corrupted files
        }
      }
    } catch {
      // directory read failure
    }

    this.memoryCache.set(normTree, false);
    return false;
  }

  /**
   * Permissive check that also accepts legacy unkeyed checksum receipts.
   * NOT a security boundary: a forged legacy receipt passes here. Use only for
   * informational reads, never to authorize skipping verification work.
   */
  public async isTreeVerifiedLegacy(treeSha: string): Promise<boolean> {
    if (!treeSha || typeof treeSha !== "string") return false;
    const normTree = treeSha.trim();
    if (!existsSync(this.storageDir)) return false;

    try {
      const files = await readdir(this.storageDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(join(this.storageDir, file), "utf8");
          const receipt = JSON.parse(content) as ReviewReceipt;
          if (
            receipt.treeSha === normTree &&
            receipt.verdict === "PASSED" &&
            verifyReviewReceipt(receipt)
          ) {
            return true;
          }
        } catch {
          // ignore corrupted files
        }
      }
    } catch {
      // directory read failure
    }
    return false;
  }

  /**
   * Clear in-memory verification cache.
   */
  public clearCache(): void {
    this.memoryCache.clear();
  }
}
