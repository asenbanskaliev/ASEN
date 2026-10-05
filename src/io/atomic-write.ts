import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export interface AtomicWriteHandle {
  writeFile(content: string, options: { encoding: "utf8" }): Promise<unknown>;
  sync(): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface AtomicWriteFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  open(path: string, flags: "wx", mode: number): Promise<AtomicWriteHandle>;
  rename(from: string, to: string): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
}

export interface AtomicWriteOptions {
  fileSystem?: AtomicWriteFileSystem;
  temporaryPath?: (destination: string, attempt: number) => string;
}

const defaultFileSystem: AtomicWriteFileSystem = {
  mkdir: (path, options) => fs.mkdir(path, options),
  open: (path, flags, mode) => fs.open(path, flags, mode),
  rename: (from, to) => fs.rename(from, to),
  unlink: (path) => fs.unlink(path),
};

function defaultTemporaryPath(destination: string): string {
  return join(dirname(destination), `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
}

function pathIdentity(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

/** Persist text without exposing a partially written destination. */
export async function atomicWriteText(
  path: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const parent = dirname(path);
  const destinationIdentity = pathIdentity(path);
  const parentIdentity = pathIdentity(parent);
  await fileSystem.mkdir(parent, { recursive: true });
  let temporaryPath = "";
  let handle: AtomicWriteHandle | undefined;
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const candidate = options.temporaryPath?.(path, attempt) ?? defaultTemporaryPath(path);
    if (pathIdentity(candidate) === destinationIdentity) {
      throw new Error("Atomic-write temporary file must differ from the destination");
    }
    if (pathIdentity(dirname(candidate)) !== parentIdentity) {
      throw new Error("Atomic-write temporary file must share the destination directory");
    }
    try {
      handle = await fileSystem.open(candidate, "wx", 0o600);
      temporaryPath = candidate;
      break;
    } catch (error) {
      if (!hasCode(error, "EEXIST") || attempt === 127) {
        throw error;
      }
    }
  }
  if (handle === undefined) {
    throw new Error("Unable to create an atomic-write temporary file");
  }
  let primaryError: unknown;
  let failed = false;
  let closed = false;
  let committed = false;
  try {
    await handle.writeFile(content, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    closed = true;
    await fileSystem.rename(temporaryPath, path);
    committed = true;
  } catch (error) {
    failed = true;
    primaryError = error;
  } finally {
    if (!committed && failed) {
      if (!closed) {
        try {
          await handle.close();
          closed = true;
        } catch {
          // Preserve the operation's first failure.
        }
      }
      try {
        await fileSystem.unlink(temporaryPath);
      } catch {
        // Cleanup is best-effort and never masks the first failure.
      }
    }
  }
  if (failed) {
    throw primaryError;
  }
}
