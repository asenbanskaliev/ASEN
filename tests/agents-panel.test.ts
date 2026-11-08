import assert from "node:assert/strict";
import test from "node:test";
import {projectAgentHierarchy,type AgentHierarchyInput,type AgentHierarchyRecord} from "../src/runtime/agents-panel.js";

const identity={sessionId:"session-owned",projectId:"D:/work/opaque-project"};
const at=(minute:number)=>`2026-11-08T10:${String(minute).padStart(2,"0")}:00.000Z`;
function record(id:string,overrides:Partial<AgentHierarchyRecord>={}):AgentHierarchyRecord{
 const createdAt=at(0),updatedAt=at(1);
 return {id,role:"explorer",owner:{kind:"user",id:"owner-agent-looking-label"},...identity,state:"running",createdAt,updatedAt,
  history:[{id,revision:1,state:"queued",at:createdAt},{id,revision:2,state:"running",at:updatedAt}],...overrides};
}
function input(records:readonly AgentHierarchyRecord[],associations:AgentHierarchyInput["associations"]=[]):AgentHierarchyInput{return {identity,records,associations};}

function byId(rows:ReturnType<typeof projectAgentHierarchy>,id:string){const row=rows.find(candidate=>candidate.id===id);assert.ok(row,`missing ${id}`);return row;}

test("preserves exact opaque IDs when display-like prefixes collide",()=>{
 const left="opaque-agent-1234567890-LEFT",right="opaque-agent-1234567890-RIGHT";
 const rows=projectAgentHierarchy(input([record(right,{createdAt:at(2),updatedAt:at(3)}),record(left)]));
 assert.deepEqual(rows.map(row=>row.id),[left,right]);
 assert.equal(byId(rows,left).id,left);assert.equal(byId(rows,right).id,right);
});

test("proves only same-scope Explorer continuations and leaves missing or cyclic ancestry flat",()=>{
 const rows=projectAgentHierarchy(input([
  record("root"),
  record("child",{continuationOf:"root",createdAt:at(2),updatedAt:at(3)}),
  record("owner-is-not-parent",{owner:{kind:"agent",id:"root"},createdAt:at(4),updatedAt:at(5)}),
  record("missing",{continuationOf:"absent",createdAt:at(6),updatedAt:at(7)}),
  record("cycle-a",{continuationOf:"cycle-b",createdAt:at(8),updatedAt:at(9)}),
  record("cycle-b",{continuationOf:"cycle-a",createdAt:at(10),updatedAt:at(11)}),
 ]));
 assert.deepEqual(byId(rows,"root").lineage,{kind:"root"});
 assert.deepEqual(byId(rows,"child").lineage,{kind:"proven",parentId:"root"});assert.equal(byId(rows,"child").depth,1);
 assert.deepEqual(byId(rows,"owner-is-not-parent").lineage,{kind:"root"});
 for(const id of ["missing","cycle-a","cycle-b"]){assert.equal(byId(rows,id).lineage.kind,"unresolved");assert.equal(byId(rows,id).depth,0);}
});

test("fails closed on duplicate records and foreign or conflicting task audit associations",()=>{
 const owned=record("agent-exact");
 assert.throws(()=>projectAgentHierarchy(input([owned,record("agent-exact")])),/duplicate/iu);
 assert.throws(()=>projectAgentHierarchy(input([owned],[{taskId:"task-1",agentId:owned.id,sessionId:"foreign",projectId:identity.projectId}])),/scope/iu);
 assert.throws(()=>projectAgentHierarchy(input([owned],[
  {taskId:"task-1",agentId:owned.id,...identity},{taskId:"task-2",agentId:owned.id,...identity},
 ])),/association/iu);
 const linked=projectAgentHierarchy(input([owned],[{taskId:"task-opaque-0001",agentId:owned.id,...identity}]));
 assert.deepEqual(linked[0]?.association,{kind:"task",taskId:"task-opaque-0001"});
});

test("rebuilds whitelisted rows without reading private content getters",()=>{
 let privateReads=0;const owned=record("private-boundary") as AgentHierarchyRecord&Record<string,unknown>;
 for(const key of ["request","prompt","result","model","thinking","dedupeKey","process","summary"])
  Object.defineProperty(owned,key,{enumerable:true,get(){privateReads++;throw new Error(`private ${key} read`);}});
 const rows=projectAgentHierarchy(input([owned]));
 assert.equal(privateReads,0);assert.doesNotMatch(JSON.stringify(rows),/request|prompt|result|model|thinking|dedupe|process|summary/iu);
 assert.deepEqual(Object.keys(rows[0]!).sort(),["association","createdAt","depth","history","id","lineage","owner","projectId","role","sessionId","state","updatedAt"].sort());
});

