import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessT06StaticWriteOnly} from "../src/runtime/agents/t06-static-write-evidence.js";
import type {T06WriterEvidenceInput} from "../src/runtime/agents/t06-writer-evidence.js";

const valid:Omit<T06WriterEvidenceInput,"behaviorOk">={
 events:[
  {type:"tool_execution_start",name:"write",id:"pi-1"},
  {type:"tool_execution_end",name:"write",id:"pi-1",error:false}
 ],
 requestedModel:"nvidia/nemotron-3.5-lightning-30b-a3b",
 observedModel:"nvidia/nemotron-3.5-lightning-30b-a3b",
 processObserved:true,nativeResultOk:true,exactScope:true,
 syntaxOk:true,attributionVerified:true
};

test("T06 permite acreditar una única escritura sin declarar comportamiento probado",()=>{
 const result=assessT06StaticWriteOnly(valid);
 assert.equal(result.writeOnlyVerified,true);
 assert.equal(result.behaviorVerified,false);
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.globalFull,false);
 assert.deepEqual(result.blockers,["behavior-tests-failed"]);
 assert.equal("passed" in result,false);
});
test("T06 estático no acepta salidas de texto, fallos, modificaciones fuera del ámbito ni identidades inventadas",()=>{
 for(const patch of [
  {events:[]},{events:[...valid.events,...valid.events]},
  {events:[{type:"tool_execution_start" as const,name:"write",id:"pi-1"},
   {type:"tool_execution_end" as const,name:"write",id:"pi-2",error:false}]},
  {events:[...valid.events,{type:"tool_execution_start" as const,name:"edit",id:"pi-3"}]},
  {observedModel:"nvidia/modelo-falso"},
  {observedModel:null},{processObserved:false},{nativeResultOk:false},
  {exactScope:false},{syntaxOk:false},{attributionVerified:false}
 ]){
  const result=assessT06StaticWriteOnly({...valid,...patch});
  assert.equal(result.writeOnlyVerified,false,JSON.stringify(patch));
  assert.equal(result.behaviorVerified,false);
  assert.equal(result.acceptance,"not-accepted");
  assert.equal(result.globalFull,false);
  assert.ok(result.blockers.some(x=>x!=="behavior-tests-failed"));
 }
});
test("T06 real conserva el bloqueo de ejecución completa y el modo limitado exige GitHub y primer intento",()=>{
 const script=readFileSync(new URL("../scripts/t06-nvidia-dual-writer-native.ts",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("../.github/workflows/t06-github-approved-writers.yml",import.meta.url),"utf8");
 const admission=readFileSync(new URL("../src/runtime/agents/t06-behavior-isolation.ts",import.meta.url),"utf8");
 assert.match(script,/if\(!staticOnly\)blockUnisolatedGeneratedCodeTrial\("T06"\)/u);
 assert.match(script,/ASEN_T06_STATIC_WRITE_ONLY==="1"/u);
 assert.match(script,/process\.env\.ASEN_T06_GITHUB_MODE!=="1"/u);
 assert.match(script,/process\.env\.GITHUB_ACTIONS!=="true"/u);
 assert.match(script,/process\.env\.GITHUB_RUN_ATTEMPT!=="1"/u);
 assert.match(script,/await requireLiveT06GithubApprovals\(\)/u);
 assert.match(script,/staticOnly\?r\.value\.writeOnlyVerified:r\.value\.passed/u);
 assert.match(script,/if\(passed&&concurrent&&!staticOnly\)/u);
 assert.match(script,/if\(!staticOnly\)behaviorOk=checkT06Behavior\(root,target,fn\)/u);
 assert.equal((script.match(/checkT06Behavior\(root,target,fn\)/gu)||[]).length,1);
 assert.match(script,/generatedCodeExecuted:false,behaviorVerified:false/u);
 assert.match(script,/PASS_TWO_WRITERS_STATIC_ONLY_BEHAVIOR_NOT_TESTED/u);
 assert.match(admission,/return false;/u);
 assert.match(workflow,/ASEN_T06_STATIC_WRITE_ONLY: "1"/u);
 assert.match(workflow,/needs: \[aprobar-a, aprobar-b\]/u);
 assert.match(workflow,/test "\$GITHUB_RUN_ATTEMPT" = 1/u);
 const step=workflow.slice(workflow.indexOf("- name: Ejecutar dos Pi Writer"));
 assert.ok(step.indexOf('test "$GITHUB_RUN_ATTEMPT" = 1')>=0);
 assert.ok(step.indexOf('test "$GITHUB_RUN_ATTEMPT" = 1')<
  step.indexOf("scripts/t06-nvidia-dual-writer-native.ts"));
 assert.match(workflow,/T07 NO COMPROBADO/u);
 assert.doesNotMatch(workflow,/contents: write|pull-requests: write/u);
});
