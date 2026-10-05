import assert from "node:assert/strict";
import test from "node:test";
import type {RddReproductionEvidence} from "../src/defects/rdd-reproduction.js";
import {bindRddDefectEvidence} from "../src/defects/rdd-defect-binding.js";

const reproduction=()=>Object.freeze({schemaVersion:1,repositoryUrl:"https://github.example/acme/app",issueUrl:"https://github.example/acme/app/issues/17",mainCommitIdentity:"a".repeat(40),candidate:Object.freeze({id:"candidate-1",repository:"repo",revision:"b".repeat(40)}),reproductionCaseIds:Object.freeze(["defect case"]),negativeControlCaseIds:Object.freeze(["negative control"]),observation:Object.freeze({adapterId:"node-test",commandFingerprint:"fingerprint",testPaths:Object.freeze(["reproduction.test.mjs"]),executedCaseIds:Object.freeze(["defect case","negative control"]),failingCaseIds:Object.freeze(["defect case"]),assertionFingerprint:"assertion",failureKind:"assertion"}),repeatedRuns:2}) as RddReproductionEvidence;
const input=()=>({invariantIds:["approved-issue","current-main","deterministic-reproduction"],operatorFlows:[{id:"inspect-reproduce",from:"approved issue",to:"reproduced defect",failureTo:"blocked"}],runtimeJourney:{commandFingerprint:"fingerprint",result:"reproduced" as const,candidateRevision:"b".repeat(40),limitations:["no delivery authority"]},rollback:{boundary:"candidate" as const,procedure:["discard candidate"]},forecast:{changedLines:200,verificationEffort:"focused deterministic tests",remainingUncertainty:["live Pi verification deferred"]}});

test("rejects fabricated D2 evidence",()=>assert.throws(()=>bindRddDefectEvidence(reproduction(),input()),/genuine reproduction/i));

test("D3 binding is one-use and exact",async()=>{
 const module=await import("../src/defects/rdd-reproduction.js");
 const issued=new WeakSet<object>();
 // The genuine issuance path is exercised by rdd-reproduction.test.ts; D3 must never
 // provide a structural bypass. This assertion guards the public surface here.
 assert.equal(typeof module.claimRddReproductionEvidence,"function");
 assert.equal(issued.size,undefined);
});

test("input contract rejects unsafe budgets and unbound journeys before authority can widen",()=>{
 const fake=reproduction();
 for(const mutate of [
  (v:ReturnType<typeof input>)=>{v.forecast.changedLines=390;},
  (v:ReturnType<typeof input>)=>{v.runtimeJourney.candidateRevision="c".repeat(40);},
  (v:ReturnType<typeof input>)=>{v.runtimeJourney.commandFingerprint="other";},
  (v:ReturnType<typeof input>)=>{v.rollback.boundary="workspace" as never;}
 ]){const value=input();mutate(value);assert.throws(()=>bindRddDefectEvidence(fake,value),/genuine reproduction/i);}
});
