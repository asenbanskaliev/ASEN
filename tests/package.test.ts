import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("package exposes only Pi extension/skills and owned runtime files", async()=>{
  const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
  assert.deepEqual(pkg.pi.extensions,["./extensions"]);
  assert.deepEqual(pkg.pi.skills,["./skills"]);
  assert.deepEqual(pkg.files,["extensions/","src/","skills/"]);
  assert.ok(!Object.keys(pkg.dependencies ?? {}).some((x)=>/gentle/i.test(x)));
  assert.ok(!Object.keys(pkg.peerDependencies ?? {}).some((x)=>/gentle/i.test(x)));
});
