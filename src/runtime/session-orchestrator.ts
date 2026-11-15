/**
 * @unreachable As of the integral audit (branch `feat/t12-integrated-acceptance-merge`),
 * no production entry point imports this module. Its only importer is its own test.
 * Intended consumer: the Pi extension composition as the single governed lifecycle facade.
 * Do not read the presence of this facade as a delivered runtime guarantee.
 * See `odd/tasks/asen-integral-runtime-architecture-stability-audit.md` (Tanda 0 / Tanda 3).
 *
 * Unified Session Orchestrator Facade for ASEN.
 *
 * Single governed lifecycle that wires the engine subsystems together
 * (command catalog, permission cache, workspace locks, activity stream,
 * notice buffer, receipt verifier) so callers depend on one entry point
 * instead of instantiating each subsystem independently.
 *
 * This facade only composes existing modules. It grants no new authority:
 * it does not approve, publish, or certify anything on its own.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CommandRegistry } from "./command-registry.js";
import { WorkspaceLockTable } from "./workspace-lock-table.js";
import { ActivityStreamFormatter } from "./activity-stream.js";
import { NoticeRingBuffer } from "./notice-ring-buffer.js";
import { PermissionHashCache } from "../security/permission-hash-cache.js";
import { ReceiptVerifierService } from "../evidence/receipt-verifier.js";

export interface SessionOrchestratorOptions {
  /** Workspace root the session operates on. */
  readonly workspaceRoot: string;
  /** ASEN state directory (typically `<workspaceRoot>/.asen`). */
  readonly asenDir: string;
  /** Optional fixed clock, forwarded to subsystems that support it (tests). */
  readonly clock?: (() => number) | undefined;
  /** Optional terminal width for the activity stream formatter. */
  readonly activityWidth?: number | undefined;
}

export class SessionOrchestrator {
  public readonly workspaceRoot: string;
  public readonly asenDir: string;

  /** Command catalog for this session. */
  public readonly commands: CommandRegistry;
  /** In-memory cache of approved commands per workspace/branch. */
  public readonly permissions: PermissionHashCache;
  /** Semantic lock table coordinating concurrent agents. */
  public readonly locks: WorkspaceLockTable;
  /** Single-line activity formatter for subagent progress. */
  public readonly activity: ActivityStreamFormatter;
  /** Bounded FIFO buffer for background notices. */
  public readonly notices: NoticeRingBuffer;
  /** Receipt lookup used to certify already-verified trees. */
  public readonly receipts: ReceiptVerifierService;

  private initialized = false;

  public constructor(options: SessionOrchestratorOptions) {
    if (!options?.workspaceRoot || typeof options.workspaceRoot !== "string") {
      throw new Error("SessionOrchestrator requires a non-empty workspaceRoot");
    }
    if (!options.asenDir || typeof options.asenDir !== "string") {
      throw new Error("SessionOrchestrator requires a non-empty asenDir");
    }

    this.workspaceRoot = options.workspaceRoot;
    this.asenDir = options.asenDir;

    const clock = options.clock;
    this.commands = new CommandRegistry();
    this.permissions = new PermissionHashCache(clock ? { clock } : {});
    this.locks = new WorkspaceLockTable(clock ? { clock } : {});
    this.activity = new ActivityStreamFormatter(
      options.activityWidth !== undefined ? { width: options.activityWidth } : {}
    );
    this.notices = new NoticeRingBuffer();
    this.receipts = new ReceiptVerifierService(join(this.asenDir, "receipts"));
  }

  /**
   * Initialize the session. Idempotent: repeated calls are no-ops.
   * Ensures the ASEN state directories exist so subsystems can persist.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.asenDir, { recursive: true });
    await mkdir(join(this.asenDir, "receipts"), { recursive: true });
    this.initialized = true;
  }

  /**
   * Tear down the session: release every lock and drain buffered state.
   * Idempotent and safe to call even if `init()` never ran.
   */
  public async dispose(): Promise<void> {
    this.locks.clear();
    this.notices.clear();
    this.permissions.clear();
    this.initialized = false;
  }

  /** Whether `init()` has completed for the current lifecycle. */
  public isInitialized(): boolean {
    return this.initialized;
  }
}
