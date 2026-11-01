import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installManaged, upgradeManaged, rollbackManaged } from "../src/runtime/managed-lifecycle.js";
import { inspectManagedInstall } from "../src/runtime/managed-install.js";
import { buildManagedManifest, generateManagedSigningKeyPair, signManagedManifest } from "../src/runtime/managed-trust.js";

test("T09-U4 characterization: successful upgrade can be explicitly rolled back and reapplied", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asen-t09-u4-char-"));
  const pkg = async (version: string) => {
    const dir = path.join(root, `v${version}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "asen", version, engines: { node: ">=0.0.0" }, bin: { asen: "./cli.cjs" } }));
    await fs.writeFile(path.join(dir, "cli.cjs"), `process.stdout.write(${JSON.stringify(version + "\n")});`);
    return dir;
  };
  const release = async (dir: string) => {
    const result = await buildManagedManifest(dir);
    const manifestPath = `${dir}.manifest.json`;
    const signaturePath = `${dir}.sig.json`;
    const keys = generateManagedSigningKeyPair();
    await fs.writeFile(manifestPath, result.manifestText);
    await fs.writeFile(signaturePath, signManagedManifest(Buffer.from(result.manifestText), keys.privateKeyPem));
    const anchor = `${dir}.anchor.pem`;
    await fs.writeFile(anchor, keys.publicKeyPem);
    return { source: { kind: "local" as const, manifestPath, signaturePath, packageRoot: dir }, anchor };
  };

  const prefix = path.join(root, "home", ".asen");
  const dataHome = path.join(root, "home", ".asen", "agent");
  await fs.mkdir(path.dirname(prefix), { recursive: true });

  const first = await release(await pkg("1.0.0"));
  const second = await release(await pkg("2.0.0"));

  const common = { prefix, protectedPaths: [dataHome], confirmed: true as const, dataHome, launcherConfig: { mode: "test" } };
  const installed = await installManaged({ ...common, source: first.source, trustedKeyPath: first.anchor });
  assert.equal(installed.status, "installed");
  assert.equal(installed.activeVersion, "1.0.0");

  const initial = await inspectManagedInstall({ prefix });
  assert.equal(initial.status, "owned");
  assert.equal(initial.activeVersion, "1.0.0");

  const upgraded = await upgradeManaged({ ...common, source: second.source, trustedKeyPath: second.anchor });
  assert.equal(upgraded.status, "upgraded");
  assert.equal(upgraded.activeVersion, "2.0.0");
  assert.equal(upgraded.previousVersion, "1.0.0");

  const rolledBack = await rollbackManaged({ prefix, expectedCurrentVersion: "2.0.0", toVersion: "1.0.0", confirmed: true });
  assert.equal(rolledBack.status, "rolled-back");
  assert.equal(rolledBack.activeVersion, "1.0.0");

  const reapplied = await upgradeManaged({ ...common, source: second.source, trustedKeyPath: second.anchor });
  assert.equal(reapplied.status, "upgraded");
  assert.equal(reapplied.activeVersion, "2.0.0");
});