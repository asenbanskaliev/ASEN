import {ASEN_PANEL_SECTIONS,renderAsenPanel,renderAsenPanelSection,type AsenPanelSection,type AsenPanelSnapshot} from "./ide-panel.js";
import {truncateForTerminal} from "./responsive-layout.js";
import type {KeybindingsManager} from "@earendil-works/pi-tui";

export interface NativePanelControls{
 readonly requestRender:()=>void;
 readonly close:()=>void;
 readonly terminalRows:()=>number;
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
 let active=0,scrollTop=0,selectedOnly=false,closeOnly=false;
 const collapsed=new Set<AsenPanelSection>();
 const sections=[...ASEN_PANEL_SECTIONS];
 const rowsFor=(width:number)=>{
  if(selectedOnly){
   const section=sections[active]!;
   return [truncateForTerminal("▾ "+section,width),...renderAsenPanelSection(snapshot,section,width,true)];
  }
  return renderAsenPanel(snapshot,width,[...collapsed]);
 };
 const activeName=()=>sections[active]!;
 const render=(width:number):string[]=>{
  const cols=Math.max(1,Math.min(1000,Math.floor(width)));
  closeOnly=cols<12;
  if(controls.stillCurrent&&!controls.stillCurrent())return [truncateForTerminal("ASEN panel scope changed; press Esc to close",cols)];
  // Keep a usable close affordance even when the full word cannot fit.
  if(closeOnly)return [truncateForTerminal(cols<5?"q":"Close",cols)];
  const usable=Math.max(2,Math.min(200,controls.terminalRows()-4));
  const hasBindings=typeof controls.keybindings?.matches==="function";
  const title=truncateForTerminal("✿ ASEN PANEL · "+activeName()+(hasBindings
   ?" · j/k scroll · Space fold · q close"
   :" · j/k sections · Enter detail · Space fold · Esc close"),cols);
  const content=rowsFor(Math.max(12,cols-2));
  const max=Math.max(0,content.length-usable);
  scrollTop=Math.min(max,Math.max(0,scrollTop));
  const visible=content.slice(scrollTop,scrollTop+usable).map(line=>truncateForTerminal(" "+line,cols));
  const remaining=content.length>usable?" · "+(scrollTop+usable)+"/"+content.length:"";
  const hint=hasBindings?"Host keys: scroll / next section / detail / back / close":"↑/↓ scroll · Tab next section · Backspace all";
  return [title,...visible,truncateForTerminal(hint+remaining,cols)];
 };
 const handleInput=(data:string)=>{
  if(controls.stillCurrent&&!controls.stillCurrent()){controls.close();return;}
  // Use this interaction's manager, not a global registry or a second keymap.
  const matches=(action:Parameters<KeybindingsManager["matches"]>[1],...fallback:string[])=>
   typeof controls.keybindings?.matches==="function"
    ?controls.keybindings.matches(data,action):fallback.includes(data);
  if(data==="q"||matches("tui.select.cancel","\u001b","\u0003")){controls.close();return;}
  if(closeOnly)return;
  if(data==="j"||matches("tui.select.down","\u001b[B")){scrollTop++;controls.requestRender();return;}
  if(data==="k"||matches("tui.select.up","\u001b[A")){scrollTop=Math.max(0,scrollTop-1);controls.requestRender();return;}
  if(matches("tui.input.tab","\t")){active=(active+1)%sections.length;scrollTop=0;controls.requestRender();return;}
  if(data===" "){if(collapsed.has(activeName()))collapsed.delete(activeName());else collapsed.add(activeName());controls.requestRender();return;}
  if(matches("tui.select.confirm","\r","\n")){selectedOnly=true;scrollTop=0;controls.requestRender();return;}
  if(matches("tui.editor.deleteCharBackward","\u007f","\b")){selectedOnly=false;scrollTop=0;controls.requestRender();}
 };
 return {render,handleInput,invalidate(){scrollTop=0;}};
}
