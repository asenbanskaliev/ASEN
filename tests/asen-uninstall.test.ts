import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile, mkdir, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  executeUninstall,
  restoreUninstallSnapshot,
  type UninstallOptions
} from "../src/runtime/managed/asen-uninstall.js";

test("executeUninstall dryRun previews files to remove without modifying disk", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-uninstall-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const homeDir = join(root, "home");
  const asenDir = join(homeDir, ".asen");
  await mkdir(asenDir, { recursive: true });
  await writeFile(join(asenDir, "config.json"), "{}");

  const report = await executeUninstall({
    homeDir,
    dryRun: true
  });

  assert.equal(report.status, "preview");
  assert.equal(report.dryRun, true);
  assert.ok(report.targets.length > 0);
  assert.equal(report.targets[0]?.path, asenDir);
  // verify file still exists
  assert.equal(existsSync(join(asenDir, "config.json")), true);
});

test("executeUninstall throws without exact UNINSTALL confirmation phrase", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-uninstall-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      executeUninstall({
        homeDir: root,
        dryRun: false,
        confirmPhrase: "yes" // invalid
      }),
    /Confirmation phrase 'UNINSTALL' is required to execute uninstallation/
  );
});

test("executeUninstall creates snapshot and removes .asen directory cleanly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-uninstall-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const homeDir = join(root, "home");
  const asenDir = join(homeDir, ".asen");
  await mkdir(asenDir, { recursive: true });
  await writeFile(join(asenDir, "memory.json"), '{"state":"saved"}');

  const report = await executeUninstall({
    homeDir,
    dryRun: false,
    confirmPhrase: "UNINSTALL"
  });

  assert.equal(report.status, "uninstalled");
  assert.ok(report.snapshotPath);
  assert.equal(existsSync(report.snapshotPath), true);
  // verify asenDir was removed
  assert.equal(existsSync(asenDir), false);
});


test("uninstall backs up nested binary data byte for byte and can restore without overwriting", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-uninstall-nested-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const homeDir = join(root, "home");
  const nested = join(homeDir, ".asen", "agents", "history");
  await mkdir(nested, { recursive: true });
  const bytes = Buffer.from([0, 255, 1, 0, 128, 4]);
  await writeFile(join(nested, "event.bin"), bytes);
  await writeFile(join(homeDir, ".asen", "settings.json"), '{"mode":"normal"}');
  const report = await executeUninstall({ homeDir, confirmPhrase: "UNINSTALL" });
  assert.ok(report.snapshotPath);
  assert.equal(existsSync(join(homeDir, ".asen")), false);
  assert.deepEqual(await readFile(join(report.snapshotPath!, "agents", "history", "event.bin")), bytes);
  await restoreUninstallSnapshot(report.snapshotPath!, homeDir);
  assert.deepEqual(await readFile(join(nested, "event.bin")), bytes);
  await assert.rejects(() => restoreUninstallSnapshot(report.snapshotPath!, homeDir), /overwrite/);
});

test("uninstall refuses a backup placed inside .asen without removing any data", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-uninstall-inside-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const asenDir = join(root, ".asen");
  await mkdir(asenDir);
  await writeFile(join(asenDir, "token.txt"), "KEEP");
  await assert.rejects(() => executeUninstall({
    homeDir: root, destinationDir: join(asenDir, "backups"), confirmPhrase: "UNINSTALL"
  }), /backup must be outside/);
  assert.equal(await readFile(join(asenDir, "token.txt"), "utf8"), "KEEP");
});

test("uninstall refuses nested symlinks instead of ignoring or following them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-uninstall-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const asenDir = join(root, ".asen");
  await mkdir(asenDir);
  await writeFile(join(root, "private.txt"), "DO NOT COPY");
  try { await symlink(join(root, "private.txt"), join(asenDir, "external")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return t.skip("Windows symlink privilege unavailable");
    throw error;
  }
  await assert.rejects(() => executeUninstall({ homeDir: root, confirmPhrase: "UNINSTALL" }), /symbolic links/);
  assert.equal(await readFile(join(root, "private.txt"), "utf8"), "DO NOT COPY");
  assert.equal(existsSync(asenDir), true);
});
