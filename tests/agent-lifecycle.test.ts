import test from "node:test";import assert from "node:assert/strict";import {agentStatusRows,createAgentLifecycleSink,createAgentRecord,transitionAgent} from "../src/runtime/agent-lifecycle.js";
test("public agent lifecycle binds owner/session/project and is monotonic",()=>{const q=createAgentRecord({id:"a",role:"worker",owner:{kind:"user",id:"u"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});const r=transitionAgent(q,"running","2026-10-06T00:00:01Z"),d=transitionAgent(r,"completed","2026-10-06T00:00:02Z","done");assert.equal(d.summary,"done");assert.throws(()=>transitionAgent(d,"running","2026-10-06T00:00:03Z"),/Terminal/);assert.throws(()=>transitionAgent(r,"completed","2026-10-05T00:00:00Z"),/stale/);});
test("agent status is bounded for narrow terminals",()=>{const q=createAgentRecord({id:"very-long-agent-id",role:"worker",owner:{kind:"agent",id:"parent"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});assert.ok(agentStatusRows([q],30)[0]!.length<=30);});
test("agent lifecycle rejects invalid transition timestamps",()=>{const q=createAgentRecord({id:"a",role:"worker",owner:{kind:"user",id:"u"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});assert.throws(()=>transitionAgent(q,"running","not-a-time"),/timestamp/i);assert.throws(()=>transitionAgent({...q,updatedAt:"broken"},"running","2026-10-06T00:00:01Z"),/timestamp/i);});
test("agent lifecycle rejects forged owners and unsafe attribution identifiers",()=>{const base={id:"a",role:"worker",owner:{kind:"user" as const,id:"u"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"};assert.throws(()=>createAgentRecord({...base,owner:{kind:"admin" as never,id:"u"}}),/owner kind/i);for(const field of ["id","role","sessionId","projectId"] as const)assert.throws(()=>createAgentRecord({...base,[field]:"bad\nvalue"}),/identity/i);});

test("lifecycle sink owns one bounded record per dispatched identity",()=>{let n=0;const sink=createAgentLifecycleSink(()=>`2026-10-06T00:00:0${n++}Z`);sink.queued({id:"a",role:"worker",owner:{kind:"system",id:"dispatcher"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});sink.running("a");sink.completed("a","ok");const [record]=sink.snapshot();assert.equal(record?.state,"completed");assert.equal(record?.summary,"ok");assert.throws(()=>sink.queued({id:"a",role:"worker",owner:{kind:"system",id:"dispatcher"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:03Z"}),/already exists/);});

test("lifecycle clock permits equal and increasing transitions and rejects stale time",()=>{let at="2026-10-07T00:00:00Z";const sink=createAgentLifecycleSink(()=>at);const input={id:"clock",role:"worker",owner:{kind:"system" as const,id:"asen"},sessionId:"s",projectId:"p",createdAt:sink.createdAt()};sink.queued(input);sink.running("clock");at="2026-10-07T00:00:01Z";sink.completed("clock","ok");assert.equal(sink.snapshot()[0]?.updatedAt,at);const stale=createAgentRecord({...input,id:"stale",createdAt:"2026-10-07T00:00:02Z"});assert.throws(()=>transitionAgent(stale,"running","2026-10-07T00:00:01Z"),/stale/);});

test("agent lifecycle rejects invalid timestamp types before parsing",()=>{
 const input={id:"timestamp",role:"worker",owner:{kind:"system" as const,id:"asen"},sessionId:"s",projectId:"p",createdAt:"2026-10-07T00:00:00Z"};
 assert.throws(()=>createAgentRecord({...input,createdAt:0 as unknown as string}),/Invalid timestamp/);
 const record=createAgentRecord(input);
 assert.throws(()=>transitionAgent(record,"running",0 as unknown as string),/Invalid agent transition timestamp/);
});

test("agent lifecycle fails safely for absent or invalid owner data",()=>{
 const base={id:"owner",role:"worker",sessionId:"s",projectId:"p",createdAt:"2026-10-07T00:00:00Z"};
 assert.throws(()=>createAgentRecord({...base,owner:undefined as unknown as {kind:"user";id:string}}),/Invalid agent owner kind|Agent identity/);
 assert.throws(()=>createAgentRecord({...base,owner:{kind:"invalid" as "user",id:"a"}}),/Invalid agent owner kind/);
});

test("agent lifecycle rejects absent input without dereferencing it",()=>{
 assert.throws(()=>createAgentRecord(undefined as unknown as Parameters<typeof createAgentRecord>[0]),/Agent identity is incomplete or invalid/);
 assert.throws(()=>createAgentRecord(null as unknown as Parameters<typeof createAgentRecord>[0]),/Agent identity is incomplete or invalid/);
});

test("agent transitions reject missing records and unknown states",()=>{
 assert.throws(()=>transitionAgent(null as unknown as ReturnType<typeof createAgentRecord>,"running","2026-10-07T00:00:00Z"),/Invalid agent state/);
 const record=createAgentRecord({id:"state",role:"worker",owner:{kind:"system",id:"asen"},sessionId:"s",projectId:"p",createdAt:"2026-10-07T00:00:00Z"});
 assert.throws(()=>transitionAgent({...record,state:"unknown" as "queued"},"running","2026-10-07T00:00:01Z"),/Invalid agent state/);
});
