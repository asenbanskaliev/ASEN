import assert from "node:assert/strict";
import test from "node:test";
import {summarizeChildFlow} from "../src/runtime/agents/flow-metrics.js";
const at="2026-01-01T00:00:00Z",end="2026-01-01T00:00:05Z";
const message={type:"message_end",message:{id:"m1",role:"assistant",provider:"nvidia",model:"modelo",usage:{input:10,output:2,totalTokens:12,cost:{total:0.01}}}};
const settled={type:"agent_settled",aborted:false};
const build=(state:string,events:readonly {state:string;at:string}[],lines:unknown[])=>summarizeChildFlow({
 record:{id:"agent",role:"explorer",state,createdAt:at,updatedAt:end},events,
 result:{output:lines.map(row=>JSON.stringify(row)).join("\n")}});
test("Las métricas no confunden consumo observado con total en fallos o reanudaciones",()=>{
 const started=[{state:"running",at}];
 for(const state of ["failed","cancelled","interrupted","running"]){
  const row=build(state,started,[message,settled]);
  assert.equal(row.completeInventory,false);assert.equal(row.totalTokens,null);
  assert.equal(row.observedUsage.totalTokens,12);
 }
 const resumed=build("completed",[...started,{state:"interrupted",at:end},{state:"running",at:end}],[message,settled]);
 assert.equal(resumed.observedAttempts,2);assert.equal(resumed.totalTokens,null);
 const duplicate=build("completed",started,[message,message,settled]);
 assert.equal(duplicate.observedUsage.assistantTurns,1);assert.equal(duplicate.completeInventory,false);
 assert.equal(build("completed",started,[message]).totalTokens,null);
 const complete=build("completed",started,[message,settled]);
 assert.equal(complete.completeInventory,true);assert.equal(complete.totalTokens,12);
});

test("Conserva el consumo observado de un prefijo válido aunque una línea posterior esté dañada",()=>{
 const row=summarizeChildFlow({
  record:{id:"agent",role:"explorer",state:"completed",createdAt:at,updatedAt:end},
  events:[{state:"running",at}],
  result:{output:[JSON.stringify(message),JSON.stringify(settled),"{json inválido"].join("\n")}
 });
 assert.equal(row.completeInventory,false);
 assert.equal(row.inputTokens,null);
 assert.equal(row.outputTokens,null);
 assert.equal(row.totalTokens,null);
 assert.equal(row.reportedCostUsd,null);
 assert.equal(row.observedUsage.totalTokens,12);
 assert.equal(row.observedUsage.reportedCostUsd,0.01);
 assert.equal(row.source,"saved-pi-rpc-result");
});

test("La lectura sin alternativas admite una respuesta correlacionada con cierre limpio sin agent_settled",()=>{
 const ack={type:"response",id:"agent",success:true};
 const ended={type:"agent_end"};
 const entry={record:{id:"agent",role:"explorer",state:"completed",createdAt:at,updatedAt:end},
  request:{id:"agent",role:"explorer"},events:[{state:"running",at}]};
 const run=(lines:unknown[],request:typeof entry.request&{modelFallback?:{chain:readonly unknown[]}}=entry.request,ok=true)=>
  summarizeChildFlow({...entry,request,result:{id:"agent",ok,output:lines.map(row=>JSON.stringify(row)).join("\n")}});
 const good=run([message,ended,ack]);
 assert.equal(good.completeInventory,true);assert.equal(good.totalTokens,12);
 for(const lines of [[message,ack],[message,ended],[message,ended,{...ack,id:"otro"}],[message,ended,{...ack,success:false}],
  [message,ended,ack,ack],[message,message,ended,ack],[message,ended,ended,ack],
  [message,ended,ack,{type:"agent_settled",aborted:true}]]){
  const row=run(lines);assert.equal(row.completeInventory,false);assert.equal(row.totalTokens,null);
  assert.equal(row.inputTokens,null);assert.equal(row.outputTokens,null);assert.equal(row.reportedCostUsd,null);
  assert.equal(row.observedUsage.totalTokens,12);
 }
 assert.equal(run([message,ended,ack],{...entry.request,modelFallback:{chain:["otro"]}}).completeInventory,false);
 assert.equal(run([message,ended,ack],entry.request,false).completeInventory,false);
 assert.equal(run([message,ended,ack],{...entry.request,id:"otro"}).completeInventory,false);
 assert.equal(run([message,ended,ack],{...entry.request,role:"worker"}).completeInventory,false);
});
