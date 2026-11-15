/**
 * @unreachable As of the integral audit (branch `feat/t12-integrated-acceptance-merge`),
 * no production entry point imports this module. Importers are its own test and
 * `src/runtime/lifecycle/session-orchestrator.ts`, which is itself unreachable.
 * Intended consumer: memoizing already-approved commands in Auto mode.
 * Auto mode is currently served by `src/security/auto-permission-reviewer.ts`, so
 * this cache is not what decides whether an approved command is re-reviewed.
 * See `odd/tasks/asen-integral-runtime-architecture-stability-audit.md` (Tanda 0).
 *
 * Permission Hash Cache for ASEN.
 * Memorizes approved commands using SHA-256 digests over (canonicalCwd + normalizedCommand + gitBranch).
 * Enforces an immutable blacklist of destructive commands that can NEVER be cached.
 */

import { createHash } from "node:crypto";

export interface PermissionRecord {
  readonly hashKey: string;
  readonly cwd: string;
  readonly command: string;
  readonly branch?: string | undefined;
  readonly approvedAt: number;
}

const IMMUTABLE_BLACKLIST_PATTERNS: readonly RegExp[] = Object.freeze([
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[fqs]\b/i,
  /\brmdir\s+\/s\b/i,
  /\bgit\s+push\b.*(--force|-f)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[fdx]{1,3}\b/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\bformat\s+[a-z]:/i
]);

export class PermissionHashCache {
  private readonly memory = new Map<string, PermissionRecord>();
  private readonly clock: () => number;

  constructor(options: { clock?: () => number } = {}) {
    this.clock = options.clock ?? (() => Date.now());
  }

  /**
   * Check if a command matches any pattern in the immutable blacklist.
   */
  public isBlacklisted(command: string): boolean {
    if (!command || typeof command !== "string") return false;
    const normalized = command.trim();
    return IMMUTABLE_BLACKLIST_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  /**
   * Normalize path canonically: trim, replace backslashes, lowercase for Windows.
   */
  private normalizeCwd(cwd: string): string {
    return cwd ? cwd.trim().replace(/\\/g, "/").toLowerCase() : "";
  }

  /**
   * Normalize command line: collapse repeated whitespace.
   */
  private normalizeCommand(command: string): string {
    return command ? command.trim().replace(/\s+/g, " ") : "";
  }

  /**
   * Compute a deterministic SHA-256 hash for a given cwd, command, and optional branch.
   */
  public computeKey(cwd: string, command: string, branch?: string): string {
    const normCwd = this.normalizeCwd(cwd);
    const normCmd = this.normalizeCommand(command);
    const normBranch = branch ? branch.trim() : "";

    return createHash("sha256")
      .update(`${normCwd}\0${normCmd}\0${normBranch}`)
      .digest("hex");
  }

  /**
   * Verify if a command is already permitted in the cache.
   */
  public isAllowed(cwd: string, command: string, branch?: string): boolean {
    if (this.isBlacklisted(command)) {
      return false;
    }
    const key = this.computeKey(cwd, command, branch);
    return this.memory.has(key);
  }

  /**
   * Remember an approved command.
   * Throws if the command is blacklisted.
   */
  public remember(cwd: string, command: string, branch?: string): void {
    if (this.isBlacklisted(command)) {
      throw new Error(
        `Security Rule Violation: Destructive command cannot be cached: ${command}`
      );
    }

    const key = this.computeKey(cwd, command, branch);
    this.memory.set(key, {
      hashKey: key,
      cwd: this.normalizeCwd(cwd),
      command: this.normalizeCommand(command),
      branch: branch ? branch.trim() : undefined,
      approvedAt: this.clock()
    });
  }

  /**
   * Clear all cached permissions.
   */
  public clear(): void {
    this.memory.clear();
  }

  /**
   * Total number of cached permissions.
   */
  public size(): number {
    return this.memory.size;
  }
}
