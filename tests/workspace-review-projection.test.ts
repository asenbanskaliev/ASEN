import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {
  captureWorkspaceReviewProjection,
  revalidateWorkspaceReviewProjection,
  type WorkspaceReviewProjection,
} from "../src/review/workspace-review-projection.js";

const fixtureParent = tmpdir();
let fixtureSequence = 0;

function fixture(t: {after(callback: () => void): void}): {root: string; git: (...args: string[]) => string} {
  const provisional = join(fixtureParent, `p-${process.pid}-${fixtureSequence += 1}`);
  mkdirSync(provisional);
  const root = realpathSync(provisional);
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
  }).trim();
  git("init", "-q");
  writeFileSync(join(root, "tracked.txt"), "base\n");
  writeFileSync(join(root, "mode.txt"), "mode\n");
  git("add", "tracked.txt", "mode.txt");
  git("-c", "user.name=ASEN Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "fixture base");
  return {root, git};
}

function indexBytes(git: (...args: string[]) => string): Buffer {
  return readFileSync(git("rev-parse", "--path-format=absolute", "--git-path", "index"));
}

function entry(projection: WorkspaceReviewProjection, path: string) {
  return projection.entries.find(candidate => candidate.path === path);
}

test("captures tracked final bytes, staged additions, and only explicitly intended untracked files", t => {
  const {root, git} = fixture(t);
  writeFileSync(join(root, "tracked.txt"), "working final\n");
  writeFileSync(join(root, "staged.txt"), "staged\n");
  git("add", "staged.txt");
  writeFileSync(join(root, "staged.txt"), "staged working final\n");
  writeFileSync(join(root, "selected.txt"), "selected\n");
  writeFileSync(join(root, "unselected.txt"), "not selected\n");

  const projection = captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: ["selected.txt"]});
  assert.equal(projection.repositoryRoot, root);
  assert.equal(projection.baseCommit, git("rev-parse", "HEAD"));
  assert.equal(projection.baseTree, git("rev-parse", "HEAD^{tree}"));
  assert.match(projection.candidateTree, /^[0-9a-f]{40,64}$/u);
  assert.deepEqual(projection.intendedUntracked, ["selected.txt"]);
  assert.deepEqual(projection.unexpectedUntracked, ["unselected.txt"]);
  assert.equal(entry(projection, "tracked.txt")?.change, "modified");
  assert.equal(entry(projection, "staged.txt")?.change, "added");
  assert.equal(entry(projection, "selected.txt")?.change, "added");
  assert.equal(entry(projection, "unselected.txt"), undefined);
  assert.deepEqual(git("ls-tree", "-r", "--name-only", projection.candidateTree).split("\n"),
    ["mode.txt", "selected.txt", "staged.txt", "tracked.txt"]);
  for (const [name, expected] of [["tracked.txt", "working final\n"], ["staged.txt", "staged working final\n"], ["selected.txt", "selected\n"]]) {
    const bytes = execFileSync("git", ["-C", root, "cat-file", "blob", `${projection.candidateTree}:${name}`]);
    assert.deepEqual(bytes, Buffer.from(expected!));
  }

  writeFileSync(join(root, "unselected.txt"), "still excluded\n");
  assert.equal(revalidateWorkspaceReviewProjection(projection, {repositoryRoot: root, intendedUntracked: ["selected.txt"]}).candidateTree, projection.candidateTree);
  writeFileSync(join(root, "selected.txt"), "selected drift\n");
  assert.throws(() => revalidateWorkspaceReviewProjection(projection, {repositoryRoot: root, intendedUntracked: ["selected.txt"]}), /drift/u);
});

test("does not move HEAD, mutate the contributor index, or chmod project files", t => {
  const {root, git} = fixture(t);
  writeFileSync(join(root, "tracked.txt"), "changed\n");
  git("update-index", "--chmod=+x", "mode.txt");
  if (process.platform !== "win32") chmodSync(join(root, "mode.txt"), 0o755);
  const head = git("rev-parse", "HEAD");
  const beforeIndex = indexBytes(git);
  const beforeMode = lstatSync(join(root, "mode.txt")).mode;
  const projection = captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []});
  assert.match(git("ls-tree", projection.candidateTree, "--", "mode.txt"), /^100755 blob [0-9a-f]+\tmode\.txt$/u);
  assert.match(git("ls-tree", projection.candidateTree, "--", "tracked.txt"), /^100644 blob [0-9a-f]+\ttracked\.txt$/u);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.deepEqual(indexBytes(git), beforeIndex);
  assert.equal(lstatSync(join(root, "mode.txt")).mode, beforeMode);
});

