import assert from "node:assert/strict";
import test from "node:test";
import {reconcileMemoryWrite} from "../src/memory/recovery.js";

test("confirmed rejected and unavailable outcomes never trigger speculative readback",()=>{
 let reads=0;
 assert.deepEqual(reconcileMemoryWrite("confirmed",()=>{reads++;return false;}),{outcome:"confirmed",persisted:true});
 assert.deepEqual(reconcileMemoryWrite("rejected",()=>{reads++;return true;}),{outcome:"rejected",persisted:false});
 assert.deepEqual(reconcileMemoryWrite("unavailable",()=>{reads++;return true;}),{outcome:"unavailable",persisted:false});
 assert.equal(reads,0);
});

test("unknown outcome reports the single readback result without replay",()=>{
 let reads=0;
 assert.deepEqual(reconcileMemoryWrite("unknown",()=>{reads++;return false;}),{outcome:"unknown",persisted:false});
 assert.equal(reads,1);
});
