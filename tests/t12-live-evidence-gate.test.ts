import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error JavaScript-only exact-SHA real-provider evidence helper.
import {gradeLiveAcceptanceEvidence} from "../scripts/t12-live-evidence-gate.mjs";

const sha="a".repeat(40),model="beam";
const explorer={passed:true,status:"PASS",provider:"ollama-cloud",model,candidateSha:sha,
 inferenceCall:1,inferenceLimit:5,toolsAllowed:false,writerAuthorized:false,fixtureUnchanged:true,
 role:"explorer",phase:"explore",artifactKind:"exploration",candidateId:"t12-real-ollama-dispatch",artifactSha256:"e".repeat(64),findings:["authorization","parsing","pricing"]};
const planner={passed:true,provider:"ollama-cloud",model,candidateSha:sha,
 inferenceCall:2,inferenceLimit:5,toolsAllowed:false,writerAuthorized:false,authorization:"NOT_GRANTED",taskCount:3,
 scope:"disposable-fixture",candidateId:"t12-disposable-fixture",findings:["authorization","parsing","pricing"],
 tasks:[
  {id:"authorization-fix",findingId:"authorization",role:"worker",paths:["src/access.js"]},
  {id:"parsing-fix",findingId:"parsing",role:"worker",paths:["src/parse.js"]},
  {id:"pricing-fix",findingId:"pricing",role:"worker",paths:["src/pricing.js"]},
 ]};
const canonicalReview=[
 {path:"src/access.js",codeEvidence:'return user.id === document.ownerId || user.role === "viewer";',acceptanceCriterion:"viewers cannot edit documents they do not own"},
 {path:"src/parse.js",codeEvidence:"const parsed = Number.parseInt(value, 10);",acceptanceCriterion:"integer parsing rejects trailing non-digits"},
 {path:"src/pricing.js",codeEvidence:"return unitPrice * quantity + discount;",acceptanceCriterion:"discounts reduce totals"},
];
const review={passed:true,status:"PASS_NEGATIVE_REJECTION",provider:"ollama-cloud",model,candidateSha:sha,
 candidateId:"t12-review-"+ "f".repeat(12),fixtureSha256:"f".repeat(64),
 changedPaths:["src/access.js","src/parse.js","src/pricing.js"],
 deterministicTests:{checks:[
  {id:"authorization",exitCode:1,failureObserved:true,failedCriterion:"viewers cannot edit documents they do not own",
   command:"node --input-type=module -e <bounded fixture assertion>",observation:"AssertionError: viewer edit was wrongly permitted"},
  {id:"parsing",exitCode:1,failureObserved:true,failedCriterion:"integer parsing rejects trailing non-digits",
   command:"node --input-type=module -e <bounded fixture assertion>",observation:"AssertionError: trailing non-digits were accepted"},
  {id:"pricing",exitCode:1,failureObserved:true,failedCriterion:"discounts reduce totals",
   command:"node --input-type=module -e <bounded fixture assertion>",observation:"AssertionError: applied discount increased total"},
 ]},toolsAllowed:false,writerAuthorized:false,authorization:"NOT_GRANTED",
 reviewer:[
 {id:"t12-review-"+ "f".repeat(12)+":judge-a",responseSha256:"c".repeat(64),responseBytes:200,grade:{passed:true,candidateSha:sha,verdict:"fail",findings:canonicalReview.map(item=>({...item}))}},
 {id:"t12-review-"+ "f".repeat(12)+":judge-b",responseSha256:"d".repeat(64),responseBytes:210,grade:{passed:true,candidateSha:sha,verdict:"fail",findings:canonicalReview.map(item=>({...item}))}}],
 verifier:{responseSha256:"e".repeat(64),responseBytes:245,grade:{passed:true,verdict:"fail",checkCount:3,findingCount:3,authorization:"NOT_GRANTED"}}};
