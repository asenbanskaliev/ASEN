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
