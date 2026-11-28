import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import {once} from "node:events";
import {chmodSync, closeSync, constants, linkSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const source = fileURLToPath(new URL("./fixtures/g05-posix/private-store.c", import.meta.url));
const supported = ["linux", "darwin"].includes(process.platform);

test("G05: CAS de un origen sintético en un almacén privado POSIX", {
  skip: supported ? false : `fixture POSIX no disponible en ${process.platform}`,
}, async (t) => {
  const work = mkdtempSync(join(tmpdir(), "g05-posix-"));
  t.after(() => rmSync(work, {recursive: true, force: true}));
  const binary = join(work, "private-store");
  const build = spawnSync("cc", ["-std=gnu11", "-Wall", "-Wextra", "-Werror", source, "-o", binary],
    {cwd: work, encoding: "utf8", timeout: 15000});
  assert.ifError(build.error);
  assert.equal(build.status, 0, build.stderr);

  function fixture(sub, setup = () => {}) {
    const root = mkdtempSync(join(work, "root-"));
    const dir = join(root, "origin");
    const leaf = join(dir, "state");
    const lock = join(dir, "lock");
    mkdirSync(dir, 0o700);
    writeFileSync(leaf, "0", {mode: 0o600, flag: "wx"});
    writeFileSync(lock, "", {mode: 0o600, flag: "wx"});
    setup({root, dir, leaf, lock});
    const fd = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    sub.after(() => closeSync(fd));
    function run(args, marker) {
      const child = spawn(binary, args,
        {cwd: work, stdio: ["pipe", "pipe", "pipe", fd], timeout: 10000, killSignal: "SIGKILL"});
      let text = "";
      let diagnostics = "";
      let notify;
      const reached = marker && new Promise((resolve) => { notify = resolve; });
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        text += chunk;
        if (marker && text.includes(marker)) notify();
      });
      child.stderr.setEncoding("utf8").on("data", (chunk) => {
        diagnostics += chunk;
        if (marker && diagnostics.includes(marker)) notify();
      });
      child.stdin.on("error", () => {}); // La salida del hijo determina el resultado.
      const done = once(child, "close").then(([code, signal]) => ({code, signal, text, diagnostics}));
      const ready = marker && Promise.race([reached, done.then((result) => {
        throw new Error(`Falta barrera ${marker.trim()}: ${JSON.stringify(result)}`);
      })]);
      sub.after(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await done;
      });
      return {child, ready, done};
    }
    return {dir, leaf, run};
  }

  await t.test("dos procesos compiten: un éxito y un CAS obsoleto sin mutación", async (sub) => {
    const {dir, leaf, run} = fixture(sub);
    const lockInode = statSync(join(dir, "lock"), {bigint: true}).ino;
    const winner = run(["hold", "0", "1"], "ready\n");
    await winner.ready;
    const loser = run(["cas", "0", "2"], "blocked\n");
    await loser.ready;
    assert.equal(readFileSync(leaf, "utf8"), "0");
    const winnerInode = statSync(join(dir, "pending"), {bigint: true}).ino;
    winner.child.stdin.end("g");
    assert.deepEqual(await winner.done, {code: 0, signal: null, text: "", diagnostics: "ready\n"});
    assert.deepEqual(await loser.done, {code: 2, signal: null, text: "", diagnostics: "blocked\n"});
    assert.deepEqual(await run(["read"]).done, {code: 0, signal: null, text: "1", diagnostics: ""});
    assert.equal(statSync(dir).mode & 0o7777, 0o700);
    assert.equal(statSync(leaf).mode & 0o7777, 0o600);
    assert.equal(statSync(leaf).nlink, 1);
    assert.equal(statSync(leaf, {bigint: true}).ino, winnerInode);
    assert.equal(statSync(join(dir, "lock"), {bigint: true}).ino, lockInode);
  });

  await t.test("SIGKILL después de fsync temporal y antes del reemplazo", async (sub) => {
    const {dir, leaf, run} = fixture(sub);
    const oldInode = statSync(leaf, {bigint: true}).ino;
    const writer = run(["hold", "0", "1"], "ready\n");
    await writer.ready;
    assert.equal(readFileSync(join(dir, "pending"), "utf8"), "1");
    assert.equal(writer.child.kill("SIGKILL"), true);
    assert.equal((await writer.done).signal, "SIGKILL");
    assert.deepEqual(await run(["read"]).done, {code: 0, signal: null, text: "0", diagnostics: ""});
    // No reutiliza el temporal huérfano.
    assert.deepEqual(await run(["cas", "0", "2"]).done, rejected("pending"));
    assert.equal(readFileSync(leaf, "utf8"), "0");
    assert.equal(statSync(leaf, {bigint: true}).ino, oldInode);
    assert.equal(readFileSync(join(dir, "pending"), "utf8"), "1");
  });

  function rejected(stage) {
    return {code: 1, signal: null, text: "", diagnostics: `${stage}\n`};
  }
  const invalid = [
    ["raíz no privada", "root", ({root}) => chmodSync(root, 0o755)],
    ["hijo no privado", "origin", ({dir}) => chmodSync(dir, 0o750)],
    ["hoja no privada", "state", ({leaf}) => chmodSync(leaf, 0o640)],
    ["hijo simbólico", "origin", ({dir, root}) => {
      renameSync(dir, join(root, "saved"));
      symlinkSync("saved", dir);
    }],
    ["hoja con enlace duro", "state", ({leaf, root}) => linkSync(leaf, join(root, "alias"))],
    ["hoja simbólica", "state", ({leaf, root}) => {
      renameSync(leaf, join(root, "saved"));
      symlinkSync("../saved", leaf);
    }],
    ["cerrojo con enlace duro", "lock", ({lock, root}) => linkSync(lock, join(root, "alias"))],
    ["temporal simbólico preexistente", "pending", ({dir}) => symlinkSync("state", join(dir, "pending"))],
  ];
  await t.test("rechaza entrada fuera del alfabeto sintético", async (sub) => {
    const {leaf, run} = fixture(sub);
    assert.deepEqual(await run(["cas", "0", "12"]).done, rejected("input"));
    assert.equal(readFileSync(leaf, "utf8"), "0");
  });
  for (const [label, stage, corrupt] of invalid) {
    await t.test(`rechaza ${label}`, async (sub) => {
      const {leaf, run} = fixture(sub, corrupt);
      assert.deepEqual(await run(["cas", "0", "1"]).done, rejected(stage));
      assert.equal(readFileSync(leaf, "utf8"), "0");
    });
  }
});
