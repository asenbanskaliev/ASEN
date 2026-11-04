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

test("EF-601/604 coordinator acknowledgement is atomic and never implied by enqueue",async t=>{
 const {file,journal}=await fixture(t),row=await journal.record(subject);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,subject.id,"completed"),/enqueued/);
 await journal.claim(row.eventId,subject);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,subject.id,"completed"),/enqueued/);
 await journal.markEnqueued(row.eventId,subject);
 const other=new AgentNotificationJournal(file);
 const outcomes=await Promise.all([journal.acknowledge(row.eventId,subject,subject.id,"completed"),
  other.acknowledge(row.eventId,subject,subject.id,"completed")]);
 assert.deepEqual(outcomes.sort(),[false,true]);
 assert.equal((await new AgentNotificationJournal(file).list(subject))[0]?.delivery,"acknowledged");
 assert.equal(await journal.claim(row.eventId,subject),false);
 assert.equal(await journal.markEnqueued(row.eventId,subject),false);
});
test("EF-601/604 foreign scope and forged terminal identity cannot acknowledge",async t=>{
 const {journal}=await fixture(t),row=await journal.record(subject);
 await journal.claim(row.eventId,subject);await journal.markEnqueued(row.eventId,subject);
 await assert.rejects(()=>journal.acknowledge(row.eventId,{...subject,sessionId:"foreign"},subject.id,"completed"),/owned terminal/);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,"other-agent","completed"),/owned terminal/);
 await assert.rejects(()=>journal.acknowledge(row.eventId,subject,subject.id,"failed"),/owned terminal/);
 assert.equal((await journal.list(subject))[0]?.delivery,"enqueued");
});

test("EF-601 duplicate terminal notification cannot be resent via canonical Windows project aliases",async t=>{
 const {file,journal}=await fixture(t);
 const first={...subject,projectId:"C:\\Work\\ASEN"};
 const alternate={...subject,projectId:"c:\\work\\asen"};
 const original=await journal.record(first);
 await journal.claim(original.eventId,first);
 await journal.markEnqueued(original.eventId,first);
 const again=await new AgentNotificationJournal(file).record(alternate);
 const entries=JSON.parse(await readFile(file,"utf8")).entries;
 if(process.platform==="win32"){
  assert.equal(again.eventId,original.eventId);
  assert.equal(again.delivery,"enqueued");
  assert.equal(entries.length,1);
  assert.equal(await journal.claim(original.eventId,alternate),false);
 }else{
  assert.notEqual(again.eventId,original.eventId);
  assert.equal(entries.length,2,"case-distinct POSIX paths must remain isolated");
  assert.equal((await journal.list(first)).length,1);
  assert.equal((await journal.list(alternate)).length,1);
 }
});
test("EF-601 repeated terminal record from two instances is idempotent even after acknowledgement",async t=>{
 const {file,journal}=await fixture(t),other=new AgentNotificationJournal(file);
 const records=await Promise.all([journal.record(subject),other.record(subject)]);
 assert.equal(records[0]?.eventId,records[1]?.eventId);
 assert.equal((await journal.list(subject)).length,1);
 const eventId=records[0]!.eventId;
 await journal.claim(eventId,subject);await journal.markEnqueued(eventId,subject);
 await journal.acknowledge(eventId,subject,subject.id,"completed");
 assert.equal((await other.record(subject)).delivery,"acknowledged");
 assert.equal((await journal.list(subject)).length,1);
});

test("EF-601/604 rejects a second contradictory terminal result without changing the durable journal",async t=>{
 const {file,journal}=await fixture(t);
 const completed=await journal.record(subject);
 const before=await readFile(file,"utf8");
 await assert.rejects(()=>journal.record({...subject,state:"failed"}),/Conflicting terminal outcome/);
 await assert.rejects(()=>new AgentNotificationJournal(file).record({...subject,state:"cancelled"}),/Conflicting terminal outcome/);
 assert.equal(await readFile(file,"utf8"),before,"No secondary event or revision may be written");
 assert.deepEqual(await journal.list(subject),[completed]);
 assert.equal((await journal.record(subject)).eventId,completed.eventId,"Same outcome stays idempotent");
 const differentSession=await journal.record({...subject,sessionId:"other-session",state:"failed"});
 assert.notEqual(differentSession.eventId,completed.eventId,"A separate owned session is independent");
});
test("EF-601/604 concurrent contradictory terminal writers commit exactly one state",async t=>{
 const {file,journal}=await fixture(t),other=new AgentNotificationJournal(file);
 const outcomes=await Promise.allSettled([
  journal.record({...subject,state:"completed"}),
  other.record({...subject,state:"failed"}),
 ]);
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
 const failure=outcomes.find(x=>x.status==="rejected");
 assert.ok(failure&&failure.status==="rejected");
 assert.match(String(failure.reason),/Conflicting terminal outcome/);
 const persisted=await new AgentNotificationJournal(file).list(subject);
 assert.equal(persisted.length,1);
 const saved=JSON.parse(await readFile(file,"utf8"));
 assert.equal(saved.revision,1);
 assert.equal(saved.entries.length,1);
});
test("EF-604 corrupt legacy journal with contradictory terminal identities fails closed",async t=>{
 const {file,journal}=await fixture(t);
 const original=await journal.record(subject);
 const newer={...original,eventId:agentNoticeEventId({...subject,state:"failed"}),state:"failed"};
 const corrupt=JSON.stringify({schema:"asen.agent-notices/v1",revision:2,entries:[original,newer]})+"\n";
 await writeFile(file,corrupt);
 await assert.rejects(()=>journal.list(subject),/conflicting terminal outcomes/);
 await assert.rejects(()=>journal.record(subject),/conflicting terminal outcomes/);
 assert.equal(await readFile(file,"utf8"),corrupt);
});
