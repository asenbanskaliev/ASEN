import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installManaged, upgradeManaged } from "../src/runtime/managed-lifecycle.js";
import { inspectManagedInstall } from "../src/runtime/managed-install.js";
import { buildManagedManifest, generateManagedSigningKeyPair, signManagedManifest } from "../src/runtime/managed-trust.js";

test("T09-U4 characterization: an after-activation crash leaves an explicit rollback recovery path", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asen-t09-u4-crash-"));
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
    await fs.writeFile(`${dir}.anchor.pem`, keys.publicKeyPem);
    return { source: { kind: "local" as const, manifestPath, signaturePath, packageRoot: dir }, anchor: `${dir}.anchor.pem` };
  };

  const prefix = path.join(root, "home", ".asen");
  const dataHome = path.join(root, "home", ".asen", "agent");
  await fs.mkdir(path.dirname(prefix), { recursive: true });

  const first = await release(await pkg("1.0.0"));
  const second = await release(await pkg("2.0.0"));

  await installManaged({
    prefix,
    source: first.source,
    trustedKeyPath: first.anchor,
    protectedPaths: [dataHome],
    dataHome,
    confirmed: true as const,
    launcherConfig: { mode: "isolated" },
  });

  await assert.rejects(
    () =>
      upgradeManaged({
        prefix,
        source: second.source,
        trustedKeyPath: second.anchor,
        protectedPaths: [dataHome],
        confirmed: true,
        hooks: { afterActivation: async () => { throw new Error("simulated activation crash"); } },
      }).then((result) => {
        if (result.status !== "rolled-back") throw new Error("upgrade was not auto-rolled back");
        throw new Error("simulated activation crash");
      }),
  );

  const final = await inspectManagedInstall({ prefix });
  assert.equal(final.status, "owned");
  assert.equal(final.activeVersion, "1.0.0");
});