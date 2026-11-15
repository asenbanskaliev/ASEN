// T2.3 (S-03): stdin writes must honor stream backpressure. `write()`
// returning false means the parent buffer is full; the runner has to wait for
// `drain` instead of piling prompts up in parent memory.
//
// RED (before the fix): `child.stdin.write(...)` was called without reading
// the return value, so a large prompt was buffered in the parent without
// bound. The deterministic RED is the exported helper contract; the large
// prompt test is the end-to-end guard that the exact prompt still arrives.
import test from "node:test";
import assert from "node:assert/strict";
import {PiProcessRunner,writeStdinLine} from "../src/agents/pi-process-runner.js";
import {createPiRpcFixture} from "./helpers/pi-rpc-fixture.js";

class BackpressuredStream{
 written:string[]=[];
 listeners:Array<()=>void>=[];
 constructor(private readonly accepted:boolean){}
 write(chunk:string):boolean{this.written.push(chunk);return this.accepted;}
 once(event:string,listener:()=>void):this{if(event==="drain")this.listeners.push(listener);return this;}
 release():void{for(const listener of this.listeners.splice(0))listener();}
}

test("T2.3 a rejected write waits for drain before resolving",async()=>{
 const stream=new BackpressuredStream(false);
 let settled=false;
 const pending=writeStdinLine(stream,"payload\n").then(()=>{settled=true;});
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(settled,false,"the write must stay pending while the stream is full");
 assert.deepEqual(stream.written,["payload\n"]);
 stream.release();
 await pending;
 assert.equal(settled,true,"the write must resolve once the stream drains");
});

test("T2.3 an accepted write resolves without waiting for drain",async()=>{
 const stream=new BackpressuredStream(true);
 await writeStdinLine(stream,"payload\n");
 assert.deepEqual(stream.written,["payload\n"]);
 assert.equal(stream.listeners.length,0,"an accepted write must not wait for drain");
});

test("T2.3 a large prompt reaches the child complete and in order",async t=>{
 const fixture=await createPiRpcFixture(t,`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
let buffer="";
process.stdin.on("data",chunk=>{
 buffer+=String(chunk);
 let end;
 while((end=buffer.indexOf("\\n"))>=0){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line.trim())continue;
  const record=JSON.parse(line);
  if(record.type!=="prompt")continue;
  const message=record.message??"";
  emit({type:"response",id:record.id,success:true,command:"prompt",message:"received "+message.length});
  emit({type:"message_end",message:{role:"assistant",stopReason:"stop"}});
  emit({type:"agent_end"});
 }
});
`);
 const prompt="x".repeat(2_000_000);
 const runner=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:20_000});
 const result=await runner.run({id:"backpressure",role:"explorer",prompt,repository:fixture.repository});
 assert.equal(result.ok,true,result.output);
 assert.match(result.output,/received 2000000/,"the exact prompt must reach the child without truncation");
});
