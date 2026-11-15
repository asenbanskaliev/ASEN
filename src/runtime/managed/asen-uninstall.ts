/**
 * Conservative ASEN uninstall: no deletion until a complete, byte-verified,
 * private recursive backup is durable and the source has been re-verified.
 * Never follow symbolic links or silently omit a file.
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdtemp, mkdir, readdir, realpath, rename, rm, chmod } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

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
  /** Complete recursive backup directory, not a lossy JSON projection. */
  readonly snapshotPath?: string | undefined;
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}

async function digestFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** No symlinks, foreign file types or discarded nested entries are admissible. */
async function inventory(root: string): Promise<string[]> {
  const lines: string[] = [];
  let count = 0;
  async function visit(dir: string, relativePath: string, depth: number): Promise<void> {
    if (depth > 64) throw new Error("ASEN backup directory nesting limit exceeded");
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++count > 100000) throw new Error("ASEN backup file count limit exceeded");
      const child = join(dir, entry.name);
      const childRel = relativePath ? relativePath + "/" + entry.name : entry.name;
      const info = await lstat(child);
      if (info.isSymbolicLink()) throw new Error("ASEN uninstall refuses symbolic links: " + childRel);
      if (info.isDirectory()) {
        lines.push("D:" + childRel);
        await visit(child, childRel, depth + 1);
      } else if (info.isFile()) {
        lines.push("F:" + childRel + ":" + info.size + ":" + await digestFile(child));
      } else {
        throw new Error("ASEN uninstall refuses special files: " + childRel);
      }
    }
  }
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("ASEN uninstall requires a real directory");
  await visit(root, "", 0);
  return lines;
}

/** All backup entries must be private even when source permissions are broader. */
async function makePrivate(root: string): Promise<void> {
  await chmod(root, 0o700);
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) await makePrivate(child);
    else if (entry.isFile()) await chmod(child, 0o600);
    else throw new Error("ASEN backup contains an unsafe filesystem entry");
  }
}

export async function executeUninstall(options: UninstallOptions): Promise<UninstallReport> {
  if (!options || typeof options.homeDir !== "string" || !options.homeDir.trim()) {
    throw new Error("ASEN uninstall requires a home directory");
  }
  const homeDir = resolve(options.homeDir);
  const asenDir = join(homeDir, ".asen");
  const targets: UninstallTarget[] = [{
    path: asenDir, kind: "directory",
    description: "ASEN global runtime configuration, logs and session state",
  }];
  if (options.dryRun) return { status: "preview", dryRun: true, targets: Object.freeze(targets) };
  if (options.confirmPhrase !== "UNINSTALL") {
    throw new Error("Confirmation phrase 'UNINSTALL' is required to execute uninstallation");
  }

  // Missing source has nothing to delete. Broken links and inaccessible state fail closed.
  let sourceInfo;
  try { sourceInfo = await lstat(asenDir); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "uninstalled", dryRun: false, targets: Object.freeze(targets) };
    }
    throw error;
  }
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
    throw new Error("ASEN uninstall refuses a linked or non-directory .asen");
  }

  const backupBase = resolve(options.destinationDir ?? homeDir);
  if (inside(asenDir, backupBase)) throw new Error("ASEN backup must be outside the directory being removed");
  await mkdir(backupBase, { recursive: true, mode: 0o700 });
  const canonicalSource = await realpath(asenDir);
  const canonicalBackup = await realpath(backupBase);
  if (inside(canonicalSource, canonicalBackup)) {
    throw new Error("ASEN backup destination resolves inside the directory being removed");
  }

  // A unique private reservation prevents backup overwrite/replay into another session.
  const reserve = await mkdtemp(join(canonicalBackup, "asen-backup-"));
  const snapshotPath = join(reserve, "data");
  const quarantine = join(homeDir, ".asen-uninstall-staged-" + randomUUID());
  let renamed = false;
  try {
    const before = await inventory(asenDir);
    await cp(asenDir, snapshotPath, { recursive: true, dereference: false, force: false, errorOnExist: true });
    await makePrivate(snapshotPath);
    const after = await inventory(asenDir);
    const backup = await inventory(snapshotPath);
    if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(after) !== JSON.stringify(backup)) {
      throw new Error("ASEN files changed or were not fully copied; uninstall refused");
    }
    await rename(asenDir, quarantine);
    renamed = true;
    if (JSON.stringify(await inventory(quarantine)) !== JSON.stringify(backup)) {
      throw new Error("ASEN state changed during uninstall; refusing to delete source");
    }
    await rm(quarantine, { recursive: true, force: false });
    renamed = false;
    return { status: "uninstalled", dryRun: false, targets: Object.freeze(targets), snapshotPath };
  } catch (error) {
    if (renamed) {
      try { await rename(quarantine, asenDir); }
      catch {
        // Preserve quarantine and private backup; never delete data on rollback failure.
        throw new Error("ASEN uninstall aborted; source preserved in " + quarantine +
          " and backup in " + snapshotPath + "; original error: " + String(error));
      }
    }
    throw error;
  }
}

/** Restore a verified snapshot only into an absent .asen directory. */
export async function restoreUninstallSnapshot(snapshotPath: string, homeDir: string): Promise<void> {
  const source = resolve(snapshotPath);
  const destination = join(resolve(homeDir), ".asen");
  const sourceInventory = await inventory(source);
  try {
    await lstat(destination);
    throw new Error("ASEN restore refuses to overwrite existing .asen");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = join(resolve(homeDir), ".asen-restore-" + randomUUID());
  try {
    await cp(source, temporary, { recursive: true, dereference: false, force: false, errorOnExist: true });
    if (JSON.stringify(sourceInventory) !== JSON.stringify(await inventory(temporary))) {
      throw new Error("ASEN restore could not verify all backup entries");
    }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
