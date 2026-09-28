import assert from "node:assert/strict";import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";import {TddCycle} from "../src/test/tdd-cycle.js";import {verifyCandidate,verifySkillEvidence} from "../src/verify/verifier.js";
import {addExecutedEvidence} from "../src/evidence/execution.js";
import {saveEvidence,loadEvidence} from "../src/evidence/persistence.js";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {appendFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
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
test("TDD enforces RED GREEN REFACTOR across real revisions",async()=>{
 const candidate=gitCandidate("lineage"),s=new EvidenceStore(),t=new TddCycle(candidate,s,"cycle-a");
 t.record("RED","cycle-a:red","fails",await executionProof(candidate,1),candidate);
 const next=(label:string)=>{appendFileSync(join(candidate.repository,"candidate.txt"),label+"\\n");execFileSync("git",["-C",candidate.repository,"add","."]);execFileSync("git",["-C",candidate.repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","-m",label]);return {...candidate,revision:execFileSync("git",["-C",candidate.repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim()};};
 const green=next("green");t.record("GREEN","cycle-a:green","passes",await executionProof(green,0),green);
 const refactor=next("refactor");t.record("REFACTOR","cycle-a:refactor","clean",await executionProof(refactor,0),refactor);
 assert.equal(s.hasPassing(refactor,"tdd"),true);
 assert.equal(s.hasPassing(green,"tdd"),false);
});
test("TDD rejects GREEN without RED",async()=>{const t=new TddCycle(c,new EvidenceStore(),"cycle-a");assert.throws(()=>t.record("GREEN","cycle-a:green","bad",{} as never),/expected RED/);});
test("an unresolved real failure still blocks verification",async()=>{const s=new EvidenceStore();await passingEvidence(s,c,"test-ok");s.add(c,{id:"regression",kind:"test",status:"fail",summary:"broken",createdAt:"now"});assert.equal(verifyCandidate(c,"medium",s).ok,false);});

test("TDD rejects evidence from another logical cycle",async()=>{const t=new TddCycle(c,new EvidenceStore(),"cycle-a");await assert.rejects(async()=>t.record("RED","cycle-b:red","mixed",await executionProof(c,1)),/does not belong to this cycle/);});
test("TDD requires a stable non-empty cycle id",()=>assert.throws(()=>new TddCycle(c,new EvidenceStore(),"   "),/stable cycle id/));

test("a lone GREEN cannot satisfy the TDD verification gate",async()=>{
 const store=new EvidenceStore(),proof=await executionProof(c,0);
 assert.throws(()=>addExecutedEvidence(store,c,proof,{id:"rogue:green",kind:"tdd",summary:"GREEN without RED or REFACTOR"}),/ordered TddCycle/);
 assert.equal(verifySkillEvidence(c,["asen-tdd"],store,"verification").ok,false);
 const cycle=new TddCycle(c,store,"real");
 cycle.record("RED","real:red","failed",await executionProof(c,1));
 cycle.record("GREEN","real:green","passing",await executionProof(c,0));
 assert.equal(verifySkillEvidence(c,["asen-tdd"],store,"verification").ok,false,"GREEN alone is incomplete");
 cycle.record("REFACTOR","real:refactor","passing",await executionProof(c,0));
 assert.equal(verifySkillEvidence(c,["asen-tdd"],store,"verification").ok,true);
});

test("signed recovery retains only a complete TDD cycle on the same revision",async t=>{
 const folder=await mkdtemp(join(tmpdir(),"asen-tdd-recovery-"));t.after(()=>rm(folder,{recursive:true,force:true}));
 const path=join(folder,"evidence.json"),key=randomBytes(32),store=new EvidenceStore(),cycle=new TddCycle(c,store,"recovered");
 cycle.record("RED","recovered:red","expected failure",await executionProof(c,1));
 cycle.record("GREEN","recovered:green","passing",await executionProof(c,0));
 await saveEvidence(path,c,store,key);
 const partial=await loadEvidence(path,c,key);
 assert.equal(verifySkillEvidence(c,["asen-tdd"],partial,"verification").ok,false);
 cycle.record("REFACTOR","recovered:refactor","passing",await executionProof(c,0));
 await saveEvidence(path,c,store,key);
 const finished=await loadEvidence(path,c,key);
 assert.equal(verifySkillEvidence(c,["asen-tdd"],finished,"verification").ok,true);
 assert.equal(verifySkillEvidence({...c,revision:"different"},["asen-tdd"],finished,"verification").ok,false);
});
