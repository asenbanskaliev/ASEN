import assert from "node:assert/strict";import test from "node:test";import {assertResumeRevision,createCheckpoint,restoreCheckpoint} from "../src/session/checkpoint.js";import {issueSkillContext} from "../src/skills/context.js";
import {isIssuedSkillContext} from "../src/skills/context.js";
const task={id:"t",title:"x",phase:"VERIFYING" as const,candidateId:"c",blockers:["b"]};const candidate={id:"c",repository:"r",revision:"abc",createdAt:"now"};
test("checkpoint restores task and exact candidate",()=>{const cp=createCheckpoint("p","s",task,candidate),r=restoreCheckpoint(cp,"p");assert.deepEqual(r.task,task);assert.deepEqual(r.candidate,candidate);});
test("checkpoint cannot cross project boundary",()=>assert.throws(()=>restoreCheckpoint(createCheckpoint("A","s",task,candidate),"B"),/project mismatch/));
test("checkpoint rejects candidate mismatch",()=>assert.throws(()=>createCheckpoint("p","s",task,{...candidate,id:"other"}),/candidate mismatch/));
test("resume rejects repository drift",()=>assert.throws(()=>assertResumeRevision(candidate,"def"),/revision changed/));
test("checkpoint is detached from mutable task input",()=>{const cp=createCheckpoint("p","s",task,candidate);task.blockers.push("later");assert.deepEqual(cp.task.blockers,["b"]);task.blockers.pop();});

test("checkpoint preserves candidate-bound skill context and exact paths",()=>{
 const context=issueSkillContext("t","r",candidate,{phase:"verify",verification:true});
 const paths=["skills/asen-phase-protocol/SKILL.md","skills/asen-verify/SKILL.md"];
 const cp=createCheckpoint("p","s",task,candidate,undefined,context,paths);
 const r=restoreCheckpoint(cp,"p");
 assert.equal(r.skillContext,context);
 assert.deepEqual(r.skillPaths,paths);
});
test("checkpoint rejects a skill context issued for another candidate",()=>{
 const other={...candidate,revision:"old"};
 const context=issueSkillContext("t","r",other,{phase:"verify"});
 assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,context,["skills/asen-verify/SKILL.md"]),/skill context mismatch/);
});
test("checkpoint rejects invalid recovered skill paths",()=>{
 assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,undefined,["../other/SKILL.md"]),/invalid skill path/);
});
test("deserialized checkpoint cannot mint delegated authority",()=>{
 const context=issueSkillContext("t","r",candidate,{phase:"verify",verification:true});
 const checkpoint=JSON.parse(JSON.stringify(createCheckpoint("p","s",task,candidate,undefined,context,["skills/asen-phase-protocol/SKILL.md","skills/asen-verify/SKILL.md"])));
 const restored=restoreCheckpoint(checkpoint,"p");
 assert.equal(isIssuedSkillContext(restored.skillContext),false);
});

test("checkpoint carries agent lifecycle only for the exact session and candidate repository",()=>{const lifecycle=[{id:"t:worker",role:"worker",owner:{kind:"system" as const,id:"asen-dispatcher"},sessionId:"s",projectId:"r",state:"completed" as const,createdAt:"2026-10-07T00:00:00Z",updatedAt:"2026-10-07T00:00:01Z",summary:"ok"}];const cp=createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,lifecycle);const restored=restoreCheckpoint(cp,"p");assert.deepEqual(restored.agentLifecycle,lifecycle);assert.notEqual(restored.agentLifecycle,lifecycle);assert.throws(()=>createCheckpoint("p","other",task,candidate,undefined,undefined,undefined,lifecycle),/agent lifecycle identity mismatch/);assert.throws(()=>createCheckpoint("p","s",task,{...candidate,repository:"other"},undefined,undefined,undefined,lifecycle),/agent lifecycle identity mismatch/);});
test("deserialized checkpoint lifecycle is observational and does not mint issued skill authority",()=>{const context=issueSkillContext("t","r",candidate,{phase:"verify",verification:true});const lifecycle=[{id:"t:verify",role:"verifier",owner:{kind:"system" as const,id:"asen-dispatcher"},sessionId:"s",projectId:"r",state:"completed" as const,createdAt:"2026-10-07T00:00:00Z",updatedAt:"2026-10-07T00:00:01Z"}];const cp=JSON.parse(JSON.stringify(createCheckpoint("p","s",task,candidate,undefined,context,["skills/asen-verify/SKILL.md"],lifecycle)));const restored=restoreCheckpoint(cp,"p");assert.equal(isIssuedSkillContext(restored.skillContext),false);assert.equal(restored.agentLifecycle?.[0]?.state,"completed");});

test("checkpoint rejects forged duplicate oversized and stale lifecycle projections",()=>{const base={id:"a",role:"worker",owner:{kind:"system" as const,id:"asen-dispatcher"},sessionId:"s",projectId:"r",state:"completed" as const,createdAt:"2026-10-07T00:00:00Z",updatedAt:"2026-10-07T00:00:01Z"};assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,[base,{...base}]),/duplicate id/);assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,Array.from({length:257},(_,i)=>({...base,id:String(i)}))),/exceeds limit/);assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,[{...base,updatedAt:"2026-10-06T23:59:59Z"}]),/stale/);const forged=createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,[base]);forged.agentLifecycle![0]!.owner.kind="root" as never;assert.throws(()=>restoreCheckpoint(forged,"p"),/owner kind/);});
