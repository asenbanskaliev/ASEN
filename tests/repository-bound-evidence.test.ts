import assert from "node:assert/strict";
import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";
import {verifyCandidate} from "../src/verify/verifier.js";
import {assertReviewCandidate,reviewEvidence} from "../src/review/review.js";
import {TddCycle} from "../src/test/tdd-cycle.js";

const a={id:"X",repository:"repo-A",revision:"R",createdAt:"now"};
const b={...a,repository:"repo-B"};
const report={candidateRepository:"repo-A",candidateId:"X",candidateRevision:"R",reviewer:"independent-1",reviewerRole:"independent" as const,findings:[]};

test("test and review PASS from repo-A cannot verify repo-B",()=>{
 const store=new EvidenceStore();
 store.add(a,{id:"test-A",kind:"test",status:"pass",summary:"executed in A",createdAt:"now"});
 store.add(a,reviewEvidence(a,report));
 assert.equal(verifyCandidate(a,"high",store).ok,true);
 assert.equal(verifyCandidate(b,"high",store).ok,false);
 assert.deepEqual(store.forCandidate(b),[]);
});

test("each dimension of evidence identity is required",()=>{
 const store=new EvidenceStore();
 store.add(a,{id:"test-A",kind:"test",status:"pass",summary:"ok",createdAt:"now"});
 for(const candidate of [{...a,revision:"R2"},{...a,id:"Y"},b]){
  assert.equal(store.hasPassing(candidate,"test"),false,JSON.stringify(candidate));
 }
});

test("review from repo-A is rejected for repo-B",()=>{
 assert.throws(()=>assertReviewCandidate(b,report),/repository mismatch/);
});

test("TDD evidence from repo-A is invisible to repo-B",()=>{
 const store=new EvidenceStore(),cycle=new TddCycle(a,store);
 cycle.record("RED","red-A","failed");cycle.record("GREEN","green-A","passed");cycle.record("REFACTOR","refactor-A","passed");
 assert.equal(store.forCandidate(b).length,0);
});
