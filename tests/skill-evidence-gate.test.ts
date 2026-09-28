import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {EvidenceStore} from "../src/evidence/store.js";
import {authorizeRelease,verifyCandidate,verifySkillEvidence} from "../src/verify/verifier.js";
import {issueSkillContext} from "../src/skills/context.js";
import {passingEvidence,passingReview,gitCandidate} from "./execution-evidence-helper.js";

const c=gitCandidate("candidate");

test("TDD skill blocks verification without candidate-bound TDD evidence",async()=>{
 const store=new EvidenceStore();
 await passingEvidence(store,c,"test");
 const result=verifyCandidate(c,"medium",store,["asen-tdd"]);
 assert.equal(result.ok,false);
 assert.match(result.reason,/asen-tdd.*tdd evidence/);
});

test("TDD evidence from another repository cannot satisfy the skill gate",async()=>{
 const store=new EvidenceStore(),dir=await mkdtemp(join(tmpdir(),"asen-other-repo-"));
 try{
 execFileSync("git",["init","-q",dir]);
 execFileSync("git",["-C",dir,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const other=gitCandidate(c.id,dir);
 await passingEvidence(store,other,"tdd-other","tdd");
 assert.equal(verifySkillEvidence(c,["asen-tdd"],store,"verification").ok,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("review skill blocks release without candidate-bound review evidence",async()=>{
 const store=new EvidenceStore();
 assert.equal(verifySkillEvidence(c,["asen-review"],store,"release").ok,false);
 await passingReview(store,c,"review");
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


test("release gate composes verification and release skill requirements",async()=>{
 const store=new EvidenceStore(),context=issueSkillContext("task",c.repository,c,{codeChange:true,risk:"high" as const});
 assert.equal(authorizeRelease(c,"high",store,context).ok,false);
 await passingEvidence(store,c,"test-release");
 await passingReview(store,c,"review-release");
 store.add(c,{id:"scope-release",kind:"scope",status:"pass",summary:"authorized",createdAt:"now"});
 assert.equal(authorizeRelease(c,"high",store,context).ok,false);
 store.add(c,{id:"rollback-release",kind:"rollback",status:"pass",summary:"ready",createdAt:"now"});
 assert.equal(authorizeRelease(c,"high",store,context).ok,true);
});

test("release rejects evidence from a previous candidate revision",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-old-revision-"));
 try{
 execFileSync("git",["init","-q",dir]);
 const commit=(message:string)=>execFileSync("git",["-C",dir,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m",message]);
 commit("old");
 const store=new EvidenceStore(),old=gitCandidate(c.id,dir);
 await passingEvidence(store,old,"test-old");
 for(const [id,kind] of [["review-old","review"],["scope-old","scope"],["rollback-old","rollback"]] as const)
  if(kind==="review")await passingReview(store,old,id);else store.add(old,{id,kind,status:"pass",summary:"old",createdAt:"now"});
 commit("current");
 const current=gitCandidate(c.id,dir),context=issueSkillContext("task",dir,current,{codeChange:true,risk:"high" as const});
 assert.equal(authorizeRelease(current,"high",store,context).ok,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("release fails closed when no skill selection is supplied",async()=>{
 const store=new EvidenceStore();
 await passingEvidence(store,c,"test-no-skills");
 assert.equal(authorizeRelease(c,"low",store,issueSkillContext("task",c.repository,c,{})).ok,false);
});


test("release cannot omit safe-change requirements for a code change",async()=>{
 const store=new EvidenceStore();
 await passingEvidence(store,c,"release-derived-test");
 store.add(c,{id:"release-derived-unit",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 const result=authorizeRelease(c,"medium",store,issueSkillContext("task",c.repository,c,{codeChange:true}));
 assert.equal(result.ok,false);
 assert.match(result.reason,/asen-safe-change.*scope evidence/);
});

test("release rejects caller-controlled mutable skill context",()=>{
 const store=new EvidenceStore();
 assert.equal(authorizeRelease(c,"low",store,{codeChange:true}).ok,false);
 assert.match(authorizeRelease(c,"low",store,{codeChange:true}).reason,/ASEN-issued skill selection context/);
});


test("release rejects an issued context from another candidate revision",()=>{
 const old={...c,revision:"old-context"};
 const store=new EvidenceStore();
 const context=issueSkillContext("task",c.repository,old,{codeChange:true});
 const result=authorizeRelease(c,"medium",store,context);
 assert.equal(result.ok,false);
 assert.match(result.reason,/does not match candidate/);
});
