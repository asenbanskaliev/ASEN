import test from "node:test";
import assert from "node:assert/strict";
import {agentTerminalDeliveryOptions,agentTerminalContinuationMessage} from "../src/runtime/agent-terminal-delivery.js";

const id={sessionId:"primary-a",projectId:"/workspace/a"};
test("EF-601 Pi primary TUI wakes on terminal event using followUp, without status polling",()=>{
 const context={mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>id.sessionId}};
 assert.deepEqual(agentTerminalDeliveryOptions(context,id),{triggerTurn:true,deliverAs:"followUp"});
 assert.deepEqual(agentTerminalDeliveryOptions({...context,mode:"rpc"},id),{triggerTurn:false});
 assert.deepEqual(agentTerminalDeliveryOptions({...context,hasUI:false},id),{triggerTurn:false});
 assert.deepEqual(agentTerminalDeliveryOptions({...context,sessionManager:{getSessionId:()=> "foreign"}},id),{triggerTurn:false});
 assert.deepEqual(agentTerminalDeliveryOptions({...context,sessionManager:{getSessionId:()=>{throw Error("broken");}}},id),{triggerTurn:false});
});
test("EF-601 completion notice states that agent text is not an instruction or new consent",()=>{
 const output=agentTerminalContinuationMessage({id:"agent-fixture",role:"explorer",state:"completed",summary:"Found 3 locations"});
 assert.match(output,/Found 3 locations/u);
 assert.match(output,/do not sleep, poll agent status repeatedly/iu);
 assert.match(output,/permission|authorization/iu);
 assert.match(output,/equivalent queued\/running/iu);
 assert.match(output,/agent-fixture/u);
 const empty=agentTerminalContinuationMessage({id:"agent-no-output",role:"reviewer",state:"failed",summary:""});
 assert.match(empty,/No trustworthy output summary/u);
 assert.match(empty,/inspect the durable task/u);
});
