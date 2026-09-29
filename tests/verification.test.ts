import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceStore } from "../src/evidence/store.js";
import { verifyCandidate } from "../src/verify/verifier.js";
import {passingEvidence,passingReview,gitCandidate} from "./execution-evidence-helper.js";

const a=gitCandidate("a");
const b={id:"b",repository:"r",revision:"222",createdAt:"now"};

test("evidence cannot verify a different candidate", async () => {
  const store=new EvidenceStore();
  await passingEvidence(store,a,"t1");
  await passingReview(store,a,"r1");
  assert.equal(verifyCandidate(b,"high",store).ok,false);
});

test("high risk requires tests and independent review", async () => {
  const store=new EvidenceStore();
  await passingEvidence(store,a,"t1");
  assert.equal(verifyCandidate(a,"high",store).ok,false);
  await passingReview(store,a,"r1");
  assert.equal(verifyCandidate(a,"high",store).ok,true);
});
test("a plain review pass cannot authorize high-risk verification",async()=>{
 const store=new EvidenceStore();
 await passingEvidence(store,a,"test");
 assert.throws(()=>store.add(a,{id:"forged-review",kind:"review",status:"pass",summary:"independent",createdAt:"now"}),/authenticated reviewer proof/);
 assert.equal(verifyCandidate(a,"high",store).ok,false);
});
