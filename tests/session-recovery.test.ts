import assert from "node:assert/strict";import test from "node:test";import {assertResumeRevision,createCheckpoint,restoreCheckpoint} from "../src/session/checkpoint.js";import {issueSkillContext} from "../src/skills/context.js";
import {isIssuedSkillContext} from "../src/skills/context.js";
import {mkdtemp,rm} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";
import {loadCheckpoint,saveCheckpoint} from "../src/session/checkpoint.js";
const task={id:"t",title:"x",phase:"VERIFYING" as const,candidateId:"c",blockers:["b"]};const candidate={id:"c",repository:"r",revision:"abc",createdAt:"now"};
function completedAgent(id:string,sessionId="s"){return {id,role:"worker",owner:{kind:"system" as const,id:"asen-dispatcher"},sessionId,projectId:"r",state:"completed" as const,createdAt:"2026-10-07T00:00:00Z",updatedAt:"2026-10-07T00:00:02Z",summary:"unverified prior output"};}
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

test("checkpoint carries agent lifecycle only for the exact session and candidate repository",()=>{const lifecycle=[completedAgent("t:worker")];const cp=createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,lifecycle);assert.equal(cp.agentLifecycle?.[0]?.state,"interrupted");const restored=restoreCheckpoint(cp,"p");assert.equal(restored.agentLifecycle?.[0]?.state,"interrupted");assert.equal(restored.agentLifecycle?.[0]?.summary,"unverified prior output");assert.notEqual(restored.agentLifecycle,lifecycle);assert.throws(()=>createCheckpoint("p","other",task,candidate,undefined,undefined,undefined,lifecycle),/agent lifecycle identity mismatch/);assert.throws(()=>createCheckpoint("p","s",task,{...candidate,repository:"other"},undefined,undefined,undefined,lifecycle),/agent lifecycle identity mismatch/);});
test("deserialized checkpoint lifecycle is observational and does not mint issued skill authority",()=>{const context=issueSkillContext("t","r",candidate,{phase:"verify",verification:true});const lifecycle=[completedAgent("t:verify")];const cp=JSON.parse(JSON.stringify(createCheckpoint("p","s",task,candidate,undefined,context,["skills/asen-verify/SKILL.md"],lifecycle)));const restored=restoreCheckpoint(cp,"p");assert.equal(isIssuedSkillContext(restored.skillContext),false);assert.equal(restored.agentLifecycle?.[0]?.state,"interrupted");});

test("checkpoint rejects forged duplicate oversized and stale lifecycle projections",()=>{const base={...completedAgent("a"),state:"completed" as const};assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,[base,{...base}]),/duplicate id/);assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,Array.from({length:257},(_,i)=>({...base,id:String(i)}))),/exceeds limit/);assert.throws(()=>createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,[{...base,updatedAt:"2026-10-06T23:59:59Z"}]),/lifecycle.*timestamp/);const forged=createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,[base]);forged.agentLifecycle![0]!.owner.kind="root" as never;assert.throws(()=>restoreCheckpoint(forged,"p"),/owner kind/);});

test("Pi checkpoint loading quarantines in-flight agents and preserves queued records and quarantines unverified completions",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-lifecycle-recovery-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const running={id:"running",role:"worker",owner:{kind:"system" as const,id:"asen-dispatcher"},sessionId:"s",projectId:"r",state:"running" as const,createdAt:"2026-10-07T00:00:00Z",updatedAt:"2026-10-07T00:00:01Z"};
 const queued={...running,id:"queued",state:"queued" as const,updatedAt:"2026-10-07T00:00:00Z"};
 const completed=completedAgent("completed");
 const file=join(dir,"checkpoint.json");await saveCheckpoint(file,createCheckpoint("p","s",task,candidate,undefined,undefined,undefined,[running,queued,completed]));
 const recovered=await loadCheckpoint(file,{projectId:"p",sessionId:"s",repository:"r",revision:"abc"});
 assert.equal(recovered.agentLifecycle?.find(item=>item.id==="running")?.state,"interrupted");
 assert.match(recovered.agentLifecycle?.find(item=>item.id==="running")?.summary??"",/explicit authorization required/);
 assert.equal(recovered.agentLifecycle?.find(item=>item.id==="queued")?.state,"queued");
 assert.equal(recovered.agentLifecycle?.find(item=>item.id==="completed")?.state,"interrupted");
 assert.equal(recovered.agentLifecycle?.find(item=>item.id==="completed")?.summary,"unverified prior output");
});
