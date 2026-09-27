import assert from "node:assert/strict";
import test from "node:test";
import {getSkillContract,listSkillContracts,selectSkills} from "../src/skills/registry.js";

test("skill registry has unique Pi-native paths and evidence contracts",()=>{
 const contracts=listSkillContracts();
 assert.equal(new Set(contracts.map(x=>x.id)).size,contracts.length);
 assert.equal(new Set(contracts.map(x=>x.path)).size,contracts.length);
 for(const contract of contracts){
  assert.match(contract.path,/^skills\/asen-[a-z-]+\/SKILL\.md$/);
  assert.ok(contract.evidence.length>0);
 }
});

test("behavior change selects work unit before TDD",()=>{
 const ids=selectSkills({behaviorChange:true}).map(x=>x.id);
 assert.deepEqual(ids,["asen-work-unit","asen-tdd"]);
});

test("code change selects safe-change and its dependency",()=>{
 const ids=selectSkills({codeChange:true}).map(x=>x.id);
 assert.deepEqual(ids,["asen-work-unit","asen-safe-change"]);
});

test("high risk verification requires routing, work unit and independent review",()=>{
 const ids=selectSkills({risk:"high",verification:true}).map(x=>x.id);
 assert.deepEqual(ids,["asen-odd","asen-work-unit","asen-review"]);
});

test("unknown skill ids fail closed",()=>{
 assert.throws(()=>getSkillContract("asen-missing" as never),/Unknown ASEN skill/);
});
