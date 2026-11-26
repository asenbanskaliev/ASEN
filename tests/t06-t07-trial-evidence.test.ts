import test from "node:test";
import assert from "node:assert/strict";
import {assessT06T07Trial} from "../src/runtime/ui/t06-t07-trial-evidence.js";
const sha="a".repeat(40),model="nvidia/nemotron-3.5-lightning-30b-a3b";
const base=()=>({
 schema:"asen.t06.native-dual-writer/v1",sha,piVersion:"1.2.0",
 executionKind:"NATIVE_PI_RPC_WRITER_WITH_TWO_GITHUB_APPROVALS",
 consentMethod:"two-distinct-github-environment-human-approvals-not-native-pi-TUI",
 distinctWorktrees:true,distinctSessions:true,concurrent:true,
 autoRetry:false,autoMerge:false,accepted:false,globalFull:false,
 requestedModel:model,result:"PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW",
 workers:["a","b"].map(suffix=>({
  worker:"t06-writer-"+suffix,session:"t06-child-11111111-1111-4111-8111-11111111111"+(suffix==="a"?"1":"2"),
  scope:"t06-writer-"+suffix+".mjs",requestedModel:model,observedModel:model,
  processObserved:true,nativeResultOk:true,writeToolObserved:true,
  exactScope:true,syntaxOk:true,behaviorOk:true,attributionVerified:true,
  attributionEntries:1,writeStarts:1,writeSuccesses:1,writeFailures:0,
  passed:true,blockers:[],fileSha256:"b".repeat(64),durationMs:120
 }))
});
const evaluate=(report:unknown,uiTestPassed=true,expectedSha=sha)=>
 assessT06T07Trial({report,uiTestPassed,expectedSha});
test("T06+T07 admite solo recibos de dos Writers auténticos y deja TUI sin demostrar",()=>{
 const r=evaluate(base());
 assert.equal(r.status,"two-real-writers-ui-renderer-tests-only");
 assert.equal(r.nativePiWritersVerified,true);
 assert.equal(r.uiRendererTestedInSameRun,true);
 assert.equal(r.uiConnectedToLivePiSessions,false);
 assert.equal(r.realPiTuiObserved,false);
 assert.equal(r.durableChildTodoAttributionVerified,false);
 assert.equal(r.globalFull,false);
});
test("T06+T07 no confunde pruebas de UI offline con un ensayo nativo fallido",()=>{
 const r=evaluate(base(),false);
 assert.equal(r.status,"blocked");assert.deepEqual(r.blockers,["pruebas-ui-fallidas"]);
 assert.equal(r.nativePiWritersVerified,true);
 assert.equal(r.uiRendererTestedInSameRun,false);
});
test("T06+T07 rechaza 1 Worker, sesiones repetidas, modelos distintos y pruebas de escritura incompletas",()=>{
 const good=base();
 for(const broken of [
  {...good,workers:good.workers.slice(0,1)},
  {...good,workers:good.workers.map(w=>({...w,session:good.workers[0]!.session}))},
  {...good,workers:good.workers.map((w,i)=>i===1?{...w,observedModel:"nvidia/otro"}:w)},
  {...good,workers:good.workers.map((w,i)=>i===0?{...w,attributionVerified:false}:w)},
  {...good,workers:good.workers.map((w,i)=>i===0?{...w,writeStarts:2}:w)},
  {...good,workers:good.workers.map((w,i)=>i===0?{...w,fileSha256:"código falso"}:w)},
  {...good,concurrent:false},{...good,autoRetry:true},
  {...good,executionKind:"SIMULATED_PI"},
  {...good,consentMethod:"one-human-click"},
  {...good,accepted:true},{...good,globalFull:true},
  {...good,result:"PASS_WITHOUT_EVIDENCE"}
 ])assert.equal(evaluate(broken).status,"blocked");
});
test("T06+T07 rechaza SHA incorrecto, recibo nulo o atribución a otro candidato",()=>{
 assert.equal(evaluate(base(),true,"b".repeat(40)).status,"blocked");
 assert.equal(evaluate(base(),true,"bad").status,"blocked");
 assert.equal(evaluate(null).status,"blocked");
 assert.equal(evaluate({}).status,"blocked");
});
