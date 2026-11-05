import {ASEN_PANEL_SECTIONS,renderAsenPanel,renderAsenPanelSection,type AsenPanelSection,type AsenPanelSnapshot} from "./ide-panel.js";
import {truncateForTerminal,visibleWidth} from "./responsive-layout.js";

export interface NativePanelControls{
 readonly requestRender:()=>void;
 readonly close:()=>void;
 readonly terminalRows:()=>number;
 readonly stillCurrent?:()=>boolean;
}
export interface NativePanelComponent{
 render(width:number):string[];
 handleInput(data:string):void;
 invalidate():void;
}
/** Keyboard-native read-only overlay on Pi's documented ui.custom component API. */
export function createNativeWorkPanel(snapshot:AsenPanelSnapshot,controls:NativePanelControls):NativePanelComponent{
 let active=0,scrollTop=0,selectedOnly=false;
 const collapsed=new Set<AsenPanelSection>();
 const sections=[...ASEN_PANEL_SECTIONS];
 const rowsFor=(width:number)=>{
  if(selectedOnly){
   const section=sections[active]!;
   return [truncateForTerminal("▾ "+section,width),...renderAsenPanelSection(snapshot,section,width)];
  }
  return renderAsenPanel(snapshot,width,[...collapsed]);
 };
 const activeName=()=>sections[active]!;
 const render=(width:number):string[]=>{
  const cols=Math.max(12,Math.min(1000,Math.floor(width)));
  if(controls.stillCurrent&&!controls.stillCurrent())return [truncateForTerminal("ASEN panel scope changed; press Esc to close",cols)];
  const usable=Math.max(2,Math.min(200,controls.terminalRows()-4));
  const title=truncateForTerminal("✿ ASEN PANEL · "+activeName()+" · j/k sections · Enter detail · Space fold · Esc close",cols);
  const content=rowsFor(cols-2);
  const max=Math.max(0,content.length-usable);
  scrollTop=Math.min(max,Math.max(0,scrollTop));
  const visible=content.slice(scrollTop,scrollTop+usable).map(line=>truncateForTerminal(" "+line,cols));
  const remaining=content.length>usable?" · "+(scrollTop+usable)+"/"+content.length:"";
  return [title,...visible,truncateForTerminal("↑/↓ scroll · Tab next section · Backspace all"+remaining,cols)];
 };
 const handleInput=(data:string)=>{
  if(controls.stillCurrent&&!controls.stillCurrent()){controls.close();return;}
  if(data==="\u001b"||data==="q"||data==="\u0003"){controls.close();return;}
  if(data==="j"||data==="\u001b[B"){scrollTop++;controls.requestRender();return;}
  if(data==="k"||data==="\u001b[A"){scrollTop=Math.max(0,scrollTop-1);controls.requestRender();return;}
  if(data==="\t"){active=(active+1)%sections.length;scrollTop=0;controls.requestRender();return;}
  if(data===" "){if(collapsed.has(activeName()))collapsed.delete(activeName());else collapsed.add(activeName());controls.requestRender();return;}
  if(data==="\r"||data==="\n"){selectedOnly=true;scrollTop=0;controls.requestRender();return;}
  if(data==="\u007f"||data==="\b"){selectedOnly=false;scrollTop=0;controls.requestRender();}
 };
 return {render,handleInput,invalidate(){scrollTop=0;}};
}
