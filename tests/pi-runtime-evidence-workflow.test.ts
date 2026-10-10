type Assert = {
  equal(actual: unknown, expected: unknown, message?: string): void;
  match(actual: string, expected: RegExp): void;
  notEqual(actual: unknown, expected: unknown, message?: string): void;
};
type ReadFile = (path: URL, encoding: "utf8") => Promise<string>;
type Test = (name: string, body: () => void | Promise<void>) => Promise<void>;

const importBuiltin = Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<Record<string, unknown>>;
const assert = (await importBuiltin("node:assert/strict")).default as Assert;
const readFile = (await importBuiltin("node:fs/promises")).readFile as ReadFile;
const test = (await importBuiltin("node:test")).default as Test;

const workflowUrl = new URL("../.github/workflows/pi-1-runtime-evidence.yml", import.meta.url);
const workflow = await readFile(workflowUrl, "utf8");
const lines = workflow.split(/\r?\n/);

function lineIndex(value: string): number {
  return lines.findIndex((line) => line.trim() === value);
}

await test("Pi facade evidence is represented by physical step keys", () => {
  const joinedFacade = lines.find((line) =>
    line.includes("Exercise ASEN extension facade with real Pi package\\n"),
  );
  assert.equal(joinedFacade, undefined, "facade step keys must not be joined by a literal \\n");

  const nameIndex = lineIndex("- name: Exercise ASEN extension facade with real Pi package");
  assert.notEqual(nameIndex, -1);
  assert.equal(
    lines[nameIndex + 1]?.trim(),
    "run: node scripts/pi-extension-e2e.mjs ./extensions/asen.ts",
  );
  assert.equal(lines[nameIndex + 2]?.trim(), "");
  assert.equal(
    lines[nameIndex + 3]?.trim(),
    "- name: Exercise ASEN extension inside real Pi 1.1 RPC runtime",
  );
});

await test("pull request filters include interaction host and facade evidence", () => {
  for (const required of [
    '- "src/interaction/**"',
    '- "tests/code-intelligence.test.ts"',
    '- ".github/workflows/pi-1-runtime-evidence.yml"',
  ]) {
    assert.notEqual(lineIndex(required), -1, `missing pull request filter ${required}`);
  }
});

await test("runtime evidence keeps its trigger, pinning, offline, and permission boundaries", () => {
  assert.notEqual(lineIndex("workflow_dispatch:"), -1);
  assert.notEqual(lineIndex("pull_request:"), -1);
  assert.equal(lines.some((line) => /^\s*push\s*:/.test(line)), false);
  assert.notEqual(lineIndex("contents: read"), -1);
  assert.equal(workflow.includes("contents: write"), false);

  assert.match(workflow, /uses: actions\/checkout@v7[\s\S]*?ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /npm install -g --ignore-scripts @earendil-works\/pi-coding-agent@1\.1\.0/);
  assert.match(workflow, /PI_OFFLINE: "1"/);
  assert.match(workflow, /PI_TELEMETRY: "0"/);
  assert.match(workflow, /PI_SKIP_VERSION_CHECK: "1"/);
  assert.match(workflow, /pi -e \.\/extensions\/asen\.ts --mode rpc --no-session --no-tools --no-approve/);
});
