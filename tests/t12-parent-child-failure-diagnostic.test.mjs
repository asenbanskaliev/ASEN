import test from "node:test";
import assert from "node:assert/strict";
import {summarizeRealChildParentFailure} from "../scripts/t12-real-child-parent-grade.mjs";
const sha="a".repeat(40);
test("E2B: al fallar el padre se conserva un diagnóstico acotado, sin datos privados",()=>{
 const secret="SECRET_MODEL_OUTPUT_AND_TOKEN";
 const events=[
  {kind:"child_pi_started",pid:1234,rawOutput:secret},
  {kind:"child_pi_finished",output:secret},
  {kind:"result_enqueued",text:secret},
  {kind:"parent_turn_start",prompt:secret},
 ];
 const report=summarizeRealChildParentFailure({
  candidateSha:sha,model:"beam:cloud",route:"idle",events,
  error:new Error("status_inspected must be observed exactly once: "+secret),
  journalObserved:true
 });
 assert.equal(report.status,"FAIL_OR_INCOMPLETE");
 assert.equal(report.failureCode,"PARENT_STATUS_NOT_OBSERVED");
 assert.equal(report.counts.child_pi_started,1);
 assert.equal(report.counts.status_inspected,0);
 assert.equal(report.journalObserved,true);
 assert.equal(report.autoRetry,false);
 assert.equal(report.writerAuthorized,false);
 assert.equal(report.globalFull,false);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(secret));
});
test("E2B: rechaza variantes ajenas y no declara éxito sin eventos",()=>{
 for(const input of [
  {candidateSha:"mal",model:"beam",route:"idle",events:[]},
  {candidateSha:sha,model:"de-pago",route:"idle",events:[]},
  {candidateSha:sha,model:"beam",route:"desconocido",events:[]},
  {candidateSha:sha,model:"beam",route:"idle",events:Array(501).fill({kind:"x"})},
 ])assert.throws(()=>summarizeRealChildParentFailure(input));
 const result=summarizeRealChildParentFailure({
  candidateSha:sha,model:"beam",route:"busy",events:[],
  error:new Error("Ninguna evidencia observada"),journalObserved:false
 });
 assert.equal(result.failureCode,"OTHER_FAILURE");
 assert.equal(result.counts.result_enqueued,0);
 assert.equal(result.modelOutputSaved,false);
 assert.equal(result.credentialsSaved,false);
});
