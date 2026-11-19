import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {controlledInstructionPlanCommand} from "../src/runtime/lifecycle/route-command.js";
import {ExplorerBudgetTelemetry} from "../src/runtime/agents/explorer-budget.js";
import {
 ASEN_EXPLORATION_BUDGET_GUIDANCE,
 ASEN_EXPLORATION_BUDGET_SECTION,
 ASEN_REQUEST_GUIDANCE_SECTION,
 addAsenRequestGuidance,
} from "../src/runtime/ui/request-guidance.js";

function facts(overrides:Record<string,unknown>={}){
 return {
  taskIdentity:"g49-route",instruction:"Implementar el cambio solicitado",
  intent:"implementation",scope:{kind:"known",expectedPaths:["src/a.ts","src/b.ts","tests/a.test.ts"]},
  writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],
  session:{estimatedMinutes:15,continuation:false},testing:{kind:"required"},
  review:{kind:"none",estimatedMinutes:10},unresolvedDecisions:[],...overrides,
 };
}

test("G49-A1: varios archivos y una sesión larga no autorizan delegación ni permisos",()=>{
 const route=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(facts({session:{estimatedMinutes:120,continuation:true}})),process.cwd()));
 assert.equal(route.route,"direct");
 assert.deepEqual(route.requiredAgentRoles,[]);
 assert.deepEqual(route.executablePlan.tasks.map((task:{role:string})=>task.role),["primary"]);
 assert.deepEqual(route.execution,{started:false,authorized:false});
 const reviewed=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(facts({review:{kind:"dual_explicit",estimatedMinutes:10}})),process.cwd()));
 assert.equal(reviewed.route,"orchestrate");
 assert.deepEqual(reviewed.requiredAgentRoles,["worker","reviewer","reviewer"]);
 assert.equal(reviewed.authorizationRequiredBeforeExecution,true);
});

test("G49-A1/A3: la orientación favorece la ruta pequeña y no transforma un rechazo en permiso",()=>{
 const options={sections:{previous:"intacto"} as Record<string,string>};
 addAsenRequestGuidance(options,true);
 const guidance=options.sections[ASEN_REQUEST_GUIDANCE_SECTION]!;
 assert.match(guidance,/original request plus the Git diff alone/u);
 assert.match(guidance,/not automatically a Writer/u);
 assert.match(guidance,/genuinely independent, sufficiently substantial units/u);
 assert.match(guidance,/do not retry the identical dispatch/u);
 assert.match(guidance,/the user expressly required separate agents/u);
 assert.match(guidance,/A changed candidate, denied Writer approval/u);
 assert.equal(options.sections.previous,"intacto");
 assert.equal(options.sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
});

test("G49-A2: el agotamiento se comunica solo como consejo, sin ejecutar ni conceder autoridad",()=>{
 const tracker=new ExplorerBudgetTelemetry();
 const options={sections:{} as Record<string,string>};
 for(let i=0;i<3;i++)assert.equal(tracker.observe({toolCallId:String(i),toolName:"read",result:{content:[{type:"text",text:"dato"}]}}),false);
 addAsenRequestGuidance(options,true,tracker.snapshot().overBudget);
 assert.equal(options.sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
 assert.equal(tracker.observe({toolCallId:"3",toolName:"read",result:{content:[{type:"text",text:"dato"}]}}),true);
 addAsenRequestGuidance(options,true,tracker.snapshot().overBudget);
 assert.equal(options.sections[ASEN_EXPLORATION_BUDGET_SECTION],ASEN_EXPLORATION_BUDGET_GUIDANCE);
 assert.match(ASEN_EXPLORATION_BUDGET_GUIDANCE,/not a Writer admission/u);
 assert.match(ASEN_EXPLORATION_BUDGET_GUIDANCE,/do not create duplicate work/u);
 addAsenRequestGuidance(options,true,false);
 assert.equal(options.sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
 addAsenRequestGuidance(options,false,true);
 assert.equal(options.sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
});

test("G49-A2: los eventos Pi entregan el presupuesto solo a su sesión y proyecto",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-g49-a-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const handlers=new Map<string,Array<(event:any,context:any)=>unknown>>(),tools:any[]=[];
 const pi={
  on(name:string,handler:(event:any,context:any)=>unknown){handlers.set(name,[...(handlers.get(name)??[]),handler]);},
  registerCommand(){},registerTool(tool:any){tools.push(tool);},
 };
 const facade=createAsenExtension({
  homeDir:()=>root,packageRoot:root,
  enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false,
 })(pi as any);
 const ctx:any={
  cwd:root,mode:"rpc",hasUI:true,
  sessionManager:{getSessionId:()=>"g49-session-a"},
  ui:{notify(){},setWidget(){},setStatus(){}},
 };
 await facade.startSession(ctx);
 t.after(async()=>{for(const handler of handlers.get("session_shutdown")??[])await handler({},ctx);});
 const prompt=async(context=ctx)=>{
  const options={sections:{} as Record<string,string>};
  for(const handler of handlers.get("before_agent_start")??[])await handler({systemPromptOptions:options},context);
  return options.sections;
 };
 assert.equal((await prompt())[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
 for(let i=0;i<4;i++){
  for(const handler of handlers.get("tool_execution_end")??[]){
   await handler({toolCallId:"g49-read-"+i,toolName:"read",result:{content:[{type:"text",text:"datos"}]}},ctx);
  }
 }
 assert.equal((await prompt())[ASEN_EXPLORATION_BUDGET_SECTION],ASEN_EXPLORATION_BUDGET_GUIDANCE);
 const another={...ctx,sessionManager:{getSessionId:()=>"g49-session-b"}};
 assert.equal((await prompt(another))[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
 assert.equal((await prompt())[ASEN_EXPLORATION_BUDGET_SECTION],ASEN_EXPLORATION_BUDGET_GUIDANCE);
 assert.equal(tools.some(tool=>tool.name==="asen_plan_request"),true);
});
