import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import {
  createImageDiskCache,
  defaultCacheRoot,
  safeSegment,
  sweepStale,
} from "../src/runtime/ui/image-disk-cache.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** POSIX ownership bits are not modelled by Windows filesystems, so privacy-bit assertions run on POSIX only. */
const POSIX = process.platform !== "win32";

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "asen-image-disk-cache-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function names(directory: string): string[] {
  return readdirSync(directory).sort();
}

function privateMode(path: string): number {
  return statSync(path).mode & 0o777;
}

function age(path: string, ms: number): void {
  const old = new Date(Date.now() - ms);
  utimesSync(path, old, old);
}

function readOrNull(path: string): Buffer | undefined {
  try {
    return readFileSync(path);
  } catch {
    return undefined;
  }
}

test("defaultCacheRoot uses XDG_CACHE_HOME when it is absolute", () => {
  assert.equal(defaultCacheRoot({ XDG_CACHE_HOME: "/xdg-cache" }), join("/xdg-cache", "gentle-shell", "images"));
});

test("defaultCacheRoot falls back to ~/.cache", () => {
  assert.equal(defaultCacheRoot({ HOME: "/fake-home" }), join("/fake-home", ".cache", "gentle-shell", "images"));
  assert.equal(defaultCacheRoot({}), join(homedir(), ".cache", "gentle-shell", "images"));
  assert.equal(defaultCacheRoot({ XDG_CACHE_HOME: "" }), join(homedir(), ".cache", "gentle-shell", "images"));
});

test("defaultCacheRoot ignores a relative XDG_CACHE_HOME", () => {
  assert.equal(defaultCacheRoot({ XDG_CACHE_HOME: "relative/cache" }), join(homedir(), ".cache", "gentle-shell", "images"));
});

test("safeSegment keeps only the last path segment", () => {
  assert.equal(safeSegment("../../etc"), "etc");
  assert.equal(safeSegment("..\\..\\windows"), "windows");
  assert.equal(safeSegment("/sessions/abc123"), "abc123");
  assert.equal(safeSegment("sessions/../passwd"), "passwd");
});

test("safeSegment strips leading dots and unsafe characters", () => {
  assert.equal(safeSegment("...hidden"), "hidden");
  assert.equal(safeSegment(".."), "");
  assert.equal(safeSegment(""), "");
  assert.equal(safeSegment("a b$c/e-f_1.2"), "e-f_1.2");
  assert.equal(safeSegment("s€s"), "ss");
});

test("createImageDiskCache creates a private per-session directory", () => {
  withTempRoot((root) => {
    const cache = createImageDiskCache("session one", root);
    assert.ok(cache, "a cache is created for a usable session id");
    const directory = join(root, "sessionone");
    assert.equal(statSync(directory).isDirectory(), true);
    if (POSIX) assert.equal(privateMode(directory), 0o700);
    assert.deepEqual(names(root), ["sessionone"]);
    // A session id with no usable segment must never resolve to the cache root itself.
    assert.equal(createImageDiskCache("../...", root), undefined);
    assert.deepEqual(names(root), ["sessionone"]);
  });
});

test("createImageDiskCache returns undefined when the directory cannot be made", () => {
  withTempRoot((root) => {
    writeFileSync(join(root, "occupied"), "x");
    assert.equal(createImageDiskCache("occupied", root), undefined);
    assert.equal(readOrNull(join(root, "occupied", "image-1.png")), undefined);
    assert.equal(statSync(join(root, "occupied")).isFile(), true);
    assert.deepEqual(names(root), ["occupied"]);
  });
});

test("write stores bytes in a private file named by the MIME extension", () => {
  withTempRoot((root) => {
    const cache = createImageDiskCache("s1", root)!;
    const path = cache.write("img-a", PNG, "image/png");
    assert.ok(path, "write returns the disk path");
    assert.equal(basename(path!), "image-1.png");
    assert.equal(statSync(path!).isFile(), true);
    if (POSIX) assert.equal(privateMode(path!), 0o600);
    assert.deepEqual(readOrNull(path!), PNG);
    const second = cache.write("img-b", JPG, "image/jpeg");
    assert.equal(basename(second!), "image-2.jpg");
    assert.deepEqual(names(join(root, "s1")), ["image-1.png", "image-2.jpg"]);
  });
});

test("write reuses one file per id and replaces it when the MIME type changes", () => {
  withTempRoot((root) => {
    const cache = createImageDiskCache("s1", root)!;
    const first = cache.write("img-a", PNG, "image/png")!;
    const repeat = cache.write("img-a", Buffer.concat([PNG, PNG]), "image/png")!;
    assert.equal(repeat, first, "the same id keeps one path");
    assert.deepEqual(names(join(root, "s1")), ["image-1.png"]);
    assert.equal(statSync(first).size, PNG.length * 2);
    const webp = cache.write("img-a", Buffer.from([0x52, 0x49, 0x46, 0x46]), "image/webp")!;
    assert.equal(basename(webp), "image-1.webp");
    assert.deepEqual(names(join(root, "s1")), ["image-1.webp"]);
    assert.ok(cache.write("", PNG, "image/png"), "an unusable id still writes an image");
    assert.equal(names(join(root, "s1")).length, 2, "each anonymous id gets its own file");
  });
});

