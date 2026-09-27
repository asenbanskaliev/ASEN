import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";

async function fixture(t:import("node:test").TestContext,body:string){
 const dir=await mkdtemp(join(tmpdir(),"asen-pi-rpc-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"rpc-fixture.mjs");await writeFile(path,body);return {dir,path};
}
const request=(dir:string)=>({id:"expected",role:"explorer" as const,prompt:"hello",repository:dir});

test("Pi RPC adapter validates matching response id and command on every OS",async t=>{
 const {dir,path}=await fixture(t,'let text="";process.stdin.on("data",d=>text+=d);process.stdin.on("end",()=>{const q=JSON.parse(text.trim());console.log(JSON.stringify({id:q.id,type:"response",command:"prompt",success:true,data:{disposition:"handled"}}));});');
 const result=await new PiProcessRunner({command:process.execPath,rpcArgs:[path]}).run(request(dir));
 assert.equal(result.ok,true,result.output);
});

test("Pi RPC adapter rejects another request id even with exit zero",async t=>{
 const {dir,path}=await fixture(t,'process.stdin.resume();process.stdin.on("end",()=>console.log(JSON.stringify({id:"other",type:"response",command:"prompt",success:true,data:{disposition:"handled"}})));');
 const result=await new PiProcessRunner({command:process.execPath,rpcArgs:[path]}).run(request(dir));
 assert.equal(result.ok,false);
});

test("Pi RPC adapter times out and bounds output on every OS",async t=>{
 const timeout=await fixture(t,'process.stdin.resume();setTimeout(()=>{},10000);');
 const timed=await new PiProcessRunner({command:process.execPath,rpcArgs:[timeout.path],timeoutMs:100}).run(request(timeout.dir));
 assert.equal(timed.ok,false);assert.match(timed.output,/timed out/);
 const overflow=await fixture(t,'process.stdin.resume();process.stdin.on("end",()=>console.log("x".repeat(10000)));');
 const bounded=await new PiProcessRunner({command:process.execPath,rpcArgs:[overflow.path],maxOutputBytes:100}).run(request(overflow.dir));
 assert.equal(bounded.ok,false);assert.match(bounded.output,/exceeded/);
});
