import test from "node:test";
import assert from "node:assert/strict";
import {C01_PROMPT,gradeRealC01} from "../scripts/r4-two-pi-beam-c01.mjs";
import {createHash} from "node:crypto";
const sha="a".repeat(40),ref="1f74e9e24473e7e121a96b1680444ae0196d3009";
const digest=x=>createHash("sha256").update(x).digest("hex");
const witness=source=>({source,candidateSha:sha,referenceSha:ref,
 promptDigest:digest(C01_PROMPT),hostVersion:"1.2.0",
 provider:"ollama-cloud",model:"beam:cloud",fixtureFingerprint:"a".repeat(64),
 projectUnchanged:true,sessionStarted:true,agentEnded:true,agentStarts:1,toolCalls:0,
 answerDigest:digest("5"),answerSample:"5",answerChars:1,
 outputDigest:digest("real native Pi source transcript"),humanConsent:false});
const both=()=>({SHELL:witness("SHELL"),ASEN:witness("ASEN")});
const grade=(records=both(),args={})=>gradeRealC01({
 candidateSha:sha,referenceSha:ref,records,runId:"44",runAttempt:"1",...args});
test("R4-04 two genuine Beam turns remain observational, never independent/full",()=>{
 const r=grade();
 assert.equal(r.caseId,"C01");
 assert.equal(r.status,"TWO_REAL_MODEL_TURNS_OBSERVED_REVIEW_REQUIRED");
 assert.equal(r.sourceSlotsCaptured,2);
 assert.equal(r.requiredSlotsTotal,40);
 assert.equal(r.certifiedFullCases,0);
 assert.equal(r.independentReviewPerformed,false);
 assert.equal(r.writerAuthorized,false);
 assert.equal(r.globalFull,false);
 assert.deepEqual(r.sourceAnswers.map(x=>x.source),["SHELL","ASEN"]);
});
test("R4-04 forged model, missing output, extra model turn, foreign reference and paid fallback fail",()=>{
 for(const change of [
  r=>r.SHELL.model="gpt-4o",
  r=>r.ASEN.model="deepseek-paid",
  r=>r.ASEN.answerSample="",
  r=>r.SHELL.answerChars=0,
  r=>r.SHELL.toolCalls=1,
  r=>r.ASEN.agentStarts=3,
  r=>r.ASEN.agentEnded=false,
  r=>r.SHELL.humanConsent=true,
  r=>r.SHELL.projectUnchanged=false,
  r=>r.ASEN.promptDigest="0".repeat(64),
  r=>r.SHELL.referenceSha="b".repeat(40),
  r=>r.ASEN.fixtureFingerprint="f".repeat(64),
 ]){const rec=both();change(rec);assert.throws(()=>grade(rec));}
});
test("R4-04 cannot count a third runtime or skip the exact Pi source identity",()=>{
 const invalid={...both(),B:witness("B")};
 assert.throws(()=>grade(invalid));
 assert.throws(()=>grade(both(),{candidateSha:"invalid"}));
 assert.throws(()=>grade(both(),{runId:"0"}));
 assert.throws(()=>grade(both(),{referenceSha:"b".repeat(40)}));
});
