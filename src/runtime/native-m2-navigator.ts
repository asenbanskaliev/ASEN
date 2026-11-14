/** M2: read-only Pi-native Agents and Jobs navigator; never a transcript or permission channel. */
import type {KeybindingsManager} from "@earendil-works/pi-tui";
import type {AgentInspection} from "./agent-inspect.js";
import {renderAgentInspection} from "./agent-inspect.js";
import type {AgentHierarchyRow} from "./agents-panel.js";
import type {AgentNoticeRecoveryView} from "./agent-notification-journal.js";
import type {JobMetadata} from "./job-inspect.js";
import {renderJobInspection} from "./job-inspect.js";
import {sanitizeTerminalText,truncateForTerminal,visibleWidth} from "./responsive-layout.js";
export interface M2AgentHierarchyBinding {
 readonly id:string;
 readonly inspection:AgentInspection;
 readonly hierarchy:AgentHierarchyRow;
}
export type M2NavigatorSource=
 {kind:"agents";agents:readonly AgentInspection[];hierarchy?:readonly M2AgentHierarchyBinding[];notices?:readonly AgentNoticeRecoveryView[]}|
 {kind:"jobs";jobs:readonly JobMetadata[]};
export interface M2AgentStopTarget {
 readonly id:string;
 readonly sessionId:string;
 readonly projectId:string;
}
export interface M2NavigatorControls {
 requestRender:()=>void;
 close:()=>void;
 terminalRows:()=>number;
 stillCurrent:()=>boolean;
 keybindings?:Pick<KeybindingsManager,"matches">;
 refresh?:()=>Promise<M2NavigatorSource>;
 stop?:(target:M2AgentStopTarget)=>Promise<boolean>;
 stopJob?:(metadata:JobMetadata)=>Promise<boolean>;
}
export interface M2NavigatorComponent {
 render(width:number):string[];
 handleInput(data:string):void;
 invalidate():void;
}
const attention=new Set(["queued","running","interrupted","failed","timed_out","flooded"]);
const clean=(value:unknown):string=>typeof value==="string"?
 sanitizeTerminalText(value).replace(/\s+/gu," ").trim():"unknown";
const fit=(value:string,width:number):string=>truncateForTerminal(value,Math.max(1,width));
type M2Row={kind:"agent";data:AgentInspection;hierarchy?:AgentHierarchyRow;notice?:AgentNoticeRecoveryView}|
 {kind:"job";data:JobMetadata};
const state=(row:M2Row)=>row.kind==="agent"?row.data.record.state:row.data.state;
const hierarchyLabel=(row:Extract<M2Row,{kind:"agent"}>):string=>{
 const hierarchy=row.hierarchy,roleState=clean(row.data.record.role)+" · "+clean(row.data.record.state),id=clean(row.data.record.id);
 if(!hierarchy)return roleState+" · "+id;
 const prefix=hierarchy.depth>0?"  ".repeat(Math.min(hierarchy.depth,20))+"↳ ":"";
 const lineage=hierarchy.lineage.kind==="proven"?"continues":hierarchy.lineage.kind==="unresolved"?"unresolved continuation":"root";
 const task=hierarchy.association.kind==="task"?" · task "+clean(hierarchy.association.taskId):"";
 return prefix+roleState+" · "+lineage+task+" · "+id;
};
const label=(row:M2Row)=>row.kind==="agent"?hierarchyLabel(row):
 clean(row.data.mode)+" · "+clean(row.data.state)+" · "+clean(row.data.id);
