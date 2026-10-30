import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Packaging verifier intentionally lives outside the runtime TypeScript project.
import {verifyPublicExports} from "../scripts/package-exports.mjs";

test("current public exports resolve through Node rather than just matching metadata",t=>{
  const dir=mkdtempSync(join(tmpdir(),"asen-exports-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const root=join(dir,"node_modules","asen"),pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
  mkdirSync(join(root,"extensions"),{recursive:true});mkdirSync(join(root,"skills","asen-safe-change"),{recursive:true});
  writeFileSync(join(root,"package.json"),JSON.stringify(pkg));
  copyFileSync(new URL("../extensions/asen.ts",import.meta.url),join(root,"extensions","asen.ts"));
  writeFileSync(join(root,"skills","asen-safe-change","SKILL.md"),"contract");
  assert.deepEqual(verifyPublicExports(dir),["asen/extensions","asen/skills/asen-safe-change"]);
  const alias=join(dir,"alias");symlinkSync(dir,alias,"junction");
  assert.deepEqual(verifyPublicExports(alias),["asen/extensions","asen/skills/asen-safe-change"],"canonical installation aliases must resolve the same exports");
  rmSync(alias);
  const outside=join(dir,"outside");mkdirSync(outside);writeFileSync(join(outside,"asen.ts"),"outside package");
  rmSync(join(root,"extensions"),{recursive:true});symlinkSync(outside,join(root,"extensions"),"junction");
  assert.throws(()=>verifyPublicExports(dir),/Packed public export mismatch/,"cached resolver paths cannot hide an escaping export symlink");
  rmSync(join(root,"extensions"));mkdirSync(join(root,"extensions"));copyFileSync(new URL("../extensions/asen.ts",import.meta.url),join(root,"extensions","asen.ts"));
  rmSync(join(root,"extensions","asen.ts"));assert.throws(()=>verifyPublicExports(dir),/Cannot find module|Packed public export mismatch/);
});
