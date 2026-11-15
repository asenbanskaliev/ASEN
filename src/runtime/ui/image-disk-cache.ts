/**
 * P50 image disk cache — per-session private image persistence.
 *
 * This is the storage contract distilled from the Gentle Shell v4.8.0
 * `lib/image-disk-cache.ts` (see odd/evidence/gentle-shell-v4.8.0-delta-reconciliation.md,
 * "P46-P50 discovery results"). It owns only bytes on disk inside one private
 * per-session directory: it has no host, attachment, prompt, or UI knowledge, and
 * nothing here builds a cache unless a caller explicitly creates one (opt-in).
 *
 * Privacy contract: session directories are created `0o700`, image files `0o600`,
 * identifiers are reduced to a single safe path segment before use, and every
 * filesystem failure is reported as `undefined` instead of throwing.
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

/** Files this cache is allowed to own; anything else in a session directory is foreign content. */
const OWN_FILE_PATTERN = /^image-\d+\.(png|jpg|webp|gif)$/;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const UNSAFE_SEGMENT_CHARACTERS = /[^A-Za-z0-9._-]/gu;
const LEADING_DOTS = /^\.+/u;

export interface ImageDiskCache{
  /** Persist one image, returning its disk path, or `undefined` for an unsupported type or any filesystem failure. */
  write(id: string, bytes: Buffer, mimeType: string): string | undefined;
  /** Remove this session's directory only. Safe to call more than once. */
  dispose(): void;
}

interface OwnedImage{readonly index: number;readonly path: string;}

/** Default cache root: `XDG_CACHE_HOME/gentle-shell/images`, or `~/.cache/gentle-shell/images`. */
export function defaultCacheRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = typeof env.XDG_CACHE_HOME === "string" ? env.XDG_CACHE_HOME : "";
  // A relative `XDG_CACHE_HOME` is deliberately ignored: it would resolve against whatever
  // working directory the host happens to use, which is not a private, predictable cache root.
  const base = isAbsolute(configured) ? configured : join(typeof env.HOME === "string" && env.HOME !== "" ? env.HOME : homedir(), ".cache");
  return join(base, "gentle-shell", "images");
}

/** Reduce an external identifier to one safe path segment: last segment only, no unsafe characters, no leading dots. */
export function safeSegment(id: string): string {
  if (typeof id !== "string") return "";
  // Taking the last segment first is what stops `../../etc` style traversal; character
  // filtering then removes separators that the platform does not treat as separators.
  return basename(id).replace(UNSAFE_SEGMENT_CHARACTERS, "").replace(LEADING_DOTS, "");
}

class SessionImageDiskCache{
  readonly #directory: string;
  readonly #images = new Map<string, OwnedImage>();
  #next = 0;
  #disposed = false;

  constructor(directory: string) {
    this.#directory = directory;
  }

  write(id: string, bytes: Buffer, mimeType: string): string | undefined {
    if (this.#disposed) return undefined;
    const extension = MIME_EXTENSIONS[mimeType];
    // `typeof` guard: inherited keys such as `constructor` must never be treated as an extension.
    if (typeof extension !== "string") return undefined;
    // An id with no usable segment is keyed by a fresh UUID, so anonymous images never overwrite each other.
    const key = safeSegment(id) || randomUUID();
    const owned = this.#images.get(key);
    const index = owned === undefined ? ++this.#next : owned.index;
    const target = join(this.#directory, `image-${index}.${extension}`);
    try {
      if (owned !== undefined && owned.path !== target) rmSync(owned.path, { force: true });
      writeFileSync(target, bytes, { mode: 0o600 });
    } catch {
      return undefined;
    }
    this.#images.set(key, { index, path: target });
    return target;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#images.clear();
    try {
      rmSync(this.#directory, { recursive: true, force: true });
    } catch {
      // Removal is best effort; a session that cannot clean up must not break its host.
    }
  }
}

/** Create a per-session image disk cache. Returns `undefined` if the private directory cannot be created. */
export function createImageDiskCache(sessionId: string, root: string = defaultCacheRoot()): ImageDiskCache | undefined {
  const segment = safeSegment(sessionId);
  // An empty segment would resolve to the cache root itself, whose removal would delete every session.
  if (segment === "") return undefined;
  const directory = join(root, segment);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  } catch {
    return undefined;
  }
  return new SessionImageDiskCache(directory);
}

/**
 * Sweep session directories that are older than `maxAgeMs`.
 *
 * A directory is removed only when it contains at least one entry and every entry matches this
 * cache's own file pattern, and its newest entry modification time is older than the horizon.
 * Foreign content, empty directories, and entries sitting directly in the root are never touched.
 */
export function sweepStale(root: string, maxAgeMs: number): void {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) return;
  const cutoff = Date.now() - maxAgeMs;
  let sessions;
  try {
    sessions = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const session of sessions) {
    // Symlinks and files in the root are skipped: sweep only descends into real session directories.
    if (!session.isDirectory()) continue;
    const directory = join(root, session.name);
    try {
      const entries = readdirSync(directory, { withFileTypes: true });
      let newest = 0;
      let owned = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !OWN_FILE_PATTERN.test(entry.name)) {
          owned = -1;
          break;
        }
        const { mtimeMs } = statSync(join(directory, entry.name));
        if (mtimeMs > newest) newest = mtimeMs;
        owned += 1;
      }
      if (owned <= 0 || newest > cutoff) continue;
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Any inspection or removal error leaves the directory untouched.
    }
  }
}
