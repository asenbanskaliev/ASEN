/**
 * Delivery conflict markers guard fixtures.
 *
 * Every case runs against a real temporary Git repository, because the guard
 * predicts what a commit records from the index and the worktree. Each fixture
 * owns an isolated temporary root and removes it in teardown.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  addedMarkerLines,
  checkConflictMarkers,
  conflictMarkerChecks,
  conflictMarkerFindings,
  CONFLICT_MARKER_BUDGET_MS,
} from "../src/security/delivery-conflict-markers.js";

interface Fixture { dir: string; git: (...args: string[]) => string }

const roots: string[] = [];
const MARKERS = "<<<<<<< HEAD\nlocal line\n=======\nremote line\n>>>>>>> feature\n";
const CLEAN = "resolved line\n";

/** Ambient Git routing and the developer's own config must not shape a fixture. */
function isolatedGitEnv(root: string): NodeJS.ProcessEnv {
 const env: NodeJS.ProcessEnv = {};
 for (const [key, value] of Object.entries(process.env)) if (!key.toUpperCase().startsWith("GIT_") && value !== undefined) env[key] = value;
 const isolated = join(root, "isolated.gitconfig");
 return { ...env, GIT_CONFIG_GLOBAL: isolated, GIT_CONFIG_SYSTEM: isolated, GIT_PAGER: "cat", GIT_ADVICE: "0" };
}

function repo(): Fixture {
 const dir = mkdtempSync(join(tmpdir(), "asen-conflict-markers-"));
 roots.push(dir);
 const git = (...args: string[]): string => execFileSync("git", ["-C", dir, ...args],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: isolatedGitEnv(dir) });
 git("init", "-q");
 for (const setting of ["user.email=guard@example.invalid", "user.name=Guard Fixture", "commit.gpgsign=false", "core.autocrlf=false"]) git("config", setting.split("=")[0]!, setting.split("=")[1]!);
 return { dir, git };
}

function commit(git: (...args: string[]) => string, message: string): void {
 git("-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", message);
}

/** A repository with `seed.md` and `merge.txt` committed clean. */
function seeded(): Fixture {
 const fixture = repo();
 writeFileSync(join(fixture.dir, "seed.md"), CLEAN);
 writeFileSync(join(fixture.dir, "merge.txt"), CLEAN);
 fixture.git("add", "seed.md", "merge.txt");
 commit(fixture.git, "chore: seed");
 return fixture;
}

after(() => {
 for (const dir of roots) rmSync(dir, { recursive: true, force: true, maxRetries: 6 });
});

test("a commit whose recorded content has no markers is let through", async () => {
 const { dir, git } = seeded();
 assert.equal(await checkConflictMarkers('git commit -m "docs: add notes"', dir), undefined);
 writeFileSync(join(dir, "merge.txt"), "resolved line\ntail\n");
 git("add", "merge.txt");
 assert.equal(await checkConflictMarkers("git commit -m 'docs: extend notes'", dir), undefined);
 assert.equal(await checkConflictMarkers("git commit --no-verify -F message.txt", dir), undefined);
});

test("a commit whose index adds a full marker set is refused with file and lines", async () => {
 const { dir, git } = seeded();
 writeFileSync(join(dir, "merge.txt"), MARKERS);
 git("add", "merge.txt");
 const result = await checkConflictMarkers("git commit -m wip", dir);
 assert.ok(result);
 assert.equal(result.blocked, true);
 assert.deepEqual(result.findings, [{ file: "merge.txt", lines: [1] }]);
 assert.match(result.reason ?? "", /<<<<<<< \.\.\. >>>>>>>/u);
 assert.match(result.reason ?? "", /merge\.txt:1/u);
 assert.match(result.reason ?? "", /conflict-marker-size/u);
});

test("markers that the commit only removes are a resolution, not an addition", async () => {
 const { dir, git } = repo();
 writeFileSync(join(dir, "merge.txt"), MARKERS);
 git("add", "merge.txt");
 commit(git, "chore: commit conflicted content for the fixture");
 writeFileSync(join(dir, "merge.txt"), CLEAN);
 git("add", "merge.txt");
 assert.equal(await checkConflictMarkers("git commit -m 'fix: resolve markers'", dir), undefined);
 assert.equal(await checkConflictMarkers("git commit -am 'fix: resolve markers'", dir), undefined);
});

