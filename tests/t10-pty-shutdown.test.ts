import test from "node:test";
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const {requestGracefulPtyExit}=await import(pathToFileURL(resolve("scripts/t10-pty-shutdown.mjs")).href);
function fakePty(){
 const handlers: Array<(result:{exitCode:number,signal:number})=>void>=[];
 let kills=0,disposals=0;
 return {child:{onExit:(handler:(result:{exitCode:number,signal:number})=>void)=>{
  handlers.push(handler);return {dispose:()=>{disposals++;}};
 },kill:()=>{kills++;}},emit:(exitCode:number,signal=0)=>{
  for(const handler of handlers)handler({exitCode,signal});
 },get kills(){return kills;},get disposals(){return disposals;}};
}
test("T10 cleanup acknowledges a clean Pi exit after explicit shutdown",async()=>{
 const fake=fakePty();let written="",subscribed=false;
 const promise=requestGracefulPtyExit({child:fake.child,shutdownFile:"/tmp/test-shutdown",timeoutMs:100,
  writeMarker:(_path:string,value:string)=>{written=value;subscribed=true;fake.emit(0);}});
 const result=await promise;
 assert.equal(result.exitCode,0);assert.equal(written,"shutdown");assert.ok(subscribed);
 assert.equal(fake.kills,0);assert.equal(fake.disposals,1);
});
test("T10 cleanup rejects a nonzero child exit, never counts it as PASS",async()=>{
 const fake=fakePty();const promise=requestGracefulPtyExit({child:fake.child,shutdownFile:"/tmp/marker",timeoutMs:100,
  writeMarker:()=>fake.emit(1)});
 await assert.rejects(promise,/exited unsuccessfully/);assert.equal(fake.kills,0);
});
test("T10 cleanup rejects a signaled child exit",async()=>{
 const fake=fakePty();const promise=requestGracefulPtyExit({child:fake.child,shutdownFile:"/tmp/marker",timeoutMs:100,
  writeMarker:()=>fake.emit(0,9)});
 await assert.rejects(promise,/exited unsuccessfully/);
});
test("T10 cleanup rejects and kills when Pi never acknowledges shutdown",async()=>{
 const fake=fakePty();const promise=requestGracefulPtyExit({child:fake.child,shutdownFile:"/tmp/marker",timeoutMs:15,
  writeMarker:()=>{}});
 await assert.rejects(promise,/did not exit/);assert.equal(fake.kills,1);
});
test("T10 cleanup rejects and kills when shutdown marker cannot be written",async()=>{
 const fake=fakePty();const promise=requestGracefulPtyExit({child:fake.child,shutdownFile:"/tmp/marker",timeoutMs:100,
  writeMarker:()=>{throw Error("write denied");}});
 await assert.rejects(promise,/write denied/);assert.equal(fake.kills,1);
});
test("T10 cleanup rejects invalid input before interacting with PTY",()=>{
 assert.throws(()=>requestGracefulPtyExit({child:null,shutdownFile:"marker"}),/invalid/);
 assert.throws(()=>requestGracefulPtyExit({child:fakePty().child,shutdownFile:"marker",timeoutMs:0}),/invalid/);
});