test("sorts copied lifecycle events without mutating any input",()=>{
 const owned=record("immutable",{history:[
  {id:"immutable",revision:2,state:"running",at:at(1)},
  {id:"immutable",revision:1,state:"queued",at:at(0)},
 ]});
 const associations=[{taskId:"task-immutable",agentId:owned.id,...identity}] as const;
 const value=input([owned],associations),before=structuredClone(value);
 const rows=projectAgentHierarchy(value);
 assert.deepEqual(value,before);assert.deepEqual(rows[0]?.history.map(event=>event.revision),[1,2]);
 assert.notEqual(rows[0]?.history,owned.history);assert.notEqual(rows[0]?.owner,owned.owner);
});
import {renderAgentFollowTail,selectAgentFollowTail,type AgentFollowQuery} from "../src/runtime/agents-panel.js";
import type {AgentNoticeRow} from "../src/runtime/agent-notification-journal.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

const notice=(overrides:Partial<AgentNoticeRow>&{agentId:string,sessionId:string,projectId:string,updatedAt:string}):AgentNoticeRow=>Object.freeze({
 eventId:`asen:agent:${overrides.agentId}:${overrides.updatedAt.slice(11,19)}:terminal`,state:"completed",delivery:"enqueued",createdAt:"2026-11-08T10:00:00.000Z",...overrides});
const followQuery:AgentFollowQuery={agentId:"agent-owned",sessionId:"session-owned",projectId:"D:/work/opaque-project"};

test("M2-02 follow tail selects only the trusted agent inside the exact session and project scope",()=>{
 const rows=[
  notice({agentId:"agent-owned",...identity,updatedAt:at(2)}),
  notice({agentId:"agent-owned",sessionId:"session-other",projectId:identity.projectId,updatedAt:at(3)}),
  notice({agentId:"agent-owned",sessionId:identity.sessionId,projectId:"D:/work/other-project",updatedAt:at(4)}),
  notice({agentId:"agent-other",...identity,updatedAt:at(5)}),
  notice({agentId:"agent-owned",...identity,updatedAt:at(6)}),
 ];
 const tail=selectAgentFollowTail(rows,followQuery);
 assert.deepEqual(tail.map(row=>row.updatedAt),[at(2),at(6)]);
});
test("M2-02 follow tail bounds memory with an ascending last-N window",()=>{
 const rows=Array.from({length:100},(_,i)=>notice({agentId:"agent-owned",...identity,updatedAt:`2026-11-08T10:${String(i%60).padStart(2,"0")}:${String(Math.floor(i/60)).padStart(2,"0")}.000Z`}));
 const tail=selectAgentFollowTail(rows,followQuery,40);
 assert.equal(tail.length,40);
 assert.ok(tail.every((row,i,arr)=>i===0||arr[i-1]!.updatedAt<=row.updatedAt));
 assert.throws(()=>selectAgentFollowTail(rows,followQuery,0),/limit/u);
 assert.throws(()=>selectAgentFollowTail(rows,followQuery,101),/limit/u);
});
test("M2-02 rendered follow tail shows enqueued verbatim and never claims delivery, acknowledgement or consumption",()=>{
 const rows=[notice({agentId:"agent-owned",...identity,updatedAt:at(2),delivery:"enqueued"})];
 const out=renderAgentFollowTail(rows,followQuery,80);
 assert.ok(out.some(row=>row.includes("delivery: enqueued")));
 assert.ok(out.some(row=>row.includes("FOLLOW")));
 assert.ok(out.some(row=>row.includes("queueing grants no consumption or authorization")));
 assert.ok(!out.some(row=>/delivered|acknowledged|consumed/iu.test(row)));
 assert.ok(out.every(row=>visibleWidth(row)<=80&&!row.includes("\u001b")&&!row.includes("\n")));
 const ack=renderAgentFollowTail([notice({agentId:"agent-owned",...identity,updatedAt:at(2),delivery:"acknowledged"})],followQuery,80);
 assert.ok(ack.some(row=>row.includes("delivery: acknowledged")));
});
test("M2-02 follow fails closed without a trusted identity and states an empty tail honestly",()=>{
 assert.throws(()=>selectAgentFollowTail([],{...followQuery,agentId:""}),/identity/u);
 assert.throws(()=>selectAgentFollowTail([],{...followQuery,sessionId:""}),/identity/u);
 const out=renderAgentFollowTail([],followQuery,80);
 assert.ok(out.some(row=>row.includes("No agent notification journal entries")));
 assert.ok(!out.some(row=>/acknowledged|delivered/iu.test(row)));
});
