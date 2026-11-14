import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  executeUninstall,
  type UninstallOptions
} from "../src/runtime/asen-uninstall.js";

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
