import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { atomicWriteText, type AtomicWriteFileSystem } from "../src/io/atomic-write.js";

async function withTempDir(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await fs.mkdtemp(join(tmpdir(), "asen-atomic-write-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
async function entries(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).sort();
}
type Step = "write" | "sync" | "rename" | "unlink";
interface HandleState { closeCalls: number; closed: boolean }
interface InstrumentOptions {
  failures?: Partial<Record<Step, Error>>;
  closeFailures?: Error[];
  renameFailures?: Error[];
  beforeRename?: (from: string, to: string) => Promise<void>;
  afterRename?: (from: string) => Promise<void>;
  unlink?: (path: string) => Promise<void>;
}
function instrumentFileSystem(
  events: string[],
  handles: HandleState[],
  options: InstrumentOptions = {},
): AtomicWriteFileSystem {
  const closeFailures = [...(options.closeFailures ?? [])];
  const renameFailures = [...(options.renameFailures ?? [])];
  return {
    async mkdir(path, settings) {
      events.push("mkdir");
      return fs.mkdir(path, settings);
    },
    async open(path, flags, mode) {
      events.push(`open:${flags}:${mode.toString(8)}`);
      const file = await fs.open(path, flags, mode);
      const state = { closeCalls: 0, closed: false };
      handles.push(state);
      return {
        async writeFile(content, settings) {
          events.push(`write:${settings.encoding}`);
          if (options.failures?.write) throw options.failures.write;
          return file.writeFile(content, settings);
        },
        async sync() {
          events.push("sync");
          if (options.failures?.sync) throw options.failures.sync;
          return file.sync();
        },
        async close() {
          events.push("close");
          state.closeCalls += 1;
          const failure = closeFailures.shift();
          if (failure) throw failure;
          await file.close();
          state.closed = true;
        },
      };
    },
    async rename(from, to) {
      events.push("rename");
      await options.beforeRename?.(from, to);
      const failure = renameFailures.shift() ?? options.failures?.rename;
      if (failure) throw failure;
      await fs.rename(from, to);
      await options.afterRename?.(from);
    },
    async unlink(path) {
      events.push("unlink");
      if (options.failures?.unlink) throw options.failures.unlink;
      return options.unlink?.(path) ?? fs.unlink(path);
    },
  };
}

test("writes, replaces, creates parents, and preserves UTF-8", async () => {
  await withTempDir(async (directory) => {
    const destination = join(directory, "deep", "registry.md");
    const content = "Grüße, 世界 🌱\nsecond line\n";
    await atomicWriteText(destination, content);
    assert.equal(await fs.readFile(destination, "utf8"), content);
    await atomicWriteText(destination, "replacement");
    assert.equal(await fs.readFile(destination, "utf8"), "replacement");
    assert.deepEqual(await entries(dirname(destination)), ["registry.md"]);
  });
});

test("retries a collision without truncating the colliding file", async () => {
  await withTempDir(async (directory) => {
    const destination = join(directory, "registry.md");
    const collision = join(directory, ".collision.tmp");
    await fs.writeFile(collision, "owned elsewhere", "utf8");
    await atomicWriteText(destination, "result", {
      temporaryPath: (_path, attempt) =>
        attempt === 0 ? collision : join(directory, ".available.tmp"),
    });
    assert.equal(await fs.readFile(collision, "utf8"), "owned elsewhere");
    assert.deepEqual(await entries(directory), [".collision.tmp", "registry.md"]);
  });
});

test("rejects destination aliases and other-directory candidates before opening", async () => {
  await withTempDir(async (directory) => {
    const destination = join(directory, "registry.md");
    const cases = [
      { candidate: destination, message: /must differ/ },
      { candidate: join(directory, "other", ".temp"), message: /must share/ },
    ];
    if (process.platform === "win32") {
      cases.push({ candidate: destination.toUpperCase().replaceAll("\\", "/"), message: /must differ/ });
    }
    for (const { candidate, message } of cases) {
      let opens = 0;
      const fileSystem: AtomicWriteFileSystem = {
        mkdir: fs.mkdir,
        async open() {
          opens += 1;
          throw new Error("unexpected open");
        },
        rename: fs.rename,
        unlink: fs.unlink,
      };
      await assert.rejects(
        atomicWriteText(destination, "new", {
          fileSystem,
          temporaryPath: () => candidate,
        }),
        message,
      );
      assert.equal(opens, 0);
    }
  });
});

test("exhausts exactly 128 exclusive-create collisions", async () => {
  const collision = Object.assign(new Error("collision"), { code: "EEXIST" });
  let attempts = 0;
  const fileSystem: AtomicWriteFileSystem = {
    async mkdir() {},
    async open(_path, flags, mode) {
      assert.equal(flags, "wx");
      assert.equal(mode, 0o600);
      attempts += 1;
      throw collision;
    },
    async rename() {},
    async unlink() {},
  };
  await assert.rejects(
    atomicWriteText("root/registry.md", "new", {
      fileSystem,
      temporaryPath: (_path, attempt) => `root/.temp-${attempt}`,
    }),
    (error) => error === collision,
  );
  assert.equal(attempts, 128);
});

test("uses exact creation options and write-sync-close-rename order", async () => {
  await withTempDir(async (directory) => {
    const events: string[] = [];
    const handles: HandleState[] = [];
    await atomicWriteText(join(directory, "registry.md"), "new", {
      fileSystem: instrumentFileSystem(events, handles),
      temporaryPath: () => join(directory, ".owned.tmp"),
    });
    assert.deepEqual(events, ["mkdir", "open:wx:600", "write:utf8", "sync", "close", "rename"]);
    assert.deepEqual(handles, [{ closeCalls: 1, closed: true }]);
  });
});

test("a close failure is primary, retries close, cleans up, and never renames", async () => {
  await withTempDir(async (directory) => {
    const primary = new Error("close failed");
    const events: string[] = [];
    const handles: HandleState[] = [];
    await assert.rejects(
      atomicWriteText(join(directory, "registry.md"), "new", {
        fileSystem: instrumentFileSystem(events, handles, {
          closeFailures: [primary],
        }),
        temporaryPath: () => join(directory, ".owned.tmp"),
      }),
      (error) => error === primary,
    );
    assert.deepEqual(events.slice(-3), ["close", "close", "unlink"]);
    assert.equal(events.includes("rename"), false);
    assert.deepEqual(handles, [{ closeCalls: 2, closed: true }]);
    assert.deepEqual(await entries(directory), []);
  });
});

test("operation failures preserve the first error and clean only the owned temp", async () => {
  for (const step of ["write", "sync", "rename"] as const) {
    await withTempDir(async (directory) => {
      const destination = join(directory, "registry.md");
      const temporary = join(directory, ".owned.tmp");
      const primary = new Error(`${step} failed`);
      const events: string[] = [];
      const handles: HandleState[] = [];
      await fs.writeFile(destination, "old", "utf8");
      await assert.rejects(
        atomicWriteText(destination, "new", {
          fileSystem: instrumentFileSystem(events, handles, {
            failures: { [step]: primary },
          }),
          temporaryPath: () => temporary,
        }),
        (error) => error === primary,
      );
      assert.equal(await fs.readFile(destination, "utf8"), "old");
      assert.equal(events.includes("rename"), step === "rename");
      assert.equal(events.at(-1), "unlink");
      assert.deepEqual(handles, [{ closeCalls: 1, closed: true }]);
      assert.deepEqual(await entries(directory), ["registry.md"]);
    });
  }
});

test("Windows retries commit-stage EPERM with the same temp while preserving the destination", async () => {
  await withTempDir(async (directory) => {
    const destination = join(directory, "registry.md");
    const temporary = join(directory, ".owned.tmp");
    const eperm = Object.assign(new Error("temporarily locked"), { code: "EPERM" });
    const events: string[] = [];
    const handles: HandleState[] = [];
    const renameSources: string[] = [];
    const delays: number[] = [];
    await fs.writeFile(destination, "old", "utf8");

    await atomicWriteText(destination, "new", {
      fileSystem: instrumentFileSystem(events, handles, {
        renameFailures: [eperm, eperm],
        async beforeRename(from, to) {
          renameSources.push(from);
          assert.equal(to, destination);
          assert.equal(await fs.readFile(destination, "utf8"), "old");
          assert.equal(await fs.readFile(from, "utf8"), "new");
        },
      }),
      temporaryPath: () => temporary,
      retryRuntime: {
        platform: "win32",
        async delay(milliseconds) {
          delays.push(milliseconds);
        },
      },
    });

    assert.deepEqual(delays, [10, 20]);
    assert.deepEqual(renameSources, [temporary, temporary, temporary]);
    assert.equal(await fs.readFile(destination, "utf8"), "new");
    assert.equal(events.filter((event) => event === "rename").length, 3);
    assert.equal(events.includes("unlink"), false);
  });
});

test("Windows preserves first-create semantics while retrying commit-stage EPERM", async () => {
  await withTempDir(async (directory) => {
    const destination = join(directory, "registry.md");
    const temporary = join(directory, ".owned.tmp");
    const eperm = Object.assign(new Error("temporarily locked"), { code: "EPERM" });
    let destinationWasAbsent = false;

    await atomicWriteText(destination, "new", {
      fileSystem: instrumentFileSystem([], [], {
        renameFailures: [eperm],
        async beforeRename(_from, to) {
          destinationWasAbsent = await fs.access(to).then(() => false, () => true);
        },
      }),
      temporaryPath: () => temporary,
      retryRuntime: { platform: "win32", async delay() {} },
    });

    assert.equal(destinationWasAbsent, true);
    assert.equal(await fs.readFile(destination, "utf8"), "new");
  });
});

test("Windows bounds permanent EPERM retries and cleans only the owned temp", async () => {
  await withTempDir(async (directory) => {
    const destination = join(directory, "registry.md");
    const temporary = join(directory, ".owned.tmp");
    const primary = Object.assign(new Error("permanently denied"), { code: "EPERM" });
    const events: string[] = [];
    const delays: number[] = [];
    await fs.writeFile(destination, "old", "utf8");
    await fs.writeFile(join(directory, ".foreign.tmp"), "foreign", "utf8");

    await assert.rejects(
      atomicWriteText(destination, "new", {
        fileSystem: instrumentFileSystem(events, [], { failures: { rename: primary } }),
        temporaryPath: () => temporary,
        retryRuntime: {
          platform: "win32",
          async delay(milliseconds) {
            delays.push(milliseconds);
          },
        },
      }),
      (error) => error === primary,
    );

    assert.deepEqual(delays, [10, 20, 40, 80, 160]);
    assert.equal(events.filter((event) => event === "rename").length, 6);
    assert.equal(events.at(-1), "unlink");
    assert.equal(await fs.readFile(destination, "utf8"), "old");
    assert.equal(await fs.readFile(join(directory, ".foreign.tmp"), "utf8"), "foreign");
    assert.deepEqual(await entries(directory), [".foreign.tmp", "registry.md"]);
  });
});

test("Windows does not retry non-EPERM rename failures", async () => {
  await withTempDir(async (directory) => {
    const primary = Object.assign(new Error("busy"), { code: "EBUSY" });
    const events: string[] = [];
    await assert.rejects(
      atomicWriteText(join(directory, "registry.md"), "new", {
        fileSystem: instrumentFileSystem(events, [], { failures: { rename: primary } }),
        temporaryPath: () => join(directory, ".owned.tmp"),
        retryRuntime: {
          platform: "win32",
          async delay() {
            throw new Error("unexpected delay");
          },
        },
      }),
      (error) => error === primary,
    );
    assert.equal(events.filter((event) => event === "rename").length, 1);
  });
});

test("non-Windows does not retry commit-stage EPERM", async () => {
  await withTempDir(async (directory) => {
    const primary = Object.assign(new Error("denied"), { code: "EPERM" });
    const events: string[] = [];
    await assert.rejects(
      atomicWriteText(join(directory, "registry.md"), "new", {
        fileSystem: instrumentFileSystem(events, [], { failures: { rename: primary } }),
        temporaryPath: () => join(directory, ".owned.tmp"),
        retryRuntime: {
          platform: "linux",
          async delay() {
            throw new Error("unexpected delay");
          },
        },
      }),
      (error) => error === primary,
    );
    assert.equal(events.filter((event) => event === "rename").length, 1);
  });
});

test("cleanup failure never masks a prior failure", async () => {
  await withTempDir(async (directory) => {
    const primary = new Error("write failed");
    const events: string[] = [];
    const handles: HandleState[] = [];
    await assert.rejects(
      atomicWriteText(join(directory, "registry.md"), "new", {
        fileSystem: instrumentFileSystem(events, handles, {
          failures: { write: primary, unlink: new Error("cleanup failed") },
        }),
        temporaryPath: () => join(directory, ".owned.tmp"),
      }),
      (error) => error === primary,
    );
    assert.deepEqual(events.slice(-2), ["close", "unlink"]);
    assert.deepEqual(handles, [{ closeCalls: 1, closed: true }]);
  });
});

test("tolerates an already absent cleanup path", async () => {
  await withTempDir(async (directory) => {
    const primary = new Error("sync failed");
    const events: string[] = [];
    const handles: HandleState[] = [];
    await assert.rejects(
      atomicWriteText(join(directory, "registry.md"), "new", {
        fileSystem: instrumentFileSystem(events, handles, {
          failures: { sync: primary },
          async unlink(path) {
            await fs.unlink(path);
            await fs.unlink(path);
          },
        }),
        temporaryPath: () => join(directory, ".owned.tmp"),
      }),
      (error) => error === primary,
    );
    assert.deepEqual(await entries(directory), []);
  });
});

test("never unlinks the old temporary path after a committed rename", async () => {
  await withTempDir(async (directory) => {
    const destination = join(directory, "registry.md");
    const temporary = join(directory, ".owned.tmp");
    const events: string[] = [];
    const handles: HandleState[] = [];
    await atomicWriteText(destination, "committed", {
      fileSystem: instrumentFileSystem(events, handles, {
        afterRename: (path) => fs.writeFile(path, "foreign", "utf8"),
      }),
      temporaryPath: () => temporary,
    });
    assert.equal(await fs.readFile(destination, "utf8"), "committed");
    assert.equal(await fs.readFile(temporary, "utf8"), "foreign");
    assert.equal(events.includes("unlink"), false);
    assert.deepEqual(handles, [{ closeCalls: 1, closed: true }]);
  });
});
