/** Disposable, deterministic read-only coding fixture for T12 real-model acceptance.
 * This script never invokes a provider or grants writing authority.
 * Usage:
 *   node scripts/t12-real-agent-fixture.mjs prepare <absolute-dir>
 *   node scripts/t12-real-agent-fixture.mjs grade <absolute-dir> <response-json-file>
 *
 * The model response MUST be JSON: {"findings":[{"id":"...","path":"...","reason":"..."}]}.
 */
import assert from "node:assert/strict";
import {readFile, mkdir, writeFile, readdir, realpath, lstat} from "node:fs/promises";
import {resolve, join, isAbsolute} from "node:path";
import {createHash} from "node:crypto";

const files = Object.freeze({
  "src/pricing.js": `export function calculateTotal(unitPrice, quantity, discount = 0) {
  if (!Number.isFinite(unitPrice) || !Number.isInteger(quantity)) throw new Error("Invalid input");
  return unitPrice * quantity + discount;
}
`,
  "src/access.js": `export function canEdit(user, document) {
  if (!user || !document) return false;
  return user.id === document.ownerId || user.role === "viewer";
}
`,
  "src/parse.js": `export function parseCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error("Invalid count");
  return parsed;
}
`,
  "README.md": `# T12 temporary code-review fixture

Read-only exercise. Identify three independent defects from source code.
Do not modify files, execute network requests, or use secrets.
Respond with a JSON object: {"findings":[{"id":"pricing","path":"src/pricing.js","reason":"..."},{"id":"authorization","path":"src/access.js","reason":"..."},{"id":"parsing","path":"src/parse.js","reason":"..."}]}.
`,
});
const expected=Object.freeze({
  pricing:"src/pricing.js",
  authorization:"src/access.js",
  parsing:"src/parse.js",
});
// Require defect-specific reasoning, not merely known IDs and file paths.
const reasonSignals=Object.freeze({
 pricing:[/discount/iu,/add|plus|subtract|reduc|increas|decreas|inflat|overcharg/iu],
 authorization:[/viewer/iu,/edit|authoriz|allow|permission|own/iu],
 parsing:[/pars|integer|digit|input|number/iu,/trail|suffix|junk|prefix|non.?digit|invalid|malform|abc/iu],
});
const sha=s=>createHash("sha256").update(s).digest("hex");
function target(args){
  const dir=args[0];
  assert.ok(dir && isAbsolute(dir),"Fixture path must be absolute");
  assert.ok(!dir.includes("\0"),"Invalid fixture path");
  return resolve(dir);
}
async function prepare(dir){
  await mkdir(dir,{recursive:true});
  const existing=await readdir(dir);
  assert.equal(existing.length,0,"Fixture destination must be initially empty");
  for(const [name,body] of Object.entries(files)){
    const out=join(dir,name);
    await mkdir(resolve(out,".."),{recursive:true});
    await writeFile(out,body,{flag:"wx",mode:0o600});
  }
  return {fixture:await realpath(dir),manifest:Object.fromEntries(Object.entries(files).map(([p,s])=>[p,sha(s)])),expectedIds:Object.keys(expected)};
}
async function assertFixtureTreeUnchanged(dir){
  const root=await lstat(dir);
  assert.ok(root.isDirectory()&&!root.isSymbolicLink(),"Fixture root must be a real directory");
  const rootNames=(await readdir(dir)).sort();
  assert.deepEqual(rootNames,["README.md","src"],"Fixture root contains missing or unexpected entries");
  const srcDir=join(dir,"src");
  const srcStat=await lstat(srcDir);
  assert.ok(srcStat.isDirectory()&&!srcStat.isSymbolicLink(),"Fixture src must be a real directory");
  const sourceNames=(await readdir(srcDir)).sort();
  assert.deepEqual(sourceNames,["access.js","parse.js","pricing.js"],"Fixture src contains missing or unexpected entries");
  for(const name of Object.keys(files)){
    const stat=await lstat(join(dir,name));
    assert.ok(stat.isFile()&&!stat.isSymbolicLink(),`Fixture entry is not a regular file: ${name}`);
  }
}
async function grade(dir,responseFile){
  await assertFixtureTreeUnchanged(dir);
  const observed=Object.fromEntries(await Promise.all(Object.keys(files).map(async p=>[p,sha(await readFile(join(dir,p),"utf8"))])));
  for(const [p,s] of Object.entries(files))assert.equal(observed[p],sha(s),`Fixture was modified: ${p}`);
  const parsed=JSON.parse(await readFile(responseFile,"utf8"));
  assert.ok(parsed && Array.isArray(parsed.findings),"Model output must include findings[]");
  const accepted=new Set();
  let valid=parsed.findings.length===Object.keys(expected).length;
  for(const finding of parsed.findings){
    if(!finding || typeof finding!=="object" || Array.isArray(finding) ||
       Object.keys(finding).sort().join(",")!=="id,path,reason" ||
       typeof finding.id!=="string" || !Object.hasOwn(expected,finding.id) ||
       accepted.has(finding.id) || finding.path!==expected[finding.id] ||
       typeof finding.reason!=="string" || finding.reason.trim().length<20 ||
       !reasonSignals[finding.id].every(pattern=>pattern.test(finding.reason))){
      valid=false;
      continue;
    }
    accepted.add(finding.id);
  }
  return {passed:valid&&accepted.size===Object.keys(expected).length,found:[...accepted].sort(),expected:Object.keys(expected).sort(),fixtureUnchanged:true};
}
if(process.argv[1]?.endsWith("t12-real-agent-fixture.mjs")){
  const [operation,...args]=process.argv.slice(2);
  const dir=target(args);
  const result=operation==="prepare"?await prepare(dir):operation==="grade"?await grade(dir,args[1]):(()=>{throw new Error("Unknown operation");})();
  console.log(JSON.stringify(result));
  if(operation==="grade"&&!result.passed)process.exitCode=1;
}
export {prepare,grade};
