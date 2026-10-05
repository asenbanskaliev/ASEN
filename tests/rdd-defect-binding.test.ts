import assert from "node:assert/strict";
import test from "node:test";
import type {RddReproductionEvidence} from "../src/defects/rdd-reproduction.js";
import {bindRddDefectEvidence} from "../src/defects/rdd-defect-binding.js";

const fabricated=()=>Object.freeze({schemaVersion:1,repositoryUrl:"https://github.example/acme/app",issueUrl:"https://github.example/acme/app/issues/17",mainCommitIdentity:"a".repeat(40),candidate:Object.freeze({id:"candidate-1",repository:"repo",revision:"b".repeat(40)}),reproductionCaseIds:Object.freeze(["defect case"]),negativeControlCaseIds:Object.freeze(["negative control"]),observation:Object.freeze({adapterId:"node-test",commandFingerprint:"fingerprint",testPaths:Object.freeze(["reproduction.test.mjs"]),executedCaseIds:Object.freeze(["defect case","negative control"]),failingCaseIds:Object.freeze(["defect case"]),assertionFingerprint:"assertion",failureKind:"assertion"}),repeatedRuns:2}) as RddReproductionEvidence;
const input=()=>({invariantIds:["approved-issue","current-main","deterministic-reproduction"],operatorFlows:[{id:"inspect-reproduce",from:"approved issue",to:"reproduced defect",failureTo:"blocked"}],runtimeJourney:{commandFingerprint:"fingerprint",result:"reproduced" as const,candidateRevision:"b".repeat(40),limitations:["no delivery authority"]},rollback:{boundary:"candidate" as const,procedure:["discard candidate"]},forecast:{changedLines:200,verificationEffort:"focused deterministic tests",remainingUncertainty:["independent verification pending"]}});

test("D3 rejects structural or cloned reproduction evidence",()=>{
 const fake=fabricated();assert.throws(()=>bindRddDefectEvidence(fake,input()),/genuine reproduction/i);assert.throws(()=>bindRddDefectEvidence(structuredClone(fake),input()),/genuine reproduction/i);
});
test("D3 never treats malformed caller metadata as reproduction authority",()=>{
 const fake=fabricated();for(const value of [null,{},Object.assign(input(),{extra:true})])assert.throws(()=>bindRddDefectEvidence(fake,value as never),/genuine reproduction/i);
});
