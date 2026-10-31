import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  asenHomeSelectorFlags,
  asenLauncherConfigPath,
  checkPiVersion,
  parseAsenArgs,
  parseAsenLauncherConfig,
  parseManagedUpdatePreviewArgs,
  readAsenLauncherConfig,
  resolveAsenHome,
  resolvePiRuntime,
} from "../src/runtime/launcher.js";
import { ASEN_HELP, runAsen } from "../src/cli.js";

test("launcher parses selectors and Pi passthrough", () => {
  assert.equal(parseAsenArgs(["--link", "install", "npm:x"]).piSubcommand, "install");
  assert.equal(parseAsenArgs(["--link", "--isolated"]).error !== undefined, true);
  assert.deepEqual(parseAsenArgs(["home", "link"]).commandArgs, ["link"]);
});

test("managed update preview parser accepts only the fixed absolute dry-run grammar", () => {
  const manifest = path.resolve("manifest.json");
  const packageRoot = path.resolve("package root");
  assert.deepEqual(
    parseManagedUpdatePreviewArgs(["--home", "ignored data home", "managed", "update", "--manifest", manifest, "--package-root", packageRoot, "--dry-run"]),
    { kind: "preview", selectorArgs: ["--home", "ignored data home"], manifestPath: manifest, packageRoot },
  );
  for (const args of [
    ["managed", "update"],
    ["managed", "update", "--package-root", packageRoot, "--manifest", manifest, "--dry-run"],
    ["managed", "update", "--manifest", manifest, "--package-root", packageRoot],
    ["managed", "update", "--manifest", manifest, "--package-root", packageRoot, "--dry-run", "extra"],
    ["--package-root", packageRoot, "managed", "update", "--manifest", manifest, "--package-root", packageRoot, "--dry-run"],
    ["managed", "update", "--manifest", "relative.json", "--package-root", packageRoot, "--dry-run"],
    ["managed", "update", "--manifest", manifest, "--package-root", "relative", "--dry-run"],
    ["managed", "update", "--manifest", `${manifest}\n`, "--package-root", packageRoot, "--dry-run"],
  ]) assert.deepEqual(parseManagedUpdatePreviewArgs(args), { kind: "invalid" });
  assert.deepEqual(parseManagedUpdatePreviewArgs(["install", "managed", "update"]), { kind: "none" });
  assert.deepEqual(parseManagedUpdatePreviewArgs(["--", "managed", "update"]), { kind: "none" });
});

test("home precedence is flag then config then environment then isolated default", () => {
  const base = { env: {}, homedir: path.join(path.sep, "home", "u") };
  assert.equal(resolveAsenHome({ ...base, args: parseAsenArgs(["--home", "x"]), config: { mode: "link" } }).dir, "x");
  assert.equal(resolveAsenHome({ ...base, args: parseAsenArgs([]), config: { mode: "link" } }).mode, "link");
  assert.equal(resolveAsenHome({ ...base, args: parseAsenArgs([]), env: { ASEN_HOME: "env-home" } }).source, "environment");
  assert.equal(resolveAsenHome({ ...base, args: parseAsenArgs([]) }).mode, "isolated");
});

test("home config is tolerant, strict-shaped, bounded, and ASEN owned", () => {
  assert.deepEqual(parseAsenLauncherConfig('{"home":"link"}'), { mode: "link" });
  assert.equal(parseAsenLauncherConfig("{"), undefined);
  for (const invalid of ['{"home":""}', '{"home":"  "}', '{"home":"x\\n"}', '{"home":"x","extra":true}', '{"home":7}']) {
    assert.equal(parseAsenLauncherConfig(invalid), undefined);
  }
  assert.match(asenLauncherConfigPath("x"), /\.asen/);
  assert.deepEqual(asenHomeSelectorFlags({ mode: "path", dir: "a b" }), ["--home", "a b"]);
});

