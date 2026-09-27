import assert from "node:assert/strict";
import test from "node:test";
import { Dispatcher, type AgentRunner } from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";

const candidate={id:"candidate",repository:"r",revision:"sha",createdAt:"now"};
function authorized(){
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"work-unit",kind:"work-unit",status:"pass",summary:"bounded",createdAt:"now"});
 evidence.add(candidate,{id:"scope",kind:"scope",status:"pass",summary:"authorized",createdAt:"now"});
 evidence.add(candidate,{id:"rollback",kind:"rollback",status:"pass",summary:"ready",createdAt:"now"});
 return evidence;
}
const writeRequest={id:"a",role:"worker" as const,prompt:"x",repository:"r",writeSurfaces:["src/a"],candidate,skills:["asen-work-unit","asen-safe-change"] as const};

test("dispatcher releases writer grant after completion", async()=>{
  const runner: AgentRunner={run:async r=>({id:r.id,ok:true,output:"ok"})};
  const d=new Dispatcher(runner,authorized());
  await d.dispatch({...writeRequest,skills:[...writeRequest.skills]});
  const second=await d.dispatch({...writeRequest,id:"b",skills:[...writeRequest.skills]});
  assert.equal(second.ok,true);
});

test("dispatcher blocks writes without exact candidate and selected skills",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"should-not-run"})};
 const d=new Dispatcher(runner,new EvidenceStore());
 await assert.rejects(()=>d.dispatch({id:"a",role:"worker",prompt:"x",repository:"r",writeSurfaces:["src/a"]}),/exact candidate/);
 await assert.rejects(()=>d.dispatch({id:"b",role:"worker",prompt:"x",repository:"r",writeSurfaces:["src/a"],candidate}),/selected skills/);
});

test("dispatcher blocks writes when mandatory mutation evidence is missing",async()=>{
 let ran=false;const runner:AgentRunner={run:async r=>{ran=true;return{id:r.id,ok:true,output:"bad"}}};
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"work-unit",kind:"work-unit",status:"pass",summary:"bounded",createdAt:"now"});
 const d=new Dispatcher(runner,evidence);
 await assert.rejects(()=>d.dispatch({...writeRequest,skills:[...writeRequest.skills]}),/asen-safe-change.*scope evidence/);
 assert.equal(ran,false);
});

test("evidence from another revision cannot authorize writes",async()=>{
 const old={...candidate,revision:"old"},evidence=new EvidenceStore();
 evidence.add(old,{id:"old-unit",kind:"work-unit",status:"pass",summary:"old",createdAt:"now"});
 evidence.add(old,{id:"old-scope",kind:"scope",status:"pass",summary:"old",createdAt:"now"});
 evidence.add(old,{id:"old-rollback",kind:"rollback",status:"pass",summary:"old",createdAt:"now"});
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 await assert.rejects(()=>new Dispatcher(runner,evidence).dispatch({...writeRequest,skills:[...writeRequest.skills]}),/work-unit evidence/);
});

test("non-worker agents cannot receive write authority",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 await assert.rejects(()=>new Dispatcher(runner,authorized()).dispatch({...writeRequest,role:"reviewer",skills:[...writeRequest.skills]}),/Only worker/);
});

test("dispatcher bounds concurrent agent executions",async()=>{let active=0,max=0;const runner:AgentRunner={run:async r=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,30));active--;return{id:r.id,ok:true,output:"ok"};}};const d=new Dispatcher(runner,new EvidenceStore(),2);await Promise.all(Array.from({length:6},(_,i)=>d.dispatch({id:String(i),role:"explorer",prompt:"x",repository:"r"})));assert.equal(max,2);});
test("dispatcher rejects invalid concurrency limits",()=>{const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"ok"})};assert.throws(()=>new Dispatcher(runner,new EvidenceStore(),0),/positive integer/);});
