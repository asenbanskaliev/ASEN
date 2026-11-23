import assert from "node:assert/strict";
import test from "node:test";
import {hasExactWorkerAuthorizationBasis} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {deriveOddFacts,planOddRoute} from "../src/flow/odd-routing.js";

const basis=()=>({
 instruction:"Implementar dos unidades independientes",taskIdentity:"e1b-autorizar",intent:"implementation",
 scope:{kind:"known",expectedPaths:["src/a.ts"]},
 writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],
 session:{estimatedMinutes:65,continuation:false},testing:{kind:"required"},
 review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[],
 taskUnits:[
  {id:"api",objective:"Contrato de API",estimatedMinutes:45,dependsOn:[]},
  {id:"ui",objective:"Vista independiente",estimatedMinutes:45,dependsOn:[]},
  {id:"integracion",objective:"Unir tras API",estimatedMinutes:30,dependsOn:["api"]},
 ],
});

test("E1B: la autorización de un Worker admite las unidades originales sin perder el plan ODD",()=>{
 const input=basis();
 assert.equal(hasExactWorkerAuthorizationBasis(input),true);
 const {instruction,...factsInput}=input;
 const facts=deriveOddFacts({...factsInput,repositoryIdentity:"/repo"} as Parameters<typeof deriveOddFacts>[0]);
 assert.equal(facts.independentUnits,2);
 const decision=planOddRoute(facts);
 assert.equal(decision.route,"orchestrate");
 assert.deepEqual(decision.reasons,["independent-substantial-task-units"]);
 assert.equal(Object.hasOwn(input,"writerAdmission"),false);
});

test("E1B: los contratos de autorización siguen rechazando claves no declaradas o incompletas",()=>{
 const input=basis();
 const {taskUnits,...withoutUnits}=input;
 assert.equal(hasExactWorkerAuthorizationBasis(withoutUnits),true,"Compatibilidad con planes anteriores");
 const {instruction,...missing}=input;
 const invalid=[{...input,permission:"forjada"},missing,{...input,instruction:" "},
  Object.assign(Object.create({permission:true}),input),null,[],
 ];
 for(const value of invalid)assert.equal(hasExactWorkerAuthorizationBasis(value),false);
 const {instruction:_,...rest}=input;
 assert.throws(()=>deriveOddFacts({...rest,repositoryIdentity:"/repo",taskUnits:[{id:"x",objective:"rota",estimatedMinutes:30,dependsOn:["inventado"]}]} as Parameters<typeof deriveOddFacts>[0]));
});
