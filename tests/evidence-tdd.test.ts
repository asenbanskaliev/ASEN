import assert from "node:assert/strict";import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";import {TddCycle} from "../src/test/tdd-cycle.js";import {verifyCandidate,verifySkillEvidence} from "../src/verify/verifier.js";
import {addExecutedEvidence} from "../src/evidence/execution.js";
import {saveEvidence,loadEvidence} from "../src/evidence/persistence.js";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {appendFileSync} from "node:fs";
import {randomBytes,createHmac} from "node:crypto";
import {executionProof,passingEvidence,gitCandidate,nextCandidateRevision} from "./execution-evidence-helper.js";
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
test("TDD rejects an unrelated GREEN Git history",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-unrelated-green-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 const commit=(label:string)=>execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m",label]);
 commit("red");const red=gitCandidate("lineage",repo),store=new EvidenceStore(),cycle=new TddCycle(red,store,"unrelated");
 cycle.record("RED","unrelated:red","fails",await executionProof(red,1),red);
 execFileSync("git",["-C",repo,"checkout","-q","--orphan","independent"]);commit("green");
 const green=gitCandidate("lineage",repo),proof=await executionProof(green,0);
 assert.throws(()=>cycle.record("GREEN","unrelated:green","passes",proof,green),/direct Git parent/);
});
test("TDD rejects skipped commits and unrelated REFACTOR histories",async t=>{
 const base=gitCandidate("chain");t.after(()=>rm(base.repository,{recursive:true,force:true}));
 const cycle=new TddCycle(base,new EvidenceStore(),"chain");
 cycle.record("RED","chain:red","fails",await executionProof(base,1),base);
 const intermediate=nextCandidateRevision(base,"intermediate");
 const skipped=nextCandidateRevision(intermediate,"skipped-green"),skippedProof=await executionProof(skipped,0);
 assert.throws(()=>cycle.record("GREEN","chain:green","skips",skippedProof,skipped),/direct Git parent/);
 const green=intermediate;
 execFileSync("git",["-C",base.repository,"checkout","-q",green.revision]);
 cycle.record("GREEN","chain:green","passes",await executionProof(green,0),green);
 execFileSync("git",["-C",base.repository,"checkout","-q","--orphan","unrelated-refactor"]);
 execFileSync("git",["-C",base.repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","unrelated"]);
 const unrelated=gitCandidate(base.id,base.repository),proof=await executionProof(unrelated,0);
 assert.throws(()=>cycle.record("REFACTOR","chain:refactor","bad",proof,unrelated),/direct Git parent/);
});
test("TDD refuses a merge commit as a stage transition",async t=>{
 const base=gitCandidate("merge");t.after(()=>rm(base.repository,{recursive:true,force:true}));
 const cycle=new TddCycle(base,new EvidenceStore(),"merge");
 cycle.record("RED","merge:red","fails",await executionProof(base,1),base);
 const green=nextCandidateRevision(base,"green");cycle.record("GREEN","merge:green","passes",await executionProof(green,0),green);
 const git=(...args:string[])=>execFileSync("git",["-C",base.repository,...args],{stdio:"ignore"});
 const commit=(label:string)=>git("-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m",label);
 git("checkout","-q","-b","feature",green.revision);commit("feature");
 git("checkout","-q","-b","mainline",green.revision);commit("mainline");
 git("-c","user.name=ASEN Test","-c","user.email=test@example.invalid","merge","-q","--no-ff","feature","-m","merge");
 const merged=gitCandidate(base.id,base.repository),proof=await executionProof(merged,0);
 assert.throws(()=>cycle.record("REFACTOR","merge:refactor","merge bypass",proof,merged),/direct Git parent/);
});
test("TDD does not accept another candidate id or repository mid-cycle",async t=>{
 const base=gitCandidate("original"),foreign=gitCandidate("original");
 t.after(()=>rm(base.repository,{recursive:true,force:true}));t.after(()=>rm(foreign.repository,{recursive:true,force:true}));
 const cycle=new TddCycle(base,new EvidenceStore(),"identity");
 cycle.record("RED","identity:red","fails",await executionProof(base,1),base);
 const next=nextCandidateRevision(base,"green"),proof=await executionProof(next,0);
 assert.throws(()=>cycle.record("GREEN","identity:green","bad id",proof,{...next,id:"other"}),/candidate lineage/);
 const foreignProof=await executionProof(foreign,0);
 assert.throws(()=>cycle.record("GREEN","identity:green","bad repo",foreignProof,foreign),/candidate lineage/);
});
test("an unresolved real failure still blocks verification",async()=>{const s=new EvidenceStore();await passingEvidence(s,c,"test-ok");s.add(c,{id:"regression",kind:"test",status:"fail",summary:"broken",createdAt:"now"});assert.equal(verifyCandidate(c,"medium",s).ok,false);});

test("TDD rejects evidence from another logical cycle",async()=>{const t=new TddCycle(c,new EvidenceStore(),"cycle-a");await assert.rejects(async()=>t.record("RED","cycle-b:red","mixed",await executionProof(c,1)),/does not belong to this cycle/);});
test("TDD requires a stable non-empty cycle id",()=>assert.throws(()=>new TddCycle(c,new EvidenceStore(),"   "),/stable cycle id/));

test("a lone GREEN cannot satisfy the TDD verification gate",async()=>{
 const store=new EvidenceStore(),proof=await executionProof(c,0);
 assert.throws(()=>addExecutedEvidence(store,c,proof,{id:"rogue:green",kind:"tdd",summary:"GREEN without RED or REFACTOR"}),/ordered TddCycle/);
 assert.equal(verifySkillEvidence(c,["asen-tdd"],store,"verification").ok,false);
 const cycle=new TddCycle(c,store,"real");
 cycle.record("RED","real:red","failed",await executionProof(c,1),c);
 const green=nextCandidateRevision(c,"real-green");cycle.record("GREEN","real:green","passing",await executionProof(green,0),green);
 assert.equal(verifySkillEvidence(green,["asen-tdd"],store,"verification").ok,false,"GREEN alone is incomplete");
 const refactor=nextCandidateRevision(green,"real-refactor");cycle.record("REFACTOR","real:refactor","passing",await executionProof(refactor,0),refactor);
 assert.equal(store.hasPassing(refactor,"tdd"),true,"generic completion remains available for audit");
 assert.equal(verifySkillEvidence(refactor,["asen-tdd"],store,"verification").ok,false,"generic completion cannot satisfy the exact lifecycle gate");
});

test("signed recovery retains only a complete TDD cycle on the same revision",async t=>{
 const folder=await mkdtemp(join(tmpdir(),"asen-tdd-recovery-"));t.after(()=>rm(folder,{recursive:true,force:true}));
 const base=gitCandidate("recovered"),path=join(folder,"evidence.json"),key=randomBytes(32),store=new EvidenceStore(),cycle=new TddCycle(base,store,"recovered");
 cycle.record("RED","recovered:red","expected failure",await executionProof(base,1),base);
 const green=nextCandidateRevision(base,"recovered-green");cycle.record("GREEN","recovered:green","passing",await executionProof(green,0),green);
 await saveEvidence(path,green,store,key);
 const partial=await loadEvidence(path,green,key);
 assert.equal(verifySkillEvidence(c,["asen-tdd"],partial,"verification").ok,false);
 const refactor=nextCandidateRevision(green,"recovered-refactor");cycle.record("REFACTOR","recovered:refactor","passing",await executionProof(refactor,0),refactor);
 await saveEvidence(path,refactor,store,key);
 const finished=await loadEvidence(path,refactor,key);
 assert.equal(finished.hasPassing(refactor,"tdd"),true);
 assert.equal(verifySkillEvidence(refactor,["asen-tdd"],finished,"verification").ok,false);
 const envelope=JSON.parse(await readFile(path,"utf8"));envelope.value.version=1;envelope.mac=createHmac("sha256",key).update(JSON.stringify(envelope.value)).digest("hex");await writeFile(path,JSON.stringify(envelope));
 const legacy=await loadEvidence(path,refactor,key);
 assert.equal(legacy.hasPassing(refactor,"tdd"),true,"legacy v1 generic TDD remains audit-readable");
 assert.equal(verifySkillEvidence(refactor,["asen-tdd"],legacy,"verification").ok,false,"legacy v1 generic TDD cannot satisfy the exact lifecycle gate");
 assert.equal(verifySkillEvidence({...refactor,revision:"different"},["asen-tdd"],finished,"verification").ok,false);
});
test("signed recovery rejects structurally forged TDD lineage and unrelated metadata",async t=>{
 const folder=await mkdtemp(join(tmpdir(),"asen-tdd-adversarial-"));t.after(()=>rm(folder,{recursive:true,force:true}));
 const base=gitCandidate("signed"),path=join(folder,"snapshot.json"),key=randomBytes(32),store=new EvidenceStore(),cycle=new TddCycle(base,store,"signed");
 t.after(()=>rm(base.repository,{recursive:true,force:true}));
 cycle.record("RED","signed:red","fails",await executionProof(base,1),base);
 const green=nextCandidateRevision(base,"green");cycle.record("GREEN","signed:green","passes",await executionProof(green,0),green);
 const refactor=nextCandidateRevision(green,"refactor");cycle.record("REFACTOR","signed:refactor","passes",await executionProof(refactor,0),refactor);
 await saveEvidence(path,refactor,store,key);
 const original=JSON.parse(await readFile(path,"utf8"));
 const corrupt=(change:(items:any[])=>void)=>{const value=structuredClone(original.value);change(value.items);return {value,mac:createHmac("sha256",key).update("asen.evidence.v2\0").update(JSON.stringify(value)).digest("hex")};};
 const cases:Array<[(items:any[])=>void,RegExp]>=[
  [items=>{items[0].tdd.previousRevision=green.revision;},/stage structure/],
  [items=>{items[1].tdd.previousRevision=refactor.revision;},/previousRevision/],
  [items=>{items[2].tdd.previousRevision=base.revision;},/previousRevision/],
  [items=>{items[1].tdd.stage="REFACTOR";},/stage structure/],
  [items=>{items.splice(0,1);},/previousRevision/],
  [items=>{items.splice(1,1);},/previousRevision/],
  [items=>{items[1].candidateRevision="f".repeat(40);},/candidate Git history/],
  [items=>{items.push({...items[2],id:"foreign",kind:"test",tdd:{...items[2].tdd}});},/Non-TDD evidence/],
 ];
 for(const [change,reason] of cases){await writeFile(path,JSON.stringify(corrupt(change)));await assert.rejects(()=>loadEvidence(path,refactor,key),reason);}
 await writeFile(path,JSON.stringify({...original,value:{...original.value,items:[]}}));
 await assert.rejects(()=>loadEvidence(path,refactor,key),/integrity mismatch/);
});
