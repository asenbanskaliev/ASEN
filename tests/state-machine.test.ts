import assert from "node:assert/strict";
import test from "node:test";
import {guardedTransition,transition} from "../src/core/state-machine.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {authorizeImplementation,authorizeVerified,type TransitionAuthorization} from "../src/verify/verifier.js";

const candidate={id:"c",repository:"r",revision:"sha",createdAt:"now"};
function implementationAuthorization(){
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"unit",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 return authorizeImplementation(candidate,Object.freeze({filesTouched:2}),evidence);
}
function verifiedAuthorization(){
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"test",kind:"test",status:"pass",summary:"green",createdAt:"now"});
 evidence.add(candidate,{id:"unit-v",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 evidence.add(candidate,{id:"review-v",kind:"review",status:"pass",summary:"review",createdAt:"now"});
 return authorizeVerified(candidate,"medium",Object.freeze({verification:true}),evidence);
}

test("rejects skipping directly to VERIFIED",()=>assert.throws(()=>transition("IMPLEMENTING","VERIFIED")));

test("allows canonical engineering path only through gate-issued authorizations",()=>{
 let phase=transition("DISCOVERING","PLANNING");
 phase=guardedTransition({from:phase,to:"IMPLEMENTING",candidate,authorization:implementationAuthorization()});
 phase=transition(phase,"TESTING");
 phase=transition(phase,"REVIEWING");
 phase=transition(phase,"VERIFYING");
 assert.equal(guardedTransition({from:phase,to:"VERIFIED",candidate,authorization:verifiedAuthorization()}),"VERIFIED");
});

test("plain transition cannot bypass privileged gates",()=>{
 assert.throws(()=>transition("PLANNING","IMPLEMENTING"),/requires gate authorization/);
 assert.throws(()=>transition("VERIFYING","VERIFIED"),/requires gate authorization/);
});

test("fabricated authorization cannot unlock privileged transition",()=>{
 const fake=Object.freeze({target:"IMPLEMENTING",candidateRepository:"r",candidateId:"c",candidateRevision:"sha"}) as TransitionAuthorization;
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
  /sealed skill selection context/
 );
});

test("verification authorization derives mandatory review skill from context",()=>{
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"test-derived",kind:"test",status:"pass",summary:"green",createdAt:"now"});
 evidence.add(candidate,{id:"unit-derived",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 assert.throws(
  ()=>authorizeVerified(candidate,"medium",Object.freeze({verification:true}),evidence),
  /asen-review.*review evidence/
 );
});
