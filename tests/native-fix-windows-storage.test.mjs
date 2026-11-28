import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import {once} from "node:events";
import {linkSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const source = fileURLToPath(new URL("./fixtures/g05-windows/private-store.c", import.meta.url));
function run(command, args, cwd) {
  const result = spawnSync(command, args, {cwd, encoding: "utf8", timeout: 30000});
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("G05: descriptores de objetos sintéticos privados en NTFS local", async (t) => {
  if (process.platform !== "win32") return t.skip("fixture exclusivo de Windows");
  if (run("where.exe", ["cl.exe"]).status !== 0) return t.skip("MSVC cl.exe no disponible en PATH");
  const work = mkdtempSync(join(tmpdir(), "g05-ntfs-"));
  t.after(() => rmSync(work, {recursive: true, force: true}));
  const binary = join(work, "private-store.exe");
  const build = run("cl.exe", ["/nologo", "/W4", "/WX", "/std:c11", "/Fe:private-store.exe",
    source, "Advapi32.lib"], work);
  assert.equal(build.status, 0, build.stdout + build.stderr);

  function setup(mode = "setup") {
    const cwd = mkdtempSync(join(work, "case-"));
    const result = run(binary, [mode], cwd);
    if (result.status === 77 && result.stderr.trim() === "local NTFS unavailable") return null;
    assert.equal(result.status, 0, result.stderr);
    return cwd;
  }
  function probe(cwd, reason = "") {
    assert.ok(cwd, "NTFS local dejó de estar disponible");
    const result = run(binary, ["probe"], cwd);
    assert.deepEqual([result.status, result.stdout, result.stderr.trim()], [reason ? 1 : 0, "", reason]);
  }
  const initial = setup();
  if (!initial) return t.skip("NTFS local no disponible en el directorio temporal");
  await t.test("acepta directorios y archivo privados", () => probe(initial));
  await t.test("rechaza un ACE adicional de lectura para Todos", () => probe(setup("broad"), "state:dacl"));
  await t.test("rechaza un directorio en lugar de archivo", () => probe(setup("type"), "state:type"));
  await t.test("rechaza un archivo privado con dos enlaces duros", () => {
    const cwd = setup();
    linkSync(join(cwd, "root", "origin", "state"), join(cwd, "root", "alias"));
    probe(cwd, "state:links");
  });
  await t.test("rechaza una junction a un directorio también privado", (sub) => {
    const cwd = setup();
    const origin = join(cwd, "root", "origin");
    const saved = join(cwd, "root", "saved");
    renameSync(origin, saved);
    try { symlinkSync(saved, origin, "junction"); }
    catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error.code)) {
        return sub.skip(`junction sintética no disponible: ${error.code}`);
      }
      throw error;
    }
    probe(cwd, "origin:reparse");
  });

  function session(sub, cwd, mode) {
    const child = spawn(binary, [mode], {cwd, timeout: 30000});
    let stdout = "", stderr = "", stdinError;
    const done = once(child, "close");
    const closed = done.then(([code, signal]) => ({code, signal, stdout, stderr, stdinError}));
    // A launch error will be asserted by the consumer or the cleanup hook.
    closed.catch(() => {});
    sub.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed;
    });
    child.stdin.on("error", (error) => { stdinError = error; });
    child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; });
    const first = new Promise((resolve) => {
      child.stdout.setEncoding("utf8").on("data", (data) => {
        stdout += data;
        if (stdout.includes("\n")) resolve(stdout.split("\n", 1)[0].trimEnd());
      });
    });
    return {
      child, closed,
      async expect(line) {
        const marker = await Promise.race([first, closed]);
        assert.equal(marker, line, `barrera ${line}: ${JSON.stringify(marker)}`);
      },
    };
  }
  function snapshot(cwd, byte) {
    const result = run(binary, ["snapshot"], cwd);
    assert.deepEqual([result.status, result.stderr], [0, ""]);
    const line = result.stdout.trim();
    assert.match(line, new RegExp(`^state ${byte} [A-F0-9]{8}:[A-F0-9]{8}:[A-F0-9]{8}$`));
    return line;
  }
  function entries(cwd) {
    return readdirSync(join(cwd, "root", "origin")).sort();
  }

  await t.test("dos escritores se serializan y solo el CAS vigente publica", async (sub) => {
    const cwd = setup("seed");
    const old = snapshot(cwd, "0");
    const first = session(sub, cwd, "write-a");
    await first.expect("flushed");
    const second = session(sub, cwd, "write-b");
    await second.expect("blocked");
    first.child.stdin.end("g");
    const a = await first.closed;
    const b = await second.closed;
    assert.ifError(a.stdinError);
    assert.deepEqual([a.code, a.signal, a.stderr], [0, null, ""]);
    assert.deepEqual([b.code, b.signal, b.stdout.trim(), b.stderr.trim()], [1, null, "blocked", "stale"]);
    const committed = snapshot(cwd, "A");
    assert.equal(a.stdout.trim().replace(/^flushed\r?\n/, ""), committed);
    assert.notEqual(old.split(" ")[2], committed.split(" ")[2]);
    assert.deepEqual(entries(cwd), ["lock", "state"]);
  });

  await t.test("terminar tras el flush conserva estado e identidad y rechaza el temporal huérfano", async (sub) => {
    const cwd = setup("seed");
    const old = snapshot(cwd, "0");
    const writer = session(sub, cwd, "write-a");
    await writer.expect("flushed");
    assert.equal(writer.child.kill("SIGKILL"), true);
    const killed = await writer.closed;
    assert.deepEqual([killed.code, killed.signal, killed.stdout.trim(), killed.stderr],
      [null, "SIGKILL", "flushed", ""]);
    assert.equal(snapshot(cwd, "0"), old);
    assert.deepEqual(entries(cwd), ["lock", "pending", "state"]);
    const retry = run(binary, ["write-b"], cwd);
    assert.deepEqual([retry.status, retry.stdout, retry.stderr.trim()], [1, "", "orphan"]);
    assert.equal(snapshot(cwd, "0"), old);
    assert.deepEqual(entries(cwd), ["lock", "pending", "state"]);
  });

  await t.test("el CAS no usa un lock con un segundo enlace duro", () => {
    const cwd = setup("seed");
    snapshot(cwd, "0");
    linkSync(join(cwd, "root", "origin", "lock"), join(cwd, "root", "alias"));
    const retry = run(binary, ["write-b"], cwd);
    assert.deepEqual([retry.status, retry.stdout, retry.stderr.trim()], [1, "", "lock:links"]);
    assert.deepEqual(entries(cwd), ["lock", "state"]);
  });
});
