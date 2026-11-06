/** M2: read-only Pi-native Agents and Jobs navigator; never a transcript or permission channel. */
import type {KeybindingsManager} from "@earendil-works/pi-tui";
import type {AgentInspection} from "./agent-inspect.js";
import {renderAgentInspection} from "./agent-inspect.js";
import type {AgentNoticeRecoveryView} from "./agent-notification-journal.js";
import type {JobMetadata} from "./job-inspect.js";
import {renderJobInspection} from "./job-inspect.js";
import {sanitizeTerminalText,truncateForTerminal,visibleWidth} from "./responsive-layout.js";
export type M2NavigatorSource=
 {kind:"agents";agents:readonly AgentInspection[];notices?:readonly AgentNoticeRecoveryView[]}|
 {kind:"jobs";jobs:readonly JobMetadata[]};
export interface M2NavigatorControls {
 requestRender:()=>void;
 close:()=>void;
 terminalRows:()=>number;
 stillCurrent:()=>boolean;
 keybindings?:Pick<KeybindingsManager,"matches">;
 refresh?:()=>Promise<M2NavigatorSource>;
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
type M2Row={kind:"agent";data:AgentInspection;notice?:AgentNoticeRecoveryView}|
 {kind:"job";data:JobMetadata};
const state=(row:M2Row)=>row.kind==="agent"?row.data.record.state:row.data.state;
const label=(row:M2Row)=>row.kind==="agent"?
 clean(row.data.record.role)+" · "+clean(row.data.record.state)+" · "+clean(row.data.record.id):
 clean(row.data.mode)+" · "+clean(row.data.state)+" · "+clean(row.data.id);
export function createNativeM2Navigator(source:M2NavigatorSource,controls:M2NavigatorControls):M2NavigatorComponent {
 const project=(source:M2NavigatorSource):M2Row[]=>source.kind==="agents"?source.agents.slice(0,100).map(data=>({
  kind:"agent" as const,data,
  ...(source.notices?.find(notice=>notice.agentId===data.record.id)?{notice:source.notices.find(notice=>notice.agentId===data.record.id)!}:{}),
 })):source.jobs.slice(0,100).map(data=>({kind:"job" as const,data}));
 let rows=project(source);
 let selected=0,scroll=0,detail=false,attentionOnly=false,closed=false,pending=false,refreshFailed=false;
 const close=()=>{closed=true;controls.close();};
 const identity=(row:M2Row)=>row.kind+":"+(row.kind==="agent"?row.data.record.id:row.data.id);
 const filtered=()=>rows.filter(row=>!attentionOnly||attention.has(state(row)));
 const current=()=>{try{return controls.stillCurrent();}catch{return false;}};
 const refresh=async()=>{
  if(!controls.refresh||pending||closed||!current())return;
  pending=true;refreshFailed=false;controls.requestRender();
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
   pending=false;
   if(!closed&&current())controls.requestRender();
  }
 };
 const render=(width:number):string[]=>{
  if(!Number.isSafeInteger(width)||width<12||width>1000)throw Error("Invalid M2 width");
  if(!current())return [fit("ASEN M2 scope changed; close inspection.",width)];
  const cols=width-1,chosenRows=filtered();
  selected=Math.max(0,Math.min(selected,chosenRows.length-1));
  const kind=source.kind==="agents"?"AGENTS":"JOBS";
  const heading=fit("ASEN "+kind+" · "+(attentionOnly?"attention":"all")+" · "+chosenRows.length+"/"+rows.length+" (snapshot)",cols);
  const chosen=chosenRows[selected];
  const details:string[]=detail&&chosen?
   chosen.kind==="agent"?
    [...renderAgentInspection(chosen.data,Math.max(12,cols)),
     chosen.notice?"Parent notice: "+chosen.notice.delivery+"; "+chosen.notice.disposition:
      source.kind==="agents"&&source.notices===undefined?"Parent notice unavailable":"No parent notice recorded",
     "Coordinator ACK != model consumption; no automatic replay or consent"]:
    [...renderJobInspection(chosen.data,Math.max(12,cols)),
     "Stop is permitted only by the ownership-checked background tool"]:
   chosenRows.length?chosenRows.map((row,index)=>(index===selected?"> ":"  ")+label(row)):
   ["No owned "+kind.toLowerCase()+" in this view"];
  const fitted=details.map(line=>fit(line,cols));
  const terminalRows=controls.terminalRows(),maxRows=Math.max(2,Math.min(100,Number.isFinite(terminalRows)?Math.floor(terminalRows)-5:12));
  scroll=Math.max(0,Math.min(scroll,Math.max(0,fitted.length-maxRows)));
  if(!detail&&selected>=scroll+maxRows)scroll=selected-maxRows+1;
  if(!detail&&selected<scroll)scroll=selected;
  const body=fitted.slice(scroll,scroll+maxRows).map(line=>fit(" "+line,width));
  const help=detail?(chosen?.kind==="agent"?
   "ACK is not model consumption · Backspace: list · q: close":
   "Stop via ownership-checked background tool · Backspace: list · q: close"):
   "j/k: select · Enter: inspect · Tab: attention/all · q: close";
  const refreshHelp=controls.refresh?"r: refresh · ":"";
  const status=pending?"Refreshing snapshot":refreshFailed?"Refresh unavailable; snapshot retained":"";
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
  // Host bindings win over the local refresh shortcut, including remapped cancel.
  const hostBound=(["tui.select.down","tui.select.up","tui.select.confirm","tui.input.tab","tui.editor.deleteCharBackward"] as const)
   .some(action=>typeof controls.keybindings?.matches==="function"&&controls.keybindings.matches(data,action));
  if(data==="r"&&!hostBound&&controls.refresh){void refresh();return;}
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
