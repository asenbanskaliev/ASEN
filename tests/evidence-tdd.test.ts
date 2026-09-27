import assert from "node:assert/strict";import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";import {TddCycle} from "../src/test/tdd-cycle.js";
const c={id:"c",repository:"r",revision:"abc",createdAt:"now"};
test("evidence is bound to exact revision",()=>{
 const s=new EvidenceStore();s.add(c,{id:"e",kind:"test",status:"pass",summary:"ok",createdAt:"now"});
 assert.equal(s.hasPassing({...c,revision:"def"},"test"),false);
});
test("evidence ids are append only",()=>{
 const s=new EvidenceStore();s.add(c,{id:"e",kind:"test",status:"pass",summary:"ok",createdAt:"now"});
 assert.throws(()=>s.add(c,{id:"e",kind:"test",status:"pass",summary:"replace",createdAt:"now"}),/already exists/);
});
test("TDD enforces RED GREEN REFACTOR",()=>{
 const s=new EvidenceStore(),t=new TddCycle(c,s);t.record("RED","r","fails");t.record("GREEN","g","passes");t.record("REFACTOR","f","clean");
 assert.equal(s.forCandidate(c).length,3);
});
test("TDD rejects GREEN without RED",()=>{const t=new TddCycle(c,new EvidenceStore());assert.throws(()=>t.record("GREEN","g","bad"),/expected RED/);});
