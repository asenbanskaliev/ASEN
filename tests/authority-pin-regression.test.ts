import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { authorityAssets } from "../src/agents/pi-authority-assets.js";

const required = [...authorityAssets.map(asset => asset.source), "src/agents/pi-authority-assets.ts"];

test("authority pin fails clearly when a pinned source hash is wrong", async t => {
 const root = mkdtempSync(path.join(tmpdir(), "asen-authority-tamper-"));
 t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
 await import("node:fs/promises").then(async fs => {
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  await fs.copyFile("scripts/authority-pin.mjs", path.join(root, "scripts", "authority-pin.mjs"));
  for (const file of required) {
   await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
   await fs.copyFile(file, path.join(root, file));
  }
 });

 const manifestPath = path.join(root, "src/agents/pi-authority-assets.ts");
 const manifest = readFileSync(manifestPath, "utf8");
 const mutated = manifest.replace(/sha256:"[0-9a-f]{64}"/, `sha256:"${"0".repeat(64)}"`);
 assert.notEqual(mutated, manifest);
 writeFileSync(manifestPath, mutated);

 let exitCode = 0;
 let output = "";
 try {
  const runExec = execFileSync as (...args: any[]) => any;
 output = runExec(process.execPath, ["scripts/authority-pin.mjs", "check"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) as string;
 } catch (error) {
  const failed = error as { status?: number; stdout?: string; stderr?: string };
  exitCode = failed.status ?? 1;
  output = `${failed.stdout ?? ""}\n${failed.stderr ?? ""}`;
 }

 assert.notEqual(exitCode, 0);
 assert.match(output, /AUTHORITY PIN MISMATCH/);

 assert.match(output, /expected:/);
 assert.match(output, /actual:/);
});
