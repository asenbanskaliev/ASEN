/** Read-only R4 gate for one real Pi TUI parent turn.
 * Recorded host events are not an independent review or proof of human reading.
 */
import assert from "node:assert/strict";

const SHA=/^[a-f0-9]{40}$/u;
const EVENT=/^asen:agent:[a-f0-9]{64}:terminal$/u;
export function gradeParentConsumption({candidateSha,model,events,notice}){
 assert.match(candidateSha??"",SHA,"Exact candidate SHA is required");
 assert.ok(model==="beam"||model==="beam:cloud","Only the explicitly selected Ollama Beam model is admitted");
 assert.ok(Array.isArray(events)&&events.length>0&&events.length<=40,"Missing bounded Pi native event trace");
 const at=(kind)=>events.flatMap((event,index)=>event?.kind===kind?[index]:[]);
 for(const kind of ["result_enqueued","idle_wake","parent_turn_start","status_inspected","acknowledged","parent_turn_end"])
  assert.equal(at(kind).length,1,kind+" must be observed exactly once from the real Pi host");
 const order=["result_enqueued","idle_wake","parent_turn_start","status_inspected","acknowledged","parent_turn_end"];
 const positions=order.map(kind=>at(kind)[0]);
 assert.ok(positions.every((x,i)=>i===0||x>positions[i-1]),"Pi parent must inspect and acknowledge AFTER idle wake in the same turn");
 const result=events[positions[0]],wake=events[positions[1]],ack=events[positions[4]];
 assert.ok(EVENT.test(result.eventId),"Result must carry a durable ASEN notice identity");
 assert.equal(result.options?.triggerTurn,false,"Result must be stored without injecting a turn");
 assert.equal(wake.options?.triggerTurn,true,"Real Pi idle wake must trigger a new model turn");
 assert.equal(wake.options?.deliverAs,"steer","Wake must enter Pi steering channel");
 assert.equal(ack.eventId,result.eventId,"Acknowledgement must belong to exactly this stored terminal result");
 assert.equal(ack.confirmed,true,"The real Pi tool must confirm a durable acknowledgement");
 assert.ok(notice&&notice.eventId===result.eventId&&notice.delivery==="acknowledged"&&
  notice.agentId===result.agentId&&notice.state==="completed",
  "Actual durable journal must contain the same acknowledged terminal agent");
 assert.ok(events.every(event=>event?.kind!=="model_turn_budget_exceeded"),"Provider call budget was exceeded");
 assert.ok(events.every(event=>event?.kind!=="writer_authorized"&&event?.kind!=="file_written"),
  "No unapproved Writer or project mutation is permitted");
 return Object.freeze({
  schema:"asen-real-pi-parent-consumption/v1",candidateSha,model,
  status:"PASS_REAL_PI_PARENT_BOUNDED",source:"Native Pi TUI with a controlled read-only fixture child",
  eventId:result.eventId,agentId:notice.agentId,eventsObserved:order,
  actor:"live-ollama-cloud-parent",verifiedParentToolActions:2,
  childUsesModel:false,writerAuthorized:false,humanReadConfirmed:false,
  independentReferenceParity:false,globalFull:false,
 });
}
