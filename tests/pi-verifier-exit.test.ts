import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import test from "node:test";
// @ts-expect-error CI-only verifier lifecycle helper.
import {settleVerifierChild} from "../scripts/pi-verifier-exit.mjs";

test("successful verifier ends stdin and accepts only a natural zero exit",async()=>{
 let ended=0,killed=0;
 const child={stdin:{end(){ended++;}},kill(){killed++;}};
 assert.deepEqual(await settleVerifierChild(child,Promise.resolve({code:0,signal:null})),{code:0,signal:null});
 assert.equal(ended,1);assert.equal(killed,0);
 for(const result of [{code:1,signal:null},{code:null,signal:"SIGTERM"}])
  await assert.rejects(settleVerifierChild(child,Promise.resolve(result)),/natural zero exit/);
});

test("a forced shutdown cannot turn a completed verifier into natural exit evidence",async()=>{
 const child=new EventEmitter() as EventEmitter&Record<string,any>;
 const stream=()=>Object.assign(new EventEmitter(),{destroyed:false,readableEnded:false,writableEnded:false,writableFinished:false,writableLength:0});
 child.stdin=stream();child.stdout=stream();child.stderr=stream();child.exitCode=null;child.signalCode=null;child.killed=false;
 child.stdin.end=()=>{child.stdin.writableEnded=true;child.stdin.writableFinished=true;child.stdin.emit("finish");};
 child.kill=()=>{child.killed=true;child.signalCode="SIGKILL";child.stderr.emit("data",Buffer.from("ASEN_PI_VERIFIER_SHUT"));child.stderr.emit("data",Buffer.from("DOWN:session-done\r\n"));child.emit("exit",null,"SIGKILL");child.emit("close",null,"SIGKILL");};
 const closed=new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
 await assert.rejects(settleVerifierChild(child,closed,{graceMs:5,killWaitMs:5}),(error:Error)=>{
  assert.match(error.message,/Verifier required forced shutdown/);assert.match(error.message,/"event":"finish"/);
  assert.match(error.message,/"event":"exit"/);assert.match(error.message,/"SIGKILL"/);
  assert.match(error.message,/ASEN_PI_VERIFIER_SHUTDOWN:session-done/);return true;
 });
});

test("unconfirmed close has bounded cleanup and never hangs",async()=>{
 const signals:string[]=[],destroyed:string[]=[];
 const child={stdin:{end(){},destroy(){destroyed.push("stdin");}},stdout:{destroy(){destroyed.push("stdout");}},
  stderr:{destroy(){destroyed.push("stderr");}},kill(signal:string){signals.push(signal);},unref(){destroyed.push("unref");}};
 await assert.rejects(settleVerifierChild(child,new Promise(()=>{}),{graceMs:5,killWaitMs:5}),/cleanup unconfirmed/);
 assert.deepEqual(signals,["SIGKILL"]);assert.deepEqual(destroyed,["stdin","stdout","stderr","unref"]);
});

test("failed verification cleans the process without issuing a natural-exit verdict",async()=>{
 const signals:string[]=[];
 const child={stdin:{end(){throw Error("unexpected success path");}},kill(signal:string){signals.push(signal);}};
 assert.deepEqual(await settleVerifierChild(child,Promise.resolve({code:null,signal:"SIGTERM"}),{successful:false}),{code:null,signal:"SIGTERM"});
 assert.deepEqual(signals,["SIGTERM"]);
});
