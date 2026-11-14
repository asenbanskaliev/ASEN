import test from "node:test";
import assert from "node:assert/strict";
import {renderAgentConversation} from "../src/runtime/agent-conversation.js";
import {pendingAgentQuestion} from "../src/runtime/agent-store.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import type {AgentStoreEntry} from "../src/runtime/agent-store.js";
import type {PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";

const record:PublicAgentRecord={id:"agent-safe-id",role:"explorer",owner:{kind:"user",id:"pi:safe-session"},sessionId:"safe-session",projectId:"/workspace",state:"completed",createdAt:"2026-11-05T08:00:00Z",updatedAt:"2026-11-05T08:05:00Z"};

function entry(patch:{record?:PublicAgentRecord;prompt?:string;events?:AgentStoreEntry["events"];result?:AgentStoreEntry["result"]}={}):AgentStoreEntry{
 const base=patch.record??record;
 return {
  record:base,
  request:{id:base.id,role:base.role as AgentStoreEntry["request"]["role"],prompt:patch.prompt??"Investigate the startup cascade.",repository:base.projectId,isolationKey:base.sessionId,createdAt:base.createdAt},
  events:patch.events??[{id:base.id,revision:1,state:"queued",at:"2026-11-05T08:00:00Z"},{id:base.id,revision:2,state:"completed",at:"2026-11-05T08:05:00Z"}],
  ...(patch.result===undefined?{}:{result:patch.result}),
 };
}

test("conversation view labels the durable record and never claims the model transcript",()=>{
 const rows=renderAgentConversation(entry({result:{id:record.id,ok:true,output:"All ten phases were read.",sha256:"a".repeat(64)}}),96);
 assert.ok(Object.isFrozen(rows));
 assert.ok(rows.some(row=>row.includes("Durable record")));
 assert.ok(rows.some(row=>row.includes("not the model transcript")));
 assert.ok(rows.some(row=>row.includes("Investigate the startup cascade.")));
 assert.ok(rows.some(row=>row.includes("queued")));
 assert.ok(rows.some(row=>row.includes("All ten phases were read.")));
 assert.ok(rows.some(row=>row.includes("aaaaaaaa")));
 assert.ok(rows.some(row=>row.includes("no approval")));
 for(const row of rows){
  assert.ok(visibleWidth(row)<=96,"row exceeds width: "+row);
  assert.ok(!row.includes("\u001b"));
  assert.ok(!row.includes("\n"));
 }
});

test("conversation view sanitizes hostile prompt, output and event text",()=>{
 const events=[
  {id:record.id,revision:1,state:"running" as const,at:"2026-11-05T08:01:00Z",summary:"\u001b[31m MALICIOUS\nSTATE"},
  {id:record.id,revision:2,state:"completed" as const,at:"2026-11-05T08:05:00Z"},
 ];
 const rows=renderAgentConversation(entry({prompt:"\u001b[31m MALICIOUS\nPROMPT \u0007",events,result:{id:record.id,ok:true,output:"\u001b]0;pwned\u0007line one\nline two",sha256:"b".repeat(64)}}),60);
 assert.ok(rows.every(row=>!row.includes("\u001b")&&!row.includes("\u0007")&&!row.includes("\n")));
 assert.ok(rows.every(row=>visibleWidth(row)<=60));
 assert.ok(rows.some(row=>row.includes("MALICIOUS")));
 assert.equal(events[0]!.summary,"\u001b[31m MALICIOUS\nSTATE");
});

test("conversation view reports a pending question and an absent result honestly",()=>{
 const waiting={...record,state:"waiting",pendingQuestion:{id:"q1",text:"Which branch should I use?",askedAt:Date.parse("2026-11-05T08:04:00Z")}} as unknown as PublicAgentRecord;
 const rows=renderAgentConversation(entry({record:waiting,events:[
  {id:record.id,revision:1,state:"queued",at:"2026-11-05T08:00:00Z"},
  {id:record.id,revision:2,state:"running",at:"2026-11-05T08:01:00Z"},
 ]}),100);
 assert.ok(rows.some(row=>row.includes("Which branch should I use?")));
 assert.ok(rows.some(row=>row.includes("No authenticated result recorded")));
 assert.ok(!rows.some(row=>row.includes("RESULT (authenticated")));
});

test("pending question is read through the store validator and never invented",()=>{
 const waiting={...record,state:"waiting",pendingQuestion:{id:"q1",text:"Which branch should I use?",askedAt:1}} as unknown as PublicAgentRecord;
 assert.deepEqual(pendingAgentQuestion(waiting),{id:"q1",text:"Which branch should I use?",askedAt:1});
 assert.equal(pendingAgentQuestion(record),undefined);
 const malformed={...record,state:"waiting",pendingQuestion:{id:"q1",text:"bad\u0007question",askedAt:1}} as unknown as PublicAgentRecord;
 assert.equal(pendingAgentQuestion(malformed),undefined);
});

test("conversation view truncates long prompt and output with an explicit marker",()=>{
 const rows=renderAgentConversation(entry({prompt:"x".repeat(5000),result:{id:record.id,ok:true,output:"y".repeat(9000),sha256:"c".repeat(64)}}),80);
 assert.ok(rows.some(row=>/truncated/u.test(row)));
 assert.ok(rows.every(row=>visibleWidth(row)<=80));
 assert.ok(rows.length<400);
});

test("conversation view rejects an out-of-range width",()=>{
 assert.throws(()=>renderAgentConversation(entry(),9),/width/u);
 assert.throws(()=>renderAgentConversation(entry(),1001),/width/u);
});
