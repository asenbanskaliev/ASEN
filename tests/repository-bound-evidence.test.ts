import assert from "node:assert/strict";
import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";
import {verifyCandidate} from "../src/verify/verifier.js";
import {assertReviewCandidate,reviewEvidence} from "../src/review/review.js";
import {TddCycle} from "../src/test/tdd-cycle.js";
import {executionProof,passingEvidence,gitCandidate} from "./execution-evidence-helper.js";

const a=gitCandidate("X");
const b={...a,repository:"repo-B"};
const report={candidateRepository:a.repository,candidateId:"X",candidateRevision:a.revision,reviewer:"independent-1",reviewerRole:"independent" as const,findings:[]};

test("test and review PASS from repo-A cannot verify repo-B",async()=>{
 const store=new EvidenceStore();
 await passingEvidence(store,a,"test-A");
 store.add(a,reviewEvidence(a,report));
 assert.equal(verifyCandidate(a,"high",store).ok,true);
 assert.equal(verifyCandidate(b,"high",store).ok,false);
 assert.deepEqual(store.forCandidate(b),[]);
});

test("each dimension of evidence identity is required",async()=>{
 const store=new EvidenceStore();
 await passingEvidence(store,a,"test-A");
 for(const candidate of [{...a,revision:"R2"},{...a,id:"Y"},b]){
  assert.equal(store.hasPassing(candidate,"test"),false,JSON.stringify(candidate));
 }
});

test("review from repo-A is rejected for repo-B",()=>{
 assert.throws(()=>assertReviewCandidate(b,report),/repository mismatch/);
});

test("TDD evidence from repo-A is invisible to repo-B",async()=>{
 const store=new EvidenceStore(),cycle=new TddCycle(a,store);
 cycle.record("RED","red-A","failed",await executionProof(a,1));cycle.record("GREEN","green-A","passed",await executionProof(a,0));cycle.record("REFACTOR","refactor-A","passed",await executionProof(a,0));
 assert.equal(store.forCandidate(b).length,0);
});
