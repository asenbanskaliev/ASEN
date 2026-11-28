import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test,{type TestContext} from "node:test";
import {createAsenExtension} from "../extensions/asen.js";
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
  result:{output:[JSON.stringify(message),JSON.stringify({type:"message_end",message:{id:"m2",role:"assistant",provider:"nvidia",model:"modelo"}}),JSON.stringify(settled),"{json inválido"].join("\n")}
 });
 assert.equal(row.completeInventory,false);
 assert.equal(row.inputTokens,null);
 assert.equal(row.outputTokens,null);
 assert.equal(row.totalTokens,null);
 assert.equal(row.reportedCostUsd,null);
 assert.equal(row.observedUsage.totalTokens,12);
 assert.equal(row.observedUsage.assistantTurns,2);assert.equal(row.observedUsage.observedUsageTurns,1);
 assert.equal(row.observedUsage.inputTokens,10);assert.equal(row.observedUsage.outputTokens,2);
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

test("Responder a preguntas no añade intentos ni invalida un inventario completo",()=>{
 const events=[{state:"queued",at},{state:"running",at},{state:"waiting",at:end},
  {state:"running",at:end},{state:"waiting",at:end},{state:"running",at:end},{state:"completed",at:end}];
 const complete=build("completed",events,[message,settled]);
 assert.equal(complete.observedAttempts,1);assert.equal(complete.elapsedMs,5000);
 assert.equal(complete.completeInventory,true);assert.equal(complete.totalTokens,12);
 assert.equal(complete.reportedCostUsd,0.01);
 const interrupted=build("completed",[...events.slice(0,-1),{state:"interrupted",at:end},{state:"running",at:end},{state:"completed",at:end}],[message,settled]);
 assert.equal(interrupted.observedAttempts,2);assert.equal(interrupted.completeInventory,false);assert.equal(interrupted.totalTokens,null);
 assert.equal(interrupted.observedUsage.totalTokens,12);
});

test("/asen-flow-metrics publica el coste cero, el desconocido y la suma mixta sin verificar facturación",async (t:TestContext)=>{
 const root=await mkdtemp(join(tmpdir(),"asen-flow-usage-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 type PiHost=Parameters<ReturnType<typeof createAsenExtension>>[0];
 type RegisteredCommand=Parameters<NonNullable<PiHost["registerCommand"]>>[1];
 const commands=new Map<string,RegisteredCommand>();
 createAsenExtension({homeDir:()=>root,packageRoot:root,deferSessionStart:true,enableAgentRuntime:false})({
  registerCommand:(name,command)=>commands.set(name,command)
 });
 const command=commands.get("asen-flow-metrics");
 if(!command)throw new Error("El comando público /asen-flow-metrics debe estar registrado");
 const {cost,...tokens}=message.message.usage;
 const entry=(id:string,usage:typeof tokens&{cost?:typeof cost})=>({
  type:"message",id,message:{...message.message,id,provider:"fixture",usage}
 });
 const zero=entry("m1",{...tokens,cost:{total:0}});
 const missing=entry("m2",{input:4,output:3,totalTokens:7});
 const reported=entry("m3",message.message.usage);
 for(const row of [
  {name:"cero explícito",entries:[zero],tokens:[10,2,12],cost:0},
  {name:"sin coste informado",entries:[missing],tokens:[4,3,7],cost:null},
  {name:"mezcla de costes conocidos y desconocidos",entries:[zero,missing,reported],tokens:[24,7,31],cost:null}
 ])await t.test(row.name,async()=>{
  const notifications:Array<{text:string;level:string}>=[];
  await command.handler("",{
   cwd:root,sessionManager:{getSessionId:()=>"flow-usage-fixture",getEntries:()=>row.entries},
   ui:{notify:(text:string,level:string)=>notifications.push({text,level})}
  });
  assert.equal(notifications.length,1);
  assert.equal(notifications[0]!.level,"info");
  const published=JSON.parse(notifications[0]!.text);
  const {inputTokens,outputTokens,totalTokens,reportedCostUsd,billingVerified}=published.parent;
  assert.deepEqual([inputTokens,outputTokens,totalTokens],row.tokens);
  assert.equal(reportedCostUsd,row.cost,"coste informado en el JSON público");
  assert.equal(billingVerified,false,"el consumo de la sesión no verifica facturación");
  assert.equal(published.billingVerified,false,"el informe no verifica facturación");
  assert.match(published.note,/no son facturas/u);
 });
});
