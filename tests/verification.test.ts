import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceStore } from "../src/evidence/store.js";
import { verifyCandidate } from "../src/verify/verifier.js";
import {passingEvidence} from "./execution-evidence-helper.js";

const a={id:"a",repository:"r",revision:"111",createdAt:"now"};
const b={id:"b",repository:"r",revision:"222",createdAt:"now"};

test("evidence cannot verify a different candidate", async () => {
  const store=new EvidenceStore();
  await passingEvidence(store,a,"t1");
  store.add(a,{id:"r1",kind:"review",status:"pass",summary:"ok",createdAt:"now"});
  assert.equal(verifyCandidate(b,"high",store).ok,false);
});

test("high risk requires tests and independent review", async () => {
  const store=new EvidenceStore();
  await passingEvidence(store,a,"t1");
  assert.equal(verifyCandidate(a,"high",store).ok,false);
  store.add(a,{id:"r1",kind:"review",status:"pass",summary:"ok",createdAt:"now"});
  assert.equal(verifyCandidate(a,"high",store).ok,true);
});