test("public home command reloads persisted config and applies it on each invocation", async t => {
  const home = await mkdtemp(path.join(tmpdir(), "asen-config-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const file = asenLauncherConfigPath(home);
  await mkdir(path.dirname(file), { recursive: true });
  let output = "";
  const run = () => runAsen(["home"], {}, { homeDirectory: () => home, stdout: text => { output += text; } });
  await writeFile(file, '{"home":"link"}');
  assert.equal(await run(), 0);
  assert.equal(output, path.join(home, ".pi", "agent") + "\n");
  output = "";
  const configured = path.join(home, "custom agent");
  await writeFile(file, JSON.stringify({ home: configured }));
  assert.equal(await run(), 0);
  assert.equal(output, configured + "\n");
  assert.equal(await readAsenLauncherConfig(path.join(home, "missing")), undefined);
});

test("Pi runtime precedence and minimum version are deterministic", () => {
  assert.equal(resolvePiRuntime({ env: { ASEN_PI: "custom" }, bundled: "bundle", onPath: "pi", nodeExecPath: "node" })?.kind, "env");
  assert.equal(resolvePiRuntime({ env: {}, bundled: "bundle", onPath: "pi", nodeExecPath: "node" })?.kind, "bundled");
  assert.deepEqual(checkPiVersion("pi 1.2.0"), { ok: true, version: "1.2.0" });
  assert.deepEqual(checkPiVersion("pi 2.0.0"), { ok: true, version: "2.0.0" });
  assert.deepEqual(checkPiVersion("pi 1.1.0"), { ok: false, version: "1.1.0", message: "Pi 1.1.0 is older than required 1.2.0." });
  assert.deepEqual(checkPiVersion("unknown"), { ok: false, message: "Could not determine Pi version; minimum is 1.2.0." });
});

type SetupFixture = Awaited<ReturnType<typeof createSetupFixture>>;

async function createSetupFixture(t: test.TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "asen setup preview ü "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, "package root");
  const piPackage = path.join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent");
  const privateHome = path.join(root, "private home");
  const configuredHome = path.join(root, "configured agent home");
  const config = asenLauncherConfigPath(privateHome);
  const record = path.join(root, "fake-pi.json");
  await mkdir(path.join(piPackage, "dist"), { recursive: true });
  await mkdir(path.dirname(config), { recursive: true });
  await writeFile(path.join(piPackage, "package.json"), JSON.stringify({ type: "commonjs" }));
  await writeFile(
    path.join(piPackage, "dist", "cli.js"),
    'require("node:fs").writeFileSync(process.env.ASEN_TEST_PI_RECORD,JSON.stringify({args:process.argv.slice(2)}));',
  );
  const configBytes = JSON.stringify({ home: configuredHome });
  await writeFile(config, configBytes);
  const configStat = await stat(config, { bigint: true });
  const entries = (await readdir(root, { recursive: true })).sort();
  return { root, packageRoot, privateHome, configuredHome, config, record, configBytes, configStat, entries };
}

async function assertFixtureUnchanged(fixture: SetupFixture) {
  assert.equal(await readFile(fixture.config, "utf8"), fixture.configBytes);
  const afterStat = await stat(fixture.config, { bigint: true });
  assert.equal(afterStat.mtimeNs, fixture.configStat.mtimeNs);
  assert.deepEqual((await readdir(fixture.root, { recursive: true })).sort(), fixture.entries);
  await assert.rejects(readFile(fixture.record, "utf8"), { code: "ENOENT" });
}

async function invokeSetup(fixture: SetupFixture, args: string[]) {
  let stdout = "";
  let stderr = "";
  let homeLookups = 0;
  const code = await runAsen(
    ["--package-root", fixture.packageRoot, ...args],
    {
      SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT,
      PATH: path.dirname(process.execPath),
      ASEN_TEST_PI_RECORD: fixture.record,
    },
    {
      homeDirectory: () => {
        homeLookups++;
        return fixture.privateHome;
      },
      stdout: text => { stdout += text; },
      stderr: text => { stderr += text; },
    },
  );
  return { code, stdout, stderr, homeLookups };
}

function expectedSetupPlan(fixture: SetupFixture, agentHome = fixture.configuredHome) {
  return {
    schema: "asen.maintenance-plan/v1",
    operation: "setup",
    executable: false,
    packageRoot: fixture.packageRoot,
    prefix: path.join(fixture.privateHome, ".asen"),
    home: agentHome,
    steps: [
      { order: 1, intent: "stage", executable: false },
      { order: 2, intent: "verify", executable: false },
      { order: 3, intent: "activate", executable: false },
    ],
  };
}

test("setup --dry-run prints the exact stable read-only plan with private config precedence", async t => {
  const fixture = await createSetupFixture(t);
  const result = await invokeSetup(fixture, ["setup", "--dry-run"]);
  assert.deepEqual(result, {
    code: 0,
    stdout: JSON.stringify(expectedSetupPlan(fixture), null, 2) + "\n",
    stderr: "",
    homeLookups: 1,
  });
  await assertFixtureUnchanged(fixture);
});

test("setup execution requests fail before home, config, runtime, or filesystem effects", async t => {
  for (const args of [["setup"], ["setup", "--yes"]]) {
    await t.test(args.join(" "), async t => {
      const fixture = await createSetupFixture(t);
      const result = await invokeSetup(fixture, args);
      assert.deepEqual(result, {
        code: 2,
        stdout: "",
        stderr: "ASEN setup execution is not available yet; use --dry-run to inspect the plan.\n",
        homeLookups: 0,
      });
      await assertFixtureUnchanged(fixture);
    });
  }
});

test("unknown setup arguments fail before every setup effect", async t => {
  const fixture = await createSetupFixture(t);
  const result = await invokeSetup(fixture, ["setup", "--dry-run", "--future"]);
  assert.deepEqual(result, {
    code: 2,
    stdout: "",
    stderr: "Unsupported ASEN setup arguments.\n",
    homeLookups: 0,
  });
  await assertFixtureUnchanged(fixture);
});

test("setup --dry-run --yes remains preview-only and grants no execution authority", async t => {
  const fixture = await createSetupFixture(t);
  const result = await invokeSetup(fixture, ["setup", "--dry-run", "--yes"]);
  assert.deepEqual(result, {
    code: 0,
    stdout: JSON.stringify(expectedSetupPlan(fixture), null, 2) + "\n",
    stderr: "",
    homeLookups: 1,
  });
  await assertFixtureUnchanged(fixture);
});

test("setup preview propagates stdout callback failures unchanged", async t => {
  const fixture = await createSetupFixture(t);
  const callbackError = new Error("INJECTED_PREVIEW_STDOUT_FAILURE");
  let stderr = "";
  let homeLookups = 0;
  let outputAttempts = 0;

  await assert.rejects(
    runAsen(
      ["--package-root", fixture.packageRoot, "setup", "--dry-run"],
      {
        SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT,
        PATH: path.dirname(process.execPath),
        ASEN_TEST_PI_RECORD: fixture.record,
      },
      {
        homeDirectory: () => {
          homeLookups++;
          return fixture.privateHome;
        },
        stdout: () => {
          outputAttempts++;
          throw callbackError;
        },
        stderr: text => { stderr += text; },
      },
    ),
    error => {
      assert.equal(error, callbackError);
      return true;
    },
  );
  assert.deepEqual({ stderr, homeLookups, outputAttempts }, { stderr: "", homeLookups: 1, outputAttempts: 1 });
  await assertFixtureUnchanged(fixture);
});

test("setup preview retains explicit home precedence and isolated selector behavior", async t => {
  for (const selected of ["explicit", "isolated"] as const) {
    await t.test(selected, async t => {
      const fixture = await createSetupFixture(t);
      const explicitHome = path.join(fixture.root, "explicit agent home");
      const selector = selected === "explicit" ? ["--home", explicitHome] : ["--isolated"];
      const expectedHome = selected === "explicit" ? explicitHome : path.join(fixture.privateHome, ".asen", "agent");
      const result = await invokeSetup(fixture, [...selector, "setup", "--dry-run"]);
      assert.deepEqual(result, {
        code: 0,
        stdout: JSON.stringify(expectedSetupPlan(fixture, expectedHome), null, 2) + "\n",
        stderr: "",
        homeLookups: 1,
      });
      await assertFixtureUnchanged(fixture);
    });
  }
});

test("public help and version remain read-only with exact output", async () => {
  for (const [args, expected] of [[ ["--help"], ASEN_HELP ], [ ["--version"], "0.1.0\n" ]] as const) {
    let stdout = "";
    let stderr = "";
    assert.equal(await runAsen([...args], {}, {
      homeDirectory: () => { throw new Error("Read-only help/version must not inspect home"); },
      stdout: text => { stdout += text; },
      stderr: text => { stderr += text; },
    }), 0);
    assert.equal(stdout, expected);
    assert.equal(stderr, "");
  }
  assert.match(ASEN_HELP, /asen setup --dry-run.*preview/iu);
});
