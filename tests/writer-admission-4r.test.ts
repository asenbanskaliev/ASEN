import {consumeRunnerWriteReceiver} from "../src/agents/dispatcher.js";
import assert from "node:assert/strict";
import test from "node:test";
import {Dispatcher,type AgentRequest} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {issueOrganicWriterAdmission,consumeWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
const candidate={id:"candidate",repository:"r",revision:"sha",createdAt:"now"};
function applicability(writes=true,paths=["src/a"],defect=false){
 const decision=issueOddDecision({taskId:"task",repository:"r",intent:writes?(defect?"defect":"implementation"):"analysis",paths,writes:writes?[{path:paths[0]!,changeKind:"behavior"}]:[]});
 buildOrchestrationPlan({taskId:"task",repository:"r",candidate,prompt:"task"},decision);
 return decideLifecycleApplicability(decision,{taskIdentity:"task",repositoryIdentity:"r",candidate:{id:candidate.id,repository:"r",revision:"sha"},explicitMode:"unspecified",affectedSubsystems:["runtime"],expectedPaths:paths,requiredArtifacts:[]});
}
function request():AgentRequest{
 const skillContext=issueSkillContext("task:worker","r",candidate,{phase:"apply",codeChange:true});
 return {id:"task:worker",role:"worker",repository:"r",prompt:"write",candidate,skillContext,skillPaths:selectSkills(skillContext).map(s=>s.path),writeSurfaces:["src/a"]};
}
function evidence(){const e=new EvidenceStore();for(const kind of ["scope","rollback","work-unit"] as const)e.add(candidate,{id:kind,kind,status:"pass",createdAt:"now",summary:"bounded"});return e;}
const admission=()=>issueOrganicWriterAdmission(applicability(),["src/a"]);
test("R1 organic admission rejects genuine read-only and forged applicability without invoking getters",()=>{
 const read=applicability(false);assert.throws(()=>issueOrganicWriterAdmission(read,["src/a"]),/organic write/);
 assert.throws(()=>issueOrganicWriterAdmission(read,["src/a"]),/claimed/);
 let calls=0;const fake={get outcome(){calls++;return "organic";}};
 assert.throws(()=>issueOrganicWriterAdmission(fake as never,["src/a"]),/issued/);assert.equal(calls,0);
});
test("R2 first-call candidate/revision/repository/surfaces mismatch burns admission",()=>{
 for(const change of [{candidate:{...candidate,id:"other"}},{candidate:{...candidate,revision:"other"}},{repository:"other"},{candidate:{...candidate,repository:"other"}},{writeSurfaces:["src/b"]},{writeSurfaces:[]},{id:"other"}]){
  const a=admission();assert.equal(consumeWriterAdmission(a,{...request(),...change}),false);
  assert.equal(consumeWriterAdmission(a,request()),false);
 }
 for(const fake of [{},structuredClone(admission()),new Proxy(admission(),{})])assert.equal(consumeWriterAdmission(fake,request()),false);
});
test("R3 exact canonical bounded arrays reject malformed/control strings without callbacks",()=>{
 const getter:string[]=[];Object.defineProperty(getter,"0",{enumerable:true,get(){throw new Error("getter executed");}});
 const extra=["src/a"];Object.assign(extra,{authority:true});
 const cases:unknown[]=[[],[""],[" src/a"],["src/a "],["src/e\u0301"],["src/a","src/a"],["src/a","src/a/"],["/"],["."],[".."],["src/../a"],["src//a"],["C:/a"],["src\\a"],["src/*"],[42],Array(1),getter,extra,new Proxy(["src/a"],{}),Array(257).fill("src/a"),["a".repeat(4097)]];
 for(let code=0;code<=159;code++)if(code<=31||code>=127)cases.push([`src/a${String.fromCharCode(code)}b`]);
 for(const surfaces of cases){const app=applicability();assert.throws(()=>issueOrganicWriterAdmission(app,surfaces as string[]));assert.throws(()=>issueOrganicWriterAdmission(app,["src/a"]),/claimed/);}
 assert.ok(issueOrganicWriterAdmission(applicability(true,["src/é"]),["src/é"]));
});
test("organic issuance rejects scope expansion and burns the original applicability",()=>{
 for(const surfaces of [["secrets/"],["src/"],["src"],["src/a/"],["src/a","secrets/key"]]){
  const original=applicability();
  assert.throws(()=>issueOrganicWriterAdmission(original,surfaces),/original.*scope/);
  assert.throws(()=>issueOrganicWriterAdmission(original,["src/a"]),/claimed/);
 }
 assert.ok(issueOrganicWriterAdmission(applicability(true,["src/a","src/b"]),["src/a"]));
});
test("organic admission cannot drop genuine original defect intent before dispatch",async()=>{
 const token=issueOrganicWriterAdmission(applicability(true,["src/a"],true),["src/a"]);
 let calls=0;
 const dispatcher=new Dispatcher({run:async r=>{calls++;return{id:r.id,ok:true,output:"must not run"};}},evidence());
 await assert.rejects(()=>dispatcher.dispatch({...request(),writerAdmission:token}),/admission/);
 assert.equal(calls,0);assert.equal(consumeWriterAdmission(token,request()),false);
 const genuineDefectContext=issueSkillContext("task:worker","r",candidate,{phase:"apply",codeChange:true,defect:true});
 const preserved={...request(),skillContext:genuineDefectContext,skillPaths:selectSkills(genuineDefectContext).map(s=>s.path)};
 const second=issueOrganicWriterAdmission(applicability(true,["src/a"],true),["src/a"]);
 await assert.rejects(()=>dispatcher.dispatch({...preserved,writerAdmission:second}),/defect-intake/);
 assert.equal(calls,0);assert.equal(consumeWriterAdmission(second,preserved),false);
});
for(const kind of ["forged","getter","proxy"] as const)test(`organic defect admission rejects ${kind} contexts without callbacks`,()=>{
 let callbacks=0;
 const supplied=kind==="forged"?{defect:true}:kind==="getter"?{get defect(){callbacks++;return true;}}:new Proxy({defect:true},{get(target,key){callbacks++;return Reflect.get(target,key);}});
 const token=issueOrganicWriterAdmission(applicability(true,["src/a"],true),["src/a"]);
 assert.equal(consumeWriterAdmission(token,{...request(),skillContext:supplied as never}),false);
 assert.equal(callbacks,0);
 const genuine=issueSkillContext("task:worker","r",candidate,{phase:"apply",codeChange:true,defect:true});
 assert.equal(consumeWriterAdmission(token,{...request(),skillContext:genuine}),false,"a rejected context must burn admission");
});
test("R2 Dispatcher burns admission before failed identity, context and evidence gates",async()=>{
 for(const modify of [(r:AgentRequest)=>({...r,id:"wrong"}),(r:AgentRequest)=>({...r,candidate:{...candidate,revision:"wrong"}}),(r:AgentRequest)=>{const {skillContext:_context,...rest}=r;return rest;}]){
  const a=admission(),dispatcher=new Dispatcher({run:async()=>{throw new Error("must not run");}},evidence());
  await assert.rejects(()=>dispatcher.dispatch({...modify(request()),writerAdmission:a}));
  assert.equal(consumeWriterAdmission(a,request()),false);
 }
 const a=admission();await assert.rejects(()=>new Dispatcher({run:async()=>{throw new Error("must not run");}},new EvidenceStore()).dispatch({...request(),writerAdmission:a}));
 assert.equal(consumeWriterAdmission(a,request()),false);
});
test("R2/R4 receiver binds immutable exact call; ID-preserving structural changes burn it",async()=>{
 for(const change of [{},{candidate:{...candidate,revision:"other"}},{repository:"other"},{writeSurfaces:["src/b"]},{prompt:"other"},{role:"reviewer" as const},{expectedPhase:"apply"}]){
  await new Dispatcher({run:async r=>{
   assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.candidate)&&Object.isFrozen(r.writeSurfaces)&&Object.isFrozen(r.skillPaths));
   assert.equal("writerAdmission" in r,false);
   assert.equal(consumeRunnerWriteReceiver(r.runnerWriteReceiver,{...r,...change}),false);
   assert.equal(consumeRunnerWriteReceiver(r.runnerWriteReceiver,r),false);
   return {id:r.id,ok:true,output:"ok"};
  }},evidence()).dispatch({...request(),writerAdmission:admission()});
 }
});
test("R2 concurrent dispatchers admit one organic writer and one receiver consumption",async()=>{
 let calls=0;const a=admission(),r={...request(),writerAdmission:a};
 const runner={run:async (call:AgentRequest)=>{calls++;assert.equal(consumeRunnerWriteReceiver(call.runnerWriteReceiver,call),true);assert.equal(consumeRunnerWriteReceiver(call.runnerWriteReceiver,call),false);return{id:call.id,ok:true,output:"ok"};}};
 const results=await Promise.allSettled([new Dispatcher(runner,evidence()).dispatch(r),new Dispatcher(runner,evidence()).dispatch(r)]);
 assert.equal(calls,1);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
});
test("R4 unused receiver expires when its dispatched call finishes",async()=>{
 let captured:AgentRequest|undefined;
 await new Dispatcher({run:async r=>{captured=r;return{id:r.id,ok:false,output:"failed"};}},evidence()).dispatch({...request(),writerAdmission:admission()});
 assert.ok(captured);assert.equal(consumeRunnerWriteReceiver(captured.runnerWriteReceiver,captured),false);
});
test("R2 Pi burns receiver before rejecting a wrong-ID call at earlier identity gates",async()=>{
 const {PiProcessRunner}=await import("../src/agents/pi-process-runner.js");
 const pi=new PiProcessRunner({command:"must-not-spawn"});
 await new Dispatcher({run:async r=>{
  const wrong=await pi.run({...r,id:"wrong"});assert.equal(wrong.ok,false);
  const retry=await pi.run(r);assert.equal(retry.ok,false);assert.match(retry.output,/exact dispatcher receiver/);
  return {id:r.id,ok:true,output:"ok"};
 }},evidence()).dispatch({...request(),writerAdmission:admission()});
});
test("R1 public admission consumption cannot mint a direct Pi receiver",async()=>{
 const {PiProcessRunner}=await import("../src/agents/pi-process-runner.js");
 const call=request(),result=consumeWriterAdmission(admission(),call);
 assert.equal(result,true);assert.equal(typeof result,"boolean");
 const direct=await new PiProcessRunner({command:"must-not-spawn"}).run(Object.freeze({...call,runnerWriteReceiver:Object.freeze({})}));
 assert.equal(direct.ok,false);assert.match(direct.output,/exact dispatcher receiver/);
});
