import assert from "node:assert/strict";
import test from "node:test";
import { Dispatcher, type AgentRunner } from "../src/agents/dispatcher.js";

test("dispatcher releases writer grant after completion", async()=>{
  const runner: AgentRunner={run:async r=>({id:r.id,ok:true,output:"ok"})};
  const d=new Dispatcher(runner);
  await d.dispatch({id:"a",role:"worker",prompt:"x",repository:"r",writeSurfaces:["src/a"]});
  const second=await d.dispatch({id:"b",role:"worker",prompt:"x",repository:"r",writeSurfaces:["src/a"]});
  assert.equal(second.ok,true);
});

test("dispatcher bounds concurrent agent executions",async()=>{let active=0,max=0;const runner:AgentRunner={run:async r=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,30));active--;return{id:r.id,ok:true,output:"ok"};}};const d=new Dispatcher(runner,2);await Promise.all(Array.from({length:6},(_,i)=>d.dispatch({id:String(i),role:"explorer",prompt:"x",repository:"r"})));assert.equal(max,2);});
test("dispatcher rejects invalid concurrency limits",()=>{const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"ok"})};assert.throws(()=>new Dispatcher(runner,0),/positive integer/);});
