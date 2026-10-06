import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("package exposes only Pi extension/skills and owned runtime files", async()=>{
  const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
  assert.deepEqual(pkg.pi.extensions,["./extensions"]);
  assert.deepEqual(pkg.pi.skills,["./skills"]);
  assert.deepEqual(pkg.files,["extensions/","src/","skills/"]);
  assert.deepEqual(pkg.exports,{"./extensions":"./extensions/asen.ts","./skills/*":"./skills/*/SKILL.md"});
  assert.equal(Object.values(pkg.exports).some((value)=>String(value).includes("src/")),false);
  const forbidden=new RegExp("gen"+"tle","i");
  assert.ok(!Object.keys(pkg.dependencies ?? {}).some((x)=>forbidden.test(x)));
  assert.ok(!Object.keys(pkg.peerDependencies ?? {}).some((x)=>forbidden.test(x)));
});