test("write rejects unsupported MIME types without side effects", () => {
  withTempRoot((root) => {
    const cache = createImageDiskCache("s1", root)!;
    const kept = cache.write("img-a", PNG, "image/png")!;
    for (const mimeType of ["text/plain", "image/svg+xml", "application/pdf", "", "constructor", "toString"]) {
      assert.equal(cache.write("img-b", JPG, mimeType), undefined, `${mimeType} is rejected`);
    }
    assert.deepEqual(names(join(root, "s1")), [basename(kept)]);
    assert.equal(statSync(kept).size, PNG.length);
  });
});

test("write returns undefined when the filesystem rejects the write", () => {
  withTempRoot((root) => {
    const cache = createImageDiskCache("s1", root)!;
    assert.ok(cache.write("img-a", PNG, "image/png"));
    rmSync(join(root, "s1"), { recursive: true, force: true });
    assert.equal(cache.write("img-b", JPG, "image/jpeg"), undefined);
    assert.equal(existsSync(join(root, "s1")), false, "a failed write does not recreate the session directory");
  });
});

test("dispose removes only this session's directory", () => {
  withTempRoot((root) => {
    const first = createImageDiskCache("s1", root)!;
    const second = createImageDiskCache("s2", root)!;
    first.write("img-a", PNG, "image/png");
    second.write("img-b", JPG, "image/jpeg");
    first.dispose();
    assert.equal(existsSync(join(root, "s1")), false);
    assert.deepEqual(names(join(root, "s2")), ["image-1.jpg"]);
    assert.equal(first.write("img-c", PNG, "image/png"), undefined, "a disposed cache stops writing");
    assert.equal(existsSync(join(root, "s1")), false);
    first.dispose();
    second.dispose();
    assert.deepEqual(names(root), []);
  });
});

test("sweepStale removes stale directories that contain only own files", () => {
  withTempRoot((root) => {
    const old = createImageDiskCache("old", root)!;
    old.write("img-a", PNG, "image/png");
    old.write("img-b", JPG, "image/jpeg");
    for (const name of names(join(root, "old"))) age(join(root, "old", name), 8 * DAY_MS);
    const fresh = createImageDiskCache("fresh", root)!;
    fresh.write("img-c", PNG, "image/png");
    sweepStale(root, 7 * DAY_MS);
    assert.equal(existsSync(join(root, "old")), false, "the fully stale session directory is gone");
    assert.deepEqual(names(join(root, "fresh")), ["image-1.png"], "a recent directory survives");
  });
});

test("sweepStale preserves directories containing foreign content", () => {
  withTempRoot((root) => {
    const directory = join(root, "s1");
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(join(directory, "image-1.png"), PNG, { mode: 0o600 });
    writeFileSync(join(directory, "note.txt"), "keep me", { mode: 0o600 });
    mkdirSync(join(directory, "image-2.png"), { mode: 0o700 });
    for (const name of names(directory)) age(join(directory, name), 30 * DAY_MS);
    sweepStale(root, 7 * DAY_MS);
    assert.equal(existsSync(directory), true);
    assert.deepEqual(names(directory), ["image-1.png", "image-2.png", "note.txt"]);
    assert.equal(readOrNull(join(directory, "note.txt"))?.toString(), "keep me");
  });
});

test("sweepStale preserves directories without own files", () => {
  withTempRoot((root) => {
    const foreign = join(root, "foreign");
    const empty = join(root, "empty");
    mkdirSync(foreign, { mode: 0o700 });
    mkdirSync(empty, { mode: 0o700 });
    writeFileSync(join(foreign, "data.bin"), "x", { mode: 0o600 });
    writeFileSync(join(root, "image-9.png"), PNG, { mode: 0o600 });
    age(join(foreign, "data.bin"), 30 * DAY_MS);
    age(join(root, "image-9.png"), 30 * DAY_MS);
    sweepStale(root, 7 * DAY_MS);
    assert.equal(existsSync(foreign), true, "a directory with no own files is never removed");
    assert.equal(existsSync(empty), true, "an empty directory is never removed");
    assert.equal(existsSync(join(root, "image-9.png")), true, "entries directly in the root are not swept");
  });
});

test("sweepStale is inert when the root or the horizon is unusable", () => {
  withTempRoot((root) => {
    const cache = createImageDiskCache("s1", root)!;
    cache.write("img-a", PNG, "image/png");
    for (const name of names(join(root, "s1"))) age(join(root, "s1", name), 30 * DAY_MS);
    sweepStale(join(root, "missing"), 7 * DAY_MS);
    for (const horizon of [-1, Number.NaN]) sweepStale(root, horizon);
    assert.deepEqual(names(join(root, "s1")), ["image-1.png"], "nothing is swept without a usable horizon");
  });
});
