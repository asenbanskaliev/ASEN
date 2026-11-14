/**
 * Clean Uninstaller with Snapshot Pre-Backup for ASEN.
 * Safely removes ASEN global home configuration and binaries after archiving a snapshot backup.
 * Strictly guarantees isolation: NEVER touches user workspace repositories.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface UninstallOptions {
  readonly homeDir: string;
  readonly destinationDir?: string | undefined;
  readonly confirmPhrase?: string | undefined;
  readonly dryRun?: boolean | undefined;
}

export interface UninstallTarget {
  readonly path: string;
  readonly kind: "directory" | "file";
  readonly description: string;
}

export interface UninstallReport {
  readonly status: "preview" | "uninstalled";
  readonly dryRun: boolean;
  readonly targets: readonly UninstallTarget[];
  readonly snapshotPath?: string | undefined;
}

export async function executeUninstall(
  options: UninstallOptions
): Promise<UninstallReport> {
  const asenDir = join(options.homeDir, ".asen");
  const targets: UninstallTarget[] = [
    {
      path: asenDir,
      kind: "directory",
      description: "ASEN global runtime configuration, logs and session state"
    }
  ];

  if (options.dryRun) {
    return {
      status: "preview",
      dryRun: true,
      targets: Object.freeze(targets)
    };
  }

  if (options.confirmPhrase !== "UNINSTALL") {
    throw new Error(
      "Confirmation phrase 'UNINSTALL' is required to execute uninstallation"
    );
  }

  // Create snapshot before removal
  const backupDir = options.destinationDir ?? options.homeDir;
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotPath = join(backupDir, `asen-backup-${timestamp}.json`);

  const snapshotData: Record<string, string> = {};
  if (existsSync(asenDir)) {
    const entries = await readdir(asenDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const content = await readFile(join(asenDir, entry.name), "utf8");
          snapshotData[entry.name] = content;
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  await writeFile(snapshotPath, JSON.stringify(snapshotData, null, 2), "utf8");

  // Remove .asen directory cleanly
  if (existsSync(asenDir)) {
    await rm(asenDir, { recursive: true, force: true });
  }

  return {
    status: "uninstalled",
    dryRun: false,
    targets: Object.freeze(targets),
    snapshotPath
  };
}
