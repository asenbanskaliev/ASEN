type Assert = {
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  equal(actual: unknown, expected: unknown, message?: string): void;
  match(actual: string, expected: RegExp, message?: string): void;
};
type ReadFile = (path: URL, encoding: "utf8") => Promise<string>;
type Test = (name: string, body: () => void | Promise<void>) => Promise<void>;
type PackageManifest = {
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
type PackageLock = {
  packages?: Record<string, PackageManifest & { version?: string }>;
};

const importBuiltin = Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<Record<string, unknown>>;
const assert = (await importBuiltin("node:assert/strict")).default as Assert;
const readFile = (await importBuiltin("node:fs/promises")).readFile as ReadFile;
const test = (await importBuiltin("node:test")).default as Test;

const sdkName = "@earendil-works/pi-coding-agent";
const rootUrl = new URL("../", import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL("package.json", rootUrl), "utf8"),
) as PackageManifest;
const packageLock = JSON.parse(
  await readFile(new URL("package-lock.json", rootUrl), "utf8"),
) as PackageLock;

const workflowPaths = [
  "gsp-05e-authenticated-rdd.yml",
  "gsp06-pi-free-parity.yml",
  "memory-openrouter-e2e.yml",
  "memory-pi-free-e2e.yml",
  "pi-1-runtime-evidence.yml",
  "pi-free-smoke.yml",
  "release-gate.yml",
] as const;
const workflowTexts = new Map(
  await Promise.all(
    workflowPaths.map(async (path) => [
      path,
      await readFile(new URL(`.github/workflows/${path}`, rootUrl), "utf8"),
    ] as const),
  ),
);

await test("package and lock metadata align the development SDK and Node floor", () => {
  const lockRoot = packageLock.packages?.[""];
  const lockedSdk = packageLock.packages?.[`node_modules/${sdkName}`];

  assert.equal(packageJson.devDependencies?.[sdkName], "^1.1.0");
  assert.equal(packageJson.engines?.node, ">=22.19.0");
  assert.equal(packageJson.peerDependencies?.[sdkName], ">=0.85.1 <2.0.0");
  assert.equal(packageJson.peerDependenciesMeta?.[sdkName]?.optional, true);

  assert.equal(lockRoot?.devDependencies?.[sdkName], "^1.1.0");
  assert.equal(lockRoot?.engines?.node, ">=22.19.0");
  assert.equal(lockRoot?.peerDependencies?.[sdkName], ">=0.85.1 <2.0.0");
  assert.equal(lockRoot?.peerDependenciesMeta?.[sdkName]?.optional, true);
  assert.equal(lockedSdk?.version, "1.1.0");
});

await test("all seven current-runtime workflows pin Pi 1.1.0", () => {
  for (const [path, workflow] of workflowTexts) {
    if (path === "release-gate.yml") {
      // Release Gate reuses the lockfile-installed SDK to avoid an unpinned second npm resolution.
      assert.match(workflow, /npm install/);
      assert.match(workflow, /p\.version !== "1\.1\.0"/);
      assert.match(workflow, /GITHUB_WORKSPACE\/node_modules\/\.bin/);
      assert.equal(workflow.includes("npm install -g"), false);
      continue;
    }
    const pins = [...workflow.matchAll(/@earendil-works\/pi-coding-agent@(\d+\.\d+\.\d+)/g)]
      .map((match) => match[1]);
    assert.deepEqual(pins, ["1.1.0"], `${path} must have one current Pi runtime pin`);
  }
});

await test("Pi runtime evidence labels and assertions describe the pinned runtime", () => {
  const workflow = workflowTexts.get("pi-1-runtime-evidence.yml") ?? "";

  assert.match(workflow, /^name:\s*Pi 1\.1 runtime evidence$/m);
  assert.match(workflow, /name:\s*Install current stable Pi 1\.1\.0/);
  assert.match(workflow, /name:\s*Exercise ASEN extension inside real Pi 1\.1 RPC runtime/);
  assert.match(workflow, /test "\$\(pi --version \| tr -d '\\r'\)" = "1\.1\.0"/);
  assert.match(workflow, /PASS: Pi 1\.1\.0 loaded ASEN/);
});
