import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error The disposable fixture helper is JavaScript-only.
import {prepare,grade} from "../scripts/t12-real-agent-fixture.mjs";

test("T12 bounded correction reference fixes deliberate defects without granting a Pi writer",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-t12-reference-correction-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const fixture=join(root,"fixture");
 await prepare(fixture);
 const answer=join(root,"answer.json");
 const findings=[
  {id:"pricing",path:"src/pricing.js",reason:"The discount is added to the price rather than reducing the total."},
  {id:"authorization",path:"src/access.js",reason:"The viewer role can incorrectly edit a document owned by a different user."},
  {id:"parsing",path:"src/parse.js",reason:"The parser accepts a number prefix and ignores trailing junk characters."}
 ];
 await writeFile(answer,JSON.stringify({findings}));
 assert.equal((await grade(fixture,answer)).passed,true,"The original fixture must expose all three defects");
 const repaired={
  "src/pricing.js":'export function calculateTotal(unitPrice, quantity, discount = 0) {\n  if (!Number.isFinite(unitPrice) || !Number.isInteger(quantity)) throw new Error("Invalid input");\n  return unitPrice * quantity - discount;\n}\n',
  "src/access.js":'export function canEdit(user, document) {\n  if (!user || !document) return false;\n  return user.id === document.ownerId;\n}\n',
  "src/parse.js":'export function parseCount(value) {\n  if (typeof value !== "string" || !/^-?\\d+$/.test(value)) throw new Error("Invalid count");\n  const parsed = Number(value);\n  if (!Number.isSafeInteger(parsed)) throw new Error("Invalid count");\n  return parsed;\n}\n',
 };
 for(const [relative,source] of Object.entries(repaired))await writeFile(join(fixture,relative),source);
 await writeFile(join(fixture,"package.json"),'{"type":"module"}\n');
 const checks=[
  'import assert from "node:assert/strict";',
  'import {calculateTotal} from "./src/pricing.js";',
  'import {canEdit} from "./src/access.js";',
  'import {parseCount} from "./src/parse.js";',
  'assert.equal(calculateTotal(10,2,3),17);',
  'assert.equal(canEdit({id:"viewer",role:"viewer"},{ownerId:"other"}),false);',
  'assert.equal(canEdit({id:"owner",role:"viewer"},{ownerId:"owner"}),true);',
  'assert.equal(parseCount("12"),12);',
  'assert.equal(parseCount("-4"),-4);',
  'assert.throws(()=>parseCount("12abc"),/Invalid count/);',
  'assert.throws(()=>parseCount("9007199254740992"),/Invalid count/);'
 ].join("\n");
 const child=spawnSync(process.execPath,["--input-type=module","-e",checks],{
  cwd:fixture,encoding:"utf8",timeout:10000,
 });
 assert.equal(child.status,0,child.stderr.slice(0,1200));
 for(const [relative,source] of Object.entries(repaired))
  assert.equal(await readFile(join(fixture,relative),"utf8"),source);
 await assert.rejects(()=>grade(fixture,answer),
  /Fixture root contains missing or unexpected entries|Fixture was modified/,
  "A changed fixture cannot be reported as the original unchanged snapshot");
});
