import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {AgentNotificationJournal,agentNoticeEventId} from "../src/runtime/agent-notification-journal.js";
const subject={id:"agent-1",sessionId:"session-a",projectId:"/project-a",state:"completed"};
async function fixture(t:import("node:test").TestContext){
 const dir=await mkdtemp(join(tmpdir(),"asen-agent-notice-"));
 t.after(()=>rm(dir,{force:true,recursive:true}));
 const file=join(dir,"journal.json");
 return {file,journal:new AgentNotificationJournal(file)};
}
test("EF-604 verified terminal outcome is pending before transport and survives reopening",async t=>{
 const {file,journal}=await fixture(t);
 const first=await journal.record(subject);
 assert.equal(first.delivery,"pending");
 const next=new AgentNotificationJournal(file);
 assert.deepEqual(await next.list(subject),[first]);
 assert.equal((await next.record(subject)).eventId,first.eventId);
 assert.equal((await next.list(subject)).length,1);
});
test("EF-604 two concurrent processes can claim a terminal notice only once",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 const other=new AgentNotificationJournal(file);
 const claimed=await Promise.all([journal.claim(row.eventId,subject),other.claim(row.eventId,subject)]);
 assert.deepEqual(claimed.sort(),[false,true]);
 assert.equal((await other.list(subject))[0]?.delivery,"attempted");
 assert.equal(await journal.claim(row.eventId,subject),false);
});
test("EF-604 attempted notice remains uncertain after restart, never auto-replayed",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 assert.equal(await journal.claim(row.eventId,subject),true);
 const reopened=new AgentNotificationJournal(file);
 const entries=await reopened.list(subject);
 assert.equal(entries.filter(x=>x.delivery==="pending").length,0);
 assert.equal(entries.filter(x=>x.delivery==="attempted").length,1);
 assert.equal(await reopened.claim(row.eventId,subject),false);
});
test("EF-604 enqueue confirmation is distinct from user consumption and cannot be forged before claim",async t=>{
 const {file,journal}=await fixture(t);
 const row=await journal.record(subject);
 await assert.rejects(()=>journal.markEnqueued(row.eventId,subject),/claimed/);
 await journal.claim(row.eventId,subject);
 assert.equal(await journal.markEnqueued(row.eventId,subject),true);
 assert.equal(await journal.markEnqueued(row.eventId,subject),false);
 const reloaded=(await new AgentNotificationJournal(file).list(subject))[0];
 assert.equal(reloaded?.delivery,"enqueued");
 assert.equal("consumed" in (reloaded??{}),false);
});
test("EF-604 session and project boundaries prevent notice claims and reads",async t=>{
 const {journal}=await fixture(t);
 const row=await journal.record(subject);
 await assert.rejects(()=>journal.claim(row.eventId,{sessionId:"foreign",projectId:subject.projectId}),/unavailable/);
 await assert.rejects(()=>journal.markEnqueued(row.eventId,{sessionId:subject.sessionId,projectId:"/other"}),/unavailable/);
 assert.deepEqual(await journal.list({sessionId:"foreign",projectId:subject.projectId}),[]);
 assert.notEqual(agentNoticeEventId({...subject,sessionId:"foreign"}),row.eventId);
 assert.equal((await journal.list(subject))[0]?.delivery,"pending");
});
test("EF-604 invalid or corrupted journal fails closed and preserves source bytes",async t=>{
 const {file,journal}=await fixture(t);
 const raw=JSON.stringify({schema:"asen.agent-notices/v1",revision:0,entries:[{eventId:"forged",agentId:"bad"}]});
 await writeFile(file,raw);
 await assert.rejects(()=>journal.record(subject),/Invalid ASEN agent notice journal/);
 assert.equal(await readFile(file,"utf8"),raw);
 await assert.rejects(()=>journal.list(subject),/Invalid ASEN agent notice journal/);
});
test("EF-604 control identities cannot poison a persisted event or alias another scope",async t=>{
 const {journal}=await fixture(t);
 await assert.rejects(()=>journal.record({...subject,id:"agent\u001fother"}),/Invalid terminal/);
 await assert.rejects(()=>journal.record({...subject,sessionId:"s\u202e"}),/Invalid terminal/);
 assert.deepEqual(await journal.list(subject),[]);
});
