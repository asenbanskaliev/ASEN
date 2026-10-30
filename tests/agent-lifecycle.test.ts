import test from "node:test";import assert from "node:assert/strict";import {createAsenExtension} from "../extensions/asen.js";import {agentStatusRows,createAgentLifecycleSink,createAgentRecord,transitionAgent,recoverAgentLifecycleRecords} from "../src/runtime/agent-lifecycle.js";
test("public agent lifecycle binds owner/session/project and completion requires an in-process runner result",()=>{const q=createAgentRecord({id:"a",role:"worker",owner:{kind:"user",id:"u"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});const r=transitionAgent(q,"running","2026-10-06T00:00:01Z");assert.throws(()=>transitionAgent(r,"completed","2026-10-06T00:00:02Z","done"),/in-process runner result/);const sink=createAgentLifecycleSink(()=>"2026-10-06T00:00:02Z");sink.queued({id:"a",role:"worker",owner:{kind:"user",id:"u"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});sink.running("a","2026-10-06T00:00:01Z");assert.throws(()=>sink.completed("a",{id:"a",ok:true,output:"done"},"2026-10-06T00:00:02Z"),/Dispatcher result/);const d=sink.snapshot()[0]!;assert.equal(d.state,"running");assert.throws(()=>transitionAgent(r,"completed","2026-10-05T00:00:00Z"),/in-process runner result/);});
test("agent status is bounded for narrow terminals and preserves the task id before its summary",()=>{
 const q=createAgentRecord({id:"agent-0123456789abcdef0123456789",role:"worker",owner:{kind:"agent",id:"parent"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});
 const normal=agentStatusRows([{...q,summary:"a result long enough to require truncation in the status output"}])[0]!;
 assert.ok(normal.includes(q.id),"the visible status must retain the id needed for a follow-up action");
 assert.ok(normal.endsWith("…"),"long summaries should be truncated after the task id");
 assert.ok(agentStatusRows([q],30)[0]!.length<=30);
});
test("interrupted agent status keeps the review-required warning visible at 80 columns",()=>{
 const q=createAgentRecord({id:"agent-package-interrupted",role:"explorer",owner:{kind:"user",id:"pi:asen-package-reopen-session"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});
 const row=agentStatusRows([{...q,state:"interrupted",summary:"Interrupted; explicit review is required before continuing"}],80)[0]!;
 assert.ok(row.includes(q.id));assert.ok(row.includes("review required"));assert.ok(row.indexOf(q.id)<row.indexOf("review required"));assert.ok(row.length<=80);
});
test("registered agent status command makes hostile display controls visible without mutating provider records",async()=>{
 const hostile=createAgentRecord({id:"agent\u200b-id",role:"work\u2028er",owner:{kind:"agent",id:"own\u2029er"},sessionId:"s",projectId:"p",createdAt:"2028-10-06T00:00:00Z"});
 const benign=createAgentRecord({id:"task-plain",role:"worker",owner:{kind:"user",id:"owner"},sessionId:"s",projectId:"p",createdAt:"2029-10-06T00:00:00Z"});
 const records=[{...hostile,summary:"task-42\tline\u0007\u009b\u2066done"},benign],before=structuredClone(records),commands=new Map<string,{handler:(...args:any[])=>unknown}>(),messages:string[]=[];
 createAsenExtension({agents:()=>records})( {registerCommand:(name:string,command:any)=>commands.set(name,command)} );
 const rows=await commands.get("asen-agents")!.handler("",{ui:{notify:(message:string)=>messages.push(message)}}) as string[];
 assert.equal(rows[0],"queued      work�er agent:own�er agent�-id — task-42�line���done");
 assert.equal(rows[1],"queued      worker user:owner task-plain");
 assert.deepEqual(messages,[rows.join("\n")]);
 assert.doesNotMatch(rows.join(""),/[\p{Cc}\p{Cf}\u2028\u2029]/u);
 assert.deepEqual(records,before);
});
test("agent lifecycle rejects invalid transition timestamps",()=>{const q=createAgentRecord({id:"a",role:"worker",owner:{kind:"user",id:"u"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});assert.throws(()=>transitionAgent(q,"running","not-a-time"),/timestamp/i);assert.throws(()=>transitionAgent({...q,updatedAt:"broken"},"running","2026-10-06T00:00:01Z"),/timestamp/i);});
test("agent lifecycle rejects forged owners and unsafe attribution identifiers",()=>{const base={id:"a",role:"worker",owner:{kind:"user" as const,id:"u"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"};assert.throws(()=>createAgentRecord({...base,owner:{kind:"admin" as never,id:"u"}}),/owner kind/i);for(const field of ["id","role","sessionId","projectId"] as const)assert.throws(()=>createAgentRecord({...base,[field]:"bad\nvalue"}),/identity/i);});

test("lifecycle sink owns one bounded record per dispatched identity and rejects caller-forged completion",()=>{const sink=createAgentLifecycleSink(()=>"2026-10-06T00:00:02Z");sink.queued({id:"a",role:"worker",owner:{kind:"system",id:"dispatcher"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:00Z"});sink.running("a","2026-10-06T00:00:01Z");assert.throws(()=>sink.completed("a",{id:"a",ok:true,output:"fake"}),/Dispatcher result/);const [record]=sink.snapshot();assert.equal(record?.state,"running");assert.throws(()=>sink.queued({id:"a",role:"worker",owner:{kind:"system",id:"dispatcher"},sessionId:"s",projectId:"p",createdAt:"2026-10-06T00:00:03Z"}),/already exists/);});

test("lifecycle clock permits equal and increasing transitions and rejects stale time",()=>{let at="2026-10-07T00:00:00Z";const sink=createAgentLifecycleSink(()=>at);const input={id:"clock",role:"worker",owner:{kind:"system" as const,id:"asen"},sessionId:"s",projectId:"p",createdAt:sink.createdAt()};sink.queued(input);sink.running("clock");at="2026-10-07T00:00:01Z";sink.failed("clock","test",at);assert.equal(sink.snapshot()[0]?.updatedAt,at);const stale=createAgentRecord({...input,id:"stale",createdAt:"2026-10-07T00:00:02Z"});assert.throws(()=>transitionAgent(stale,"running","2026-10-07T00:00:01Z"),/stale/);});

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

test("restart recovery quarantines persisted executions without calling them failed",()=>{
 const base=createAgentRecord({id:"inflight",role:"worker",owner:{kind:"system",id:"asen"},sessionId:"s",projectId:"p",createdAt:"2026-10-07T00:00:00Z"});
 const running=transitionAgent(base,"running","2026-10-07T00:00:01Z");
 const completed={...running,id:"done",state:"completed" as const,updatedAt:"2026-10-07T00:00:02Z",summary:"unverified prior output"};
 const recovered=recoverAgentLifecycleRecords([running,completed],"2026-10-07T00:00:03Z");
 assert.deepEqual(recovered.map(r=>r.state),["interrupted","interrupted"]);
 assert.match(recovered[0]?.summary??"",/explicit authorization required/);
 assert.equal(recovered[1]?.summary,"unverified prior output");
 assert.throws(()=>transitionAgent(recovered[0]!,"completed","2026-10-07T00:00:04Z"),/Invalid agent transition/);
 assert.throws(()=>transitionAgent(recovered[0]! ,"running","2026-10-07T00:00:04Z"),/new authorized dispatch/);
 assert.throws(()=>recoverAgentLifecycleRecords([running,running],"2026-10-07T00:00:03Z"),/Invalid lifecycle recovery record/);
 const unproven={...running,id:"unproven",state:"completed" as const,updatedAt:"2026-10-07T00:00:02Z",summary:"claimed"};
 assert.equal(recoverAgentLifecycleRecords([unproven],"2026-10-07T00:00:03Z")[0]?.state,"interrupted");
});
