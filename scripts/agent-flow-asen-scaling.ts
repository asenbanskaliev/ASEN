import { resolve } from "node:path";
import { readAgentABManifest } from "./agent-ab-manifest-reader.mjs";

const usage = "Uso: node --import tsx scripts/agent-flow-asen-scaling.ts <synthetic-pair.json>";
const identity = ["commit", "taskDigest", "toolsDigest", "permissionsDigest", "configDigest"] as const;
type Observation = Record<typeof identity[number], string> & {
  runId: string;
  workerCount: 1 | 2;
  durationMs: number;
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hex(value: unknown, length: number): boolean {
  return typeof value === "string" && value.length === length && !/[^0-9a-f]/u.test(value);
}

function observation(value: unknown): value is Observation {
  return object(value) && Object.keys(value).length === identity.length + 6 &&
    value.system === "asen" && value.synthetic === true && value.requirementPassed === true &&
    typeof value.runId === "string" && value.runId.length > 0 && value.runId.trim() === value.runId &&
    (value.workerCount === 1 || value.workerCount === 2) &&
    typeof value.durationMs === "number" && Number.isFinite(value.durationMs) && value.durationMs > 0 &&
    identity.every((key) => hex(value[key], key === "commit" ? 40 : 64));
}

function compare(input: unknown) {
  if (!object(input) || Object.keys(input).length !== 1 ||
      !Array.isArray(input.observations) || input.observations.length !== 2) return null;
  const [a, b]: unknown[] = input.observations;
  if (!observation(a) || !observation(b) || a.runId === b.runId || a.workerCount === b.workerCount ||
      identity.some((key) => a[key] !== b[key])) return null;

  const [t1, t2] = a.workerCount === 1 ? [a.durationMs, b.durationMs] : [b.durationMs, a.durationMs];
  const ratio = t1 / t2;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return {
    synthetic: true,
    elapsedDeltaMs: t1 - t2,
    t1OverT2: ratio,
    costUsd: null,
    costConclusion: "unknown",
    providerReceiptObserved: false,
    acceptance: "not-accepted",
    globalFull: false,
  };
}

async function main(args: string[]): Promise<number> {
  const [path] = args;
  if (args.length !== 1 || !path?.trim() || path.startsWith("-")) {
    console.error(usage);
    return 2;
  }
  let input: unknown;
  try {
    input = await readAgentABManifest(resolve(path));
  } catch {
    console.error("P05: no se pudo leer un objeto JSON acotado.");
    return 1;
  }
  const result = compare(input);
  if (!result) {
    console.error("P05: se requiere un par sintético ASEN válido y comparable (1 y 2 Workers).");
    return 1;
  }
  console.log(JSON.stringify(result));
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
