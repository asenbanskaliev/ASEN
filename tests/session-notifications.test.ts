import test from "node:test";
import assert from "node:assert/strict";
import {SessionNotificationBus} from "../src/runtime/session-notifications.js";
test("deduplicates and replays notifications only within their session",()=>{const bus=new SessionNotificationBus(),a=bus.emit("s1","job","done"),b=bus.emit("s1","job","done");assert.equal(a.id,b.id);assert.equal(bus.list("s2").length,0);assert.equal(bus.replay("s1").length,1);bus.acknowledge("s1",a.id);assert.equal(bus.list("s1").length,0);});

