import assert from "node:assert/strict";import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";import {TddCycle} from "../src/test/tdd-cycle.js";import {verifyCandidate} from "../src/verify/verifier.js";
import {executionProof,passingEvidence} from "./execution-evidence-helper.js";
const c={id:"c",repository:"r",revision:"abc",createdAt:"now"};
test("evidence is bound to exact revision",async()=>{
 const s=new EvidenceStore();await passingEvidence(s,c,"e");
 assert.equal(s.hasPassing({...c,revision:"def"},"test"),false);
});
test("evidence ids are append only",async()=>{
 const s=new EvidenceStore();await passingEvidence(s,c,"e");
 await assert.rejects(async()=>passingEvidence(s,c,"e"),/already exists/);
});
test("TDD enforces RED GREEN REFACTOR",async()=>{
 const s=new EvidenceStore(),t=new TddCycle(c,s);
 t.record("RED","r","fails",await executionProof(c,1));
 t.record("GREEN","g","passes",await executionProof(c,0));
 t.record("REFACTOR","f","clean",await executionProof(c,0));
 const evidence=s.forCandidate(c);assert.equal(evidence.length,3);assert.equal(evidence[0]?.status,"expected-fail");
 await passingEvidence(s,c,"test-final");
 assert.equal(verifyCandidate(c,"medium",s).ok,true,"a resolved TDD RED must not poison final verification");
});
test("TDD rejects GREEN without RED",async()=>{const t=new TddCycle(c,new EvidenceStore());assert.throws(()=>t.record("GREEN","g","bad",{} as never),/expected RED/);});
test("an unresolved real failure still blocks verification",async()=>{const s=new EvidenceStore();await passingEvidence(s,c,"test-ok");s.add(c,{id:"regression",kind:"test",status:"fail",summary:"broken",createdAt:"now"});assert.equal(verifyCandidate(c,"medium",s).ok,false);});
