import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createPiProbeEnvironment,
  createPiRuntimeEnvironment,
  createPiVerifierEnvironment,
} from "../scripts/gsp06-pi-free-environment.mjs";

const repository = process.cwd();

test("Pi Free receives only the selected provider credential and required runtime settings", () => {
  const source: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: process.env.PATH ?? "",
    HOME: "/isolated/home",
    PI_CODING_AGENT_DIR: "/isolated/pi",
    PI_PACKAGE_DIR: "/isolated/packages",
    PI_OFFLINE: "1",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    LC_CTYPE: "C.UTF-8",
    TZ: "UTC",
    OPENROUTER_API_KEY: "selected-openrouter-key",
    LLM7_API_KEY: "unselected-llm7-key",
    GROQ_API_KEY: "unselected-groq-key",
    GITHUB_TOKEN: "runner-token",
    OTHER_SECRET: "unrelated-secret",
    __CF_USER_TEXT_ENCODING: "untrusted-inherited-value",
  };
  const environment = createPiProbeEnvironment(source, "openrouter");
  const child = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(JSON.stringify(process.env))"],
    { encoding: "utf8", env: environment },
  );

  assert.equal(child.status, 0, child.stderr);
  const observed = JSON.parse(child.stdout) as Record<string, string>;
  const control = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(process.env))"],
    {encoding: "utf8", env: createPiRuntimeEnvironment(source)});
  assert.equal(control.status, 0, control.stderr);
  const systemEnvironment = JSON.parse(control.stdout) as Record<string, string>;

  assert.equal(observed.PATH, source.PATH);
  assert.equal(observed.HOME, source.HOME);
  assert.equal(observed.PI_CODING_AGENT_DIR, source.PI_CODING_AGENT_DIR);
  assert.equal(observed.PI_PACKAGE_DIR, source.PI_PACKAGE_DIR);
  assert.equal(observed.PI_OFFLINE, source.PI_OFFLINE);
  assert.equal(observed.PI_TELEMETRY, "0");
  assert.equal(observed.OPENROUTER_API_KEY, source.OPENROUTER_API_KEY);
  for (const name of ["SYSTEMROOT", "WINDIR", "TEMP", "TMPDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "LC_CTYPE", "TZ"]) {
    assert.equal(observed[name], environment[name], `${name} must remain available to Pi`);
  }
  const allowed = new Set([
    "PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "WINDIR",
    "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "PI_CODING_AGENT_DIR",
    "PI_PACKAGE_DIR", "PI_OFFLINE", "PI_SKIP_VERSION_CHECK", "OPENROUTER_API_KEY", "PI_TELEMETRY",
  ]);
  for (const name of Object.keys(source)) {
    if (allowed.has(name) || (process.platform === "win32" && [...allowed].some(key => key.toUpperCase() === name.toUpperCase()))) continue;
    assert.equal(Object.hasOwn(environment, name), false, `${name} must not be inherited by Pi`);
    // macOS may synthesize this non-secret variable even when absent from env.
    // Node 22.19.0 libuv required_vars adds these absent Windows values.
    const systemGenerated = (process.platform === "darwin" && name === "__CF_USER_TEXT_ENCODING") ||
      (process.platform === "win32" && ["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "USERDOMAIN", "USERNAME"].includes(name.toUpperCase()));
    if (systemGenerated) {
      assert.equal(observed[name], systemEnvironment[name], `${name} must match the credential-free control`);
      continue;
    }
    assert.equal(Object.hasOwn(observed, name), false, `${name} must not reach Pi`);
  }
});

test("Pi runtime environment retains runtime paths but strips every provider credential", () => {
  const source: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: process.env.PATH ?? "",
    HOME: "/isolated/home",
    OPENROUTER_API_KEY: "openrouter-key",
    LLM7_API_KEY: "llm7-key",
    GROQ_API_KEY: "groq-key",
    GITHUB_TOKEN: "runner-token",
  };
  const environment = createPiRuntimeEnvironment(source);
  const child = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(JSON.stringify(process.env))"],
    { encoding: "utf8", env: environment },
  );

  assert.equal(child.status, 0, child.stderr);
  const observed = JSON.parse(child.stdout) as Record<string, string>;
  assert.equal(observed.PATH, source.PATH);
  assert.equal(observed.HOME, source.HOME);
  for (const name of ["OPENROUTER_API_KEY", "LLM7_API_KEY", "GROQ_API_KEY", "GITHUB_TOKEN"]) {
    assert.equal(Object.hasOwn(observed, name), false, `${name} must not reach intermediate processes`);
  }
});

test("Pi verifier subprocess is offline and excludes ambient credentials", () => {
  const source: NodeJS.ProcessEnv = {
    ...process.env,
    OPENROUTER_API_KEY: "provider-key",
    GITHUB_TOKEN: "runner-token",
    PI_OFFLINE: "0",
    PI_TELEMETRY: "1",
    PI_SKIP_VERSION_CHECK: "0",
  };
  const environment = createPiVerifierEnvironment(source);
  const child = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(JSON.stringify(process.env))"],
    { encoding: "utf8", env: environment },
  );

  assert.equal(child.status, 0, child.stderr);
  const observed = JSON.parse(child.stdout) as Record<string, string>;
  assert.equal(observed.PI_OFFLINE, "1");
  assert.equal(observed.PI_TELEMETRY, "0");
  assert.equal(observed.PI_SKIP_VERSION_CHECK, "1");
  assert.equal(Object.hasOwn(observed, "OPENROUTER_API_KEY"), false);
  assert.equal(Object.hasOwn(observed, "GITHUB_TOKEN"), false);
});

test("Pi Free workflow pins the verified release and exposes only OpenRouter credentials", () => {
  const workflow = readFileSync(
    join(repository, ".github/workflows/gsp06-pi-free-parity.yml"),
    "utf8",
  );

  assert.match(workflow, /pi install npm:pi-free@2\.8\.4/);
  assert.match(workflow, /ASEN_PI_PROVIDER_EXTENSION: npm:pi-free@2\.8\.4/);
  assert.match(workflow, /OPENROUTER_API_KEY: \$\{\{ secrets\.OPENROUTER_API_KEY \}\}/);
  assert.doesNotMatch(workflow, /secrets\.(?:LLM7_API_KEY|GROQ_API_KEY)/);
});

test("Pi child environment fails closed for an unsupported or unconfigured provider", () => {
  assert.throws(() => createPiProbeEnvironment({}, "unknown"), /Unsupported GSP-06 provider/);
  assert.throws(() => createPiProbeEnvironment({}, "toString"), /Unsupported GSP-06 provider/);
  assert.throws(() => createPiProbeEnvironment({}, "openrouter"), /credential is unavailable/);
});


test("Windows runtime snapshots preserve mixed-case system paths without inheriting secrets", () => {
  const source = {Path: "C:\\runtime", SystemRoot: "C:\\Windows", windir: "C:\\Windows", ComSpec: "C:\\Windows\\System32\\cmd.exe", Other_Secret: "excluded", OPENROUTER_API_KEY: "excluded"};
  assert.deepEqual(createPiRuntimeEnvironment(source, "win32"), {
    PATH: source.Path, SYSTEMROOT: source.SystemRoot, WINDIR: source.windir, COMSPEC: source.ComSpec,
  });
  assert.deepEqual(createPiRuntimeEnvironment(source, "linux"), {});
});
