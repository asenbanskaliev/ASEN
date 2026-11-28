import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/agent-flow-asen-scaling.ts", import.meta.url));
const usage = "Uso: node --import tsx scripts/agent-flow-asen-scaling.ts <synthetic-pair.json>\n";
const invalidPair = "P05: se requiere un par sintético ASEN válido y comparable (1 y 2 Workers).\n";
const invalidFile = "P05: no se pudo leer un objeto JSON acotado.\n";

const one = {
  system: "asen", synthetic: true, runId: "fixture-uno", commit: "a".repeat(40),
  taskDigest: "b".repeat(64), toolsDigest: "c".repeat(64),
  permissionsDigest: "d".repeat(64), configDigest: "e".repeat(64),
  workerCount: 1, durationMs: 300, requirementPassed: true,
};
const two = { ...one, runId: "fixture-dos", workerCount: 2, durationMs: 200 };

function run(...args: string[]) {
  const child = spawnSync(process.execPath, [...process.execArgv, cli, ...args], {
    encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

async function withInput(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "asen-p05-scaling-"));
  let created: string | undefined;
  t.after(async () => {
    try {
      if (created) await unlink(created);
      await rmdir(dir);
    } catch (error) {
      t.diagnostic(`Limpieza de la entrada sintética no disponible: ${String(error)}`);
    }
  });
  // El directorio temporal de Windows puede usar un alias 8.3.
  const path = join(await realpath(dir), "synthetic-pair.json");
  return async (text: string) => {
    const bytes = Buffer.from(text);
    await writeFile(path, bytes);
    created = path;
    const result = run(path);
    assert.deepEqual(await readFile(path), bytes);
    return result;
  };
}

const evidenceOnly = {
  synthetic: true, costUsd: null, costConclusion: "unknown", providerReceiptObserved: false,
  acceptance: "not-accepted", globalFull: false,
};

test("P05: compara 1 y 2 Workers por su número, no por orden; solo aritmética sintética", async (t: TestContext) => {
  const input = await withInput(t);
  for (const [second, delta, ratio] of [[two, 100, 1.5], [{ ...two, durationMs: 600 }, -300, 0.5]] as const) {
    const { status, stdout, stderr } = await input(JSON.stringify({ observations: [second, one] }));
    assert.equal(status, 0, stderr);
    assert.equal(stderr, "");
    assert.deepEqual(JSON.parse(stdout), { ...evidenceOnly, elapsedDeltaMs: delta, t1OverT2: ratio });
  }
});

test("P05: rechaza pares incompletos, duplicados, 3/4 Workers e identidades distintas", async (t: TestContext) => {
  const input = await withInput(t);
  const { configDigest: _missing, ...incomplete } = two;
  const variants: [string, unknown][] = [
    ["solo una", [one]], ["tres observaciones", [one, two, two]], ["campo ausente", [one, incomplete]],
    ["ID duplicado", [one, { ...two, runId: one.runId }]],
    ["ID vacío", [one, { ...two, runId: " " }]],
    ["otro sistema", [one, { ...two, system: "reference" }]],
    ["no sintético", [one, { ...two, synthetic: false }]],
    ["sin éxito", [one, { ...two, requirementPassed: false }]],
    ["1 frente a 1", [one, { ...two, workerCount: 1 }]],
    ["1 frente a 3", [one, { ...two, workerCount: 3 }]],
    ["1 frente a 4", [one, { ...two, workerCount: 4 }]],
    ["duración inválida", [one, { ...two, durationMs: 0 }]],
    ["duración como texto", [one, { ...two, durationMs: "200" }]],
    ["cociente desbordado", [one, { ...two, durationMs: Number.MIN_VALUE }]],
    ["SHA abreviado", [{ ...one, commit: "91e34d64" }, { ...two, commit: "91e34d64" }]],
    ["recibo de proveedor", [one, { ...two, providerReceiptObserved: true }]],
    ["coste declarado", [one, { ...two, costUsd: 0 }]],
    ...(["commit", "taskDigest", "toolsDigest", "permissionsDigest", "configDigest"] as const)
      .map((key): [string, unknown] => [key, [one, { ...two, [key]: "f".repeat(two[key].length) }]]),
  ];
  for (const [label, observations] of variants) {
    const result = await input(JSON.stringify({ observations }));
    assert.deepEqual(result, { status: 1, stdout: "", stderr: invalidPair }, label);
  }
});

test("P05: rechaza argumentos inválidos y lee únicamente JSON acotado", async (t: TestContext) => {
  for (const args of [[], ["a.json", "b.json"], ["--flag"], [""]]) {
    assert.deepEqual(run(...args), { status: 2, stdout: "", stderr: usage });
  }
  const input = await withInput(t);
  for (const text of ["throw new Error('no ejecutar');", "[]", " ".repeat(1024 * 1024) + "{}"]) {
    assert.deepEqual(await input(text), { status: 1, stdout: "", stderr: invalidFile });
  }
  const nonFinite = JSON.stringify({ observations: [one, two] }).replace('"durationMs":200', '"durationMs":1e400');
  assert.deepEqual(await input(nonFinite), { status: 1, stdout: "", stderr: invalidPair });
});
