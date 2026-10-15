import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {registerAsenPlanRequestTool,ASEN_PLAN_REQUEST_TOOL} from "../src/runtime/natural-plan-tool.js";
import {addAsenRequestGuidance,ASEN_REQUEST_GUIDANCE_SECTION} from "../src/runtime/request-guidance.js";
import {createAsenExtension} from "../extensions/asen.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";

function request(){return {
 instruction:"Add email validation to the form",
 intent:"implementation",
 scope:{kind:"known",expectedPaths:["src/form.ts"]},
 writes:[{path:"src/form.ts",changeKind:"behavior"}],
 riskOperations:[],session:{estimatedMinutes:5,continuation:false},testing:{kind:"required"},
 review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[],
 };}

test("natural-plan tool generates internal identity and hides machine fields from the user",async()=>{
 let registered:any,received="",observedContext:unknown;
 registerAsenPlanRequestTool({registerTool:tool=>{registered=tool;}},async(args,context)=>{received=args;observedContext=context;return JSON.stringify({task:"private-task-id",route:"orchestrate",risk:"low",executablePlan:{tasks:[{role:"worker",title:"Worker task",status:"ready",dependsOn:[],writeSurfaces:["src/form.ts"]}]},persistence:{status:"saved"},execution:{started:false,authorized:false}});},()=>"task-generated-by-asen");
 assert.equal(registered.name,ASEN_PLAN_REQUEST_TOOL);
 assert.equal(registered.parameters.additionalProperties,false);
 assert.ok(!registered.parameters.required.includes("taskIdentity"));
 assert.ok(!Object.hasOwn(registered.parameters.properties,"repositoryIdentity"));
 const context={cwd:"/repo"};
 const result=await registered.execute("call",request(),undefined,undefined,context);
 const internal=JSON.parse(received);
 assert.equal(internal.taskIdentity,"task-generated-by-asen");assert.equal(internal.repositoryIdentity,undefined);
 assert.equal(internal.instruction,request().instruction);assert.equal(observedContext,context);
 const visible=result.content[0].text;
 assert.match(visible,/archivos propuestos: src\/form\.ts/u);assert.match(visible,/No se ha iniciado ningún trabajo/u);
 assert.doesNotMatch(visible,/private-task-id|task-generated-by-asen|\{"/u);
 assert.equal(result.details.task,"private-task-id");
});

test("natural-plan tool refuses missing facts instead of inventing an ODD plan",async()=>{
 let runs=0,tool:any;
 registerAsenPlanRequestTool({registerTool:value=>{tool=value;}},async()=>{runs++;return "{}";},()=>"task-id");
 await assert.rejects(()=>tool.execute("call",{instruction:"Inspect"},undefined,undefined,{cwd:"/repo"}),/incomplete/u);
 assert.equal(runs,0);
});

test("Pi prompt guidance removes user-authored ODD JSON and explains safe automatic advancement",()=>{
 const options:{sections:Record<string,string>}={sections:{existing:"preserved"}};addAsenRequestGuidance(options,true);
 assert.equal(options.sections.existing,"preserved");
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Never ask the user to write JSON/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/automatically dispatch dependency-ready read-only tasks/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/exact one-run Pi approval/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/continúa.*reanuda.*¿qué queda?/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Do not ask the user to run slash commands or copy task IDs/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/explicitly says to stop, cancel, or replace work/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Preserve completed work and unrelated plans/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Do not treat an unrelated new request as cancellation/u);
 const disabled:{sections:Record<string,string>}={sections:{existing:"preserved"}};addAsenRequestGuidance(disabled,false);assert.deepEqual(disabled,{sections:{existing:"preserved"}});
});

test("ASEN registers the natural-language planning tool and injects its guidance into Pi turns",()=>{
 const events=new Map<string,(...args:any[])=>unknown>(),tools=new Map<string,unknown>();
 const pi={registerCommand(){},registerTool(tool:{name:string}){tools.set(tool.name,tool);},on(name:string,handler:(...args:any[])=>unknown){events.set(name,handler);}};
 createAsenExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(pi);
 assert.ok(tools.has(ASEN_PLAN_REQUEST_TOOL));
 const options={sections:{} as Record<string,string>};events.get("before_agent_start")?.({systemPromptOptions:options},{});
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/ordinary language/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Never ask the user to write JSON/u);
});

