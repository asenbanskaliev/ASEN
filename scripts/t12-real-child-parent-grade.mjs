/** Guarded evidence for one real Pi RPC child + one real Pi TUI parent.
 * This is still NOT a real A/B C13 comparison or human Writer consent.
 */
import assert from "node:assert/strict";
import {gradeParentConsumption} from "./t12-parent-consumption-grade.mjs";
const digest=/^[a-f0-9]{64}$/u;
export function gradeRealChildParentConsumption(input){
 const base=gradeParentConsumption(input);
 const {events,model}=input;
 const busy=input.route==="busy";
 const position=kind=>events.flatMap((event,index)=>event?.kind===kind?[index]:[]);
 for(const kind of ["child_pi_requested","child_pi_started","child_pi_selected","child_pi_finished"])
  assert.equal(position(kind).length,1,"Actual Pi RPC child evidence requires exactly one "+kind);
 const stages=["child_pi_requested","child_pi_started","child_pi_selected",
  "child_pi_finished","result_enqueued"];
 const indexes=stages.map(kind=>position(kind)[0]);
 assert.ok(indexes.every((x,index)=>index===0||x>indexes[index-1]),
  "Child Pi RPC inference must complete before ASEN publishes a terminal result");
 if(busy)assert.ok(position("busy_tool_started")[0]<indexes[0]&&
  indexes[3]<position("busy_tool_finished")[0],
  "Real Pi child must finish entirely inside one active parent tool call");
 const [requested,started,selected,finished]=indexes.slice(0,4).map(x=>events[x]);
 assert.equal(requested.role,"explorer","Child Pi must be a read-only Explorer");
 assert.equal(requested.agentId,base.agentId,"Requested Pi child identity must match the durable agent");
 assert.equal(started.pidObserved,true,"Real OS Pi RPC child process is mandatory");
 assert.equal(selected.agentId,base.agentId,"Child model selection must belong to this launch");
 assert.equal(selected.provider,"ollama-cloud","Child cannot use a provider other than Ollama Cloud");
 assert.equal(selected.model,model,"Child must use the same registered Beam model as its parent");
 assert.equal(finished.agentId,base.agentId,"Child completion must match terminal ASEN identity");
 assert.equal(finished.ok,true,"Pi RPC child must genuinely succeed");
 assert.equal(finished.hadAgentEnd,true,"Pi RPC child must complete a real agent_end");
 assert.equal(finished.hadAssistantMessage,true,"Pi RPC child must emit a real assistant message completion");
 assert.equal(finished.selectionObserved,true,"Child selection must be observed exactly once");
 assert.match(finished.outputSha256??"",digest,"Child Pi RPC must have a bound transcript digest");
 assert.equal(events.some(event=>event.kind==="child_pi_tool_attempted"),false,
  "No child built-in or extension tool calls are allowed");
 assert.equal(events.some(event=>event.kind==="model_turn_budget_exceeded"),false,
  "Parent must not exceed the configured turn budget");
 return Object.freeze({...base,
  schema:"asen-real-pi-parent-child-consumption/v1",
  status:busy?"PASS_REAL_PI_BUSY_PARENT_AND_CHILD_BOUNDED":"PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED",
  source:busy?"Native Pi RPC child completed during a native Pi TUI active tool call; both use Ollama Beam":
   "Native Pi RPC child and native Pi TUI parent, both using Ollama Beam",
  childUsesModel:true,childRole:"explorer",
  childProvider:"ollama-cloud",childModel:selected.model,
  childPiProcessObserved:true,childAssistantResponseObserved:true,
  childResponseSha256:finished.outputSha256,
  writerAuthorized:false,humanReadConfirmed:false,
  independentReferenceParity:false,globalFull:false,
 });
}
