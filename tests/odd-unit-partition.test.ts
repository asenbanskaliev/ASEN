import assert from "node:assert/strict";
import test from "node:test";
import {deriveOddFacts,describeOddUnitPartition,planOddRoute,type OddRoutingRequest,type OddTaskUnit} from "../src/flow/odd-routing.js";
import {controlledInstructionPlanCommand} from "../src/runtime/lifecycle/route-command.js";
import {registerAsenPlanRequestTool} from "../src/runtime/lifecycle/natural-plan-tool.js";

const repo="/repo";
const units:readonly OddTaskUnit[]=[
 {id:"integracion",objective:"Integrar y comprobar ambos componentes",estimatedMinutes:35,dependsOn:["api","ui"],writePaths:["tests/integration.test.ts"]},
 {id:"api",objective:"Desarrollar y probar API",estimatedMinutes:45,dependsOn:[],writePaths:["src/api.ts","tests/api.test.ts"]},
 {id:"ui",objective:"Desarrollar y probar interfaz",estimatedMinutes:40,dependsOn:[],writePaths:["src/ui.ts","tests/ui.test.ts"]},
];
const paths=units.flatMap(unit=>unit.writePaths!);
function request(overrides:Partial<OddRoutingRequest>={}):OddRoutingRequest{
 return {taskIdentity:"division-odd",repositoryIdentity:repo,intent:"implementation",
  scope:{kind:"known",expectedPaths:paths},writes:paths.map(path=>({path,changeKind:"behavior"})),
  riskOperations:[],session:{estimatedMinutes:120,continuation:false},
  testing:{kind:"required"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[],
  taskUnits:units,...overrides};
}
test("Dos raíces con ámbitos exactos y una sucesora forman una propuesta ordenada, sin permisos",()=>{
 const input=request(),before=structuredClone(input),facts=deriveOddFacts(input);
 const result=describeOddUnitPartition(facts)!;
 assert.deepEqual(result.dependencyRoots,["api","ui"]);
 assert.deepEqual(result.topologicalOrder,["api","ui","integracion"]);
 assert.equal(result.authorization,"not_granted");
 assert.equal(result.execution,"not_started");
 assert.equal(result.status,"proposal-only");
 assert.equal(planOddRoute(facts).route,"orchestrate");
 assert.deepEqual(input,before);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.units[0]!.writePaths));
 assert.throws(()=>describeOddUnitPartition({...facts}),/not issued/u);
});
test("No divide ámbitos incompletos, duplicados, ampliados ni solapados",()=>{
 const [integration,api,ui]=units;
 const invalid:readonly (readonly OddTaskUnit[])[]=[
  [integration!,api!,{...ui!,writePaths:[]}],
  [integration!,api!,{...ui!,writePaths:["src/ui.ts"]}],
  [integration!,api!,{...ui!,writePaths:["src/ui.ts","tests/ui.test.ts","outside.ts"]}],
  [integration!,api!,{...ui!,writePaths:["src/api.ts","tests/ui.test.ts"]}],
  [integration!,api!,{id:"ui",objective:"Sin ámbito",estimatedMinutes:40,dependsOn:[]}],
 ];
 for(const taskUnits of invalid)assert.throws(()=>deriveOddFacts(request({taskUnits})),/partition/u);
 for(const [a,b] of [["src/API","src/api/file.ts"],["src/a.ts","SRC/A.ts"],["src/*","docs/a.md"]] as const){
  const taskUnits=[{...api!,writePaths:[a]},{...ui!,writePaths:[b]}];
  assert.throws(()=>deriveOddFacts(request({taskUnits,scope:{kind:"known",expectedPaths:[a,b]},
   writes:[{path:a,changeKind:"behavior"},{path:b,changeKind:"behavior"}]})),/partition/u);
 }
});
test("Las unidades antiguas sin rutas no se convierten en propuestas con permisos",()=>{
 const legacy=units.map(({writePaths,...unit})=>unit);
 assert.equal(describeOddUnitPartition(deriveOddFacts(request({taskUnits:legacy}))),undefined);
 assert.equal(planOddRoute(deriveOddFacts(request({taskUnits:legacy}))).route,"orchestrate");
});
test("La entrada natural devuelve la división validada y mantiene el plan ejecutable vigente",async()=>{
 let tool:any;
 registerAsenPlanRequestTool({registerTool:value=>{tool=value;}},async args=>controlledInstructionPlanCommand(args,repo),()=>"division-odd");
 assert.ok(tool.parameters.properties.taskUnits.items.properties.writePaths);
 const {taskIdentity,repositoryIdentity,...facts}=request();
 const call=async(overrides:Record<string,unknown>={})=>(await tool.execute("call",{instruction:"Completar API, interfaz e integración",...facts,...overrides},undefined,undefined,{cwd:repo})).details;
 const result=await call();
 assert.equal(result.unitPartition.status,"proposal-only");
 assert.deepEqual(result.unitPartition.dependencyRoots,["api","ui"]);
 assert.equal(result.executablePlan.tasks.filter((task:{role:string})=>task.role==="worker").length,1);
 assert.deepEqual(result.execution,{started:false,authorized:false});
 const blocked=await call({riskOperations:["security_boundary"]});
 assert.equal(blocked.route,"plan");
 assert.deepEqual(blocked.requiredAgentRoles,[]);
 assert.deepEqual(blocked.execution,{started:false,authorized:false});
 const approval=await call({scope:{kind:"known",expectedPaths:paths.slice(1)}});
 assert.equal(approval.status,"needs-scope-approval");
 assert.deepEqual(approval.execution,{started:false,authorized:false});
});

