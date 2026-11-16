import test from "node:test";
import assert from "node:assert/strict";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createPiRpcFixture} from "./helpers/pi-rpc-fixture.js";
import {parseT08NativeReviewText} from "../src/runtime/agents/t08-pi-review-text.js";

const emit=(value:unknown)=>JSON.stringify(value);
const recovered="Dictamen final de prueba: falta validación de enteros.";
/** El hijo no termina su ejecución al emitir agent_end con willRetry=true. */
const recoveringPi=`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
let input="",scheduled=false;
process.stdin.on("data",chunk=>{
 input+=String(chunk);
 let cut;
 while((cut=input.indexOf("\\n"))>=0){
  const raw=input.slice(0,cut);input=input.slice(cut+1);
  if(!raw.trim())continue;
  const command=JSON.parse(raw);
  if(command.type!=="prompt"||scheduled)continue;
  scheduled=true;
  emit({type:"response",id:command.id,success:true,command:"prompt"});
  emit({type:"agent_start"});
  emit({type:"message_start",message:{role:"assistant"}});
  emit({type:"message_end",message:{role:"assistant",content:[],stopReason:"error"}});
  emit({type:"agent_end",willRetry:true});
  setTimeout(()=>{
   emit({type:"agent_start"});
   emit({type:"message_start",message:{role:"assistant"}});
   emit({type:"message_update",assistantMessageEvent:{
    type:"text_delta",delta:${JSON.stringify(recovered)}
   }});
   emit({type:"message_end",message:{role:"assistant",
    content:[{type:"text",text:${JSON.stringify(recovered)}}],stopReason:"stop"}});
   emit({type:"agent_end",willRetry:false});
   emit({type:"agent_settled"});
  },60);
 }
});
process.stdin.on("end",()=>{process.exit(0);});
`;
const emptyWithoutSettlement=`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
let b="";
process.stdin.on("data",chunk=>{
 b+=String(chunk);
 let i;
 while((i=b.indexOf("\\n"))>=0){
  const line=b.slice(0,i);b=b.slice(i+1);
  if(!line.trim())continue;
  const cmd=JSON.parse(line);
  if(cmd.type!=="prompt")continue;
  emit({type:"response",id:cmd.id,success:true,command:"prompt"});
  emit({type:"agent_start"});
  emit({type:"message_end",message:{role:"assistant",
   content:[{type:"text",text:"texto parcial"}],stopReason:"stop"}});
  emit({type:"agent_end",willRetry:false});
 }
});
process.stdin.on("end",()=>process.exit(0));
`;

test("T08 espera agent_settled y recupera el dictamen final sin llamadas de pago",async t=>{
 const fixture=await createPiRpcFixture(t,recoveringPi);
 let seenText=0;
 const runner=new PiProcessRunner({
  command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],
  noTools:true,requireFinalSettlement:true,timeoutMs:5_000,
  onAssistantTextDelta:()=>{seenText++;}
 });
 const result=await runner.run({
  id:"t08-recovery-no-ia",role:"reviewer",
  repository:fixture.repository,prompt:"Revisa el archivo de prueba",
  isolationKey:"t08-recovery"
 });
 assert.equal(result.ok,true,result.output);
 assert.match(result.output,/"willRetry":true/u);
 assert.match(result.output,/"agent_settled"/u);
 assert.ok(seenText>0,"debe seguir observando texto después de agent_end inicial");
 assert.equal(parseT08NativeReviewText(result.output,{requireFinalSettlement:true}),recovered);
 assert.throws(()=>parseT08NativeReviewText(result.output),/un solo dictamen/u);
});

test("T08 rechaza cierre sin agent_settled incluso si Pi devuelve texto",async t=>{
 const fixture=await createPiRpcFixture(t,emptyWithoutSettlement);
 const runner=new PiProcessRunner({
  command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],
  noTools:true,requireFinalSettlement:true,timeoutMs:650
 });
 const result=await runner.run({
  id:"t08-not-settled",role:"reviewer",repository:fixture.repository,prompt:"Prueba"
 });
 assert.equal(result.ok,false);
 assert.match(result.output,/timed out|before final agent_settled/u);
});

test("T08 no acepta un agent_settled que se adelanta al final real",async t=>{
 const scenario=`
const emit=value=>process.stdout.write(JSON.stringify(value)+"\\n");
let buf="";
process.stdin.on("data",chunk=>{
 buf+=String(chunk);
 let i;
 while((i=buf.indexOf("\\n"))>=0){
  const line=buf.slice(0,i);buf=buf.slice(i+1);
  if(!line.trim())continue;
  const cmd=JSON.parse(line);
  if(cmd.type!=="prompt")continue;
  emit({type:"response",id:cmd.id,success:true,command:"prompt"});
  emit({type:"agent_settled"});
 }
});
`;
 const fixture=await createPiRpcFixture(t,scenario);
 const runner=new PiProcessRunner({
  command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],
  noTools:true,requireFinalSettlement:true,timeoutMs:3_000
 });
 const result=await runner.run({
  id:"t08-premature",role:"reviewer",repository:fixture.repository,prompt:"Prueba"
 });
 assert.equal(result.ok,false);
 assert.match(result.output,/without a completed final assistant turn/u);
});

test("T08 rechaza mensajes repetidos que Pi no marcó para recuperación",()=>{
 const output=[
  emit({type:"message_end",message:{role:"assistant",content:[],stopReason:"stop"}}),
  emit({type:"agent_end",willRetry:false}),
  emit({type:"message_end",message:{role:"assistant",
   content:[{type:"text",text:recovered}],stopReason:"stop"}}),
  emit({type:"agent_end",willRetry:false}),
  emit({type:"agent_settled"})
 ].join("\n");
 assert.throws(()=>parseT08NativeReviewText(output,{requireFinalSettlement:true}),
  /sin recuperación autorizada/u);
});
