import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {linkSync, mkdtempSync, renameSync, rmSync, symlinkSync} from "node:fs";
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
});
