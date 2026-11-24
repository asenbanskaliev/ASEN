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
