import {ASEN_PANEL_SECTIONS,renderAsenPanelSection,renderAsenPanelWithLayout,type AsenPanelSection,type AsenPanelSnapshot} from "./ide-panel.js";
import {truncateForTerminal,visibleWidth} from "../responsive-layout.js";
import type {Theme} from "@earendil-works/pi-coding-agent";
import type {KeybindingsManager,TuiMouseEvent,TuiMouseEventResult} from "@earendil-works/pi-tui";

export interface NativePanelControls{
 readonly requestRender:()=>void;
 readonly close:()=>void;
 /** Lectura fresca del mismo diario/Todo/AgentRuntime. Nunca ejecuta agentes. */
 readonly refresh?:()=>Promise<AsenPanelSnapshot>;
 /** La ventana visible es la única propietaria de este temporizador. */
 readonly autoRefreshMs?:number;
 /** Solo tras aplicar una observación nueva del mismo contexto. */
 readonly onRefreshed?:(snapshot:AsenPanelSnapshot)=>void;
 /** Una lectura antigua no sustituye los datos que ya están dibujados. */
 readonly acceptSnapshot?:(snapshot:AsenPanelSnapshot)=>boolean;
 /** Una lectura superada no debe provocar un falso estado indisponible. */
 readonly ignoreReadFailure?:(error:unknown)=>boolean;
 /** Si falla la lectura, retirar también los datos compartidos del lateral.
  * No equivale a cero agentes ni cambia permisos. */
 readonly onUnavailable?:(snapshot:AsenPanelSnapshot)=>void;
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
 handleMouse?(event:TuiMouseEvent):TuiMouseEventResult|undefined;
 invalidate():void;
 refreshNow():Promise<void>;
 dispose():void;
}
/** Keyboard-native read-only overlay on Pi's documented ui.custom component API. */
export function createNativeWorkPanel(snapshot:AsenPanelSnapshot,controls:NativePanelControls):NativePanelComponent & {handleMouse:(event:TuiMouseEvent)=>TuiMouseEventResult|undefined}{
 let active=0,scrollTop=0,selectedOnly=false,closeOnly=false,activationRequested=false,revealActive=false;
 let disposed=false,refreshing=false,refreshTimer:ReturnType<typeof setTimeout>|undefined;
 const dispose=()=>{disposed=true;if(refreshTimer!==undefined)clearTimeout(refreshTimer);refreshTimer=undefined;};
 const close=()=>{dispose();controls.close();};
 const refreshNow=async():Promise<void>=>{
  if(disposed||refreshing||!controls.refresh)return;
  if(controls.stillCurrent&&!controls.stillCurrent()){close();return;}
  refreshing=true;
  try{
   const next=await controls.refresh();
   if(disposed)return;
   if(controls.stillCurrent&&!controls.stillCurrent()){close();return;}
   if(controls.acceptSnapshot&&!controls.acceptSnapshot(next))return;
   snapshot=next;
   try{controls.onRefreshed?.(next);}catch{/* La presentación no modifica la observación. */}
   controls.requestRender();
  }catch(error){
   if(disposed)return;
   // El cambio de sesión cierra la ventana incluso cuando el fallo queda superado.
   if(controls.stillCurrent&&!controls.stillCurrent()){close();return;}
   if(controls.ignoreReadFailure?.(error))return;
   // Ante lectura fallida no conservar estados hijos activos obsoletos.
   // La lectura falló: no reutilizar listas, revisión, Git o integraciones
   // anteriores como si fueran observaciones vivas del mismo momento.
   snapshot={todos:[],agents:[],jobs:[],activityUnavailable:true,agentFlowUnavailable:true};
   // Evitar que la barra o el lateral reutilicen datos mientras el modal
   // ya muestra la pérdida de observación. No se divulga el error original.
   try{controls.onUnavailable?.(snapshot);}catch{/* Solo presentación. */}
   controls.requestRender();
  }finally{refreshing=false;}
 };
 const period=controls.autoRefreshMs;
 if(controls.refresh&&typeof period==="number"&&Number.isFinite(period)&&period>=1000){
  const ms=Math.min(30000,Math.floor(period));
  const schedule=()=>{
   if(disposed)return;
   refreshTimer=setTimeout(()=>{void refreshNow().finally(schedule);},ms);
   refreshTimer.unref?.();
  };
  schedule();
 }
 const collapsed=new Set<AsenPanelSection>();
 const sections=[...ASEN_PANEL_SECTIONS];
 const activeName=()=>sections[active]!;
 type Row={text:string;section?:AsenPanelSection;heading?:boolean};
 let displayedRows:Row[]=[];
 // Fit plain text first. Theme escapes must never pass back through sanitization.
 const fitLine=(left:string,right:string,width:number)=>{
  const tail=visibleWidth(right)+2<width?right:"";
  const head=truncateForTerminal(left,Math.max(1,width-visibleWidth(tail)-(tail?1:0)));
  return head+" ".repeat(Math.max(0,width-visibleWidth(head)-visibleWidth(tail)))+tail;
 };
 const rowsFor=(width:number):Row[]=>{
  const layout=renderAsenPanelWithLayout(snapshot,width,[...collapsed]);
  const trustedFlow=snapshot.agentFlowUnavailable?undefined:snapshot.agentFlow;
  const rows:Row[]=[];
  const noWork=!snapshot.activityUnavailable&&!snapshot.agentFlowUnavailable&&!snapshot.todos.length&&!snapshot.jobs.length&&!snapshot.agents.length&&
   !(trustedFlow?.overview.totalTasks);
  for(const group of layout.groups){
   const section=group.section;
   if(selectedOnly&&section!==activeName())continue;
   const open=selectedOnly||!collapsed.has(section);
   const header=layout.lines[group.start]??section;
   const summary=header.split(" · ").slice(1).join(" · ");
   rows.push({text:fitLine((section===activeName()?"> ":"  ")+(open?"▾ ":"▸ ")+section,summary,width),section,heading:true});
   if(!selectedOnly&&section==="AGENTS"&&noWork&&!snapshot.agentFlowUnavailable)rows.push({text:"  No work in this session"});
   if(!open)continue;
   let source:readonly string[]=[];
   if(snapshot.activityUnavailable)source=layout.lines.slice(group.start+1,group.end);
   else if(selectedOnly)source=renderAsenPanelSection(snapshot,section,width,true);
   else if(section==="INTEGRATIONS"){
    const inspection=snapshot.integrationInspection;
    const flowLine=trustedFlow?.overview.totalTasks?
     ["  Cross-session ODD: linked worktree flow observed · actual model unknown"]:
     snapshot.agentFlowUnavailable?["  Cross-session ODD: unavailable"]:[];
    source=inspection?[
     ...flowLine,
     "  Commands: "+inspection.commands.state+(inspection.commands.limited?" · limited":""),
     "  Tools: "+inspection.tools.state+(inspection.tools.limited?" · limited":"")+" · connection: unknown",
     "  Enter details · /asen-integrations",
    ]:layout.lines.slice(group.start+1,group.end).slice(0,3);
   }else if(section==="TODOS"?snapshot.todos.length||!!trustedFlow?.overview.totalTasks||!!snapshot.agentFlowUnavailable:
    section==="JOBS"?snapshot.jobs.length:
    section==="AGENTS"?snapshot.agents.length||!!trustedFlow?.overview.totalTasks||!!snapshot.agentFlowUnavailable:
    section==="CHANGES"?(snapshot.changes&&snapshot.changes.files>0)||!!trustedFlow?.overview.totalTasks||!!snapshot.agentFlowUnavailable:
    section==="REVIEW"?!/no pending results|unverified/u.test(summary):false){
    source=layout.lines.slice(group.start+1,group.end);
   }
   rows.push(...source.map(text=>({text,section})));
  }
  return rows;
 };
 const render=(width:number):string[]=>{
  displayedRows=[];
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
  displayedRows=content.slice(scrollTop,scrollTop+usable);
  const visible=displayedRows.map(row=>{
   const focused=row.heading&&row.section===activeName();
   const muted=/unknown|unavailable|unverified|No work/u.test(row.text);
   return paint(" "+row.text,muted?"muted":focused?"accent":"text",row.heading);
  });
  const indicator=max>0?(scrollTop>0?"↑ ":"")+(scrollTop<max?"↓ "+(content.length-scrollTop-usable)+" more":"end")+" · ":"";
  const host=typeof controls.keybindings?.matches==="function";
  const hints=host?"j/k scroll · r refresh · host keys: next/detail/back · q close":
   selectedOnly?"Backspace all · r refresh · Tab section · q close":
   cols<60?"j/k scroll · r refresh · Tab next":"j/k scroll · r refresh · Tab next · Enter detail · Backspace all";
  return [paint(title,"accent",true),...visible,paint(indicator+hints,"muted")];
 };
 const handleInput=(data:string)=>{
  if(activationRequested||disposed)return;
  if(controls.stillCurrent&&!controls.stillCurrent()){close();return;}
  // Use this interaction's manager, not a global registry or a second keymap.
  const matches=(action:Parameters<KeybindingsManager["matches"]>[1],...fallback:string[])=>
   typeof controls.keybindings?.matches==="function"
    ?controls.keybindings.matches(data,action):fallback.includes(data);
  if(data==="q"||matches("tui.select.cancel","\u001b","\u0003")){close();return;}
  if(closeOnly)return;
  if(data==="r"&&controls.refresh){void refreshNow();return;}
  if(data==="j"||matches("tui.select.down","\u001b[B")){scrollTop++;controls.requestRender();return;}
  if(data==="k"||matches("tui.select.up","\u001b[A")){scrollTop=Math.max(0,scrollTop-1);controls.requestRender();return;}
  if(matches("tui.input.tab","\t")){active=(active+1)%sections.length;scrollTop=0;revealActive=true;controls.requestRender();return;}
  if(data===" "){if(collapsed.has(activeName()))collapsed.delete(activeName());else collapsed.add(activeName());controls.requestRender();return;}
  if(matches("tui.select.confirm","\r","\n")){
   if(activeName()==="CHANGES"&&controls.openChanges){activationRequested=true;dispose();controls.openChanges();return;}
   selectedOnly=true;scrollTop=0;controls.requestRender();return;
  }
  if(matches("tui.editor.deleteCharBackward","\u007f","\b")){selectedOnly=false;scrollTop=0;controls.requestRender();}
 };
 const handleMouse=(event:TuiMouseEvent):TuiMouseEventResult|undefined=>{
  if(event.type!=="press"||event.button!=="left"||closeOnly)return undefined;
  if(controls.stillCurrent&&!controls.stillCurrent()){close();return {handled:true};}
  // Title is rendered on row 0. Only the headings ACTUALLY displayed in
  // the current viewport can be clicked, independent of folding or scroll.
  const index=Number.isSafeInteger(event.y)?event.y-1:-1;
  const target=index>=0?displayedRows[index]:undefined;
  if(!target?.heading||!target.section)return undefined;
  active=sections.indexOf(target.section);
  if(active<0)return undefined;
  scrollTop=0;revealActive=true;
  if(collapsed.has(target.section))collapsed.delete(target.section);
  else collapsed.add(target.section);
  controls.requestRender();return {handled:true};
 };
 return {render,handleInput,handleMouse,invalidate(){scrollTop=0;},refreshNow,dispose};
}