test("staging earlier in the same command is predicted by the later commit", async () => {
 const { dir } = seeded();
 writeFileSync(join(dir, "merge.txt"), MARKERS); // modified, not staged
 // Unstaged worktree content is not recorded by a plain commit.
 assert.equal(await checkConflictMarkers("git commit -m wip", dir), undefined);
 for (const command of ['git add merge.txt && git commit -m "wip"', "git add -A && git commit -m wip", "git commit -am wip"]) {
  const result = await checkConflictMarkers(command, dir);
  assert.ok(result, command);
  assert.equal(result.blocked, true, command);
  assert.deepEqual(result.findings, [{ file: "merge.txt", lines: [1] }], command);
 }
 // A dry-run add stages nothing, so the commit still records nothing.
 assert.equal(await checkConflictMarkers("git add --dry-run merge.txt && git commit -m wip", dir), undefined);
 // An add this guard will not predict contributes no staging source, so nothing new is recorded.
 assert.equal(await checkConflictMarkers("git add -p merge.txt && git commit -m wip", dir), undefined);
 assert.deepEqual(conflictMarkerChecks("git add merge.txt && git commit -m wip", dir)[0]?.staged,
  [{ pathspecs: ["merge.txt"], tracked: true, untracked: true, force: false }]);
 assert.deepEqual(conflictMarkerChecks("git add -p merge.txt && git commit -m wip", dir)[0]?.staged, []);
 // `commit <paths>` records only that path, which stays clean here.
 assert.equal(await checkConflictMarkers("git commit -m wip -- seed.md", dir), undefined);
 assert.equal((await checkConflictMarkers("git commit -i -m wip merge.txt", dir))?.blocked, true);
});

test("an untracked file staged by add in the same command is read from the worktree", async () => {
 const { dir } = seeded();
 writeFileSync(join(dir, "brand-new.md"), MARKERS);
 assert.equal(await checkConflictMarkers("git commit -m wip", dir), undefined);
 assert.equal(await checkConflictMarkers("git commit -am wip", dir), undefined); // `-a` never adds untracked content
 const result = await checkConflictMarkers("git add brand-new.md && git commit -m wip", dir);
 assert.ok(result);
 assert.deepEqual(result.findings, [{ file: "brand-new.md", lines: [1] }]);
});

test("conflict markers in the commit message are data, not file content", async () => {
 const { dir } = seeded(); // index content stays clean; only the message holds marker text
 assert.equal(await checkConflictMarkers('git commit -m "explain the <<<<<<< HEAD ======= >>>>>>> notation"', dir), undefined);
});

test("heredoc bodies are data and never a segment", async () => {
 const { dir } = seeded(); // index content stays clean; the heredoc holds marker text and a nested commit
 const command = "git commit -F - <<'MSG'\n<<<<<<< HEAD\ngit commit -m \"nested\"\n=======\n>>>>>>> feature\nMSG\n";
 assert.equal(await checkConflictMarkers(command, dir), undefined);
 const checks = conflictMarkerChecks(command, dir);
 assert.equal(checks.length, 1);
 assert.equal(checks[0]?.directory, dir);
 assert.deepEqual(checks[0]?.sources, [{ kind: "index" }]);
});

test("redirections are not arguments and never a commit pathspec", async () => {
 const { dir, git } = seeded();
 writeFileSync(join(dir, "log.txt"), MARKERS); // untracked output of the redirect, never committed
 git("add", "log.txt");
 git("reset", "-q", "--", "log.txt");
 const command = 'git commit -m "docs: notes" > log.txt 2>&1';
 assert.equal(await checkConflictMarkers(command, dir), undefined);
 assert.deepEqual(conflictMarkerChecks("git status > out.txt", dir), []);
});

test("sequencer --continue is checked while other sequencer shapes are not", async () => {
 const { dir, git } = seeded();
 writeFileSync(join(dir, "merge.txt"), MARKERS);
 git("add", "merge.txt");
 for (const command of ["git rebase --continue", "git merge --continue", "git cherry-pick --continue", "git revert --continue", "git am --continue"]) {
  const result = await checkConflictMarkers(command, dir);
  assert.ok(result, command);
  assert.equal(result.blocked, true, command);
  assert.deepEqual(result.findings, [{ file: "merge.txt", lines: [1] }], command);
 }
 for (const command of ["git rebase origin/main", "git rebase --onto main feature", "git cherry-pick abc1234", "git merge other", "git am patch-file"]) {
  assert.equal(await checkConflictMarkers(command, dir), undefined, command);
 }
});

test("pushes are deliberately not checked", async () => {
 const { dir, git } = seeded();
 writeFileSync(join(dir, "merge.txt"), MARKERS);
 git("add", "merge.txt");
 // The same repository state is refused for a commit ...
 assert.equal((await checkConflictMarkers("git commit -m wip", dir))?.blocked, true);
 // ... and let through for every push shape, even beside a commit that is not checked twice.
 for (const command of ["git push", "git push origin main", "git push --force-with-lease origin main", "git push -u origin HEAD && git status"]) {
  assert.equal(await checkConflictMarkers(command, dir), undefined, command);
 }
});

test("the guard fails open when Git cannot answer", async () => {
 const outside = mkdtempSync(join(tmpdir(), "asen-conflict-markers-norepo-"));
 roots.push(outside);
 assert.equal(await checkConflictMarkers("git commit -m wip", outside), undefined);
 assert.equal(await checkConflictMarkers("git commit -m wip", join(outside, "missing-subdirectory")), undefined);
 const { dir, git } = seeded();
 writeFileSync(join(dir, "merge.txt"), MARKERS);
 git("add", "merge.txt");
 // Shapes the guard will not guess never produce a check, so the command runs.
 for (const command of ['git -C "$DIR" commit -m wip', "GIT_DIR=elsewhere git commit -m wip", 'cd "$DIR" && git commit -m wip',
  "(cd sub && git commit -m wip)", "git ${SUBCMD} -m wip", "git commit --dry-run -m wip"]) {
  assert.equal(await checkConflictMarkers(command, dir), undefined, command);
 }
});

