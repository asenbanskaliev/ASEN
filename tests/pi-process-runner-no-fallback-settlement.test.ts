// T2.5 (S-05): pin the settlement contract of the Pi runner.
//
// Decision (recorded in the audit): with no fallback chain the correlated
// response plus a clean exit IS the completion proof; `agent_settled` is
// only required when a fallback chain may replace the turn. Making the rule
// uniform would reject every existing read-only run, so the asymmetry is
// kept deliberately and is now pinned by tests instead of being implicit.
//
// These are pin tests: they encode the current, intended contract and pass
// before and after the Tanda 2 changes.
import test from "node:test";
import assert from "node:assert/strict";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createPiRpcFixture,uniqueModelNames} from "./helpers/pi-rpc-fixture.js";

const settleWithoutFallback=`
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
  emit({type:"message_end",message:{role:"assistant",stopReason:"stop"}});
  emit({type:"agent_end"});
 }
});
`;

const abandonSettlement=`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
let buffer="",prompts=0;
process.stdin.on("data",chunk=>{
 buffer+=String(chunk);
 let end;
 while((end=buffer.indexOf("\\n"))>=0){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line.trim())continue;
  const record=JSON.parse(line);
  if(record.type==="prompt"){
   prompts++;
   if(prompts===1){
    emit({type:"response",id:record.id,success:true,command:"prompt"});
    emit({type:"message_end",message:{role:"assistant",stopReason:"error",errorMessage:"quota exhausted in this fixture"}});
    emit({type:"agent_end"});
    emit({type:"agent_settled"});
    continue;
   }
   // The continuation answers but never settles: the run must not be accepted.
   process.stdout.write(JSON.stringify({type:"response",id:record.id,success:true,command:"prompt"})+"\\n",()=>{
    setTimeout(()=>process.exit(0),20);
   });
   continue;
  }
  if(record.type==="set_model"){
   emit({type:"response",id:record.id,success:true,command:"set_model"});
   continue;
  }
 }
});
`;

test("T2.5 without a fallback chain a correlated response and a clean exit complete the run",async t=>{
 const fixture=await createPiRpcFixture(t,settleWithoutFallback);
 const runner=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:10_000});
 const result=await runner.run({id:"settlement-plain",role:"explorer",prompt:"work",repository:fixture.repository});
 assert.equal(result.ok,true,result.output);
 assert.match(result.output,/settlement-plain/);
});

test("T2.5 with a fallback chain the run is rejected when the turn never settles",async t=>{
 const fixture=await createPiRpcFixture(t,abandonSettlement);
 const models=uniqueModelNames(1);
 const runner=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:10_000});
 const result=await runner.run({
  id:"settlement-fallback",role:"explorer",prompt:"work",repository:fixture.repository,
  model:models.primary,
  modelFallback:{chain:models.chain.map(model=>({model}))},
 });
 assert.equal(result.ok,false);
 assert.match(result.output,/before final agent_settled/,`an unsettled turn must be rejected: ${result.output}`);
});

for(const outcome of ["settled","closed","premature","no-start"] as const){
 test("G03 turno abierto nativo sin repetir prompt: "+outcome,{timeout:30_000},async t=>{
  const fixture=await createPiRpcFixture(t,`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
let buffer="",prompts=0;
process.stdin.on("data",chunk=>{
 buffer+=String(chunk);
 let end;
 while((end=buffer.indexOf("\\n"))>=0){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line.trim())continue;
  const record=JSON.parse(line);
  if(record.type!=="prompt")continue;
  if(++prompts!==1){process.exit(3);return;}
  emit({type:"response",id:record.id,success:true,command:"prompt"});
  emit({type:"agent_start"});
  emit({type:"message_end",message:{role:"assistant",stopReason:"error",errorMessage:"quota exhausted in this fixture"}});
  emit({type:"agent_end",willRetry:true});
  if(${JSON.stringify(outcome)}==="closed"){setTimeout(()=>process.exit(0),30);return;}
  if(${JSON.stringify(outcome)}==="premature"){emit({type:"agent_settled",aborted:false});return;}
  setTimeout(()=>{
   if(${JSON.stringify(outcome)}!=="no-start")emit({type:"agent_start"});
   emit({type:"message_end",message:{role:"assistant",stopReason:"stop",content:[{type:"text",text:"recuperación del mismo turno"}]}});
   emit({type:"agent_end",willRetry:false});
   emit({type:"agent_settled",aborted:false});
  },30);
 }
});
`);
  const runner=new PiProcessRunner({command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],timeoutMs:10_000});
  const result=await runner.run({id:"g03-open-turn",role:"explorer",prompt:"inspect",repository:fixture.repository});
  if(outcome==="settled"){
   assert.equal(result.ok,true,result.output);
   assert.match(result.output,/recuperación del mismo turno/u);
  }else{
   assert.equal(result.ok,false,result.output);
   assert.match(result.output,/before final agent_settled|without a completed final assistant turn/u);
  }
 });
}
