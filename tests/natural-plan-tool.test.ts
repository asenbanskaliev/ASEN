import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {registerAsenPlanRequestTool,ASEN_PLAN_REQUEST_TOOL} from "../src/runtime/natural-plan-tool.js";
import {controlledInstructionPlanCommand} from "../src/runtime/route-command.js";
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

test("registered natural intake preserves controlled command routing and instructions",async t=>{
 const cases=[
  {name:"direct primary",taskIdentity:"parity-direct",route:"direct",taskRoles:["primary"],delegatedRoles:[],facts:{...request(),instruction:"Inspect the bounded form behavior without changing it",writes:[],testing:{kind:"n_a",reason:"Read-only inspection"}}},
  {name:"material clarification",taskIdentity:"parity-clarify",route:"plan",taskRoles:["clarifier"],delegatedRoles:[],facts:{...request(),instruction:"Update the form while preserving its current normalization contract",unresolvedDecisions:["Should surrounding whitespace be rejected or normalized?"]}},
  {name:"explicit coordinated review",taskIdentity:"parity-review",route:"orchestrate",taskRoles:["worker","reviewer","verifier"],delegatedRoles:["worker","reviewer","verifier"],facts:{...request(),instruction:"Implement the bounded form change with explicit coordinated review",scope:{kind:"known",expectedPaths:["src/form.ts","src/form-rules.ts","tests/form.test.ts","docs/form.md"]},review:{kind:"dual_explicit",estimatedMinutes:10}}},
  {name:"verification",taskIdentity:"parity-verify",route:"verify",taskRoles:["verifier"],delegatedRoles:["verifier"],facts:{...request(),instruction:"Verify the completed form behavior independently",intent:"verification",scope:{kind:"known",expectedPaths:[]},writes:[]}},
 ] as const;
 for(const item of cases)await t.test(item.name,async()=>{
  let tool:any,received="",materialized="",observedContext:unknown;
  registerAsenPlanRequestTool({registerTool:value=>{tool=value;}},async(args,context)=>{received=args;observedContext=context;materialized=controlledInstructionPlanCommand(args,"/repo");return materialized;},()=>item.taskIdentity);
  const context={cwd:"/repo",marker:item.name};
  const actual=(await tool.execute("call",item.facts,undefined,undefined,context)).details;
  const internal=JSON.parse(received),expected=JSON.parse(materialized);
  assert.equal(internal.instruction,item.facts.instruction);assert.equal(observedContext,context);
  assert.equal(actual.route,item.route);assert.equal(actual.route,expected.route);assert.equal(actual.risk,expected.risk);
  assert.deepEqual(actual.executablePlan.tasks.map((task:{role:string})=>task.role),item.taskRoles);
  assert.deepEqual(actual.requiredAgentRoles,item.delegatedRoles);assert.deepEqual(actual.requiredAgentRoles,expected.requiredAgentRoles);
  assert.deepEqual(actual.executablePlan.tasks.map((task:{role:string;instruction:string;dependsOn:string[]})=>({role:task.role,instruction:task.instruction,dependsOn:task.dependsOn})),expected.executablePlan.tasks.map((task:{role:string;instruction:string;dependsOn:string[]})=>({role:task.role,instruction:task.instruction,dependsOn:task.dependsOn})));
  assert.deepEqual(actual.execution,{started:false,authorized:false});assert.equal(actual.executablePlan.execution,"not_started");assert.equal(actual.executablePlan.authorization,"required_before_dispatch");
 });
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
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Group related unresolved decisions into that same message/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/does not need another confirmation dialog/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/continúa.*reanuda.*¿qué queda?/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Do not ask the user to run slash commands or copy task IDs/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/explicitly says to stop, cancel, or replace work/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Preserve completed work and unrelated plans/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Do not treat an unrelated new request as cancellation/u);
 const disabled:{sections:Record<string,string>}={sections:{existing:"preserved"}};addAsenRequestGuidance(disabled,false);assert.deepEqual(disabled,{sections:{existing:"preserved"}});
});

test("Pi guidance keeps explicitly scoped read-only parallelism proportional and authority-free",async t=>{
 const guidance=()=>{const options:{sections:Record<string,string>}={sections:{}};addAsenRequestGuidance(options,true);return options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!;};
 await t.test("uses separate Todo-bound agents for explicitly named independent read-only branches",()=>{
  assert.match(guidance(),/explicitly named, non-overlapping read-only branches.*separate Todos.*Todo-bound asen_agent_start/isu);
 });
 await t.test("does not force decomposition from counts",()=>{
  assert.match(guidance(),/Do not decompose or delegate merely because of task count, file count, or step count/iu);
 });
 await t.test("never routes writers through the independent read-only branch path",()=>{
  assert.match(guidance(),/Never use this independent-branch path for writers or infer write authority from it/iu);
 });
 await t.test("retains the plan dependency DAG for genuinely dependent work",()=>{
  assert.match(guidance(),/Genuinely dependent work retains the existing bounded plan dependency DAG/iu);
 });
});

test("ASEN registers the natural-language planning tool and injects its guidance into Pi turns",()=>{
 const events=new Map<string,(...args:any[])=>unknown>(),tools=new Map<string,unknown>();
 const pi={registerCommand(){},registerTool(tool:{name:string}){tools.set(tool.name,tool);},on(name:string,handler:(...args:any[])=>unknown){events.set(name,handler);}};
 createAsenExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false})(pi);
 assert.ok(tools.has(ASEN_PLAN_REQUEST_TOOL));
 const options={sections:{} as Record<string,string>};events.get("before_agent_start")?.({systemPromptOptions:options},{});
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/ordinary language/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/Never ask the user to write JSON/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/asen_todo_inspect_interrupted_write/u);
 assert.match(options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!,/fresh plan plus a new explicit write authorization/u);
});

test("natural-language plan request persists the real planner output without authorizing a write",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"asen-natural-plan-"));
 try{
  const tools=new Map<string,any>(),commands=new Map<string,any>(),events=new Map<string,(...args:any[])=>unknown>();
  const todos=await SessionTodoStore.open(path.join(directory,"todos.json"));
  const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(tool:any){tools.set(tool.name,tool);},on(name:string,handler:(...args:any[])=>unknown){events.set(name,handler);}};
  createAsenExtension({enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,todoStoreFactory:async()=>todos})(pi);
  const tool=tools.get(ASEN_PLAN_REQUEST_TOOL);
  const requestFacts={...request(),scope:{kind:"known",expectedPaths:["src/runtime/natural-plan-tool.ts","src/runtime/route-command.ts","src/orchestration/orchestrator.ts","tests/natural-plan-tool.test.ts"]},writes:[{path:"src/runtime/natural-plan-tool.ts",changeKind:"behavior"}],review:{kind:"dual_explicit",estimatedMinutes:5}};
  const context={cwd:process.cwd(),sessionManager:{getSessionId:()=>"natural-plan-session"},ui:{notify(){}}};
  const result=await tool.execute("call",requestFacts,undefined,undefined,context);
  const persisted=await todos.list({sessionId:"natural-plan-session",projectId:process.cwd()});
  assert.equal(persisted.length,3);
  assert.deepEqual(persisted.map(row=>row.plan?.role),["worker","reviewer","verifier"]);
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
  assert.match(result.content[0].text,/Haz un único mensaje breve en esta conversación/u);
  assert.match(result.content[0].text,/agrupa en él las decisiones relacionadas/u);
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