test("an exhausted time budget or an aborted caller signal lets the command run", async () => {
 const { dir, git } = seeded();
 writeFileSync(join(dir, "merge.txt"), MARKERS);
 git("add", "merge.txt");
 const controller = new AbortController();
 controller.abort();
 assert.equal(CONFLICT_MARKER_BUDGET_MS, 5_000);
 // The same command and repository state is refused with a live budget ...
 assert.equal((await checkConflictMarkers("git commit -m wip", dir, new AbortController().signal))?.blocked, true);
 // ... and let through once the inspection budget or the caller is spent.
 assert.equal(await checkConflictMarkers("git commit -m wip", dir, undefined, 0), undefined);
 assert.equal(await checkConflictMarkers("git rebase --continue", dir, undefined, 0), undefined);
 assert.equal(await checkConflictMarkers("git commit -m wip", dir, controller.signal), undefined);
});

test("a declared conflict-marker-size attribute exempts a file and re-sizes detection", async () => {
 const exempt = repo();
 writeFileSync(join(exempt.dir, ".gitattributes"), "markers.md conflict-marker-size=60\n");
 exempt.git("add", ".gitattributes");
 commit(exempt.git, "chore: declare marker size");
 writeFileSync(join(exempt.dir, "markers.md"), MARKERS);
 exempt.git("add", "markers.md");
 assert.equal(await checkConflictMarkers("git commit -m wip", exempt.dir), undefined);

 const sized = repo();
 writeFileSync(join(sized.dir, ".gitattributes"), "weird.md conflict-marker-size=8\n");
 sized.git("add", ".gitattributes");
 commit(sized.git, "chore: declare marker size");
 writeFileSync(join(sized.dir, "weird.md"), "<<<<<<<< HEAD\nlocal\n========\nremote\n>>>>>>>> feature\n");
 sized.git("add", "weird.md");
 const result = await checkConflictMarkers("git commit -m wip", sized.dir);
 assert.ok(result);
 assert.deepEqual(result.findings, [{ file: "weird.md", lines: [1] }]);
});

test("subdirectories and cd tracking keep the recorded repository and source", async () => {
 const { dir, git } = seeded();
 mkdirSync(join(dir, "pkg"));
 writeFileSync(join(dir, "pkg", "conflict.txt"), MARKERS);
 git("add", "pkg/conflict.txt");
 assert.equal((await checkConflictMarkers("git commit -m wip", join(dir, "pkg")))?.blocked, true);
 assert.equal((await checkConflictMarkers("cd pkg && git commit -m wip", dir))?.blocked, true);
 assert.equal((await checkConflictMarkers("git -C pkg commit -m wip", dir))?.blocked, true);
 // A commit recorded from the clean root index still sees the staged path.
 assert.equal((await checkConflictMarkers("git commit -m wip", dir))?.blocked, true);
 const checks = conflictMarkerChecks("cd pkg && git commit -m wip", dir);
 assert.equal(checks.length, 1);
 assert.equal(checks[0]?.directory, join(dir, "pkg"));
 assert.deepEqual(conflictMarkerChecks("git push origin main", dir), []);
});

test("addedMarkerLines reads only added lines from a -U0 diff", () => {
 const diff = [
  "diff --git a/merge.txt b/merge.txt",
  "--- a/merge.txt",
  "+++ b/merge.txt",
  "@@ -0,0 +1,5 @@",
  "+<<<<<<< HEAD",
  "+local line",
  " =======",
  "+remote line",
  "@@ -9,2 +9,1 @@",
  "->>>>>>> feature",
 ].join("\n");
 assert.deepEqual(addedMarkerLines(diff), [{ line: 1, text: "<<<<<<< HEAD" }]);
 assert.deepEqual(addedMarkerLines(""), []);
});

test("conflictMarkerFindings needs an opening and a closing marker of the file's size", () => {
 const added = new Map<string, Array<{ line: number; text: string }>>([
  ["pair.md", [{ line: 3, text: "<<<<<<< HEAD" }, { line: 9, text: ">>>>>>> feature" }]],
  ["opening-only.md", [{ line: 1, text: "<<<<<<< HEAD" }, { line: 2, text: "plain" }]],
  ["short.md", [{ line: 4, text: "<<< HEAD" }, { line: 8, text: ">>> feature" }]],
  ["sized.md", [{ line: 7, text: "<<<<<<<< HEAD" }, { line: 11, text: ">>>>>>>> feature" }]],
 ]);
 assert.deepEqual(conflictMarkerFindings(added), ["pair.md:3"]);
 assert.deepEqual(conflictMarkerFindings(added, new Map([["sized.md", 8]])), ["pair.md:3", "sized.md:7"]);
 assert.deepEqual(conflictMarkerFindings(added, new Map([["pair.md", 8]])), []);
 assert.deepEqual(conflictMarkerFindings(new Map()), []);
});
