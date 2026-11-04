/** EF-403: deterministic RED/GREEN/PRESERVE on one disposable fixture. No Writer. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,readFile,readdir,writeFile,lstat} from "node:fs/promises";
import {join} from "node:path";
import {prepare} from "./t12-real-agent-fixture.mjs";
export const correctedPaths=Object.freeze(["src/access.js","src/parse.js","src/pricing.js"]);
const correct={
 "src/access.js":'export function canEdit(user, document) {\n  if (!user || !document) return false;\n  return user.id === document.ownerId;\n}\n',
 "src/parse.js":'export function parseCount(value) {\n  if (typeof value !== "string" || !/^-?\\d+$/.test(value)) throw new Error("Invalid count");\n  const parsed = Number(value);\n  if (!Number.isSafeInteger(parsed)) throw new Error("Invalid count");\n  return parsed;\n}\n',
 "src/pricing.js":'export function calculateTotal(unitPrice, quantity, discount = 0) {\n  if (!Number.isFinite(unitPrice) || !Number.isInteger(quantity)) throw new Error("Invalid input");\n  return unitPrice * quantity - discount;\n}\n',
};
const cases=[
 {id:"authorization",code:'import assert from "node:assert/strict";import {canEdit} from "./src/access.js";assert.equal(canEdit({id:"viewer",role:"viewer"},{ownerId:"owner"}),false);'},
 {id:"parsing",code:'import assert from "node:assert/strict";import {parseCount} from "./src/parse.js";assert.throws(()=>parseCount("12abc"));'},
 {id:"pricing",code:'import assert from "node:assert/strict";import {calculateTotal} from "./src/pricing.js";assert.equal(calculateTotal(10,2,3),17);'}
];
const hash=s=>createHash("sha256").update(s).digest("hex");
const hashMap=files=>hash(Object.keys(files).sort().map(k=>k+"\0"+files[k]+"\0").join(""));
async function sources(fixture){
 const result={};
 for(const p of correctedPaths){const st=await lstat(join(fixture,p));
  assert.ok(st.isFile()&&!st.isSymbolicLink());result[p]=await readFile(join(fixture,p),"utf8");}
 return result;
}
function check(fixture,code){
 // The fixture assertions need no provider credentials or repository secrets.
 const env={...process.env};
 for(const key of Object.keys(env))if(/(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD)$/iu.test(key))delete env[key];
 const run=spawnSync(process.execPath,["--input-type=module","-e",code],{
  cwd:fixture,encoding:"utf8",timeout:12000,windowsHide:true,env});
 assert.equal(run.error,undefined);return {exitCode:run.status,assertion:/AssertionError/u.test(run.stderr),stderrHash:hash(run.stderr)};
}
export async function executeCorrectionFixture(root){
 const fixture=join(root,"fixture");await mkdir(fixture,{mode:0o700});
 await prepare(fixture);await writeFile(join(fixture,"package.json"),'{"type":"module"}\n',{flag:"wx",mode:0o600});
 const before=await sources(fixture),readme=await readFile(join(fixture,"README.md"));
 const red=cases.map(x=>({id:x.id,...check(fixture,x.code)}));
 assert.ok(red.every(x=>x.exitCode===1&&x.assertion),"All original tests must fail RED");
 for(const p of correctedPaths)await writeFile(join(fixture,p),correct[p]);
 const after=await sources(fixture),green=cases.map(x=>({id:x.id,...check(fixture,x.code)}));
 assert.deepEqual(after,correct);assert.ok(green.every(x=>x.exitCode===0),"All repaired tests must pass GREEN");
 assert.deepEqual(await readFile(join(fixture,"README.md")),readme);
 assert.deepEqual((await readdir(fixture)).sort(),["README.md","package.json","src"]);
 assert.deepEqual((await readdir(join(fixture,"src"))).sort(),["access.js","parse.js","pricing.js"]);
 const originalSha=hashMap(before),fixtureSha=hashMap(after);
 const preservedFiles=Object.freeze({readmeSha:hash(readme),packageSha:hash(await readFile(join(fixture,"package.json")))});
 assert.notEqual(originalSha,fixtureSha);
 return {fixture,before,after,red,green,originalSha,fixtureSha,testsSha:hash(JSON.stringify({red,green})),
   correctedPaths,preservedFiles,writerAuthorized:false,globalFull:false};
}
export async function confirmCorrectionUnchanged(e){
 assert.deepEqual(await sources(e.fixture),e.after,"Fixture changed after model acceptance");
 assert.equal(hashMap(await sources(e.fixture)),e.fixtureSha,"Exact corrected fixture SHA is stale");
 assert.deepEqual((await readdir(e.fixture)).sort(),["README.md","package.json","src"],
  "Unapproved fixture root entries appeared");
 assert.deepEqual((await readdir(join(e.fixture,"src"))).sort(),["access.js","parse.js","pricing.js"],
  "Unapproved source paths appeared");
 for(const [name,sha] of [["README.md",e.preservedFiles.readmeSha],
  ["package.json",e.preservedFiles.packageSha]]){
  const path=join(e.fixture,name),stat=await lstat(path);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink(),"Auxiliary fixture entry is not a regular file");
  assert.equal(hash(await readFile(path)),sha,"Unrelated fixture file changed: "+name);
 }
}
const exact=(x,keys)=>x&&typeof x==="object"&&!Array.isArray(x)&&Object.keys(x).sort().join("|")===keys.slice().sort().join("|");
const patterns={
 "src/access.js":[/owner|viewer/iu,/edit|authoriz|permission/iu],
 "src/parse.js":[/integer|pars|digit/iu,/trailing|reject|invalid|whole|suffix|strict/iu],
 "src/pricing.js":[/discount/iu,/subtract|deduct|reduc|less|minus/iu],
};
function grade(value,expected,verifier){
 const keys=["candidateSha","fixtureSha","verdict","paths","reasons",...(verifier?["reviewHash","testsSha"]:[])];
 assert.ok(exact(value,keys),"Unexpected review schema");
 assert.equal(value.candidateSha,expected.candidateSha);
 assert.equal(value.fixtureSha,expected.fixtureSha);
 assert.equal(value.verdict,"pass");
 assert.deepEqual(value.paths,correctedPaths,"Review scope changed");
 assert.ok(Array.isArray(value.reasons)&&value.reasons.length===3,"Exactly three reasons required");
 assert.deepEqual(value.reasons.map(r=>r?.path).sort(),correctedPaths,"Missing or duplicate reviewed file");
 for(const reason of value.reasons){
  assert.ok(exact(reason,["path","text"])&&typeof reason.text==="string"&&reason.text.length>=25&&reason.text.length<=800);
  assert.ok(patterns[reason.path].every(p=>p.test(reason.text)),"Reason is not file-specific");
 }
 if(verifier){assert.equal(value.reviewHash,expected.reviewHash);assert.equal(value.testsSha,expected.testsSha);}
 return {status:verifier?"PASS_REPAIRED_VERIFIER":"PASS_REPAIRED_REVIEWER",writerAuthorized:false,globalFull:false};
}
export const gradeCorrectedReviewer=(value,expected)=>grade(value,expected,false);
export const gradeCorrectedVerifier=(value,expected)=>grade(value,expected,true);
