// T2.1 (S-01): the Pi runner must budget every phase separately with a
// monotonic deadline, so a healthy fallback chain is never killed by a single
// global timeout, and a genuine stall reports the phase that expired.
//
// RED (before the fix): the single global timer covered spawn + preflight +
// prompt + every fallback continuation, so a chain whose total duration
// exceeded `timeoutMs` was reported as a generic timeout even though every
// individual attempt was healthy.
import test from "node:test";
import assert from "node:assert/strict";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createPiRpcFixture,uniqueModelNames} from "./helpers/pi-rpc-fixture.js";

const scenario=`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let buffer="",prompts=0;
process.stdin.on("data",chunk=>{
 buffer+=String(chunk);
 let end;
 while((end=buffer.indexOf("\\n"))>=0){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line.trim())continue;
  const record=JSON.parse(line);
  if(record.type==="set_model"){
   void (async()=>{await sleep(600);emit({type:"response",id:record.id,success:true,command:"set_model"});})();
   continue;
  }
  if(record.type!=="prompt")continue;
  prompts++;
  if(prompts===1){
   emit({type:"response",id:record.id,success:true,command:"prompt"});
   emit({type:"message_end",message:{role:"assistant",stopReason:"error",errorMessage:"quota exhausted in this fixture"}});
   emit({type:"agent_end"});
   emit({type:"agent_settled"});
   continue;
  }
  const failing=prompts<=3;
  void (async()=>{
   await sleep(500);
   emit({type:"response",id:record.id,success:true,command:"prompt"});
   if(failing){
    emit({type:"message_end",message:{role:"assistant",stopReason:"error",errorMessage:"quota exhausted in this fixture"}});
   }else{
    emit({type:"message_end",message:{role:"assistant",stopReason:"stop",content:[{type:"text",text:"done"}]}});
   }
   emit({type:"agent_end"});
   emit({type:"agent_settled"});
  })();
 }
});
`;

test("T2.1 a healthy fallback chain survives past the per-phase budget",async t=>{
 const fixture=await createPiRpcFixture(t,scenario);
 const models=uniqueModelNames(3);
 // The budget covers one attempt: 600ms model switch plus 500ms continuation.
 // The whole chain (3 continuations) needs more than that single budget.
 const runner=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:2000});
 const started=Date.now();
 const result=await runner.run({
  id:"budget-run",role:"explorer",prompt:"work",repository:fixture.repository,
  model:models.primary,
  modelFallback:{chain:models.chain.map(model=>({model}))},
 });
 const elapsed=Date.now()-started;
 assert.equal(result.ok,true,`a healthy fallback chain must not be killed by a global timeout: ${result.output}`);
 assert.doesNotMatch(result.output,/timed out/i);
 assert.ok(elapsed>2000,`the chain must really exceed the single budget (elapsed ${elapsed}ms)`);
});

test("T2.1 a stalled turn reports the phase that expired",async t=>{
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
  emit({type:"response",id:record.id,success:true,command:"prompt"});
  setInterval(()=>{},1000);
 }
});
`);
 const runner=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:2000});
 const result=await runner.run({id:"stalled-turn",role:"explorer",prompt:"work",repository:fixture.repository});
 assert.equal(result.ok,false);
 assert.match(result.output,/timed out/i);
 assert.match(result.output,/phase: turn/,`the expired phase must be named: ${result.output}`);
});
