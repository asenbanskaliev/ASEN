import test from "node:test";
import assert from "node:assert/strict";
import {BackgroundJobRegistry} from "../src/runtime/background-jobs.js";

test("bounds output, emits completion once, and keeps session isolation",()=>{
 const registry=new BackgroundJobRegistry(),events=[] as string[],job=registry.start({sessionId:"s1",command:"long",maxTailLines:2,maxLineChars:4});
 registry.subscribe(job.id,event=>events.push(event.kind));registry.append(job.id,"abcdef\nhello\nlast");registry.finish(job.id,"completed",0);
 const snapshot=registry.snapshot(job.id);assert.deepEqual(snapshot.tail,["ello","last"]);assert.equal(snapshot.state,"completed");assert.deepEqual(events,["line","line","line","completed"]);assert.equal(registry.list("s2").length,0);
});

test("stops a session's running jobs and rejects later output",()=>{
 const registry=new BackgroundJobRegistry(),job=registry.start({sessionId:"s1",command:"watch"});registry.stop(job.id);assert.equal(registry.snapshot(job.id).state,"stopped");assert.throws(()=>registry.append(job.id,"late"),/not running/);registry.disposeSession("s1");assert.equal(registry.list("s1").length,0);
});

test("fails closed on an event flood",()=>{
 const registry=new BackgroundJobRegistry(),job=registry.start({sessionId:"s1",command:"monitor",maxEventsPerMinute:2});registry.append(job.id,"1\n2\n3");assert.equal(registry.snapshot(job.id).state,"flooded");
});

test("runs a real contained child and records its exit",async()=>{
 const registry=new BackgroundJobRegistry(),child=registry.run({sessionId:"real",command:process.execPath,args:["-e","process.stdout.write('ok\\n')"]});
 const result=await child.done;assert.equal(result.state,"completed");assert.equal(result.exitCode,0);assert.deepEqual(result.tail,["ok"]);
});

test("timeout terminates a real child",async()=>{
 const registry=new BackgroundJobRegistry(),child=registry.run({sessionId:"timeout",command:process.execPath,args:["-e","setTimeout(()=>{},10000)"],timeoutMs:50});
 const result=await child.done;assert.equal(result.state,"timed_out");
});

