import assert from "node:assert/strict";
import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";
import {authorizeRelease,verifyCandidate,verifySkillEvidence} from "../src/verify/verifier.js";

const c={id:"candidate",repository:"repo",revision:"sha",createdAt:"now"};

test("TDD skill blocks verification without candidate-bound TDD evidence",()=>{
 const store=new EvidenceStore();
 store.add(c,{id:"test",kind:"test",status:"pass",summary:"suite green",createdAt:"now"});
 const result=verifyCandidate(c,"medium",store,["asen-tdd"]);
 assert.equal(result.ok,false);
 assert.match(result.reason,/asen-tdd.*tdd evidence/);
});

test("TDD evidence from another repository cannot satisfy the skill gate",()=>{
 const store=new EvidenceStore(),other={...c,repository:"other"};
 store.add(other,{id:"tdd-other",kind:"tdd",status:"pass",summary:"cycle complete",createdAt:"now"});
 assert.equal(verifySkillEvidence(c,["asen-tdd"],store,"verification").ok,false);
});

test("review skill blocks release without candidate-bound review evidence",()=>{
 const store=new EvidenceStore();
 assert.equal(verifySkillEvidence(c,["asen-review"],store,"release").ok,false);
 store.add(c,{id:"review",kind:"review",status:"pass",summary:"independent",createdAt:"now"});
 assert.equal(verifySkillEvidence(c,["asen-review"],store,"release").ok,true);
});


test("mutation gate requires route decision and work-unit evidence",()=>{
 const store=new EvidenceStore();
 assert.equal(verifySkillEvidence(c,["asen-odd","asen-work-unit"],store,"mutation").ok,false);
 store.add(c,{id:"route",kind:"route-decision",status:"pass",summary:"route selected",createdAt:"now"});
 assert.equal(verifySkillEvidence(c,["asen-odd","asen-work-unit"],store,"mutation").ok,false);
 store.add(c,{id:"unit",kind:"work-unit",status:"pass",summary:"bounded unit",createdAt:"now"});
 assert.equal(verifySkillEvidence(c,["asen-odd","asen-work-unit"],store,"mutation").ok,true);
});

test("safe-change blocks mutation and release until scope and rollback are evidenced",()=>{
 const store=new EvidenceStore();
 store.add(c,{id:"scope",kind:"scope",status:"pass",summary:"scope authorized",createdAt:"now"});
 assert.equal(verifySkillEvidence(c,["asen-safe-change"],store,"mutation").ok,false);
 store.add(c,{id:"rollback",kind:"rollback",status:"pass",summary:"rollback ready",createdAt:"now"});
 assert.equal(verifySkillEvidence(c,["asen-safe-change"],store,"mutation").ok,true);
 assert.equal(verifySkillEvidence(c,["asen-safe-change"],store,"release").ok,true);
});

test("skill evidence from another revision cannot satisfy mutation or release",()=>{
 const store=new EvidenceStore(),other={...c,revision:"sha-old"};
 for(const [id,kind] of [["scope","scope"],["rollback","rollback"]] as const)
  store.add(other,{id,kind,status:"pass",summary:"old candidate",createdAt:"now"});
 assert.equal(verifySkillEvidence(c,["asen-safe-change"],store,"mutation").ok,false);
 assert.equal(verifySkillEvidence(c,["asen-safe-change"],store,"release").ok,false);
});


test("release gate composes verification and release skill requirements",()=>{
 const store=new EvidenceStore(),context=Object.freeze({codeChange:true,risk:"high" as const});
 assert.equal(authorizeRelease(c,"high",store,context).ok,false);
 store.add(c,{id:"test-release",kind:"test",status:"pass",summary:"green",createdAt:"now"});
 store.add(c,{id:"review-release",kind:"review",status:"pass",summary:"independent",createdAt:"now"});
 store.add(c,{id:"scope-release",kind:"scope",status:"pass",summary:"authorized",createdAt:"now"});
 assert.equal(authorizeRelease(c,"high",store,context).ok,false);
 store.add(c,{id:"rollback-release",kind:"rollback",status:"pass",summary:"ready",createdAt:"now"});
 assert.equal(authorizeRelease(c,"high",store,context).ok,true);
});

test("release rejects evidence from a previous candidate revision",()=>{
 const store=new EvidenceStore(),old={...c,revision:"old"},context=Object.freeze({codeChange:true,risk:"high" as const});
 for(const [id,kind] of [["test-old","test"],["review-old","review"],["scope-old","scope"],["rollback-old","rollback"]] as const)
  store.add(old,{id,kind,status:"pass",summary:"old",createdAt:"now"});
 assert.equal(authorizeRelease(c,"high",store,context).ok,false);
});

test("release fails closed when no skill selection is supplied",()=>{
 const store=new EvidenceStore();
 store.add(c,{id:"test-no-skills",kind:"test",status:"pass",summary:"green",createdAt:"now"});
 assert.equal(authorizeRelease(c,"low",store,Object.freeze({})).ok,false);
});


test("release cannot omit safe-change requirements for a code change",()=>{
 const store=new EvidenceStore();
 store.add(c,{id:"release-derived-test",kind:"test",status:"pass",summary:"green",createdAt:"now"});
 store.add(c,{id:"release-derived-unit",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 const result=authorizeRelease(c,"medium",store,Object.freeze({codeChange:true}));
 assert.equal(result.ok,false);
 assert.match(result.reason,/asen-safe-change.*scope evidence/);
});

test("release rejects caller-controlled mutable skill context",()=>{
 const store=new EvidenceStore();
 assert.equal(authorizeRelease(c,"low",store,{codeChange:true}).ok,false);
 assert.match(authorizeRelease(c,"low",store,{codeChange:true}).reason,/sealed skill selection context/);
});
