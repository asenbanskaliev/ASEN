import assert from "node:assert/strict";
import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";
import {verifyCandidate,verifySkillEvidence} from "../src/verify/verifier.js";

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
