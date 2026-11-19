import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {ASEN_EXPLORATION_BUDGET_SECTION} from "../src/runtime/ui/request-guidance.js";

test("G49-A2: Pi ejecuta un único Explorer de lectura tras cuatro consultas, sin pagos ni duplicados",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-a2-explorer-"));
 const handlers=new Map<string,Array<(event:any,ctx:any)=>unknown>>();
 const tools=new Map<string,any>(),requests:any[]=[];
 let observeRequest!:(request:any)=>void;
 const launched=new Promise<any>(resolve=>{observeRequest=resolve;});
 const FREE={provider:"local",id:"sin-coste",cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
 const PAID={provider:"cloud",id:"modelo-pago",cost:{input:1,output:1,cacheRead:0,cacheWrite:0}};
 const context:any={
  cwd:home,mode:"rpc",hasUI:true,model:PAID,
  sessionManager:{getSessionId:()=>"g49-read-budget",getEntries:()=>[]},
  modelRegistry:{find:(provider:string,id:string)=>{
   const current=context.model;
   return provider===current.provider&&id===current.id?current:undefined;
  }},
  ui:{notify(){},setWidget(){},setStatus(){}},
 };
 const pi={
  registerTool(tool:any){tools.set(tool.name,tool);},
  registerCommand(){},
  on(name:string,handler:(event:any,ctx:any)=>unknown){
   handlers.set(name,[...(handlers.get(name)??[]),handler]);
  },
 };
 createAsenExtension({
  homeDir:()=>home,enableTodoRuntime:false,enableMemoryRuntime:false,
  enableWorkspaceRuntime:false,enableAgentRuntime:true,agentStoreFile:join(home,".asen","agents.json"),
  agentRunner:{run:async(request:any)=>{
   requests.push(request);observeRequest(request);
   return {id:request.id,ok:true,output:"Solo lectura de la zona solicitada"};
  }},
 })(pi as any);
 t.after(async()=>{
  try{for(const h of handlers.get("session_shutdown")??[])await h({},context);}
  finally{await rm(home,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 for(const h of handlers.get("session_start")??[])await h({reason:"new"},context);
 const tool=tools.get("asen_agent_start");assert.ok(tool);
 const options=async()=>{
  const result={sections:{} as Record<string,string>};
  for(const h of handlers.get("before_agent_start")??[])
   await h({systemPromptOptions:result},context);
  return result.sections;
 };
 const attempted=async(prompt="Buscar las relaciones de los módulos indicados")=>
  tool.execute("g49-launch",{prompt,budgetExplorer:true},new AbortController().signal,()=>{},context);
 context.model=FREE;
 await assert.rejects(attempted(),/not authorized by one fresh/u);
 context.model=PAID;
 for(let index=0;index<4;index++){
  for(const handler of handlers.get("tool_execution_end")??[])
   await handler({toolCallId:"lectura-"+index,toolName:"read",result:{content:[{type:"text",text:"dato"}]}},context);
 }
 assert.match((await options())[ASEN_EXPLORATION_BUDGET_SECTION]??"",/budgetExplorer=true/u);
 await assert.rejects(attempted(),/verified zero-price model/u);
 assert.equal(requests.length,0);
 context.model=FREE;
 const result=await attempted();
 assert.equal(result.details.role,"explorer");
 const request=await launched;
 assert.equal(request.model,"local/sin-coste");
 assert.equal(request.role,"explorer");
 for(const field of ["writeSurfaces","writerAdmission","phaseGrant","runnerWriteReceiver"])
  assert.equal(Object.hasOwn(request,field),false);
 assert.equal(request.modelFallback,undefined);
 await assert.rejects(attempted("Otra exploración no permitida"),/not authorized by one fresh/u);
 assert.equal(requests.length,1);
 assert.equal((await options())[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
});
