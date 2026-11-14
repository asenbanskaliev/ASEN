import test from "node:test";
import assert from "node:assert/strict";
import {SessionNotificationBus} from "../src/runtime/session-notifications.js";

test("deduplicates by source identity, not by display text",()=>{
 const bus=new SessionNotificationBus({ttlMs:60_000,capacity:4});
 const a=bus.emit("s1","job","done","source-a");
 const b=bus.emit("s1","job","different message","source-a");
 assert.equal(a.id,b.id,"same identity collapses to the same event");
 const c=bus.emit("s1","job","done","source-b");
 assert.notEqual(a.id,c.id,"different identities stay separate even with the same text");
});

test("never merges events across sessions or kinds",()=>{
 const bus=new SessionNotificationBus({ttlMs:60_000,capacity:4});
 const a=bus.emit("s1","job","x","src");
 const b=bus.emit("s2","job","x","src");
 const c=bus.emit("s1","monitor","x","src");
 assert.notEqual(a.id,b.id);
 assert.notEqual(a.id,c.id);
 assert.equal(bus.list("s1").length,2);
 assert.equal(bus.list("s2").length,1);
});

test("drops acknowledged and expired events from list and replay",async t=>{
 const bus=new SessionNotificationBus({ttlMs:5,capacity:4});
 const event=bus.emit("s1","job","x","src");
 bus.acknowledge("s1",event.id);
 assert.equal(bus.list("s1").length,0,"acknowledged events disappear");
 assert.equal(bus.replay("s1").length,0);
 const second=bus.emit("s2","job","x","src2");
 const refreshed=bus.emit("s2","job","x","src2");
 assert.equal(second.id,refreshed.id,"an unacknowledged event is not recreated");
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(bus.list("s2").length,0,"expired events are pruned");
 assert.equal(bus.replay("s2").length,0,"replay cannot revive an expired event");
});

test("rejects emission beyond the bounded capacity",()=>{
 const bus=new SessionNotificationBus({ttlMs:60_000,capacity:1});
 bus.emit("s1","job","first","src-1");
 assert.throws(()=>bus.emit("s1","job","second","src-2"),/capacity/i);
 assert.equal(bus.list("s1").length,1,"the original event survives the rejected emission");
});

test("acknowledgment rejects unknown or foreign identities",()=>{
 const bus=new SessionNotificationBus({ttlMs:60_000,capacity:4});
 const event=bus.emit("s1","job","x","src");
 assert.throws(()=>bus.acknowledge("s2",event.id),/unavailable/i);
 assert.throws(()=>bus.acknowledge("s1","no-such-id"),/unavailable/i);
});

test("carries identity and expiry metadata for consumers",()=>{
 const bus=new SessionNotificationBus({ttlMs:60_000,capacity:4});
 const event=bus.emit("s1","job","text","source-xyz");
 assert.equal(event.eventId,"s1:job:source-xyz");
 assert.equal(event.sourceId,"source-xyz");
 assert.ok(Number.isFinite(Date.parse(event.expiresAt)), "expiry must be a timestamp");
 assert.equal(event.acknowledged,false);
});

test("constructor rejects invalid ttl or capacity",()=>{
 assert.throws(()=>new SessionNotificationBus({ttlMs:0}),"non-positive TTL");
 assert.throws(()=>new SessionNotificationBus({capacity:0}),"non-positive capacity");
});


test("clearing a presentation partition never clears unrelated sessions or claims durable delivery",()=>{
 const bus=new SessionNotificationBus({capacity:2});
 const one=bus.emit("session-project-a","job","result a","source-a");
 const two=bus.emit("session-project-b","job","result b","source-b");
 bus.clear("session-project-a");
 assert.equal(bus.list("session-project-a").length,0);
 assert.deepEqual(bus.list("session-project-b").map(item=>item.eventId),[two.eventId]);
 assert.throws(()=>bus.acknowledge("session-project-a",one.id),/unavailable/u);
 assert.equal(bus.emit("session-project-b","job","result c","source-c").acknowledged,false,"freed capacity is presentation-only");
 assert.equal(bus.list("session-project-b").length,2);
 assert.throws(()=>bus.clear(""),/invalid session id/u);
});
 
test("EF-602 C14 acknowledged agent outcome cannot be re-enqueued during TTL",()=>{
 const bus=new SessionNotificationBus({capacity:2,ttlMs:60_000});
 const original=bus.emit("session","agent","finished","agent-id");
 bus.acknowledge("session",original.id);
 const duplicate=bus.emit("session","agent","forged later result","agent-id");
 assert.equal(duplicate.id,original.id);
 assert.equal(duplicate.acknowledged,true);
 assert.deepEqual(bus.replay("session"),[]);
 assert.deepEqual(bus.list("session"),[]);
 bus.acknowledge("session",original.id);
});
test("EF-602 bounded tombstones fail closed and expire to free capacity",async()=>{
 const bus=new SessionNotificationBus({capacity:1,ttlMs:25});
 const first=bus.emit("session","agent","one","agent-a");
 bus.acknowledge("session",first.id);
 assert.throws(()=>bus.emit("session","agent","two","agent-b"),/capacity/u);
 await new Promise(resolve=>setTimeout(resolve,40));
 const newer=bus.emit("session","agent","two","agent-b");
 assert.notEqual(first.id,newer.id);
 assert.equal(bus.list("session").length,1);
});
test("EF-602 C14 scope separators and Unicode controls cannot alias notification identities",()=>{
 const bus=new SessionNotificationBus({capacity:3});
 const own=bus.emit("session","job","done","task-id");
 assert.throws(()=>bus.emit("session\u001fjob","fake","done","task-id"),/invalid session id/u);
 assert.throws(()=>bus.emit("session","job\u001ffake","done","task-id"),/invalid notification kind/u);
 assert.throws(()=>bus.emit("session","job","done","task\u001fid"),/invalid source identity/u);
 assert.throws(()=>bus.emit("session\u202eforeign","job","done","task-id"),/invalid session id/u);
 assert.equal(bus.list("session")[0]?.id,own.id);
});