test("La partición con candidato real materializa dos raíces Writer y una sucesora",()=>{
 const {repositoryIdentity,...facts}=request();
 const candidate={id:"candidate",repository:repo,revision:"a".repeat(40),createdAt:"2026-11-24T00:00:00.000Z"};
 const input={instruction:"Completar API, interfaz e integración",...facts};
 const result=JSON.parse(controlledInstructionPlanCommand(JSON.stringify(input),repo,candidate));
 assert.equal(result.partitionExecution,"supervised-worktrees-required");
 assert.equal(result.requiresSingleWriter,false);
 assert.deepEqual(result.requiredAgentRoles,["worker","worker","worker"]);
 const tasks=result.executablePlan.tasks;
 assert.equal(tasks.length,3);
 const integration=tasks[0],api=tasks[1],ui=tasks[2];
 assert.deepEqual(integration.dependsOn,[api.id,ui.id]);
 assert.equal(integration.status,"waiting");
 assert.deepEqual(api.dependsOn,[]);
 assert.deepEqual(ui.dependsOn,[]);
 assert.equal(api.status,"ready");
 assert.equal(ui.status,"ready");
 assert.deepEqual(api.writeSurfaces,["src/api.ts","tests/api.test.ts"]);
 assert.deepEqual(ui.writeSurfaces,["src/ui.ts","tests/ui.test.ts"]);
 assert.equal(new Set(tasks.map((task:{id:string})=>task.id)).size,3);
 assert.deepEqual(result.executablePlan.topologicalOrder,[api.id,ui.id,integration.id]);
 assert.deepEqual(result.execution,{started:false,authorized:false});
 for(const task of tasks){
  const basis=JSON.parse(task.writerAuthorizationBasis);
  assert.deepEqual(basis.partitionOrigin,input);
  assert.equal(basis.sourceRevision,candidate.revision);
  assert.equal(task.authorization,"required_before_dispatch");
 }
 const childRoot="/repo-child",child={...candidate,repository:childRoot,id:"child-candidate"};
 const reconstructed=JSON.parse(controlledInstructionPlanCommand(api.writerAuthorizationBasis,childRoot,child));
 assert.equal(reconstructed.executablePlan.tasks.length,1);
 const restored=reconstructed.executablePlan.tasks[0];
 assert.equal(restored.id,api.id);
 assert.equal(restored.instruction,api.instruction);
 assert.equal(restored.writerAuthorizationBasis,api.writerAuthorizationBasis);
 assert.deepEqual(restored.writeSurfaces,api.writeSurfaces);
 assert.equal(restored.candidate.repository,childRoot);
 assert.throws(()=>controlledInstructionPlanCommand(integration.writerAuthorizationBasis,childRoot,child),/dependent unit requires/u);
 assert.throws(()=>controlledInstructionPlanCommand(api.writerAuthorizationBasis,childRoot,{...child,revision:"b".repeat(40)}),/stale/u);
 const changed=JSON.parse(api.writerAuthorizationBasis);
 changed.instruction="Otra instrucción";
 assert.throws(()=>controlledInstructionPlanCommand(JSON.stringify(changed),childRoot,child),/identity or instruction changed/u);
});

