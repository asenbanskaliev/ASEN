import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

const workflow=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");
const nodeBlock=/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE\n/u.exec(workflow)?.[1];
if(!nodeBlock)throw new Error("The T05 provider validation block is missing");
const validator=nodeBlock.replace(/^ {10}/gmu,"");

function runValidator(output:string){
 const directory=mkdtempSync(join(tmpdir(),"asen-t05-provider-contract-"));
 try{
  writeFileSync(join(directory,"review-output.json"),output);
  writeFileSync(join(directory,"candidate.diff.sha256"),"a".repeat(64)+"  candidate.diff\n");
  const result=spawnSync(process.execPath,["--input-type=module"],{input:validator,encoding:"utf8",timeout:10000,
   env:{...process.env,ASEN_T05_EVIDENCE_DIR:directory,ASEN_EXPECTED_SHA:"b".repeat(40),ASEN_T05_BASE_SHA:"c".repeat(40)}});
  if(result.error)throw result.error;
  const receipt=existsSync(join(directory,"review-evidence.json"))?JSON.parse(readFileSync(join(directory,"review-evidence.json"),"utf8")):undefined;
  return {status:result.status,stdout:result.stdout,stderr:result.stderr,receipt};
 }finally{rmSync(directory,{recursive:true,force:true});}
}

test("review prompt names the description field and treats unresolved serious security defects as blocking",()=>{
 const prompt=/cat <<'PROMPT'\n([\s\S]*?)\n\s*PROMPT/u.exec(workflow)?.[1];
 assert.ok(prompt);
 assert.match(prompt,/"description":"nonempty reproducible explanation"/u);
 assert.match(prompt,/do not use explanation in place of description/u);
 assert.match(prompt,/previously identified security defect if it remains unresolved/u);
 assert.match(prompt,/documenting a known security defect does not make it nonblocking/u);
});

test("explanation instead of description fails closed with a field-only diagnostic",()=>{
 const secret="DO_NOT_LOG_REVIEW_CONTENT";
 const result=runValidator(JSON.stringify({verdict:"pass",summary:secret,findings:[{severity:"high",path:"target",explanation:secret}]}));
 assert.notEqual(result.status,0);assert.equal(result.receipt,undefined);
 assert.match(result.stderr,/Reviewer finding at index 0 is missing a nonempty description/u);
 assert.ok(!result.stderr.includes(secret));assert.ok(!result.stdout.includes(secret));
});

test("invalid JSON fails without including the model response in the error",()=>{
 const secret="DO_NOT_LOG_INVALID_RESPONSE";
 const result=runValidator(`{"summary":"${secret}",`);
 assert.notEqual(result.status,0);assert.equal(result.receipt,undefined);
 assert.match(result.stderr,/Reviewer output is not valid JSON/u);
 assert.ok(!result.stderr.includes(secret));assert.ok(!result.stdout.includes(secret));
});

test("a finding with a blank path is rejected without a receipt",()=>{
 const result=runValidator(JSON.stringify({verdict:"fail",summary:"Fixture",findings:[{severity:"high",path:"  ",description:"Missing traceable location"}]}));
 assert.notEqual(result.status,0);assert.equal(result.receipt,undefined);
 assert.match(result.stderr,/Reviewer finding at index 0 has invalid path/u);
});

test("a valid high-severity finding cannot pass, and a fail remains a failure with evidence",()=>{
 const finding={severity:"high",path:"target",description:"A reproducible problem"};
 const passing=runValidator(JSON.stringify({verdict:"pass",summary:"Fixture",findings:[finding]}));
 assert.notEqual(passing.status,0);assert.equal(passing.receipt,undefined);
 assert.match(passing.stderr,/Reviewer cannot pass with blocking findings/u);
 const failing=runValidator(JSON.stringify({verdict:"fail",summary:"Fixture",findings:[finding]}));
 assert.equal(failing.status,2);assert.equal(failing.receipt.reviewerOutput.verdict,"fail");
 assert.equal(failing.receipt.reviewerOutput.findings[0].severity,"high");
});

test("a valid pass without findings retains exact candidate identity",()=>{
 const result=runValidator(JSON.stringify({verdict:"pass",summary:"Fixture",findings:[]}));
 assert.equal(result.status,0);assert.equal(result.receipt.candidateSha,"b".repeat(40));
 assert.equal(result.receipt.baseSha,"c".repeat(40));assert.equal(result.receipt.diffSha256,"a".repeat(64));
 assert.equal(result.receipt.reviewerOutput.verdict,"pass");
});
