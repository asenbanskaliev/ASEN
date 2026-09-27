import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceStore } from "../src/evidence/store.js";
import { verifyCandidate } from "../src/verify/verifier.js";

const a={id:"a",repository:"r",revision:"111",createdAt:"now"};
const b={id:"b",repository:"r",revision:"222",createdAt:"now"};

test("evidence cannot verify a different candidate", () => {
  const store=new EvidenceStore();
  store.add(a,{id:"t1",kind:"test",status:"pass",summary:"ok",createdAt:"now"});
  store.add(a,{id:"r1",kind:"review",status:"pass",summary:"ok",createdAt:"now"});
  assert.equal(verifyCandidate(b,"high",store).ok,false);
});

test("high risk requires tests and independent review", () => {
  const store=new EvidenceStore();
  store.add(a,{id:"t1",kind:"test",status:"pass",summary:"ok",createdAt:"now"});
  assert.equal(verifyCandidate(a,"high",store).ok,false);
  store.add(a,{id:"r1",kind:"review",status:"pass",summary:"ok",createdAt:"now"});
  assert.equal(verifyCandidate(a,"high",store).ok,true);
});
