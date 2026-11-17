/**
 * T11: lateral derecho real solo si el host Pi ofrece un árbol adaptable.
 * La API interna es experimental: si no está disponible, no se modifica Pi.
 * Jamás ejecuta tareas, concede permisos ni inventa datos de modelos.
 */
import {ScrollView,type Component,type TUI} from "@earendil-works/pi-tui";
import type {Theme} from "@earendil-works/pi-coding-agent";
import {renderAsenPanel,renderAsenPanelWithLayout,type AsenPanelSnapshot} from "./ide-panel.js";
import {truncateForTerminal} from "../responsive-layout.js";
import type {AsenAppearancePreset} from "./t11-appearance.js";
import type {T11Position,T11Density} from "./t11-layout-settings.js";

export const ASEN_RAIL_BREAKPOINT=140;
export const ASEN_RAIL_WIDTH=50;
export const ASEN_RAIL_GAP=3;
const NODE=Symbol.for("@earendil-works/pi-tui/layout-node");
type LayoutNode={type:string;gap?:number;align?:"stretch"|"start"|"center"|"end";entries?:unknown[]};
type Root=Component&Record<symbol,unknown>;
type Host=TUI&{mode?:string;layoutRoot?:Root};
export interface AsenRailHandle{
 readonly hostSupported:()=>boolean;
 readonly active:()=>boolean;
 readonly sync:()=>void;
 readonly refresh:()=>void;
 readonly dispose:()=>void;
}
function supported(root:Root|undefined):root is Root{
 if(!root||typeof root[NODE]!=="function")return false;
 const descriptor=Object.getOwnPropertyDescriptor(root,NODE);
 return !descriptor||descriptor.writable===true||descriptor.configurable===true;
}
export function installAsenNativeRail(
 tui:TUI,theme:Pick<Theme,"fg"|"bold">,read:()=>AsenPanelSnapshot|undefined,
 readPreset:()=>AsenAppearancePreset=()=>"neutral",
 readPosition:()=>T11Position=()=>"auto",readDensity:()=>T11Density=()=>"comfortable"
):AsenRailHandle{
 const host=tui as Host;
 let closed=false,originalRoot:Root|undefined,originalNode:(()=>LayoutNode)|undefined;
 let ownNode:(()=>LayoutNode)|undefined,ownDescriptor:PropertyDescriptor|undefined;
 let rebindTimer:ReturnType<typeof setInterval>|undefined;
 const content:Component={
  render(width:number):string[]{
   const cols=Math.max(12,Math.min(1000,Math.floor(width)-2));
   const snapshot=read()??{todos:[],agents:[],jobs:[]};
   const density=readDensity();
   const lines=density==="comfortable"?renderAsenPanel(snapshot,cols,[],readPreset()==="power"):
    (()=>{const layout=renderAsenPanelWithLayout(snapshot,cols);
     return layout.groups.flatMap(group=>density==="minimal"?[layout.lines[group.start]!]:
      layout.lines.slice(group.start,Math.min(group.end,group.start+3)));})();
   return (readDensity()==="comfortable"?["",...lines]:lines).map((line)=>{
    const value=truncateForTerminal(line,cols);
    const heading=/^[▾▸] /u.test(value),dim=/unknown|unverified|unavailable|No (?:agents|tasks|owned jobs)/iu.test(value);
    const painted=heading?theme.fg("accent",theme.bold(value)):dim?theme.fg("muted",value):theme.fg("text",value);
    return " "+painted;
   });
  },invalidate(){}
 };
 const scroll=new ScrollView(content,{follow:"none",primary:false,overscroll:"contain",scrollbar:"auto"});
 const leaf:Component&Record<symbol,unknown>={
  render:()=>[],invalidate(){},
 };
 const position=():"none"|"right"|"bottom"=>{
  if(closed||host.mode!=="fullscreen")return "none";
  const cols=tui.terminal?.columns??0,rows=tui.terminal?.rows??24,requested=readPosition();
  if(requested==="hidden")return "none";
  if(requested==="bottom")return cols>=24&&rows>=16?"bottom":"none";
  if(requested==="right")return cols>=ASEN_RAIL_BREAKPOINT?"right":"none";
  return readPreset()!=="light"&&cols>=ASEN_RAIL_BREAKPOINT?"right":"none";
 };
 const eligible=()=>position()!=="none";
 const detach=()=>{
  if(originalRoot&&originalNode&&ownNode&&originalRoot[NODE]===ownNode){
   if(ownDescriptor)Object.defineProperty(originalRoot,NODE,ownDescriptor);
   else Reflect.deleteProperty(originalRoot,NODE);
  }
  originalRoot=undefined;originalNode=undefined;ownNode=undefined;ownDescriptor=undefined;
 };
 const sync=()=>{
  if(closed)return;
  const root=host.layoutRoot;
  if(root===originalRoot&&ownNode&&root?.[NODE]===ownNode)return;
  detach();
  if(!supported(root))return;
  const before=root[NODE] as ()=>LayoutNode;
  const descriptor=Object.getOwnPropertyDescriptor(root,NODE);
  const left=()=>before.call(root);
  leaf[NODE]=left;
  const composed=():LayoutNode=>{
   if(!eligible())return before.call(root);
   if(position()==="bottom")return {type:"vstack",gap:1,align:"stretch",entries:[
    {component:leaf,basis:0,grow:1,shrink:1,minSize:1},
    {component:scroll,basis:8,grow:0,shrink:0,minSize:8},
   ]};
   return {type:"hstack",gap:ASEN_RAIL_GAP,align:"stretch",entries:[
    {component:leaf,basis:0,grow:1,shrink:1,minSize:1},
    {component:scroll,basis:ASEN_RAIL_WIDTH,grow:0,shrink:0,minSize:ASEN_RAIL_WIDTH},
   ]};
  };
  try{root[NODE]=composed;}catch{return;}
  originalRoot=root;originalNode=before;ownNode=composed;ownDescriptor=descriptor;
  try{tui.requestRender();}catch{/* La composición visual es opcional. */}
 };
 const hostSupported=()=>!!(originalRoot&&ownNode&&originalRoot[NODE]===ownNode);
 const active=()=>hostSupported()&&eligible();
 const refresh=()=>{if(closed)return;scroll.invalidate();try{tui.requestRender();}catch{/* Es una vista auxiliar. */}};
 const dispose=()=>{if(closed)return;closed=true;
  if(rebindTimer!==undefined)clearInterval(rebindTimer);rebindTimer=undefined;
  detach();try{tui.requestRender();}catch{/* No bloquear el cierre. */}};
 sync();
 // El host sustituye el árbol al cambiar entre regular/fullscreen. No
 // alcanza con conectar al crear la cabecera: reanudar sin invadir otros
 // propietarios y cerrar el temporizador al terminar la sesión.
 rebindTimer=setInterval(sync,100);
 rebindTimer.unref?.();
 return {hostSupported,active,sync,refresh,dispose};
}
