/** Read-only R4 gate for one real Pi TUI parent turn.
 * Recorded host events are not an independent review or proof of human reading.
 */
import assert from "node:assert/strict";

const SHA=/^[a-f0-9]{40}$/u;
const EVENT=/^asen:agent:[a-f0-9]{64}:terminal$/u;
export function gradeParentConsumption({candidateSha,model,events,notice,route="idle"}){
 assert.match(candidateSha??"",SHA,"Exact candidate SHA is required");
 assert.ok(model==="beam"||model==="beam:cloud","Only the explicitly selected Ollama Beam model is admitted");
 assert.ok(Array.isArray(events)&&events.length>0&&events.length<=40,"Missing bounded Pi native event trace");
 assert.ok(route==="idle"||route==="busy","Only pinned Pi parent delivery routes are permitted");
 const at=(kind)=>events.flatMap((event,index)=>event?.kind===kind?[index]:[]);
 const order=route==="busy"?
  ["parent_turn_start","busy_tool_started","result_enqueued","busy_tool_finished","status_inspected","acknowledged","parent_turn_end"]:
  ["result_enqueued","idle_wake","parent_turn_start","status_inspected","acknowledged","parent_turn_end"];
 for(const kind of order)
  assert.equal(at(kind).length,1,kind+" must be observed exactly once from the real Pi host");
 const positions=order.map(kind=>at(kind)[0]);
 assert.ok(positions.every((x,i)=>i===0||x>positions[i-1]),
  route==="busy"?"Pi parent must inspect and acknowledge AFTER its active tool call":"Pi parent must inspect and acknowledge AFTER idle wake in the same turn");
 const result=events[at("result_enqueued")[0]],inspection=events[at("status_inspected")[0]],
  ack=events[at("acknowledged")[0]];
 assert.ok(EVENT.test(result.eventId),"Result must carry a durable ASEN notice identity");
 if(route==="busy"){
  assert.equal(at("idle_wake").length,0,"A busy Pi parent cannot create an idle wake");
  assert.equal(result.options?.triggerTurn,true,"Busy parent requires real Pi steering delivery");
  assert.equal(result.options?.deliverAs,"steer","Busy parent must use native Pi steering");
  assert.equal(result.parentHostIdle,false,"Pi must report busy while Explorer completes");
  assert.equal(result.parentTurnActive,true,"Parent run must be observed active at delivery");
  assert.equal(result.busyToolActive,true,"The parent tool must still be executing at delivery");
  assert.equal(events[at("busy_tool_started")[0]].parentTurnActive,true,"Busy tool began outside parent run");
  assert.equal(events[at("busy_tool_finished")[0]].parentTurnActive,true,"Busy tool ended after parent settled");
 }else{
  const wake=events[at("idle_wake")[0]];
  assert.equal(result.options?.triggerTurn,false,"Result must be stored without injecting a turn");
  assert.equal(wake.options?.triggerTurn,true,"Real Pi idle wake must trigger a new model turn");
  assert.equal(wake.options?.deliverAs,"steer","Wake must enter Pi steering channel");
 }
 assert.equal(inspection.agentId,result.agentId,"Pi parent must inspect the exact terminal agent, not a different task or the list");
 assert.equal(inspection.taskFound,true,"Pi parent must observe the completed durable task, not a missing or unfinished result");
 assert.equal(inspection.returnedAgentId,result.agentId,"Status response must identify the same durable agent");
 assert.equal(inspection.returnedState,"completed","Status response must report the completed terminal state");
 assert.equal(ack.eventId,result.eventId,"Acknowledgement must belong to exactly this stored terminal result");
 assert.equal(ack.confirmed,true,"The real Pi tool must confirm a durable acknowledgement");
 assert.equal(ack.returnedEventId,result.eventId,"Acknowledgement tool response must return the same durable event");
 assert.equal(ack.returnedAgentId,result.agentId,"Acknowledgement tool response must identify the same agent");
 assert.equal(ack.returnedState,"completed","Acknowledgement tool response must confirm the completed state");
 assert.ok(notice&&notice.eventId===result.eventId&&notice.delivery==="acknowledged"&&
  notice.agentId===result.agentId&&notice.state==="completed",
  "Actual durable journal must contain the same acknowledged terminal agent");
 assert.ok(events.every(event=>event?.kind!=="model_turn_budget_exceeded"),"Provider call budget was exceeded");
 assert.ok(events.every(event=>event?.kind!=="writer_authorized"&&event?.kind!=="file_written"),
  "No unapproved Writer or project mutation is permitted");
 return Object.freeze({
  schema:"asen-real-pi-parent-consumption/v1",candidateSha,model,
  status:route==="busy"?"PASS_REAL_PI_BUSY_PARENT_BOUNDED":"PASS_REAL_PI_PARENT_BOUNDED",
  source:route==="busy"?"Native Pi TUI with an active read-only tool call":"Native Pi TUI with a controlled read-only fixture child",
  parentRoute:route,
  eventId:result.eventId,agentId:notice.agentId,eventsObserved:order,
  actor:"live-ollama-cloud-parent",verifiedParentToolActions:2,
  childUsesModel:false,writerAuthorized:false,humanReadConfirmed:false,
  independentReferenceParity:false,globalFull:false,
 });
}
