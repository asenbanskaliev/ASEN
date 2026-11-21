import assert from "node:assert/strict";
import test from "node:test";
import {controlledInstructionPlanCommand} from "../src/runtime/lifecycle/route-command.js";
import {registerAsenPlanRequestTool} from "../src/runtime/lifecycle/natural-plan-tool.js";

function request(scope:string[],writes:string[]){
 return {
  instruction:"Actualizar solo los archivos autorizados",taskIdentity:"scope-proposal",
  intent:"implementation",scope:{kind:"known",expectedPaths:scope},
  writes:writes.map(path=>({path,changeKind:"behavior"})),riskOperations:[],
  session:{estimatedMinutes:15,continuation:false},testing:{kind:"required"},
  review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]
 };
}
const project=process.platform==="win32"?"C:\\proyecto":"/tmp/proyecto";

test("E2: la ampliación produce una propuesta sin plan, agentes ni permisos",()=>{
 const proposal=JSON.parse(controlledInstructionPlanCommand(
  JSON.stringify(request(["src/a.ts"],["src/a.ts","src/b.ts"])),project
 ));
 assert.equal(proposal.status,"needs-scope-approval");
 assert.deepEqual(proposal.originalPaths,["src/a.ts"]);
 assert.deepEqual(proposal.additionalPaths,["src/b.ts"]);
 assert.deepEqual(proposal.execution,{started:false,authorized:false});
 assert.equal(proposal.scopeAuthorization,"not-granted");
 assert.equal(Object.hasOwn(proposal,"executablePlan"),false);
 assert.equal(Object.hasOwn(proposal,"delegatedAgents"),false);
});

test("E2: no se disfraza de ampliación una ruta peligrosa o ajena",()=>{
 for(const invalid of ["../fuera","/absoluto",".git/config","src/../fuera"]){
  assert.throws(()=>controlledInstructionPlanCommand(JSON.stringify(request(["src/a.ts"],[invalid])),project));
 }
 assert.throws(()=>controlledInstructionPlanCommand(
  JSON.stringify(request(["src/a.ts"],["src/a.ts","src/a.ts"])),project));
});

test("E2: el padre muestra la solicitud en lenguaje normal y no la acepta por sí solo",async()=>{
 let tool:any;
 registerAsenPlanRequestTool({registerTool(value){tool=value;}},async()=>JSON.stringify({
  status:"needs-scope-approval",additionalPaths:["src/b.ts"],execution:{started:false,authorized:false}
 }),()=>"scope-proposal");
 assert.ok(tool);
 const args=request(["src/a.ts"],["src/a.ts","src/b.ts"]);
 const {taskIdentity:unused,...params}=args;
 const result=await tool.execute("solicitud",params,new AbortController().signal,()=>{},{
  cwd:project,sessionManager:{getSessionId:()=>"sesion"}
 });
 assert.match(result.content[0].text,/aprobación expresa/u);
 assert.equal(result.details.execution.authorized,false);
});
