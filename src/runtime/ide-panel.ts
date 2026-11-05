import type {PublicAgentRecord} from "./agent-lifecycle.js";
import type {TodoItem} from "./todo-store.js";
import type {TaskEvent} from "./task-replay.js";
import type {BackgroundJobSnapshot} from "./background-jobs.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";

/** Read-only Pi UI projection: never grants a role, launches an agent, or replays a message. */
export const ASEN_PANEL_SECTIONS=["TODOS","JOBS","AGENTS","CHANGES","REVIEW","INTEGRATIONS"] as const;
export type AsenPanelSection=(typeof ASEN_PANEL_SECTIONS)[number];
export interface AsenPanelSnapshot{
 readonly todos:readonly (TodoItem&{current:TaskEvent})[];
 readonly agents:readonly PublicAgentRecord[];
 readonly jobs:readonly BackgroundJobSnapshot[];
 readonly changes?:{readonly branch:string;readonly files:number};
 readonly profile?:string;
 readonly permission?:string;
 readonly model?:string;
 readonly effort?:string;
 readonly contextPercent?:number;
 readonly cost?:number;
 readonly subscription?:boolean;
 readonly integrationStates?:readonly string[];
 readonly review?:{readonly pending:number;readonly label?:string};
}
const clean=(value:string,max=200)=>sanitizeTerminalText(value).replace(/\s+/gu," ").trim().slice(0,max);
const fit=(value:string,width:number)=>truncateForTerminal(value,Math.max(1,width));
const glyph=(state:string):string=>({
 planned:"○",running:"◐",succeeded:"◇",blocked:"⊘",done:"✓",cancelled:"✕",
 queued:"○",completed:"✓",failed:"✗",interrupted:"!",stopped:"■",timed_out:"⌛",
} as Record<string,string>)[state]??"·";
const activeJob=new Set(["running","queued"]);
const unfinishedTodo=new Set(["planned","running","succeeded","blocked"]);
function count(snapshot:AsenPanelSnapshot,section:AsenPanelSection):string{
 switch(section){
  case "TODOS":return snapshot.todos.filter(t=>t.current.state==="done").length+"/"+snapshot.todos.length;
  case "JOBS":return snapshot.jobs.filter(j=>activeJob.has(j.state)).length+" running";
  case "AGENTS":return snapshot.agents.filter(a=>a.state==="running").length+" running";
  case "CHANGES":return snapshot.changes?snapshot.changes.files+" files":"unavailable";
  case "REVIEW":return snapshot.review?.pending?snapshot.review.pending+" needs you":"unverified";
  case "INTEGRATIONS":return snapshot.integrationStates?.length?snapshot.integrationStates.length+" reported":"unknown";
 }
}
export function renderAsenPanelSection(snapshot:AsenPanelSnapshot,section:AsenPanelSection,width=72):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid ASEN panel width");
 const out:string[]=[];
 switch(section){
  case "TODOS":{
   const open=snapshot.todos.filter(t=>unfinishedTodo.has(t.current.state));
   if(!snapshot.todos.length)out.push("No tasks in this session");
   for(const item of open.slice(0,12)){
    const state=item.current.state==="succeeded"?"awaiting independent review":item.current.state;
    out.push(glyph(item.current.state)+" "+clean(item.title,240)+" ["+state+"]");
    if(item.current.state==="blocked"||item.current.state==="succeeded")
     out.push("  └ "+clean(item.current.reason||"Review required",200));
   }
   const done=snapshot.todos.filter(t=>t.current.state==="done").length;
   const cancelled=snapshot.todos.filter(t=>t.current.state==="cancelled").length;
   if(done)out.push("✓ "+done+" done");
   if(cancelled)out.push("✕ "+cancelled+" cancelled");
   if(open.length>12)out.push("… "+(open.length-12)+" more · /asen-todos");
   break;
  }
  case "JOBS":{
   const jobs=[...snapshot.jobs].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
   if(!jobs.length)out.push("No local jobs · /asen-background-status");
   for(const job of jobs.slice(0,8))out.push(glyph(job.state)+" "+clean(job.mode,20)+" · "+job.state+" · "+clean(job.command,100));
   if(jobs.length>8)out.push("… "+(jobs.length-8)+" more");
   break;
  }
  case "AGENTS":{
   const priority:Record<string,number>={interrupted:0,running:1,queued:2,failed:3,cancelled:4,completed:5};
   const agents=[...snapshot.agents].sort((a,b)=>(priority[a.state]??9)-(priority[b.state]??9)||b.updatedAt.localeCompare(a.updatedAt));
   if(!agents.length)out.push("No agents · /asen-agents");
   for(const agent of agents.slice(0,8))out.push(glyph(agent.state)+" "+clean(agent.role,30)+" · "+agent.state+(agent.state==="interrupted"?" · inspect first":""));
   if(agents.length>8)out.push("… "+(agents.length-8)+" more · /asen-agents");
   // No real tokens/prices/model on the durable public agent record: never fabricate.
   break;
  }
  case "CHANGES":{
   const status=snapshot.changes;
   out.push(status?("Git "+clean(status.branch,48)+" · "+(status.files?status.files+" files":"clean")):"Git state unavailable");
   out.push("Inspect current Git with /asen-changes");
   break;
  }
  case "REVIEW":{
   out.push(snapshot.review?.pending?"Human review needed · "+snapshot.review.pending:"Review state unverified · /asen-review");
   if(snapshot.review?.label)out.push(clean(snapshot.review.label,140));
   break;
  }
  case "INTEGRATIONS":{
   out.push("Agent profile: "+(snapshot.profile?clean(snapshot.profile,80):"unknown"));
   out.push("Permission: "+(snapshot.permission?clean(snapshot.permission,40):"unknown"));
   if(snapshot.integrationStates?.length)out.push(...snapshot.integrationStates.slice(0,6).map(value=>clean(value,120)));
   else out.push("MCP and extension connections: unknown");
   break;
  }
 }
 return Object.freeze(out.map(value=>fit("  "+value,width)));
}
export function renderAsenPanel(snapshot:AsenPanelSnapshot,width=72,collapsed:readonly AsenPanelSection[]=[]):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid ASEN panel width");
 const lines:string[]=[];
 for(const section of ASEN_PANEL_SECTIONS){
  const open=!collapsed.includes(section);
  lines.push(fit((open?"▾ ":"▸ ")+section+" · "+count(snapshot,section),width));
  if(open)lines.push(...renderAsenPanelSection(snapshot,section,width));
 }
 return Object.freeze(lines);
}
export function renderAsenWorkRow(snapshot:AsenPanelSnapshot,width=80):string|undefined{
 const open=snapshot.todos.filter(t=>unfinishedTodo.has(t.current.state));
 const running=snapshot.agents.filter(a=>a.state==="running").length;
 const attention=snapshot.agents.filter(a=>a.state==="interrupted"||a.state==="failed").length;
 const jobs=snapshot.jobs.filter(j=>activeJob.has(j.state)).length;
 if(!open.length&&!running&&!attention&&!jobs)return undefined;
 const parts:string[]=[];
 if(running)parts.push("◐ "+running+" agents");
 if(attention)parts.push("! "+attention+" inspect");
 if(jobs)parts.push("⧗ "+jobs+" jobs");
 if(snapshot.todos.length)parts.push(snapshot.todos.filter(t=>t.current.state==="done").length+"/"+snapshot.todos.length+" todos");
 return fit("▸ "+parts.join(" · ")+" · /asen-panel",width);
}
/** No unsupported runtime model, context, pricing or quota claims. */
export function renderAsenStatusLine(snapshot:AsenPanelSnapshot,width=80):string{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid ASEN status width");
 const parts:string[]=["ASEN"];
 if(snapshot.changes)parts.push(clean(snapshot.changes.branch,45)+" "+(snapshot.changes.files?"±"+snapshot.changes.files:"clean"));
 if(snapshot.permission&&snapshot.permission!=="normal")parts.push(clean(snapshot.permission,25));
 if(snapshot.model)parts.push(clean(snapshot.model,55)+(snapshot.effort?" · "+clean(snapshot.effort,20):""));
 if(typeof snapshot.contextPercent==="number"&&Number.isFinite(snapshot.contextPercent)&&snapshot.contextPercent>=0&&snapshot.contextPercent<=100)
  parts.push("ctx "+Math.round(snapshot.contextPercent)+"%");
 if(typeof snapshot.cost==="number"&&Number.isFinite(snapshot.cost)&&snapshot.cost>=0)
  parts.push("$"+snapshot.cost.toFixed(2)+(snapshot.subscription?" sub":""));
 return fit(parts.join(" │ "),width);
}
