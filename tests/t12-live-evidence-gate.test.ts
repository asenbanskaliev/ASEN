import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error JavaScript-only exact-SHA real-provider evidence helper.
import {gradeLiveAcceptanceEvidence} from "../scripts/t12-live-evidence-gate.mjs";

const sha="a".repeat(40),model="beam";
const explorer={passed:true,status:"PASS",provider:"ollama-cloud",model,candidateSha:sha,
 inferenceCall:1,inferenceLimit:5,toolsAllowed:false,writerAuthorized:false,fixtureUnchanged:true};
const planner={passed:true,provider:"ollama-cloud",model,candidateSha:sha,
 inferenceCall:2,inferenceLimit:5,toolsAllowed:false,writerAuthorized:false,authorization:"NOT_GRANTED",taskCount:3};
const review={passed:true,status:"PASS_NEGATIVE_REJECTION",provider:"ollama-cloud",model,candidateSha:sha,
 toolsAllowed:false,writerAuthorized:false,authorization:"NOT_GRANTED",
 reviewer:[{grade:{passed:true,findings:[1,2,3]}},{grade:{passed:true,findings:[1,2,3]}}],
 verifier:{grade:{passed:true,verdict:"fail",checkCount:3,findingCount:3}}};
const budget={limit:5,reserved:5,remaining:0,authorization:"NOT_GRANTED"};
const ready=()=>({sha,model,maxCalls:5,budget,explorer,planner,review});

test("T12 only exact-SHA real graded evidence can yield bounded read-only PASS",()=>{
 const result=gradeLiveAcceptanceEvidence(ready());
 assert.equal(result.status,"PASS_BOUNDED_READ_ONLY");
 assert.equal(result.verifier,"PASS_NEGATIVE_REJECTION");
 assert.equal(result.writer,"BLOCKED_INTERACTIVE");
 assert.equal(result.authorization,"NOT_GRANTED");
 assert.equal(result.independentAudit,"NOT_PERFORMED");
 assert.equal(result.liveProviderRecovery,"NOT_VERIFIED");
});
test("T12 missing real verifier, wrong SHA, changed model and incomplete calls reject PASS",()=>{
 const base=ready();
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,verifier:undefined}}),/Verifier grade/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,verifier:{grade:{passed:false}}}}),/Verifier grade/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,planner:{...planner,candidateSha:"b".repeat(40)}}),/candidate SHA mismatch/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,explorer:{...explorer,model:"other"}}),/model mismatch/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,model:"unapproved-free-model"}),/unapproved model/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,budget:{...budget,reserved:4,remaining:1}}),/call receipts/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,writerAuthorized:true}}),/cannot grant Writer/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,reviewer:[review.reviewer[0]]}}),/Two real blind/);
});
test("T12 three-call evidence can only be PARTIAL, never claim Reviewer or Verifier",()=>{
 const three={sha,model,maxCalls:3,budget:{limit:3,reserved:3,remaining:0,authorization:"NOT_GRANTED"},
  explorer:{...explorer,inferenceCall:2,inferenceLimit:3},
  planner:{...planner,inferenceCall:3,inferenceLimit:3},
  review:{status:"BLOCKED_CALL_BUDGET",reviewer:"NOT_RUN",verifier:"NOT_RUN",authorization:"NOT_GRANTED"}};
 const result=gradeLiveAcceptanceEvidence(three);
 assert.equal(result.status,"PARTIAL_CALL_BUDGET");
 assert.equal(result.verifier,"NOT_RUN");
 assert.equal(result.writer,"BLOCKED_INTERACTIVE");
 assert.throws(()=>gradeLiveAcceptanceEvidence({...three,review:{...three.review,verifier:"PASS"}}),/must not claim/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...three,explorer:{...three.explorer,inferenceCall:1}}),/call order/);
});
