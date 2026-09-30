import assert from "node:assert/strict";
import test from "node:test";
import {guardedTransition,transition} from "../src/core/state-machine.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {authorizeImplementation,authorizeVerified,type TransitionAuthorization} from "../src/verify/verifier.js";
import {issueSkillContext} from "../src/skills/context.js";
import {passingEvidence,passingReview,gitCandidate} from "./execution-evidence-helper.js";
import {admitRouteEvidence} from "./helpers/route-evidence.js";

const candidate=gitCandidate("c");
function implementationAuthorization(){
 const evidence=new EvidenceStore();
 admitRouteEvidence(evidence,candidate,{id:"route",summary:"route",createdAt:"now"});
 evidence.add(candidate,{id:"unit",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 evidence.add(candidate,{id:"scope",kind:"scope",status:"pass",summary:"scope",createdAt:"now"});
 evidence.add(candidate,{id:"rollback",kind:"rollback",status:"pass",summary:"rollback",createdAt:"now"});
 return authorizeImplementation(candidate,issueSkillContext("task",candidate.repository,candidate,{phase:"apply",filesTouched:2}),evidence);
}
async function verifiedAuthorization(){
 const evidence=new EvidenceStore();
 await passingEvidence(evidence,candidate,"test");
 evidence.add(candidate,{id:"unit-v",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 await passingReview(evidence,candidate,"review-v");
 return authorizeVerified(candidate,"medium",issueSkillContext("task",candidate.repository,candidate,{phase:"verify",verification:true}),evidence);
}

test("rejects skipping directly to VERIFIED",()=>assert.throws(()=>transition("IMPLEMENTING","VERIFIED")));

test("allows canonical engineering path only through gate-issued authorizations",async()=>{
 let phase=transition("DISCOVERING","PLANNING");
 phase=guardedTransition({from:phase,to:"IMPLEMENTING",candidate,authorization:implementationAuthorization()});
 phase=transition(phase,"TESTING");
 phase=transition(phase,"REVIEWING");
 phase=transition(phase,"VERIFYING");
 assert.equal(guardedTransition({from:phase,to:"VERIFIED",candidate,authorization:await verifiedAuthorization()}),"VERIFIED");
});

test("plain transition cannot bypass privileged gates",()=>{
 assert.throws(()=>transition("PLANNING","IMPLEMENTING"),/requires gate authorization/);
 assert.throws(()=>transition("VERIFYING","VERIFIED"),/requires gate authorization/);
});
test("an explorer context cannot mint IMPLEMENTING authorization",()=>{
 const context=issueSkillContext("task",candidate.repository,candidate,{phase:"explore"});
 assert.throws(()=>authorizeImplementation(candidate,context,new EvidenceStore()),/apply phase/);
});
test("an explorer context cannot mint VERIFIED authorization",()=>{
 const context=issueSkillContext("task",candidate.repository,candidate,{phase:"explore"});
 assert.throws(()=>authorizeVerified(candidate,"low",context,new EvidenceStore()),/verify phase/);
});

test("fabricated authorization cannot unlock privileged transition",()=>{
 const fake=Object.freeze({target:"IMPLEMENTING",candidateRepository:candidate.repository,candidateId:"c",candidateRevision:candidate.revision}) as TransitionAuthorization;
 assert.throws(()=>guardedTransition({from:"PLANNING",to:"IMPLEMENTING",candidate,authorization:fake}),/invalid authorization/);
});

test("authorization is bound to its target phase",()=>{
 assert.throws(
  ()=>guardedTransition({from:"VERIFYING",to:"VERIFIED",candidate,authorization:implementationAuthorization()}),
  /target mismatch/
 );
});

test("authorization is bound to exact candidate revision",()=>{
 const authorization=implementationAuthorization();
 const newer={...candidate,revision:"sha2"};
 assert.throws(
  ()=>guardedTransition({from:"PLANNING",to:"IMPLEMENTING",candidate:newer,authorization}),
  /candidate mismatch/
 );
});

test("authorization cannot make an invalid structural transition valid",()=>{
 assert.throws(
  ()=>guardedTransition({from:"DISCOVERING",to:"IMPLEMENTING",candidate,authorization:implementationAuthorization()}),
  /Invalid ASEN transition/
 );
});


test("transition authorization rejects caller-controlled mutable skill context",()=>{
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"unit-mutable",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 assert.throws(
  ()=>authorizeImplementation(candidate,{filesTouched:2},evidence),
  /ASEN-issued skill selection context/
 );
});

test("verification authorization derives mandatory review skill from context",async()=>{
 const evidence=new EvidenceStore();
 await passingEvidence(evidence,candidate,"test-derived");
 evidence.add(candidate,{id:"unit-derived",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 assert.throws(
  ()=>authorizeVerified(candidate,"medium",issueSkillContext("task",candidate.repository,candidate,{phase:"verify",verification:true}),evidence),
  /asen-review.*review evidence/
 );
});


test("verification rejects an issued context from another candidate revision",()=>{
 const old={...candidate,revision:"old-context"};
 const evidence=new EvidenceStore();
 const context=issueSkillContext("task",candidate.repository,old,{verification:true});
 assert.throws(
  ()=>authorizeVerified(candidate,"medium",context,evidence),
  /does not match candidate/
 );
});
