import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error Standalone JS acceptance contract intentionally has no declarations.
import {executeCorrectionFixture,confirmCorrectionUnchanged,gradeCorrectedReviewer,gradeCorrectedVerifier,correctedPaths,classifyRevalidationFailure} from "../scripts/t12-revalidation-contract.mjs";
const sha="a".repeat(40),fixtureSha="b".repeat(64),reviewHash="c".repeat(64),testsSha="d".repeat(64);
const reasons=[
 {path:"src/access.js",text:"Editing is now limited to the correct document owner, even when the user is a viewer."},
 {path:"src/parse.js",text:"Strict integer parsing rejects invalid trailing suffixes, rather than accepting prefixes."},
 {path:"src/pricing.js",text:"Subtracting the discount now reduces the resulting total instead of adding it."},
];
const reviewer=()=>({candidateSha:sha,fixtureSha,verdict:"pass",paths:[...correctedPaths],reasons:structuredClone(reasons)});
const verifier=()=>({...reviewer(),reviewHash,testsSha});
test("EF-403 tests RED 3/3, repaired GREEN 3/3 and preservation without Pi Writer",{timeout:90000},async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-ef403-green-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const result=await executeCorrectionFixture(root);
 assert.deepEqual(result.red.map((r:{exitCode:number})=>r.exitCode),[1,1,1]);
 assert.deepEqual(result.green.map((r:{exitCode:number})=>r.exitCode),[0,0,0]);
 assert.equal(result.writerAuthorized,false);
 assert.equal(result.globalFull,false);
 await confirmCorrectionUnchanged(result);
 const originalReadme=readFileSync(join(result.fixture,"README.md"));
 await writeFile(join(result.fixture,"README.md"),"tampered unrelated content");
 await assert.rejects(()=>confirmCorrectionUnchanged(result),/Unrelated fixture file changed/u);
 await writeFile(join(result.fixture,"README.md"),originalReadme);
 const originalPackage=readFileSync(join(result.fixture,"package.json"));
 await writeFile(join(result.fixture,"package.json"),'{"type":"commonjs"}');
 await assert.rejects(()=>confirmCorrectionUnchanged(result),/Unrelated fixture file changed/u);
 await writeFile(join(result.fixture,"package.json"),originalPackage);
 await confirmCorrectionUnchanged(result);
 await writeFile(join(result.fixture,"src/pricing.js"),"tampered content");
 await assert.rejects(()=>confirmCorrectionUnchanged(result),/Fixture changed/u);
});
test("EF-502 accepts exact candidate and model responses only, without authority",()=>{
 const expected={candidateSha:sha,fixtureSha,reviewHash,testsSha};
 assert.equal(gradeCorrectedReviewer(reviewer(),expected).status,"PASS_REPAIRED_REVIEWER");
 const receipt=gradeCorrectedVerifier(verifier(),expected);
 assert.equal(receipt.status,"PASS_REPAIRED_VERIFIER");
 assert.equal(receipt.globalFull,false);
 const mutations:Array<(x:any)=>void>=[
  x=>x.candidateSha="f".repeat(40),
  x=>x.fixtureSha="f".repeat(64),
  x=>x.reviewHash="f".repeat(64),
  x=>x.testsSha="f".repeat(64),
  x=>x.verdict="fail",
  x=>x.paths.pop(),
  x=>x.reasons.pop(),
  x=>x.reasons[0].path="src/pricing.js",
  x=>x.reasons[2].text="This looks fine",
  x=>x.reasons[1].text="Nothing changed, not related",
  x=>x.writerAuthorized=true,
 ];
 for(const [i,mutate] of mutations.entries()){
  const response=verifier();mutate(response);
  assert.throws(()=>gradeCorrectedVerifier(response,expected),Error,"negative "+i);
 }
});
test("EF-502 opt-in separate two-call Beam lane is pinned, write-disabled and not rerunnable",()=>{
 const wf=readFileSync(new URL("../.github/workflows/asen-real-agent-acceptance.yml",import.meta.url),"utf8");
 const start=wf.indexOf("  real-repaired-review:");
 const end=wf.indexOf("  real-provider-acceptance:",start+1);
 assert.ok(start>0&&end>start,"Dedicated bounded job must exist");
 const section=wf.slice(start,end);
 for(const key of ["github.run_attempt == 1","environment: ollama-cloud-beam",
  "ci: one-time Pi repaired-review Beam proof","ASEN_EXPECTED_SHA: $"+"{{ github.sha }}",
  "scripts/t12-real-repair-revalidation.mjs","persist-credentials: false"])assert.ok(section.includes(key),key);
 assert.doesNotMatch(section,/writerAuthorized: true|GROQ_API_KEY|OPENROUTER_API_KEY/iu);
});


test("EF-403 failure receipt classifies sanitized Pi errors without recording provider text",()=>{
 const cases:Array<[Record<string,string>,string]>=[
  [{output:"HTTP 429 too many requests; token secret-must-not-escape"},"PROVIDER_QUOTA_OR_RATE_LIMIT"],
  [{output:"401 unauthorized invalid api key"},"PROVIDER_AUTH_REJECTED"],
  [{output:"HTTP 402 payment required"},"BILLING_OR_PAID_PROVIDER_REJECTED"],
  [{output:"ECONNRESET fetch failed"},"PROVIDER_NETWORK_OR_UPSTREAM_FAILURE"],
  [{message:"Pi artifact RPC stream is malformed"},"ROLE_RPC_OR_ARTIFACT_CONTRACT_FAILURE"],
  [{errorName:"AssertionError"},"ROLE_RESULT_OR_GRADE_REJECTED"],
 ];
 for(const [input,expected] of cases){
  const code=classifyRevalidationFailure(input);
  assert.equal(code,expected);
  assert.doesNotMatch(code,/secret|token|429|401|402|ECONNRESET/u);
 }
});