const budget={limit:5,reserved:5,remaining:0,authorization:"NOT_GRANTED"};
const receipts5=[
 {call:1,label:"asen-dispatcher-explorer",limit:5},{call:2,label:"real-plan",limit:5},
 {call:3,label:"real-judge-a",limit:5},{call:4,label:"real-judge-b",limit:5},
 {call:5,label:"real-verifier",limit:5},
];
const ready=()=>({sha,model,maxCalls:5,budget,receipts:receipts5,explorer,planner,review});

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
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,verifier:undefined}}),/Verifier response hash/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,verifier:{...review.verifier,grade:{passed:false}}}}),/Verifier grade/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,planner:{...planner,candidateSha:"b".repeat(40)}}),/candidate SHA mismatch/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,explorer:{...explorer,model:"other"}}),/model mismatch/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,model:"unapproved-free-model"}),/unapproved model/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,budget:{...budget,reserved:4,remaining:1}}),/call receipts/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,writerAuthorized:true}}),/cannot grant Writer/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,reviewer:[review.reviewer[0]]}}),/Two real blind/);
});
test("T12 three-call evidence can only be PARTIAL, never claim Reviewer or Verifier",()=>{
 const three={sha,model,maxCalls:3,budget:{limit:3,reserved:3,remaining:0,authorization:"NOT_GRANTED"},
  receipts:[
   {call:1,label:"provider-connectivity",limit:3},
   {call:2,label:"asen-dispatcher-explorer",limit:3},
   {call:3,label:"real-plan",limit:3},
  ],
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

test("T12 provider call receipts must bind the precise stage labels, sequence and limits",()=>{
 const base=ready();
 const duplicate=receipts5.map(x=>({...x}));
 duplicate[4]!.label="real-judge-b";
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,receipts:duplicate}),/stage receipt identities/);
 const unknown=receipts5.map(x=>({...x}));
 unknown[0]!.label="provider-connectivity";
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,receipts:unknown}),/stage receipt identities/);
 const inverted=receipts5.slice().reverse();
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,receipts:inverted}),/stage receipt identities/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,receipts:receipts5.slice(0,4)}),/stage receipt identities/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,receipts:undefined}),/stage-specific inference receipts/);
});
test("T12 provider evidence requires exact Explorer identity, scoped Planner and distinct Reviewer receipts",()=>{
 const base=ready();
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,explorer:{...explorer,role:"worker"}}),/Explorer role mismatch/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,explorer:{...explorer,findings:["pricing","parsing","pricing"]}}),/three known defects/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,planner:{...planner,scope:"production-repository"}}),/disposable fixture scope/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,reviewer:[review.reviewer[1],review.reviewer[0]]}}),/identity or order mismatch/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,verifier:{...review.verifier,responseSha256:"bad"}}}),/Verifier response hash/);
});

test("T12 live-gate detects forged duplicate or unrelated Planner/Explorer findings and task paths",()=>{
 const base=ready();
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,planner:{...planner,
  findings:["authorization","authorization","pricing"]}}),/Planner findings/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,planner:{...planner,
  tasks:planner.tasks.map(item=>({...item,paths:item.findingId==="pricing"?["src/secret.js"]:item.paths}))}}),
  /approved file/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,planner:{...planner,
  tasks:planner.tasks.map(item=>({...item,findingId:"pricing"}))}}),/distinct defect/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,explorer:{...explorer,
  candidateId:"other-candidate"}}),/Explorer candidate identity/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,explorer:{...explorer,
  artifactSha256:"forged"}}),/Explorer artifact digest/);
});
test("T12 live-gate rejects mismatched Reviewers, tampered code evidence and partial deterministic tests",()=>{
 const base=ready();
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  changedPaths:["src/access.js","src/pricing.js","src/unapproved.js"]}}),/changed paths mismatch/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  deterministicTests:{checks:review.deterministicTests.checks.slice(0,2)}}}),/failed-test evidence/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  deterministicTests:{checks:review.deterministicTests.checks.map(item=>({...item,exitCode:0}))}}}),/observe a failed test/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  reviewer:review.reviewer.map((judge,i)=>({...judge,grade:{...judge.grade,
   findings:judge.grade.findings.map((item,j)=>i===0&&j===0?{...item,codeEvidence:"unrelated"}:item)}}))}}),
  /code evidence is not from frozen fixture/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  verifier:{...review.verifier,grade:{...review.verifier.grade,authorization:"GRANTED"}}}}),
  /no-authorization status/);
});

test("T12 historical malformed Explorer and incomplete real Verifier can never become a green receipt",()=>{
 const base=ready();
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,explorer:{...explorer,
  passed:false,status:"EXPLORATION_SCHEMA_INVALID"}}),/Explorer must have a positive grade/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  passed:false,status:"VERIFIER_EVIDENCE_INCOMPLETE"}}),/Verifier needs a real negative-rejection grade/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  verifier:{...review.verifier,grade:{...review.verifier.grade,findingCount:2}}}}),
  /Verifier omitted reviewer defects/);
});

test("T12 final Reviewer/Verifier receipt cannot be borrowed from another frozen fixture",()=>{
 const base=ready();
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  fixtureSha256:"a".repeat(64)}}),/Reviewer candidate is not bound/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  candidateId:"t12-review-"+ "a".repeat(12)}}),/Reviewer candidate is not bound/);
 assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:{...review,
  reviewer:review.reviewer.map((judge,i)=>i===0?{...judge,id:"other-fixture:judge-a"}:judge)}}),
  /Reviewer judgment identity or order mismatch/);
});

test("T12 F5 final grade rejects invented, missing or unbounded deterministic failure observations",()=>{
 const base=ready();
 const corrupt=(delta:Record<string,unknown>)=>({...review,deterministicTests:{
  checks:review.deterministicTests.checks.map((check,index)=>index===0?{...check,...delta}:check),
 }});
 for(const [invalid,expected] of [
  [{failureObserved:false},/actually observed failure/],
  [{failureObserved:undefined},/actually observed failure/],
  [{observation:""},/bounded deterministic assertion evidence/],
  [{observation:"passed successfully"},/bounded deterministic assertion evidence/],
  [{observation:"AssertionError: "+ "x".repeat(1000)},/bounded deterministic assertion evidence/],
  [{command:"echo fabricated pass"},/deterministic test execution command/],
 ] as const){
  assert.throws(()=>gradeLiveAcceptanceEvidence({...base,review:corrupt(invalid)}),expected);
 }
 assert.equal(gradeLiveAcceptanceEvidence(base).status,"PASS_BOUNDED_READ_ONLY");
});
