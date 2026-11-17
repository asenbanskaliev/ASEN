/**
 * T11: lateral derecho real solo si el host Pi ofrece un árbol adaptable.
 * La API interna es experimental: si no está disponible, no se modifica Pi.
 * Jamás ejecuta tareas, concede permisos ni inventa datos de modelos.
 */
import {ScrollView,type Component,type TUI,type TuiMouseEvent,type TuiMouseEventResult} from "@earendil-works/pi-tui";
import type {Theme} from "@earendil-works/pi-coding-agent";
import {ASEN_PANEL_SECTIONS,renderAsenPanelWithLayout,type AsenPanelSection,type AsenPanelSnapshot} from "./ide-panel.js";
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
 /** Lectura de estado visual, sin acceder al modelo ni a autorizaciones. */
 readonly selectedSection:()=>AsenPanelSection;
 readonly collapsedSections:()=>readonly AsenPanelSection[];
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

 // El lateral no crea un segundo gestor de datos. Conserva solo selección y plegado.
 const folded=new Set<AsenPanelSection>();
 const sections=[...ASEN_PANEL_SECTIONS];
 let selected=0,focusWas:Component|null=null,ownsFocus=false,renderedHeadings=new Map<number,AsenPanelSection>();
 const focusHost=tui as TUI&{getFocusedComponent?:()=>Component|null};
 const releaseFocus=()=>{
  if(!ownsFocus)return;
  ownsFocus=false;
  try{
   if(typeof focusHost.getFocusedComponent==="function"&&focusHost.getFocusedComponent()===content)
    tui.setFocus(focusWas);
  }catch{/* Un foco anterior caducado no puede bloquear la salida. */}
  focusWas=null;
 };
 const content:Component={
  render(width:number):string[]{
   const cols=Math.max(12,Math.min(1000,Math.floor(width)-2));
   const snapshot=read()??{todos:[],agents:[],jobs:[]};
   const density=readDensity();
   const detail=readPreset()==="power"&&density==="comfortable";
   const layout=renderAsenPanelWithLayout(snapshot,cols,[...folded],detail);
   renderedHeadings=new Map<number,AsenPanelSection>();
   const rows:Array<{value:string;section?:AsenPanelSection}>=[];
   if(density==="comfortable")rows.push({value:""});
   for(const group of layout.groups){
    renderedHeadings.set(rows.length,group.section);
    rows.push({value:layout.lines[group.start]??group.section,section:group.section});
    const end=density==="minimal"?group.start+1:
     density==="compact"?Math.min(group.end,group.start+3):group.end;
    for(let i=group.start+1;i<end;i++)rows.push({value:layout.lines[i]??""});
   }
   return rows.map(({value,section})=>{
    const highlighted=ownsFocus&&section===sections[selected];
    const fitted=truncateForTerminal(highlighted?"> "+value:value,cols);
    const heading=section!==undefined,dim=/unknown|unverified|unavailable|No (?:agents|tasks|owned jobs)/iu.test(fitted);
    const painted=heading?theme.fg("accent",theme.bold(fitted)):dim?theme.fg("muted",fitted):theme.fg("text",fitted);
    return " "+painted;
   });
  },
  handleMouse(event:TuiMouseEvent):TuiMouseEventResult|undefined{
   if(!eligible()||event.type!=="press"||event.button!=="left")return;
   // En Pi 1.2 la coordenada es local al hijo dentro de ScrollView; ya
   // incluye el desplazamiento del contenido. No se usa screenY absoluto.
   const section=renderedHeadings.get(event.y);
   if(section===undefined)return;
   selected=sections.indexOf(section);
   if(folded.has(section))folded.delete(section);else folded.add(section);
   const focusAvailable=typeof focusHost.getFocusedComponent==="function";
   if(focusAvailable&&!ownsFocus){
    focusWas=focusHost.getFocusedComponent!();
    ownsFocus=true;
   }
   scroll.invalidate();
   try{tui.requestRender();}catch{}
   return {handled:true,...(focusAvailable?{focus:true}:{})};
  },
  handleInput(data:string):void{
   if(!ownsFocus)return;
   if(data==="\u001b"||data==="q"){
    releaseFocus();try{tui.requestRender();}catch{}return;
   }
   if(data==="\t"||data==="\u001b[B"||data==="j")
    selected=(selected+1)%sections.length;
   else if(data==="\u001b[A"||data==="k")
    selected=(selected+sections.length-1)%sections.length;
   else if(data===" "||data==="\r"||data==="\n"){
    const section=sections[selected]!;
    if(folded.has(section))folded.delete(section);else folded.add(section);
   }else return; // No se interpreta una orden para ejecutar agentes.
   scroll.invalidate();
   try{tui.requestRender();}catch{}
  },
  invalidate(){renderedHeadings.clear();}
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
   if(!eligible()){releaseFocus();return before.call(root);}
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
 const refresh=()=>{if(closed)return;if(!eligible())releaseFocus();scroll.invalidate();try{tui.requestRender();}catch{/* Es una vista auxiliar. */}};
 const dispose=()=>{if(closed)return;releaseFocus();closed=true;
  if(rebindTimer!==undefined)clearInterval(rebindTimer);rebindTimer=undefined;
  detach();try{tui.requestRender();}catch{/* No bloquear el cierre. */}};
 sync();
 // El host sustituye el árbol al cambiar entre regular/fullscreen. No
 // alcanza con conectar al crear la cabecera: reanudar sin invadir otros
 // propietarios y cerrar el temporizador al terminar la sesión.
 rebindTimer=setInterval(sync,100);
 rebindTimer.unref?.();
 return {hostSupported,active,sync,refresh,selectedSection:()=>sections[selected]!,collapsedSections:()=>[...folded],dispose};
}
