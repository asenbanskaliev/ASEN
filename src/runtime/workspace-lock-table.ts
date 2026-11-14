/**
 * Workspace Semantic Lock Table for ASEN.
 * Coordinates concurrent multi-agent executions, preventing conflicting edits
 * on shared files without distributed dependencies or deadlocks.
 */

export interface LockRecord {
  readonly agentId: string;
  readonly acquiredAt: number;
  readonly ttlMs: number;
}

export interface WorkspaceLockOptions {
  readonly defaultTtlMs?: number | undefined;
  readonly clock?: (() => number) | undefined;
}

export class WorkspaceLockTable {
  private readonly locks = new Map<string, LockRecord>();
  private readonly defaultTtlMs: number;
  private readonly clock: () => number;

  constructor(options: WorkspaceLockOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
    this.clock = options.clock ?? (() => Date.now());
  }

  /**
   * Normalize file paths canonically:
   * trims whitespace, replaces backslashes with slashes, and downcases for Windows case-insensitivity.
   */
  public normalizePath(rawPath: string): string {
    if (!rawPath || typeof rawPath !== "string") return "";
    let normalized = rawPath.trim().replace(/\\/g, "/");
    // Normalize leading ./
    if (normalized.startsWith("./")) {
      normalized = normalized.slice(2);
    }
    return normalized.toLowerCase();
  }

  /**
   * Try acquiring a lock for an agent on a specific file path.
   * Returns true if acquired or renewed by the same agent.
   * Returns false if locked by another active agent.
   */
  public tryLock(rawPath: string, agentId: string, ttlMs?: number): boolean {
    const path = this.normalizePath(rawPath);
    if (!path || !agentId) return false;

    const now = this.clock();
    const effectiveTtl = ttlMs && ttlMs > 0 ? ttlMs : this.defaultTtlMs;

    const current = this.locks.get(path);
    if (current) {
      const isExpired = now - current.acquiredAt >= current.ttlMs;
      if (!isExpired && current.agentId !== agentId) {
        return false;
      }
    }

    this.locks.set(path, {
      agentId,
      acquiredAt: now,
      ttlMs: effectiveTtl
    });
    return true;
  }

  /**
   * Check if a path is currently locked by any non-expired lock.
   */
  public isLocked(rawPath: string): boolean {
    const path = this.normalizePath(rawPath);
    if (!path) return false;

    const record = this.locks.get(path);
    if (!record) return false;

    const now = this.clock();
    if (now - record.acquiredAt >= record.ttlMs) {
      this.locks.delete(path);
      return false;
    }
    return true;
  }

  /**
   * Get the current owner of an active lock on a path, or undefined if free/expired.
   */
  public getLockOwner(rawPath: string): string | undefined {
    const path = this.normalizePath(rawPath);
    if (!path) return undefined;

    const record = this.locks.get(path);
    if (!record) return undefined;

    const now = this.clock();
    if (now - record.acquiredAt >= record.ttlMs) {
      this.locks.delete(path);
      return undefined;
    }
    return record.agentId;
  }

  /**
   * Release a lock for a given agent. Returns true if released, false if not held by this agent.
   */
  public releaseLock(rawPath: string, agentId: string): boolean {
    const path = this.normalizePath(rawPath);
    if (!path || !agentId) return false;

    const record = this.locks.get(path);
    if (!record || record.agentId !== agentId) {
      return false;
    }

    this.locks.delete(path);
    return true;
  }

  /**
   * Release all locks held by a specific agent (e.g. on commit or task completion).
   * Returns the count of released locks.
   */
  public releaseAll(agentId: string): number {
    if (!agentId) return 0;
    let count = 0;
    for (const [path, record] of Array.from(this.locks.entries())) {
      if (record.agentId === agentId) {
        this.locks.delete(path);
        count++;
      }
    }
    return count;
  }

  /**
   * Count the number of active (non-expired) locks currently held.
   */
  public activeLockCount(): number {
    const now = this.clock();
    let count = 0;
    for (const [path, record] of Array.from(this.locks.entries())) {
      if (now - record.acquiredAt < record.ttlMs) {
        count++;
      } else {
        this.locks.delete(path);
      }
    }
    return count;
  }
}
