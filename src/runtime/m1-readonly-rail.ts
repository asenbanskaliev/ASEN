/** M1: a native Pi editor widget summarizing six read-only panels, not a screen sidebar. */
import {ASEN_PANEL_SECTIONS,renderAsenPanel,renderAsenWorkRow,type AsenPanelSnapshot} from "./ide-panel.js";
import {truncateForTerminal,visibleWidth} from "./responsive-layout.js";
export type M1Mode="rail"|"compact"|"minimum";
export interface M1Surface {readonly mode:M1Mode;readonly lines:readonly string[]}
export function renderM1Surface(snapshot:AsenPanelSnapshot,width:number):M1Surface{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw Error("Invalid M1 width");
 if(width<140){
  const line=renderAsenWorkRow(snapshot,width);
  return {mode:width<50?"minimum":"compact",lines:line?[line]:[]};
 }
 const headings=renderAsenPanel(snapshot,width-3).filter(line=>line.startsWith("▾ "));
 if(headings.length!==ASEN_PANEL_SECTIONS.length)throw Error("M1 section inventory incomplete");
 const lines=["✿ ASEN │ active Pi session · /asen-panel",
  ...headings.map(line=>"│ "+line)].map(line=>truncateForTerminal(line,width-1));
 if(lines.some(line=>visibleWidth(line)>width))throw Error("M1 width overflow");
 return {mode:"rail",lines};
}
export function createM1SurfaceCache(){
 let last="";
 return {
  next(snapshot:AsenPanelSnapshot,width:number,identity:string):M1Surface|undefined{
   const surface=renderM1Surface(snapshot,width),key=JSON.stringify([identity,width,surface]);
   if(key===last)return;
   last=key;return surface;
  },
  reset(){last="";}
 };
}
