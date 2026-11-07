/** Separate OS-process reopening of an authentic Pi child's interrupted stream.
 * This process has NO provider credential and must never dispatch any task.
 */
import assert from "node:assert/strict";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";
const {ASEN_STREAM_STORE:store,ASEN_STREAM_JOURNAL:journal,
 ASEN_STREAM_AGENT:id,ASEN_STREAM_SESSION:sessionId,
 ASEN_STREAM_PROJECT:projectId}=process.env;
assert.ok(store&&journal&&id&&sessionId&&projectId,"Exact scoped durable identity required");
for(const key of Object.keys(process.env)){
 if(/(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/iu.test(key))
  assert.equal(key.startsWith("ASEN_STREAM_"),true,"Verifier must not receive model secrets");
}
let replayedCalls=0;
const runtime=await AgentRuntime.open({
 storeFile:store,runner:{run:async()=>{
  replayedCalls++;throw Error("FORBIDDEN_PROVIDER_REPLAY_ON_RESTART");
 }}
});
const scope={sessionId,projectId};
const rows=await runtime.list(scope);
assert.equal(rows.length,1,"Exactly one original durable child task required");
assert.equal(rows[0].id,id);
assert.equal(rows[0].role,"explorer");
assert.equal(rows[0].state,"cancelled");
assert.equal((await runtime.query(id,scope))?.record.state,"cancelled");
await assert.rejects(()=>runtime.continue(id,scope),
 /cannot be resumed safely|interrupted|not available/u,
 "A cancelled child cannot acquire implicit continuation authority");
const notices=await new AgentNotificationJournal(journal).list(scope);
assert.equal(notices.length,1);
assert.equal(notices[0].agentId,id);
assert.equal(notices[0].state,"cancelled");
assert.equal(notices[0].delivery,"pending");
assert.equal(replayedCalls,0);
console.log(JSON.stringify({
 result:"PASS_CANCELLED_PI_READONLY_REOPEN",agentId:id,
 durableState:"cancelled",noticeDelivery:"pending",
 replayedCalls:0,writerAuthorized:false,globalFull:false
}));
