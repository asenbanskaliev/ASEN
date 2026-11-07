import type {PublicAgentRecord} from "./agent-lifecycle.js";
import type {AgentStateEvent} from "./agent-store.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";
export interface AgentInspection{
 readonly record:PublicAgentRecord;
 readonly history:readonly AgentStateEvent[];
}
const clean=(value:string,max=160)=>sanitizeTerminalText(value).replace(/\s+/gu," ").trim().slice(0,max);
/** Persisted lifecycle trace; never claim child Pi RPC thought/tool transcript. */
export function renderAgentInspection(view:AgentInspection,width=100):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid agent inspection width");
 const {record,history}=view;
 const rows:string[]=[
  "AGENT · "+clean(record.role,40)+" · "+clean(record.state,30),
  "Task: "+clean(record.id,180),
  "Project: "+clean(record.projectId,140),
  "Owner: "+clean(record.owner.kind,16)+" · "+clean(record.owner.id,90),
  "Persistent lifecycle (not the model transcript):",
 ];
 const sorted=[...history].sort((a,b)=>a.revision-b.revision);
 for(const event of sorted.slice(-40)){
  rows.push("  "+clean(event.at,32)+" · "+clean(event.state,24)+" · #"+event.revision);
 }
 if(history.length>40)rows.push("… "+(history.length-40)+" older events omitted");
 if(record.state==="interrupted")rows.push("Interrupted: inspect before an explicit restart; no automatic replay");
 rows.push("Model message/thread metadata unavailable in this durable lifecycle store");
 return Object.freeze(rows.map(row=>truncateForTerminal(row,width)));
}
