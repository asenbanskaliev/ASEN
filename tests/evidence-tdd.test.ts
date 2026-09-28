import assert from "node:assert/strict";import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";import {TddCycle} from "../src/test/tdd-cycle.js";import {verifyCandidate,verifySkillEvidence} from "../src/verify/verifier.js";
import {addExecutedEvidence} from "../src/evidence/execution.js";
import {executionProof,passingEvidence,gitCandidate} from "./execution-evidence-helper.js";
const c=gitCandidate("c");
test("evidence is bound to exact revision",async()=>{
 const s=new EvidenceStore();await passingEvidence(s,c,"e");
 assert.equal(s.hasPassing({...c,revision:"def"},"test"),false);
});
test("evidence ids are append only",async()=>{
 const s=new EvidenceStore();await passingEvidence(s,c,"e");
 await assert.rejects(async()=>passingEvidence(s,c,"e"),/already exists/);
});
test("TDD enforces RED GREEN REFACTOR",async()=>{
 const s=new EvidenceStore(),t=new TddCycle(c,s,"cycle-a");
 t.record("RED","cycle-a:red","fails",await executionProof(c,1));
 t.record("GREEN","cycle-a:green","passes",await executionProof(c,0));
 t.record("REFACTOR","cycle-a:refactor","clean",await executionProof(c,0));
 const evidence=s.forCandidate(c);assert.equal(evidence.length,3);assert.equal(evidence[0]?.status,"expected-fail");
 await passingEvidence(s,c,"test-final");
 assert.equal(verifyCandidate(c,"medium",s).ok,true,"a resolved TDD RED must not poison final verification");
});
test("TDD rejects GREEN without RED",async()=>{const t=new TddCycle(c,new EvidenceStore(),"cycle-a");assert.throws(()=>t.record("GREEN","cycle-a:green","bad",{} as never),/expected RED/);});
test("an unresolved real failure still blocks verification",async()=>{const s=new EvidenceStore();await passingEvidence(s,c,"test-ok");s.add(c,{id:"regression",kind:"test",status:"fail",summary:"broken",createdAt:"now"});assert.equal(verifyCandidate(c,"medium",s).ok,false);});

test("TDD rejects evidence from another logical cycle",async()=>{const t=new TddCycle(c,new EvidenceStore(),"cycle-a");await assert.rejects(async()=>t.record("RED","cycle-b:red","mixed",await executionProof(c,1)),/does not belong to this cycle/);});
test("TDD requires a stable non-empty cycle id",()=>assert.throws(()=>new TddCycle(c,new EvidenceStore(),"   "),/stable cycle id/));

test("a lone GREEN cannot satisfy the TDD verification gate",async()=>{
 const store=new EvidenceStore(),proof=await executionProof(c,0);
 addExecutedEvidence(store,c,proof,{id:"rogue:green",kind:"tdd",summary:"GREEN without RED or REFACTOR"});
 assert.equal(verifySkillEvidence(c,["asen-tdd"],store,"verification").ok,false);
});
