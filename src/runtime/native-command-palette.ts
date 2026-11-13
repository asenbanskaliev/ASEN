import type {Theme} from "@earendil-works/pi-coding-agent";
import type {KeybindingsManager,TuiMouseEvent,TuiMouseEventResult} from "@earendil-works/pi-tui";
import type {RegisteredCommand} from "./command-palette.js";
import {truncateForTerminal,visibleWidth} from "./responsive-layout.js";

export interface NativeCommandPaletteControls{
 readonly availableRows:()=>number;
 readonly theme?:Pick<Theme,"fg"|"bg"|"bold">;
 readonly keybindings?:Pick<KeybindingsManager,"matches">;
 readonly requestRender:()=>void;
 /** Manual guidance only: return the original discovery label, never execute it. */
 readonly complete:(label:string|undefined)=>void;
 readonly stillCurrent?:()=>boolean;
 readonly notice?:string;
}
export interface NativeCommandPaletteComponent{
 render(width:number):string[];
 handleInput(data:string):void;
 handleMouse(event:TuiMouseEvent):TuiMouseEventResult|undefined;
 invalidate():void;
 dispose():void;
}
type Entry=Readonly<RegisteredCommand>;
type Row={heading:string}|{entry:Entry;index:number};
const size=(n:number)=>Number.isFinite(n)?Math.max(1,Math.min(1000,Math.floor(n))):1;
// Source-observed reference ordering; no reference catalog, bindings or execution.
function rank(entry:Entry,query:string):number|undefined{
 const label=entry.label.toLowerCase();
 if(label.startsWith(query))return 0;
 if(label.includes(query))return 1;
 let cursor=0;
 for(const char of label)if(char===query[cursor])cursor++;
 if(cursor===query.length)return 2;
 if(entry.name.toLowerCase().includes(query))return 3;
 if(entry.description.toLowerCase().includes(query))return 4;
 return undefined;
}
/** Pure interaction-local ui.custom component; the host owns snapshot/cap/overlay. */
export function createNativeCommandPalette(entries:readonly Entry[],controls:NativeCommandPaletteControls):NativeCommandPaletteComponent{
 const groups=new Map<string,Entry[]>();
 for(const entry of entries){
  if(!groups.has(entry.group))groups.set(entry.group,[]);
  groups.get(entry.group)!.push(entry);
 }
 let query="",selected=0,top=0,finished=false,disposed=false;
 let items:Entry[]=[],rows:Row[]=[],lastWidth:number|undefined,visibleSelection=false;
 type Hit={y:number;index:number};
 let frame:{width:number;height:number;budget:number;model:Entry[];selected:number;hits:Hit[]}|undefined;
 let cache:{width:number;height:number;theme:typeof controls.theme;lines:string[];hits:Hit[]}|undefined;
 const current=()=>!finished&&!disposed&&(!controls.stillCurrent||controls.stillCurrent());
 const rebuild=()=>{
  items=[];rows=[];
  const term=query.trim().toLowerCase();
  for(const [heading,group] of groups){
   const matches=group.map(entry=>({entry,rank:term?rank(entry,term):0}))
    .filter((value):value is {entry:Entry;rank:number}=>value.rank!==undefined)
    .sort((a,b)=>a.rank-b.rank);
   if(!matches.length)continue;
   rows.push({heading});
   for(const {entry} of matches){rows.push({entry,index:items.length});items.push(entry);}
  }
 };
 rebuild();
 const invalidate=()=>{frame=undefined;if(current()){cache=undefined;controls.requestRender();}};
 const finish=(label:string|undefined)=>{
  // Expiry revokes selection authority, not the ability to dismiss the dialog.
  if(finished||disposed||(label!==undefined&&!current()))return;
  finished=true;frame=undefined;cache=undefined;visibleSelection=false;controls.complete(label);
 };
 const render=(width:number):string[]=>{
  const cols=size(width),height=size(controls.availableRows());
  lastWidth=cols;visibleSelection=false;frame=undefined;
  if(disposed||finished)return [];
  const paint=(text:string,role:"text"|"accent"|"muted"="text",bold=false,focus=false)=>{
   const plain=truncateForTerminal(text,cols);
   const theme=controls.theme;
   if(!theme)return plain;
   const styled=theme.fg(role,bold?theme.bold(plain):plain);
   return focus?theme.bg("selectedBg",styled):styled;
  };
  if(!current())return [paint("Commands scope changed","muted")];
  if(cols<4||height<4)return [paint("Esc close","muted")];
  if(cache?.width===cols&&cache.height===height&&cache.theme===controls.theme){
   visibleSelection=items.length>0;
   frame={width:cols,height:cache.lines.length,budget:height,model:items,selected,hits:cache.hits};
   return [...cache.lines];
  }
  const budget=height-3;
  const selectedRow=rows.findIndex(row=>"entry" in row&&row.index===selected);
  // Reserve both indicators only when they leave at least one actual row.
  const scrolling=rows.length>budget,indicators=scrolling&&budget>=3;
  const windowSize=budget-(indicators?2:0);
  top=Math.max(0,Math.min(top,Math.max(0,rows.length-windowSize)));
  if(selectedRow<top)top=selectedRow;
  if(selectedRow>=top+windowSize)top=selectedRow-windowSize+1;
  top=Math.max(0,top);
  const end=Math.min(rows.length,top+windowSize);
  const body:string[]=[],hits:Hit[]=[];
  if(indicators&&top>0)body.push(paint(`↑ ${top} more`,"muted"));
  for(const row of rows.slice(top,end)){
   if("heading" in row)body.push(paint(row.heading,"accent",true));
   else{
    const focus=row.index===selected;
    if(visibleWidth(truncateForTerminal("  "+row.entry.label,cols))>2)hits.push({y:2+body.length,index:row.index});
    body.push(paint((focus?"> ":"  ")+row.entry.label,focus?"accent":"text",false,focus));
    if(focus)visibleSelection=visibleWidth(truncateForTerminal("> "+row.entry.label,cols))>2;
   }
  }
  if(!items.length)body.push(paint("No commands match","muted"));
  if(indicators&&end<rows.length)body.push(paint(`↓ ${rows.length-end} more`,"muted"));
  const host=!!controls.keybindings;
  const hint=host?"host keys · Ctrl K/J move · manual selection":"↑/↓ move · Enter select · Esc close";
  const more=scrolling&&!indicators?`${top>0?"↑ ":""}${end<rows.length?"↓ ":""}more · `:"";
  const lines=[paint(controls.notice?`Commands · ${controls.notice}`:"Commands","accent",true),paint(query?`› ${query}`:"› Search","muted"),...body,paint(more+hint,"muted")];
  cache={width:cols,height,theme:controls.theme,lines,hits};
  frame={width:cols,height:lines.length,budget:height,model:items,selected,hits};
  return [...lines];
 };
 const handleInput=(data:string)=>{
  frame=undefined;
  if(finished||disposed)return;
  const matches=(action:Parameters<KeybindingsManager["matches"]>[1],...defaults:string[])=>
   controls.keybindings?controls.keybindings.matches(data,action):defaults.includes(data);
  // Mouse/paste/escape payloads are never query text or actions by themselves.
  if(data.startsWith("\x1b[<")||data.startsWith("\x1b[M")||data.startsWith("\x1b[200~"))return;
  if(matches("tui.select.cancel","\x1b","\x03")){finish(undefined);return;}
  if(!current())return;
  if(data==="\n"||data==="\x0b"||matches("tui.select.down","\x1b[B")||matches("tui.select.up","\x1b[A")){
   const down=data==="\n"||matches("tui.select.down","\x1b[B");
   selected=Math.max(0,Math.min(items.length-1,selected+(down?1:-1)));invalidate();return;
  }
  if(matches("tui.select.confirm","\r")){
   if(lastWidth!==undefined)render(lastWidth);
   if(visibleSelection&&items[selected])finish(items[selected]!.label);
   return;
  }
  let next=query;
  if(matches("tui.editor.deleteCharBackward","\x7f","\b"))next=query.slice(0,-1);
  else if(matches("tui.editor.deleteToLineStart","\x15"))next="";
  else if(data.length===1&&!/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(data))next+=data;
  if(next!==query){query=next;selected=0;top=0;rebuild();invalidate();}
 };
 const handleMouse=(event:TuiMouseEvent):TuiMouseEventResult|undefined=>{
  const painted=frame;
  if(!current()||!painted||painted.width!==event.width||painted.height!==event.height||
   painted.budget!==size(controls.availableRows())||painted.model!==items||painted.selected!==selected){frame=undefined;return;}
  if(!Number.isInteger(event.x)||!Number.isInteger(event.y)||event.x<0||event.x>=painted.width)return;
  const hit=painted.hits.find(hit=>hit.y===event.y);
  if(!hit)return;
  if(event.type==="move"&&event.button==="none"){
   const changed=selected!==hit.index;
   if(changed){selected=hit.index;invalidate();}
   return {handled:true,render:changed};
  }
  if(event.type==="wheel"&&Number.isFinite(event.wheelDelta)&&event.wheelDelta){
   const next=Math.max(0,Math.min(items.length-1,selected+Math.sign(event.wheelDelta)));
   const changed=selected!==next;
   if(changed){selected=next;invalidate();}
   return {handled:true,render:changed};
  }
  if(event.button!=="left")return;
  if(event.type==="press")return {handled:true,render:false};
  if(event.type==="click"){
   finish(items[hit.index]?.label);return {handled:true,render:true};
  }
  return;
 };
 return {render,handleInput,handleMouse,invalidate,dispose:()=>{disposed=true;frame=undefined;cache=undefined;visibleSelection=false;}};
}
