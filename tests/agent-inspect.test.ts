import test from "node:test";
import assert from "node:assert/strict";
import {renderAgentInspection} from "../src/runtime/agent-inspect.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import type {PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";
import type {AgentStateEvent} from "../src/runtime/agent-store.js";
const record:PublicAgentRecord={id:"agent-safe-id",role:"explorer",owner:{kind:"user",id:"pi:safe-session"},sessionId:"safe-session",projectId:"/workspace",state:"interrupted",createdAt:"2026-11-05T08:00:00Z",updatedAt:"2026-11-05T08:05:00Z"};
test("M2 agent detail renders persisted lifecycle, never fabricates Pi message transcript",()=>{
 const events:AgentStateEvent[]=[
  {id:record.id,revision:2,state:"running",at:"2026-11-05T08:01:00Z",summary:"\u001b[31m MALICIOUS\nSTATE"},
  {id:record.id,revision:1,state:"queued",at:"2026-11-05T08:00:00Z"},
 ];
 const rows=renderAgentInspection({record,history:events},46);
 assert.ok(rows.some(row=>row.includes("Persistent lifecycle")));
 assert.ok(rows.some(row=>row.includes("queued")));
 assert.ok(rows.some(row=>row.includes("running")));
 assert.ok(rows.some(row=>row.includes("Interrupted")));
 assert.ok(rows.some(row=>row.includes("metadata unavailable")));
 assert.ok(rows.every(row=>visibleWidth(row)<=46&&!row.includes("\u001b")&&!row.includes("\n")));
 assert.equal(events[0]!.state,"running");
});
test("M2 agent inspection rejects invalid widths and caps long histories",()=>{
 const events=Array.from({length:100},(_,i)=>({id:record.id,revision:i+1,state:"running" as const,at:"2026-11-05T08:00:00Z"}));
 const out=renderAgentInspection({record,history:events},90);
 assert.ok(out.some(row=>row.includes("60 older events")));
 assert.throws(()=>renderAgentInspection({record,history:events},9),/width/u);
});