test("records deletions and rejects source, index, and explicit-scope drift", t => {
  const {root, git} = fixture(t);
  rmSync(join(root, "tracked.txt"));
  const projection = captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []});
  assert.deepEqual(entry(projection, "tracked.txt"), {
    path: "tracked.txt", mode: "100644", objectId: null, contentSha256: null, change: "deleted",
  });
  assert.equal(git("ls-tree", projection.candidateTree, "--", "tracked.txt"), "");
  assert.equal(git("ls-tree", "-r", "--name-only", projection.candidateTree), "mode.txt");
  writeFileSync(join(root, "tracked.txt"), "base\n");
  assert.throws(() => revalidateWorkspaceReviewProjection(projection, {repositoryRoot: root, intendedUntracked: []}), /drift/u);

  const clean = captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []});
  writeFileSync(join(root, "other.txt"), "index drift\n");
  git("add", "other.txt");
  assert.throws(() => revalidateWorkspaceReviewProjection(clean, {repositoryRoot: root, intendedUntracked: []}), /drift/u);
  assert.throws(() => revalidateWorkspaceReviewProjection(clean, {repositoryRoot: root, intendedUntracked: ["scope.txt"]}), /scope/u);
});

test("rejects unsafe paths before creating Git objects", t => {
  const {root, git} = fixture(t);
  const count = () => git("count-objects", "-v").match(/^count: (\d+)$/mu)?.[1];
  const before = count();
  for (const path of ["../escape", "/absolute", ".git/config", "a\\b", "a/../b", "bad\u0001name"]) {
    assert.throws(() => captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: [path]}), /path|scope/u);
  }
  assert.equal(count(), before);
});

test("rejects a tracked escaping symlink without changing objects or index", t => {
  const {root, git} = fixture(t);
  try {
    symlinkSync("../outside.txt", join(root, "escape-link"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") { t.skip("Host does not permit fixture symlink creation"); return; }
    throw error;
  }
  writeFileSync(join(root, "link-target.txt"), "../outside.txt");
  const blob = git("hash-object", "-w", "link-target.txt");
  git("update-index", "--add", "--cacheinfo", `120000,${blob},escape-link`);
  const beforeObjects = git("count-objects", "-v"), beforeIndex = indexBytes(git), head = git("rev-parse", "HEAD");
  assert.throws(() => captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []}), /symlink escapes/u);
  assert.equal(git("count-objects", "-v"), beforeObjects);
  assert.deepEqual(indexBytes(git), beforeIndex);
  assert.equal(git("rev-parse", "HEAD"), head);
});

test("keeps unchanged gitlinks as metadata and rejects changed or newly staged gitlinks", t => {
  const {root, git} = fixture(t);
  const first = git("rev-parse", "HEAD");
  git("-c", "user.name=ASEN Test", "-c", "user.email=test@example.invalid", "commit", "-q", "--allow-empty", "-m", "second");
  const second = git("rev-parse", "HEAD");
  git("update-index", "--add", "--cacheinfo", `160000,${first},linked`);
  git("-c", "user.name=ASEN Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "gitlink base");

  const projection = captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []});
  assert.deepEqual(entry(projection, "linked"), {
    path: "linked", mode: "160000", objectId: first, contentSha256: null, change: "gitlink",
  });
  assert.equal(existsSync(join(root, "linked")), false);

  git("update-index", "--cacheinfo", `160000,${second},linked`);
  assert.throws(() => captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []}), /gitlink/u);
  git("update-index", "--cacheinfo", `160000,${first},linked`);
  git("update-index", "--add", "--cacheinfo", `160000,${first},new-linked`);
  assert.throws(() => captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []}), /gitlink/u);
});

