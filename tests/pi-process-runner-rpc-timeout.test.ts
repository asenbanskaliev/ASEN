// T2.2 (S-02): every RPC issued to the Pi child must own an explicit
// budget. A child that ignores `set_model` can no longer immobilize the
// chain until the global deadline.
//
// RED (before the fix): `sendRpc` was only resolved by a correlated response
// or by `finish()`, so an unanswered RPC produced the generic global timeout
// instead of naming the RPC that never answered.
import test from "node:test";
import assert from "node:assert/strict";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createPiRpcFixture,uniqueModelNames} from "./helpers/pi-rpc-fixture.js";

const scenario=`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
let buffer="";
process.stdin.on("data",chunk=>{
 buffer+=String(chunk);
 let end;
 while((end=buffer.indexOf("\\n"))>=0){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line.trim())continue;
  const record=JSON.parse(line);
  if(record.type==="prompt"){
   emit({type:"response",id:record.id,success:true,command:"prompt"});
   emit({type:"message_end",message:{role:"assistant",stopReason:"error",errorMessage:"quota exhausted in this fixture"}});
   emit({type:"agent_end"});
   emit({type:"agent_settled"});
   continue;
  }
  if(record.type==="set_model"){
   // Deliberately ignored: this fixture never answers the model switch.
   continue;
  }
 }
});
`;

test("T2.2 an unanswered set_model fails on its own RPC budget",async t=>{
 const fixture=await createPiRpcFixture(t,scenario);
 const models=uniqueModelNames(1);
 const runner=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:1000});
 const started=Date.now();
 const result=await runner.run({
  id:"rpc-timeout",role:"explorer",prompt:"work",repository:fixture.repository,
  model:models.primary,
  modelFallback:{chain:models.chain.map(model=>({model}))},
 });
 const elapsed=Date.now()-started;
 assert.equal(result.ok,false);
 assert.match(result.output,/rpc timeout/i,`the unanswered RPC must be named: ${result.output}`);
 assert.match(result.output,/set_model/,`the unanswered RPC must be identified: ${result.output}`);
 assert.ok(elapsed<5_000,`the run must settle on the RPC budget, not on a global deadline (elapsed ${elapsed}ms)`);
});