test("La división no elimina revisiones ni controles de riesgo existentes",()=>{
 const candidate={id:"candidate",repository:repo,revision:"a".repeat(40),createdAt:"2026-11-24T00:00:00.000Z"};
 const {repositoryIdentity,...facts}=request();
 for(const changes of [{review:{kind:"dual_explicit",estimatedMinutes:15}},{namedRisks:[{item:4,reason:"Concurrencia"}]}]){
  const result=JSON.parse(controlledInstructionPlanCommand(JSON.stringify({instruction:"Completar tres unidades",...facts,...changes}),repo,candidate));
  assert.equal(result.partitionExecution,undefined);
  assert.equal(result.executablePlan.tasks.filter((task:{role:string})=>task.role==="worker").length,1);
  assert.ok(result.executablePlan.tasks.some((task:{role:string})=>["reviewer","verifier"].includes(task.role)));
  assert.equal(result.execution.authorized,false);
 }
});

test("Pi guarda las tres unidades en el diario real y no despacha la raíz en la sesión padre",async()=>{
 const {mkdtemp,mkdir,rm,realpath}=await import("node:fs/promises");
 const {tmpdir}=await import("node:os");
 const {join}=await import("node:path");
 const {execFileSync}=await import("node:child_process");
 const {SessionTodoStore}=await import("../src/runtime/lifecycle/todo-store.js");
 const {createAsenExtension}=await import("../extensions/asen.js");
 const {dispatchNextPlanTask}=await import("../src/runtime/lifecycle/plan-dispatcher.js");
 const {bindParallelSourceTodos}=await import("../src/runtime/agents/parallel-todo-bindings.js");
 const directory=await mkdtemp(join(tmpdir(),"asen-odd-partition-"));
 try{
  const root=join(directory,"repo"),home=join(directory,"home");
  await mkdir(root);await mkdir(home);
  const project=await realpath(root);
  const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  git("init","-q");git("config","user.name","ASEN");git("config","user.email","test@example.invalid");git("commit","--allow-empty","-qm","base");
  const head=git("rev-parse","HEAD");
  const todos=await SessionTodoStore.open(join(home,"todos.json"));
  const tools=new Map<string,any>();
  const pi={registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);},on(){}};
  createAsenExtension({homeDir:()=>home,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,todoStoreFactory:async()=>todos})(pi);
  const identity={sessionId:"partition-parent",projectId:project};
  const context={cwd:project,sessionManager:{getSessionId:()=>identity.sessionId},ui:{notify(){}}};
  const {taskIdentity,repositoryIdentity,...facts}=request();
  const result=await tools.get("asen_plan_request").execute("call",{instruction:"Completar tres unidades",...facts},undefined,undefined,context);
  assert.equal(result.details.persistence.status,"saved");
  assert.equal(result.details.execution.started,false);
  assert.match(result.content[0].text,/Las tareas están guardadas/u);
  const rows=await todos.list(identity);
  assert.equal(rows.length,3);
  assert.ok(rows.every(row=>row.current.state==="planned"&&row.plan?.role==="worker"));
  const roots=rows.filter(row=>!(row.dependsOn?.length));
  const successor=rows.find(row=>row.dependsOn?.length)!;
  assert.equal(roots.length,2);
  assert.deepEqual(successor.dependsOn,roots.map(row=>row.taskId));
  assert.equal(bindParallelSourceTodos({identity,expectedHead:head,rows,units:roots.map(row=>({taskId:row.taskId,writeSurfaces:row.plan!.writeSurfaces!}))}).length,2);
  let confirmations=0;
  const denied=await dispatchNextPlanTask({todos,identity,
   agents:{} as Parameters<typeof dispatchNextPlanTask>[0]["agents"],
   links:{} as Parameters<typeof dispatchNextPlanTask>[0]["links"],
   validateIdentity:async()=>{},confirm:async()=>{confirmations++;return true;}});
  assert.equal(denied.status,"blocked");
  if(denied.status==="blocked")assert.match(denied.reason,/supervisor padre/u);
  assert.equal(confirmations,0);
  assert.ok((await todos.list(identity)).every(row=>row.current.state==="planned"));
 }finally{await rm(directory,{recursive:true,force:true});}
});