for (const kind of ["filter", "hooks", "fsmonitor", "external-diff"] as const) {
  test(`does not execute repository ${kind} after a valid positive control`, t => {
    const {root, git} = fixture(t);
    const marker = join(root, "executed.txt"), probe = join(root, "probe.cjs");
    const quote = (value: string) => `'${value.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
    const command = `${quote(process.execPath)} ${quote(probe)}`;
    const output = kind === "filter" ? "process.stdout.write(fs.readFileSync(0));"
      : kind === "fsmonitor" ? "process.stdout.write('fixture-token\\0');" : "";
    writeFileSync(probe, `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(marker)},'called\\n');${output}\n`);
    writeFileSync(join(root, "tracked.txt"), "raw bytes\n");
    if (kind === "filter") {
      writeFileSync(join(root, ".gitattributes"), "tracked.txt filter=fixture\n");
      git("config", "filter.fixture.clean", command);
      git("hash-object", "--path=tracked.txt", "tracked.txt");
    } else if (kind === "hooks") {
      const hooks = join(root, "hooks"); mkdirSync(hooks);
      const hook = join(hooks, "post-index-change");
      writeFileSync(hook, `#!/bin/sh\nexec ${command}\n`);
      if (process.platform !== "win32") chmodSync(hook, 0o700);
      git("config", "core.hooksPath", hooks);
      git("hook", "run", "post-index-change");
    } else if (kind === "fsmonitor") {
      git("config", "core.fsmonitor", command);
      git("config", "core.fsmonitorHookVersion", "2");
      git("status", "--porcelain");
    } else {
      git("config", "diff.external", command);
      git("diff", "--ext-diff", "--", "tracked.txt");
    }
    const calls = readFileSync(marker, "utf8");
    assert.match(calls, /^(called\n)+$/u, "positive control must execute the configured fixture command");
    const beforeIndex = indexBytes(git), head = git("rev-parse", "HEAD");
    const projection = captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []});
    assert.equal(readFileSync(marker, "utf8"), calls);
    assert.equal(entry(projection, "tracked.txt")?.contentSha256,
      createHash("sha256").update("raw bytes\n").digest("hex"));
    assert.deepEqual(execFileSync("git", ["-C", root, "cat-file", "blob", `${projection.candidateTree}:tracked.txt`]), Buffer.from("raw bytes\n"));
    assert.deepEqual(indexBytes(git), beforeIndex);
    assert.equal(git("rev-parse", "HEAD"), head);
  });
}

test("rejects colon scope before repository lookup or Git object creation", t => {
  const {root, git} = fixture(t);
  const beforeObjects = git("count-objects", "-v"), beforeIndex = indexBytes(git), head = git("rev-parse", "HEAD");
  for (const name of ["C:foo", "tracked.txt:stream", "directory/file:stream"]) {
    for (const repositoryRoot of [root, join(root, "missing-repository")]) {
      assert.throws(() => captureWorkspaceReviewProjection({repositoryRoot, intendedUntracked: [name]}),
        /^Error: workspace projection scope contains an unsafe path$/u);
    }
  }
  assert.equal(git("count-objects", "-v"), beforeObjects);
  assert.deepEqual(indexBytes(git), beforeIndex);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(readFileSync(join(root, "tracked.txt"), "utf8"), "base\n");
});

test("isolates hooks from a valid hook at the conventional temporary hooks path", t => {
  const {root, git} = fixture(t);
  const temporary = join(root, "private-temp"), hooks = join(temporary, "asen-no-hooks");
  mkdirSync(hooks, {recursive: true});
  const marker = join(root, "hook-calls.txt"), probe = join(root, "hook-probe.cjs");
  writeFileSync(probe, `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'called\\n');\n`);
  const quote = (value: string) => `'${value.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
  const hook = join(hooks, "post-index-change");
  writeFileSync(hook, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(probe)}\n`);
  if (process.platform !== "win32") chmodSync(hook, 0o700);
  git("-c", `core.hooksPath=${hooks}`, "hook", "run", "post-index-change");
  assert.equal(readFileSync(marker, "utf8"), "called\n", "positive control must execute the fixture hook");
  writeFileSync(join(root, "tracked.txt"), "changed\n");
  const beforeIndex = indexBytes(git), head = git("rev-parse", "HEAD");
  const keys = ["TEMP", "TMP", "TMPDIR"] as const;
  const previous = keys.map(key => process.env[key]);
  try {
    for (const key of keys) process.env[key] = temporary;
    assert.equal(tmpdir(), temporary);
    const projection = captureWorkspaceReviewProjection({repositoryRoot: root, intendedUntracked: []});
    assert.equal(git("show", `${projection.candidateTree}:tracked.txt`), "changed");
    assert.deepEqual(indexBytes(git), beforeIndex);
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(readFileSync(marker, "utf8"), "called\n", "capture must not execute the pre-existing temporary hook");
  } finally {
    keys.forEach((key, index) => { const value = previous[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  }
});

test("supports an unborn repository without manufacturing a commit", t => {
  const unborn = join(fixtureParent, `u-${process.pid}-${fixtureSequence += 1}`);
  mkdirSync(unborn);
  t.after(() => rmSync(unborn, {recursive: true, force: true}));
  execFileSync("git", ["-C", unborn, "init", "-q"]);
  writeFileSync(join(unborn, "new.txt"), "new\n");
  const projection = captureWorkspaceReviewProjection({repositoryRoot: unborn, intendedUntracked: ["new.txt"]});
  assert.equal(projection.baseCommit, null);
  assert.match(projection.baseTree, /^[0-9a-f]{40,64}$/u);
  assert.equal(entry(projection, "new.txt")?.change, "added");
  assert.throws(() => execFileSync("git", ["-C", unborn, "rev-parse", "HEAD"], {stdio: "ignore"}));
});
