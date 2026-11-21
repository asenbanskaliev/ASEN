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
 assert.match(guidance,/petición original y el diff de Git/u);
 assert.match(guidance,/no automáticamente un Writer/u);
 assert.match(guidance,/unidades suficientemente grandes e independientes/u);
 assert.match(guidance,/no repitas el mismo lanzamiento/u);
 assert.match(guidance,/el usuario exige agentes separados/u);
 assert.match(guidance,/cambia el candidato, se deniega el Writer/u);
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
 assert.match(ASEN_EXPLORATION_BUDGET_GUIDANCE,/no una autorización de Writer/u);
 assert.match(ASEN_EXPLORATION_BUDGET_GUIDANCE,/No dupliques trabajos/u);
 addAsenRequestGuidance(options,true,false);
 assert.equal(options.sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
 addAsenRequestGuidance(options,false,true);
 assert.equal(options.sections[ASEN_EXPLORATION_BUDGET_SECTION],undefined);
});

test("G49-A2: los eventos Pi entregan el presupuesto solo a su sesión y proyecto",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-g49-a-"));
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
 t.after(async()=>{
  try{for(const handler of handlers.get("session_shutdown")??[])await handler({},ctx);}
  finally{await rm(root,{recursive:true,force:true});}
 });
 await facade.startSession(ctx);
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


test("E1B: delegación completa convierte una edición directa en Writer con ámbito exacto",()=>{
 const repository=process.cwd();
 const request={...facts(),scope:{kind:"known",expectedPaths:["src/a.ts","src/b.ts","tests/a.test.ts"]},
  writes:[{path:"src/a.ts",changeKind:"behavior"}]};
 const candidate={id:"candidato-e1",repository,revision:"a".repeat(40),createdAt:"2026-11-19T10:00:00Z"};
 const layers={global:{schema:"asen.runtime-profiles/v1" as const,active:"autonomo",profiles:[{
  name:"autonomo",mode:"full-delegation" as const,routes:{worker:{model:"cloud/configurado"}}
 }]}};
 const planned=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(request),repository,candidate,layers));
 assert.equal(planned.route,"direct");
 assert.deepEqual(planned.requiredAgentRoles,["worker"]);
 assert.deepEqual(planned.executablePlan.tasks.map((task:{role:string})=>task.role),["worker"]);
 assert.deepEqual(planned.executablePlan.tasks[0].writeSurfaces,["src/a.ts"]);
 assert.equal(planned.executablePlan.tasks[0].model,"cloud/configurado");
 assert.equal(planned.execution.started,false);
 assert.equal(planned.execution.authorized,false);
 const normal=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(request),repository,candidate));
 assert.deepEqual(normal.executablePlan.tasks.map((task:{role:string})=>task.role),["primary"]);
});

test("E1B: delegación completa no lanza agentes para lectura directa",()=>{
 const repository=process.cwd(),request={...facts({intent:"analysis",writes:[]})};
 const layers={global:{schema:"asen.runtime-profiles/v1" as const,active:"delegado",profiles:[{
  name:"delegado",mode:"full-delegation" as const,routes:{}
 }]}};
 const planned=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(request),repository,undefined,layers));
 assert.deepEqual(planned.executablePlan.tasks.map((task:{role:string})=>task.role),["primary"]);
 assert.equal(planned.execution.started,false);
});