function agentRows(source:Extract<M2NavigatorSource,{kind:"agents"}>):M2Row[]{
 const agents=source.agents.slice(0,100);
 if(source.hierarchy===undefined)return agents.map(data=>({kind:"agent" as const,data,
  ...(source.notices?.find(notice=>notice.agentId===data.record.id)?{notice:source.notices.find(notice=>notice.agentId===data.record.id)!}:{}),
 }));
 if(source.hierarchy.length!==agents.length)throw Error("Agent hierarchy binding is incomplete");
 const inspections=new Map<string,AgentInspection>();
 for(const inspection of agents){if(!inspection.record.id||inspections.has(inspection.record.id))throw Error("Agent hierarchy binding has duplicate inspection identity");inspections.set(inspection.record.id,inspection);}
 const bindings=new Map<string,M2AgentHierarchyBinding>(),position=new Map<string,number>();
 source.hierarchy.forEach((binding,index)=>{
  if(!binding||!binding.id||bindings.has(binding.id)||binding.inspection!==inspections.get(binding.id)||binding.inspection.record.id!==binding.id||binding.hierarchy.id!==binding.id)
   throw Error("Agent hierarchy binding identity mismatch");
  bindings.set(binding.id,binding);position.set(binding.id,index);
 });
 if(bindings.size!==inspections.size)throw Error("Agent hierarchy binding is incomplete");
 const children=new Map<string,M2AgentHierarchyBinding[]>(),roots:M2AgentHierarchyBinding[]=[];
 for(const binding of bindings.values()){
  const lineage=binding.hierarchy.lineage;
  if(lineage.kind==="proven"){
   if(!bindings.has(lineage.parentId))throw Error("Agent hierarchy binding parent is missing");
   const rows=children.get(lineage.parentId)??[];rows.push(binding);children.set(lineage.parentId,rows);
  }else roots.push(binding);
 }
 const byPosition=(left:M2AgentHierarchyBinding,right:M2AgentHierarchyBinding)=>(position.get(left.id)??0)-(position.get(right.id)??0);
 roots.sort(byPosition);for(const rows of children.values())rows.sort(byPosition);
 const ordered:M2AgentHierarchyBinding[]=[],visited=new Set<string>();
 const visit=(binding:M2AgentHierarchyBinding)=>{if(visited.has(binding.id))throw Error("Agent hierarchy binding cycle");visited.add(binding.id);ordered.push(binding);for(const child of children.get(binding.id)??[])visit(child);};
 for(const root of roots)visit(root);
 if(ordered.length!==bindings.size)throw Error("Agent hierarchy binding is unresolved");
 return ordered.map(binding=>({kind:"agent" as const,data:binding.inspection,hierarchy:binding.hierarchy,
  ...(source.notices?.find(notice=>notice.agentId===binding.id)?{notice:source.notices.find(notice=>notice.agentId===binding.id)!}:{}),
 }));
}
export function createNativeM2Navigator(source:M2NavigatorSource,controls:M2NavigatorControls):M2NavigatorComponent {
 const project=(source:M2NavigatorSource):M2Row[]=>source.kind==="agents"?agentRows(source):source.jobs.slice(0,100).map(data=>({kind:"job" as const,data}));
 let rows=project(source);
 let selected=0,scroll=0,detail=false,attentionOnly=false,closed=false,closeOnly=false,invalidJobWidth=false,refreshPending=false,stopPending=false,refreshFailed=false;
 let stopStatus:"requested"|"unavailable"|undefined;
 const close=()=>{closed=true;controls.close();};
 const identity=(row:M2Row)=>row.kind+":"+(row.kind==="agent"?row.data.record.id:row.data.id);
 const filtered=()=>rows.filter(row=>!attentionOnly||attention.has(state(row)));
 const current=()=>{try{return controls.stillCurrent();}catch{return false;}};
 const stopTarget=():{kind:"agent";target:M2AgentStopTarget}|{kind:"job";metadata:JobMetadata}|undefined=>{
  if(closeOnly||invalidJobWidth||closed||stopStatus||!current())return undefined;
  const chosen=filtered()[selected];
  if(chosen?.kind==="agent"){
   if(!controls.stop||(chosen.data.record.state!=="queued"&&chosen.data.record.state!=="running"))return undefined;
   const record=chosen.data.record;
   if(!record.id||!record.sessionId||!record.projectId||rows.filter(row=>row.kind==="agent"&&row.data.record.id===record.id).length!==1)return undefined;
   return {kind:"agent",target:Object.freeze({id:record.id,sessionId:record.sessionId,projectId:record.projectId})};
  }
  if(chosen?.kind!=="job"||!controls.stopJob||chosen.data.provenance!=="registry-observed"||(chosen.data.state!=="queued"&&chosen.data.state!=="running")||rows.filter(row=>row.kind==="job"&&row.data.id===chosen.data.id).length!==1)return undefined;
  return {kind:"job",metadata:chosen.data};
 };
 const refresh=async()=>{
  if(!controls.refresh||refreshPending||stopPending||closed||!current())return;
  refreshPending=true;refreshFailed=false;stopStatus=undefined;controls.requestRender();
  try{
   const next=await controls.refresh();
   if(closed||!current())return;
   if(next.kind!==source.kind)throw Error("Unexpected inspection kind");
   // Compare opaque DTO identities, never labels or row positions. Duplicate bounded
   // job IDs (including projection collisions) cannot prove entity continuity.
   const previous=filtered()[selected],key=previous?identity(previous):undefined;
   const uniqueBefore=key!==undefined&&rows.filter(row=>identity(row)===key).length===1&&
    // A truncated ID cannot prove continuity even if only one collision is visible.
    !(previous?.kind==="job"&&previous.data.id.includes("…"));
   const nextRows=project(next);
   source=next;rows=nextRows;
   const visible=filtered(),at=key===undefined?-1:visible.findIndex(row=>identity(row)===key);
   const survives=uniqueBefore&&at>=0&&rows.filter(row=>identity(row)===key).length===1;
   selected=survives?at:0;
   if(!survives){detail=false;scroll=0;}
  }catch{
   if(closed||!current())return;
   refreshFailed=true;
  }finally{
   refreshPending=false;
   if(!closed&&current())controls.requestRender();
  }
 };
 const stop=async()=>{
  if(refreshPending||stopPending)return;
  const target=stopTarget();if(!target)return;
  stopPending=true;stopStatus=undefined;controls.requestRender();
  try{
   const accepted=target.kind==="agent"?await controls.stop!(target.target):await controls.stopJob!(target.metadata);
   if(closed||!current())return;
   stopStatus=accepted?"requested":"unavailable";
  }catch{
   if(closed||!current())return;
   stopStatus="unavailable";
  }finally{
   stopPending=false;
   if(!closed&&current())controls.requestRender();
  }
 };
 const render=(width:number):string[]=>{
  if(!Number.isSafeInteger(width)||width<1||width>1000)throw Error("Invalid M2 width");
  invalidJobWidth=source.kind==="jobs"&&width<12;if(invalidJobWidth)throw Error("Invalid M2 width");
  closeOnly=source.kind==="agents"&&width<12;
  if(!current())return [fit("ASEN M2 scope changed; close inspection.",width)];
  if(closeOnly)return [fit(width<5?"q":"Close",width)];
  const cols=width-1,chosenRows=filtered();
  selected=Math.max(0,Math.min(selected,chosenRows.length-1));
  const kind=source.kind==="agents"?"AGENTS":"JOBS";
  const heading=fit("ASEN "+kind+" · "+(attentionOnly?"attention":"all")+" · "+chosenRows.length+"/"+rows.length+" (snapshot)",cols);
  const chosen=chosenRows[selected];
  const details:string[]=detail&&chosen?
   chosen.kind==="agent"?
    [...renderAgentInspection(chosen.data,Math.max(12,cols)),
     ...(chosen.hierarchy?[chosen.hierarchy.lineage.kind==="root"?"Hierarchy: root":
      chosen.hierarchy.lineage.kind==="proven"?"Continuation of: "+chosen.hierarchy.lineage.parentId:
       "Continuation unresolved: "+chosen.hierarchy.lineage.continuationOf,
      chosen.hierarchy.association.kind==="task"?"Task audit: "+chosen.hierarchy.association.taskId:"Task audit: none"]:[]),
     chosen.notice?"Parent notice: "+chosen.notice.delivery+"; "+chosen.notice.disposition:
      source.kind==="agents"&&source.notices===undefined?"Parent notice unavailable":"No parent notice recorded",
     "Coordinator ACK != model consumption; no automatic replay or consent"]:
    [...renderJobInspection(chosen.data,Math.max(12,cols)),
     controls.stopJob?"Stop requires a fresh uniquely owned live ASEN registry handle":"Stop is permitted only by the ownership-checked background tool"]:
   chosenRows.length?chosenRows.map((row,index)=>(index===selected?"> ":"  ")+label(row)):
   ["No owned "+kind.toLowerCase()+" in this view"];
  const fitted=details.map(line=>fit(line,cols));
  const terminalRows=controls.terminalRows(),maxRows=Math.max(2,Math.min(100,Number.isFinite(terminalRows)?Math.floor(terminalRows)-(detail?3:5):12));
  scroll=Math.max(0,Math.min(scroll,Math.max(0,fitted.length-maxRows)));
  if(!detail&&selected>=scroll+maxRows)scroll=selected-maxRows+1;
  if(!detail&&selected<scroll)scroll=selected;
  const body=fitted.slice(scroll,scroll+maxRows).map(line=>fit(" "+line,width));
  const canStop=!refreshPending&&!stopPending&&!!stopTarget();
  const help=detail?(chosen?.kind==="agent"?
   (canStop?"s: stop · ":"")+"ACK is not model consumption · Backspace: list · q: close":
   (canStop?"s: stop · ":"")+(controls.stopJob?"Stop via owned live ASEN registry · Backspace: list · q: close":"Stop via ownership-checked background tool · Backspace: list · q: close")):
   "j/k: select · Enter: inspect · Tab: attention/all · "+(canStop?"s: stop · ":"")+"q: close";
  const refreshHelp=controls.refresh&&!stopPending?"r: refresh · ":"";
  const status=refreshPending?"Refreshing snapshot":stopPending?"Requesting Stop":refreshFailed?"Refresh unavailable; snapshot retained":
   stopStatus==="requested"?"Stop requested; lifecycle state remains authoritative":stopStatus==="unavailable"?"Stop unavailable; snapshot retained":"";
  const result=[heading,...body,...(status?[fit(status,cols)]:[]),fit(refreshHelp+help,cols)];
  if(result.some(row=>visibleWidth(row)>width))throw Error("M2 width overflow");
  return result;
 };
 const handleInput=(data:string):void=>{
  if(closed)return;
  if(!current()){close();return;}
  const matches=(action:Parameters<KeybindingsManager["matches"]>[1],...fallback:string[])=>
   typeof controls.keybindings?.matches==="function"?
    controls.keybindings.matches(data,action):fallback.includes(data);
  if(data==="q"||matches("tui.select.cancel","\u001b","\u0003")){close();return;}
  if(closeOnly)return;
  // Host bindings win over local shortcuts, including a native cancel remapped to "s".
  const hostBound=(["tui.select.down","tui.select.up","tui.select.confirm","tui.input.tab","tui.editor.deleteCharBackward"] as const)
   .some(action=>typeof controls.keybindings?.matches==="function"&&controls.keybindings.matches(data,action));
  if(data==="r"&&!hostBound&&controls.refresh){void refresh();return;}
  if(data==="s"&&!hostBound&&stopTarget()){void stop();return;}
  if(detail){
   if(matches("tui.editor.deleteCharBackward","\u007f","\b")){detail=false;scroll=0;controls.requestRender();return;}
   if(data==="j"||matches("tui.select.down","\u001b[B")){scroll++;controls.requestRender();return;}
   if(data==="k"||matches("tui.select.up","\u001b[A")){scroll=Math.max(0,scroll-1);controls.requestRender();}
   return;
  }
  if(matches("tui.input.tab","\t")){attentionOnly=!attentionOnly;selected=0;scroll=0;controls.requestRender();return;}
  if(data==="j"||matches("tui.select.down","\u001b[B")){selected=Math.max(0,Math.min(filtered().length-1,selected+1));controls.requestRender();return;}
  if(data==="k"||matches("tui.select.up","\u001b[A")){selected=Math.max(0,selected-1);controls.requestRender();return;}
  if(matches("tui.select.confirm","\r","\n")&&filtered().length){detail=true;scroll=0;controls.requestRender();}
 };
 return {render,handleInput,invalidate(){selected=0;scroll=0;detail=false;}};
}
