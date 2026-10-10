import test from "node:test";import assert from "node:assert/strict";import {applyTaskEvent,replayTask} from "../src/runtime/task-replay.js";
const e=(revision:number,state:any,at=`2026-10-06T00:00:0${revision}Z`)=>({taskId:"t",sessionId:"s",projectId:"p",revision,state,at});
test("task replay is deterministic and rejects conflicts/stale transitions",()=>{const p=applyTaskEvent(undefined,e(1,"planned")),r=applyTaskEvent(p,e(2,"running")),d=applyTaskEvent(r,e(3,"done"));assert.equal(replayTask([p,r,d])?.state,"done");assert.throws(()=>applyTaskEvent(r,e(4,"done")),/revision conflict/);assert.throws(()=>applyTaskEvent(d,e(4,"running")),/Invalid task transition/);});
test("task replay isolates session and project identity",()=>{const p=applyTaskEvent(undefined,e(1,"planned"));assert.throws(()=>applyTaskEvent(p,{...e(2,"running"),sessionId:"other"}),/identity/);});
test("task replay rejects malformed, unbounded, noncanonical and accessor event data",()=>{
 const first=e(1,"planned");
 for(const bad of [{...first,revision:1.5},{...first,revision:Number.MAX_SAFE_INTEGER+1},{...first,state:"unknown"},{...first,at:"October 6, 2026"},{...first,at:"2026-02-31T00:00:00Z"},{...first,reason:"  padded  "},{...first,reason:"x".repeat(8193)},{...first,extra:true}])assert.throws(()=>applyTaskEvent(undefined,bad as never));
 let calls=0;const accessor={...first};Object.defineProperty(accessor,"taskId",{enumerable:true,get(){calls++;return "t";}});
 assert.throws(()=>applyTaskEvent(undefined,accessor));assert.equal(calls,0);
 const proxy=new Proxy(first,{getPrototypeOf(){calls++;return Object.prototype;}});assert.throws(()=>applyTaskEvent(undefined,proxy));assert.equal(calls,0);
});
