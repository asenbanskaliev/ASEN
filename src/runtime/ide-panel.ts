import type {PublicAgentRecord} from "./agent-lifecycle.js";
import type {TodoItem} from "./todo-store.js";
import type {TaskEvent} from "./task-replay.js";
import type {BackgroundJobSnapshot} from "./background-jobs.js";
import {projectJobMetadata,jobInspectionLabel,isObservedActiveJob} from "./job-inspect.js";
import {sanitizeTerminalText,truncateForTerminal,visibleWidth} from "./responsive-layout.js";
import type {HostStatusProjection} from "./host-status-projection.js";
import type {IntegrationProfileInspection} from "./integration-profile-inspection.js";

/** Read-only Pi UI projection: never grants a role, launches an agent, or replays a message. */
export const ASEN_PANEL_SECTIONS=["TODOS","JOBS","AGENTS","CHANGES","REVIEW","INTEGRATIONS"] as const;
export type AsenPanelSection=(typeof ASEN_PANEL_SECTIONS)[number];
export interface AsenPanelSnapshot{
 readonly todos:readonly (TodoItem&{current:TaskEvent})[];
 readonly todosObserved?:boolean;
 readonly agents:readonly PublicAgentRecord[];
 readonly jobs:readonly BackgroundJobSnapshot[];
 readonly changes?:{readonly branch:string;readonly files:number};
 readonly profile?:string;
 readonly permission?:string;
 readonly model?:string;
 readonly effort?:string;
 readonly contextPercent?:number;
 /** Explicit observation state is additive; legacy snapshots retain omission semantics. */
 readonly hostStatus?:HostStatusProjection;
 readonly integrationInspection?:IntegrationProfileInspection;
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
const unfinishedTodo=new Set(["planned","running","succeeded","blocked"]);
/** What an elevated mode means; stated once in Integrations while the status bar owns the mode banner. */
export const ASEN_PERMISSION_MODE_MEANINGS:Readonly<Record<string,string>>=Object.freeze({
 normal:"",
 auto:"independent classifier checks each action · extra inference cost · hard safety and consent remain",
 yolo:"standing permission for ordinary primary work · destructive confirmations remain",
 "super-yolo":"no routine permission prompts · sensitive-path and critical guards remain",
});
export function derivePanelReview(snapshot:AsenPanelSnapshot):{pending:number;known:boolean}{
 const explicit=snapshot.review?.pending;
 if(typeof explicit==="number"&&Number.isSafeInteger(explicit)&&explicit>=0)return {pending:explicit,known:true};
 if(snapshot.todosObserved!==true)return {pending:0,known:false};
 return {pending:snapshot.todos.filter(todo=>todo.current.state==="succeeded"||
  todo.current.state==="blocked"&&todo.current.reason==="Linked review result requires explicit user acceptance").length,known:true};
}
function count(snapshot:AsenPanelSnapshot,section:AsenPanelSection):string{
 switch(section){
  case "TODOS":return snapshot.todos.filter(t=>t.current.state==="done").length+"/"+snapshot.todos.length;
  case "JOBS":return snapshot.jobs.filter(isObservedActiveJob).length+" running";
  case "AGENTS":return snapshot.agents.filter(a=>a.state==="running").length+" running";
  case "CHANGES":return snapshot.changes?snapshot.changes.files+" files":"unavailable";
  case "REVIEW":{const review=derivePanelReview(snapshot);return review.known?(review.pending?review.pending+" needs review":"no pending results"):"unverified";}
  case "INTEGRATIONS":return snapshot.integrationInspection?"observed":snapshot.integrationStates?.length?snapshot.integrationStates.length+" reported":"unknown";
 }
}
/**
 * Summary views stay deliberately compact.  A caller that has entered one
 * section may request the bounded detail projection; it is still read-only
 * and never changes the underlying session state.
 */
export function renderAsenPanelSection(snapshot:AsenPanelSnapshot,section:AsenPanelSection,width=72,detail=false):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid ASEN panel width");
 const out:string[]=[];
 const itemLimit=detail?100:12,secondaryLimit=detail?100:8;
 switch(section){
  case "TODOS":{
   const open=snapshot.todos.filter(t=>unfinishedTodo.has(t.current.state));
   if(!snapshot.todos.length)out.push("No tasks in this session");
   for(const item of open.slice(0,itemLimit)){
    const state=item.current.state==="succeeded"?"awaiting independent review":item.current.state;
    out.push(glyph(item.current.state)+" "+clean(item.title,240)+" ["+state+"]");
    if(item.current.state==="blocked"||item.current.state==="succeeded")
     out.push("  └ "+clean(item.current.reason||"Review required",200));
   }
   const done=snapshot.todos.filter(t=>t.current.state==="done").length;
   const cancelled=snapshot.todos.filter(t=>t.current.state==="cancelled").length;
   if(done)out.push("✓ "+done+" done");
   if(cancelled)out.push("✕ "+cancelled+" cancelled");
   if(open.length>itemLimit)out.push("… "+(open.length-itemLimit)+" more · /asen-todos");
   break;
  }
  case "JOBS":{
   const jobs=[...snapshot.jobs].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
   if(!jobs.length)out.push("No owned jobs");
   for(const job of jobs.slice(0,secondaryLimit)){
    const metadata=projectJobMetadata(job);
    out.push(glyph(metadata.state)+" "+jobInspectionLabel(metadata)+(metadata.provenance==="journal-historical"?" · historical":" · observed"));
   }
   out.push("Read-only tail · /asen-job-inspect [id] · bounded metadata and log tail");
   if(jobs.length>secondaryLimit)out.push("… "+(jobs.length-secondaryLimit)+" more");
   break;
  }
  case "AGENTS":{
   const priority:Record<string,number>={interrupted:0,running:1,queued:2,failed:3,cancelled:4,completed:5};
   const agents=[...snapshot.agents].sort((a,b)=>(priority[a.state]??9)-(priority[b.state]??9)||b.updatedAt.localeCompare(a.updatedAt));
   if(!agents.length)out.push("No agents · /asen-agents");
   for(const agent of agents.slice(0,secondaryLimit))out.push(glyph(agent.state)+" "+clean(agent.role,30)+" · "+agent.state+(agent.state==="interrupted"?" · inspect first":""));
   if(agents.length>secondaryLimit)out.push("… "+(agents.length-secondaryLimit)+" more · /asen-agents");
   // No real tokens/prices/model on the durable public agent record: never fabricate.
   break;
  }
  case "CHANGES":{
   const status=snapshot.changes;
   out.push(status?("Git "+clean(status.branch,48)+" · "+(status.files?status.files+" files":"clean")):"Git state unavailable");
   out.push(status&&status.files>0?"Panel: CHANGES + Enter to pick a file and preview its diff · /asen-changes-view":"Inspect read-only diffs with /asen-changes-view");
   break;
  }
  case "REVIEW":{
   // The panel snapshot's Todos come from the scoped SessionTodoStore.  A
   // succeeded or blocked Todo is the only stored panel state that says its
   // result still needs review; no request, candidate, acknowledgement or
   // human-read state is inferred here.
   const {pending,known}=derivePanelReview(snapshot);
   out.push(!known?"Review state unverified · /asen-review":pending?"Results awaiting review · "+pending:"No pending review results observed");
   if(snapshot.review?.label)out.push(clean(snapshot.review.label,140));
   else if(pending)out.push(`${pending} stored Todo result${pending===1?"":"s"} awaiting review`);
   break;
  }
  case "INTEGRATIONS":{
   const inspection=snapshot.integrationInspection;
   if(inspection){
    const profiles=inspection.profiles,frozen=profiles.snapshot;
    out.push("Agent profile: "+(profiles.state==="unavailable"?"unavailable":frozen?`${frozen.active} (${frozen.source}; frozen in-process)`:"unknown"));
    out.push("Actual routing: unknown · connection: unknown");
    for(const route of profiles.routes)out.push(`${route.role}: ${route.source} · model ${route.model}`+(route.thinking?` · thinking ${route.thinking}`:"")+" · actual unknown");
    if(profiles.limited)out.push("Profile routes limited; not a complete inventory");
    const meaning=snapshot.permission?ASEN_PERMISSION_MODE_MEANINGS[snapshot.permission]:undefined;
    if(meaning)out.push(`permissions ${meaning}`);
    for(const [label,inventory] of [["Commands",inspection.commands],["Tools",inspection.tools]] as const){
     out.push(label+": "+(inventory.state==="empty"?"empty (no entries reported)":inventory.state));
     for(const entry of inventory.entries){
      const provenance=entry.provenance.source+(entry.provenance.scope?"/"+entry.provenance.scope:"");
      out.push(entry.name+(entry.namespace?` [${entry.namespace}]`:"")+` · ${entry.status} · ${provenance} · connection unknown`);
     }
     if(inventory.limited)out.push(label+" limited; not a complete inventory");
    }
    break;
   }
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
 const jobs=snapshot.jobs.filter(isObservedActiveJob).length;
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
 const host=snapshot.hostStatus;
 if(host){
  const identity=(value:HostStatusProjection["selectedModel"])=>value?clean(value.provider+"/"+value.model,55):"?";
  parts.push("selected "+identity(host.selectedModel)+(host.effectiveThinking?" · "+clean(host.effectiveThinking,20):""));
  parts.push("responding "+identity(host.respondingModel));
  parts.push("ctx "+(host.context.percent===null?"?":Math.round(host.context.percent)+"%")+
   (host.context.state==="warning"||host.context.state==="error"?" "+host.context.state:""));
  // UI-08 cost/sub truthful unknown: the public projection publishes only "unavailable"
  // for cost/subscription/quota today (host-status-projection.ts:20-22,67), so the host
  // path states the unknown instead of omitting the segment entirely.
  parts.push("cost/sub ?");
 }else{
 if(snapshot.model)parts.push(clean(snapshot.model,55)+(snapshot.effort?" · "+clean(snapshot.effort,20):""));
 if(typeof snapshot.contextPercent==="number"&&Number.isFinite(snapshot.contextPercent)&&snapshot.contextPercent>=0&&snapshot.contextPercent<=100)
  parts.push("ctx "+Math.round(snapshot.contextPercent)+"%");
 }
 // UI-07 integration presence, stated only from the observed inventory enum; an absent
 // inspection keeps the shipped omission and no wording here ever implies a connection.
 if(snapshot.integrationInspection){
  const observed=[snapshot.integrationInspection.commands.state,snapshot.integrationInspection.tools.state];
  parts.push("integrations "+(observed.includes("unavailable")?"unavailable"
   :observed.every(s=>s==="empty")?"empty":"reported"));
 }
 if(!host&&typeof snapshot.cost==="number"&&Number.isFinite(snapshot.cost)&&snapshot.cost>=0)
  parts.push("$"+snapshot.cost.toFixed(2)+(snapshot.subscription?" sub":""));
 // The observed host-only eight-cell gauge is added ONLY when the entire row fits.
 // Unknown/legacy/narrow rows remain exactly byte-compatible; font approval is separate.
 if(host&&host.context.percent!==null){
  const displayed=Math.max(0,Math.min(100,Math.round(host.context.percent)));
  const filled=Math.max(0,Math.min(8,Math.round(displayed*8/100)));
  const gauge="▰".repeat(filled)+"▱".repeat(8-filled);
  const candidate=[...parts];const index=candidate.findIndex(part=>part.startsWith("ctx "));
  if(index>=0){candidate[index]+=" "+gauge;const row=candidate.join(" │ ");if(visibleWidth(row)<=width)return fit(row,width);}
 }
 return fit(parts.join(" │ "),width);
}
