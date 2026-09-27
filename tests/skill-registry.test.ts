import assert from "node:assert/strict";
import test from "node:test";
import {getSkillContract,listSkillContracts,selectSkills} from "../src/skills/registry.js";

test("skill registry has unique Pi-native paths and evidence contracts",()=>{
 const contracts=listSkillContracts();
 assert.equal(contracts.length,25);
 assert.equal(new Set(contracts.map(x=>x.id)).size,contracts.length);
 assert.equal(new Set(contracts.map(x=>x.path)).size,contracts.length);
 for(const contract of contracts){
  assert.match(contract.path,/^skills\/asen-[a-z-]+\/SKILL\.md$/);
  assert.ok(contract.evidence.length>0);
 }
});
test("lifecycle phases resolve exact Pi-native behavior contracts",()=>{
 assert.deepEqual(selectSkills({phase:"explore"}).map(x=>x.id),["asen-explore"]);
 assert.deepEqual(selectSkills({phase:"proposal"}).map(x=>x.id),["asen-proposal"]);
 assert.deepEqual(selectSkills({phase:"specification"}).map(x=>x.id),["asen-specification"]);
 assert.deepEqual(selectSkills({phase:"design"}).map(x=>x.id),["asen-design"]);
 assert.deepEqual(selectSkills({phase:"verify"}).map(x=>x.id),["asen-verify"]);
});
test("context initialization requires the skill registry contract",()=>{
 assert.deepEqual(selectSkills({phase:"context-init"}).map(x=>x.id),["asen-skill-registry","asen-context-init"]);
});
test("task planning includes work-unit behavior",()=>{
 assert.deepEqual(selectSkills({phase:"tasks"}).map(x=>x.id),["asen-work-unit","asen-tasks"]);
});
test("apply includes safe-change and its work-unit dependency",()=>{
 assert.deepEqual(selectSkills({phase:"apply"}).map(x=>x.id),["asen-work-unit","asen-safe-change","asen-apply"]);
});
test("archive requires verification behavior",()=>{
 assert.deepEqual(selectSkills({phase:"archive"}).map(x=>x.id),["asen-verify","asen-archive"]);
});
test("behavior change selects work unit before TDD",()=>{
 assert.deepEqual(selectSkills({behaviorChange:true}).map(x=>x.id),["asen-work-unit","asen-tdd"]);
});
test("code change selects safe-change and its dependency",()=>{
 assert.deepEqual(selectSkills({codeChange:true}).map(x=>x.id),["asen-work-unit","asen-safe-change"]);
});
test("high risk verification requires routing, work unit and independent review",()=>{
 assert.deepEqual(selectSkills({risk:"high",verification:true}).map(x=>x.id),["asen-odd","asen-work-unit","asen-review"]);
});
test("specialized behavioral families resolve through explicit phases",()=>{
 assert.deepEqual(selectSkills({phase:"adversarial-review"}).map(x=>x.id),["asen-work-unit","asen-review","asen-adversarial-review"]);
 assert.deepEqual(selectSkills({phase:"skill-authoring"}).map(x=>x.id),["asen-skill-registry","asen-skill-authoring"]);
 assert.deepEqual(selectSkills({phase:"defect"}).map(x=>x.id),["asen-work-unit","asen-defect-workflow"]);
 assert.deepEqual(selectSkills({phase:"delivery-chain"}).map(x=>x.id),["asen-work-unit","asen-delivery-chain"]);
 assert.deepEqual(selectSkills({phase:"go-testing"}).map(x=>x.id),["asen-go-testing"]);
});
test("unknown skill ids fail closed",()=>{
 assert.throws(()=>getSkillContract("asen-missing" as never),/Unknown ASEN skill/);
});
