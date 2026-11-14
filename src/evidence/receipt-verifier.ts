/**
 * Receipt Verifier Service for ASEN.
 * Accelerates verification pipelines by checking if a treeSha has already been
 * certified with an authentic, cryptographically signed PASSED receipt.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  verifyReviewReceipt,
  type ReviewReceipt
} from "./review-receipt.js";

export class ReceiptVerifierService {
  private readonly storageDir: string;
  private readonly memoryCache = new Map<string, boolean>();

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  /**
   * Fast check: determine if a git treeSha already has a verified PASSED receipt in storage.
   * Resolves in ~2ms.
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
   * Clear in-memory verification cache.
   */
  public clearCache(): void {
    this.memoryCache.clear();
  }
}
