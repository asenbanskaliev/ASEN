import assert from "node:assert/strict";import test from "node:test";import {assertResumeRevision,createCheckpoint,restoreCheckpoint} from "../src/session/checkpoint.js";
const task={id:"t",title:"x",phase:"VERIFYING" as const,candidateId:"c",blockers:["b"]};const candidate={id:"c",repository:"r",revision:"abc",createdAt:"now"};
test("checkpoint restores task and exact candidate",()=>{const cp=createCheckpoint("p","s",task,candidate),r=restoreCheckpoint(cp,"p");assert.deepEqual(r.task,task);assert.deepEqual(r.candidate,candidate);});
test("checkpoint cannot cross project boundary",()=>assert.throws(()=>restoreCheckpoint(createCheckpoint("A","s",task,candidate),"B"),/project mismatch/));
test("checkpoint rejects candidate mismatch",()=>assert.throws(()=>createCheckpoint("p","s",task,{...candidate,id:"other"}),/candidate mismatch/));
test("resume rejects repository drift",()=>assert.throws(()=>assertResumeRevision(candidate,"def"),/revision changed/));
test("checkpoint is detached from mutable task input",()=>{const cp=createCheckpoint("p","s",task,candidate);task.blockers.push("later");assert.deepEqual(cp.task.blockers,["b"]);task.blockers.pop();});