test("natural-language plan request persists the real planner output without authorizing a write",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"asen-natural-plan-"));
 try{
  const tools=new Map<string,any>(),commands=new Map<string,any>(),events=new Map<string,(...args:any[])=>unknown>();
  const todos=await SessionTodoStore.open(path.join(directory,"todos.json"));
  const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(tool:any){tools.set(tool.name,tool);},on(name:string,handler:(...args:any[])=>unknown){events.set(name,handler);}};
  createAsenExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,todoStoreFactory:async()=>todos})(pi);
  const tool=tools.get(ASEN_PLAN_REQUEST_TOOL);
  const requestFacts={...request(),scope:{kind:"known",expectedPaths:["src/runtime/natural-plan-tool.ts"]},writes:[{path:"src/runtime/natural-plan-tool.ts",changeKind:"behavior"}],review:{kind:"ordinary",estimatedMinutes:5}};
  const context={cwd:process.cwd(),sessionManager:{getSessionId:()=>"natural-plan-session"},ui:{notify(){}}};
  const result=await tool.execute("call",requestFacts,undefined,undefined,context);
  const persisted=await todos.list({sessionId:"natural-plan-session",projectId:process.cwd()});
  assert.equal(persisted.length,4);
  assert.deepEqual(persisted.map(row=>row.plan?.role),["explorer","worker","reviewer","verifier"]);
  assert.ok(persisted.every(row=>row.current.state==="planned"));
  assert.ok(persisted.find(row=>row.plan?.role==="worker")?.plan?.candidate?.revision);
  assert.equal(result.details.execution.started,false);
  assert.equal(result.details.execution.authorized,false);
  assert.match(result.content[0].text,/El plan quedó guardado/u);
  assert.doesNotMatch(result.content[0].text,/task-[0-9a-f-]{36}|natural-plan-session/u);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test("bounded direct requests stay in chat without leaving a stalled Todo task",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"asen-natural-direct-"));
 try{
  const tools=new Map<string,any>(),events=new Map<string,(...args:any[])=>unknown>();
  const todos=await SessionTodoStore.open(path.join(directory,"todos.json"));
  const pi={registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);},on(name:string,handler:(...args:any[])=>unknown){events.set(name,handler);}};
  createAsenExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,todoStoreFactory:async()=>todos})(pi);
  const context={cwd:process.cwd(),sessionManager:{getSessionId:()=>"natural-direct-session"},ui:{notify(){}}};
  const result=await tools.get(ASEN_PLAN_REQUEST_TOOL).execute("call",request(),undefined,undefined,context);
  assert.equal(result.details.route,"direct");
  assert.equal(result.details.inlineContinuation,true);
  assert.equal(result.details.persistence.status,"not-needed");
  assert.equal(result.details.execution.started,false);
  assert.deepEqual(await todos.list({sessionId:"natural-direct-session",projectId:process.cwd()}),[]);
  assert.match(result.content[0].text,/continúa en esta misma conversación de Pi/u);
  assert.match(result.content[0].text,/No guardes una tarea Todo/u);
  assert.doesNotMatch(result.content[0].text,/slash command|task-[0-9a-f-]{36}|natural-direct-session/u);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test("material clarification stays in chat instead of parking a blocked Todo task",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"asen-natural-clarify-"));
 try{
  const tools=new Map<string,any>();
  const todos=await SessionTodoStore.open(path.join(directory,"todos.json"));
  const pi={registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);},on(){}};
  createAsenExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,todoStoreFactory:async()=>todos})(pi);
  const context={cwd:process.cwd(),sessionManager:{getSessionId:()=>"natural-clarify-session"},ui:{notify(){}}};
  const facts={...request(),unresolvedDecisions:["Should the form reject or normalize surrounding whitespace?"]};
  const result=await tools.get(ASEN_PLAN_REQUEST_TOOL).execute("call",facts,undefined,undefined,context);
  assert.equal(result.details.route,"plan");
  assert.equal(result.details.inlineClarification,true);
  assert.equal(result.details.persistence.status,"not-needed");
  assert.equal(result.details.execution.started,false);
  assert.deepEqual(await todos.list({sessionId:"natural-clarify-session",projectId:process.cwd()}),[]);
  assert.match(result.content[0].text,/Haz una sola pregunta concreta en esta conversación/u);
  assert.match(result.content[0].text,/No guardes una tarea pendiente/u);
  assert.doesNotMatch(result.content[0].text,/slash command|task-[0-9a-f-]{36}|natural-clarify-session/u);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test("high-risk requests stay blocked without a stale clarification task",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"asen-natural-high-risk-"));
 try{
  const tools=new Map<string,any>();
  const todos=await SessionTodoStore.open(path.join(directory,"todos.json"));
  const pi={registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);},on(){}};
  createAsenExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,todoStoreFactory:async()=>todos})(pi);
  const context={cwd:process.cwd(),sessionManager:{getSessionId:()=>"natural-high-risk-session"},ui:{notify(){}}};
  const facts={...request(),writes:[{path:"src/form.ts",changeKind:"security"}],riskOperations:["security_boundary"]};
  const result=await tools.get(ASEN_PLAN_REQUEST_TOOL).execute("call",facts,undefined,undefined,context);
  assert.equal(result.details.route,"plan");
  assert.equal(result.details.risk,"high");
  assert.equal(result.details.inlineClarification,true);
  assert.equal(result.details.execution.started,false);
  assert.deepEqual(await todos.list({sessionId:"natural-high-risk-session",projectId:process.cwd()}),[]);
  assert.match(result.content[0].text,/límite de riesgo alto/u);
  assert.match(result.content[0].text,/No inicies tareas ni escribas/u);
 }finally{await rm(directory,{recursive:true,force:true});}
});
