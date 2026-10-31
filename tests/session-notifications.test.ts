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
