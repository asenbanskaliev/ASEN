import {ASEN_PANEL_SECTIONS,renderAsenPanel,renderAsenPanelSection,type AsenPanelSection,type AsenPanelSnapshot} from "./ide-panel.js";
import {truncateForTerminal,visibleWidth} from "./responsive-layout.js";
import type {Theme} from "@earendil-works/pi-coding-agent";
import type {KeybindingsManager} from "@earendil-works/pi-tui";

export interface NativePanelControls{
 readonly requestRender:()=>void;
 readonly close:()=>void;
 /** Only returns a selection to the host; never runs Git inside the modal. */
 readonly openChanges?:()=>void;
 readonly terminalRows:()=>number;
 /** Actual overlay cap; absent callers use 90% of terminalRows. */
 readonly availableRows?:()=>number;
 readonly theme?:Pick<Theme,"fg"|"bg"|"bold">;
 readonly stillCurrent?:()=>boolean;
 readonly keybindings?:Pick<KeybindingsManager,"matches">|undefined;
}
export interface NativePanelComponent{
 render(width:number):string[];
 handleInput(data:string):void;
 invalidate():void;
}
/** Keyboard-native read-only overlay on Pi's documented ui.custom component API. */
export function createNativeWorkPanel(snapshot:AsenPanelSnapshot,controls:NativePanelControls):NativePanelComponent{
 let active=0,scrollTop=0,selectedOnly=false,closeOnly=false,activationRequested=false,revealActive=false;
 const collapsed=new Set<AsenPanelSection>();
 const sections=[...ASEN_PANEL_SECTIONS];
 const activeName=()=>sections[active]!;
 type Row={text:string;section?:AsenPanelSection;heading?:boolean};
 // Fit plain text first. Theme escapes must never pass back through sanitization.
 const fitLine=(left:string,right:string,width:number)=>{
  const tail=visibleWidth(right)+2<width?right:"";
  const head=truncateForTerminal(left,Math.max(1,width-visibleWidth(tail)-(tail?1:0)));
  return head+" ".repeat(Math.max(0,width-visibleWidth(head)-visibleWidth(tail)))+tail;
 };
 const rowsFor=(width:number):Row[]=>{
  const headers=renderAsenPanel(snapshot,width,sections);
  const rows:Row[]=[];
  const noWork=!snapshot.todos.length&&!snapshot.jobs.length&&!snapshot.agents.length;
  for(const [index,section] of sections.entries()){
   if(selectedOnly&&section!==activeName())continue;
   const open=selectedOnly||!collapsed.has(section);
   const summary=headers[index]!.split(" · ").slice(1).join(" · ");
   rows.push({text:fitLine((section===activeName()?"> ":"  ")+(open?"▾ ":"▸ ")+section,summary,width),section,heading:true});
   if(!selectedOnly&&section==="AGENTS"&&noWork)rows.push({text:"  No work in this session"});
   if(!open)continue;
   let body:readonly string[]=[];
   if(selectedOnly)body=renderAsenPanelSection(snapshot,section,width,true);
   else if(section==="INTEGRATIONS"){
    const inspection=snapshot.integrationInspection;
    body=inspection?[
     "  Commands: "+inspection.commands.state+(inspection.commands.limited?" · limited":""),
     "  Tools: "+inspection.tools.state+(inspection.tools.limited?" · limited":"")+" · connection: unknown",
     "  Enter details · /asen-integrations",
    ]:renderAsenPanelSection(snapshot,section,width).slice(0,3);
   }else if(section==="TODOS"?snapshot.todos.length:section==="JOBS"?snapshot.jobs.length:section==="AGENTS"?snapshot.agents.length:section==="CHANGES"?snapshot.changes&&snapshot.changes.files>0:section==="REVIEW"?!/no pending results|unverified/u.test(summary):false){
    body=renderAsenPanelSection(snapshot,section,width);
   }
   rows.push(...body.map(text=>({text,section})));
  }
  return rows;
 };
 const render=(width:number):string[]=>{
  const cols=Number.isFinite(width)?Math.max(1,Math.min(1000,Math.floor(width))):1;
  const requested=controls.availableRows?controls.availableRows():controls.terminalRows()*.9;
  const height=Number.isFinite(requested)?Math.max(1,Math.min(1000,Math.floor(requested))):1;
  closeOnly=cols<12||height<3;
  const paint=(text:string,role:"text"|"accent"|"muted"="text",bold=false)=>{
   const plain=fitLine(text,"",cols);
   const theme=controls.theme;
   if(!theme)return plain.trimEnd();
   return theme.bg("customMessageBg",theme.fg(role,bold?theme.bold(plain):plain));
  };
  if(controls.stillCurrent&&!controls.stillCurrent())return [paint("ASEN panel scope changed; q close","muted")];
  if(cols<12)return [paint(cols<5?"q":"Close")];
  if(height<3)return [paint("Panel · q close","accent",true)];
  const title=fitLine(cols<30?"Panel":"Panel · "+activeName(),cols<20?"q":"q close",cols);
  const content=rowsFor(Math.max(12,cols-2));
  const usable=height-2,max=Math.max(0,content.length-usable);
  if(revealActive){
   const index=content.findIndex(row=>row.heading&&row.section===activeName());
   if(index<scrollTop||index>=scrollTop+usable)scrollTop=Math.max(0,index);
   revealActive=false;
  }
  scrollTop=Math.min(max,Math.max(0,scrollTop));
  const visible=content.slice(scrollTop,scrollTop+usable).map(row=>{
   const focused=row.heading&&row.section===activeName();
   const muted=/unknown|unavailable|unverified|No work/u.test(row.text);
   return paint(" "+row.text,muted?"muted":focused?"accent":"text",row.heading);
  });
  const indicator=max>0?(scrollTop>0?"↑ ":"")+(scrollTop<max?"↓ "+(content.length-scrollTop-usable)+" more":"end")+" · ":"";
  const host=typeof controls.keybindings?.matches==="function";
  const hints=host?"j/k scroll · Space fold · host keys: next/detail/back · q close":
   selectedOnly?"Backspace all · j/k scroll · Tab section · q close":
   cols<60?"j/k scroll · Tab next · Enter detail":"j/k scroll · Tab next · Space fold · Enter detail · Backspace all";
  return [paint(title,"accent",true),...visible,paint(indicator+hints,"muted")];
 };
 const handleInput=(data:string)=>{
  if(activationRequested)return;
  if(controls.stillCurrent&&!controls.stillCurrent()){controls.close();return;}
  // Use this interaction's manager, not a global registry or a second keymap.
  const matches=(action:Parameters<KeybindingsManager["matches"]>[1],...fallback:string[])=>
   typeof controls.keybindings?.matches==="function"
    ?controls.keybindings.matches(data,action):fallback.includes(data);
  if(data==="q"||matches("tui.select.cancel","\u001b","\u0003")){controls.close();return;}
  if(closeOnly)return;
  if(data==="j"||matches("tui.select.down","\u001b[B")){scrollTop++;controls.requestRender();return;}
  if(data==="k"||matches("tui.select.up","\u001b[A")){scrollTop=Math.max(0,scrollTop-1);controls.requestRender();return;}
  if(matches("tui.input.tab","\t")){active=(active+1)%sections.length;scrollTop=0;revealActive=true;controls.requestRender();return;}
  if(data===" "){if(collapsed.has(activeName()))collapsed.delete(activeName());else collapsed.add(activeName());controls.requestRender();return;}
  if(matches("tui.select.confirm","\r","\n")){
   if(activeName()==="CHANGES"&&controls.openChanges){activationRequested=true;controls.openChanges();return;}
   selectedOnly=true;scrollTop=0;controls.requestRender();return;
  }
  if(matches("tui.editor.deleteCharBackward","\u007f","\b")){selectedOnly=false;scrollTop=0;controls.requestRender();}
 };
 return {render,handleInput,invalidate(){scrollTop=0;}};
}
