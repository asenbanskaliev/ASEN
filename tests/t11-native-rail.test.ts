import test from "node:test";
import assert from "node:assert/strict";
import {KeybindingsManager,TUI_KEYBINDINGS,visibleWidth,type TUI} from "@earendil-works/pi-tui";
import {ASEN_RAIL_BREAKPOINT,ASEN_RAIL_GAP,ASEN_RAIL_WIDTH,installAsenNativeRail} from "../src/runtime/ui/t11-native-rail.js";
import type {AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";

const NODE=Symbol.for("@earendil-works/pi-tui/layout-node");
const fakeTheme={
 fg(_role:string,value:string){return value;},
 bold(value:string){return value;}
} as never;
const snapshot:AsenPanelSnapshot={todos:[],agents:[],jobs:[],changes:{branch:"feat/revision",files:1}};
const host=(cols=180,mode="fullscreen",withNode=true)=>{
 const node={type:"vstack",entries:[]},original=()=>node;
 const root:Record<symbol,unknown>={};
 if(withNode)root[NODE]=original;
 const ui={mode,terminal:{columns:cols},layoutRoot:root,requestRender(){}} as unknown as TUI;
 return {ui,node,root,original};
};
test("T11 reserva físicamente 50+3 columnas solo cuando el host tiene layout y pantalla >=140",()=>{
 assert.equal(ASEN_RAIL_BREAKPOINT,140);assert.equal(ASEN_RAIL_WIDTH,50);assert.equal(ASEN_RAIL_GAP,3);
 const f=host();const rail=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot);
 assert.equal(rail.hostSupported(),true);assert.equal(rail.active(),true);
 const wide=(f.root[NODE] as ()=>any)();
 assert.equal(wide.type,"hstack");assert.equal(wide.gap,3);
 assert.equal(wide.entries.length,2);
 assert.equal(wide.entries[0].grow,1);assert.equal(wide.entries[1].basis,50);
 assert.equal(wide.entries[1].minSize,50);
 assert.equal(wide.entries[0].component[NODE](),f.node,"Pi conserva su contenido nativo");
 (f.ui.terminal as {columns:number}).columns=139;
 assert.equal(rail.active(),false);
 assert.equal((f.root[NODE] as ()=>any)(),f.node,"al estrechar recupera el layout original");
 (f.ui.terminal as {columns:number}).columns=140;
 assert.equal(rail.active(),true);
 rail.dispose();
 assert.equal(f.root[NODE],f.original,"el cierre devuelve exactamente el árbol original");
});
test("T11 no finge un lateral en el modo regular ni sin la API del host",()=>{
 const regular=host(180,"regular");
 const one=installAsenNativeRail(regular.ui,fakeTheme,()=>snapshot);
 assert.equal(one.hostSupported(),true);assert.equal(one.active(),false);
 assert.equal((regular.root[NODE] as ()=>unknown)(),regular.node);
 one.dispose();
 const missing=host(180,"fullscreen",false);
 const other=installAsenNativeRail(missing.ui,fakeTheme,()=>snapshot);
 assert.equal(other.hostSupported(),false);assert.equal(other.active(),false);
 assert.equal(missing.root[NODE],undefined);
 other.dispose();
});
test("T11 no suplanta un árbol ajeno ni repara automáticamente un host distinto",()=>{
 const f=host(180);
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot);
 const nextRoot:Record<symbol,unknown>={[NODE]:()=>({type:"vstack",entries:[]})};
 (f.ui as unknown as {layoutRoot:Record<symbol,unknown>}).layoutRoot=nextRoot;
 h.sync();
 assert.equal(f.root[NODE],f.original,"restaura el árbol de la sesión anterior");
 assert.equal(h.active(),true);
 h.dispose();
 assert.equal(typeof nextRoot[NODE],"function");
 const frozen=host(180);
 Object.defineProperty(frozen.root,NODE,{value:frozen.original,writable:false,configurable:false});
 const h2=installAsenNativeRail(frozen.ui,fakeTheme,()=>snapshot);
 assert.equal(h2.hostSupported(),false);
 assert.equal(h2.active(),false);
 h2.dispose();
});

test("T11 reconecta al nuevo árbol del host sin una llamada manual y detiene la reconexión al cerrar",async()=>{
 const f=host(180),rail=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot);
 const replacement:Record<symbol,unknown>={[NODE]:()=>({type:"vstack",entries:[]})};
 (f.ui as unknown as {layoutRoot:Record<symbol,unknown>}).layoutRoot=replacement;
 await new Promise(resolve=>setTimeout(resolve,240));
 const installed=(replacement[NODE] as ()=>any)();
 assert.equal(installed.type,"hstack");
 assert.equal(installed.gap,3);
 rail.dispose();
 assert.equal((replacement[NODE] as ()=>any)().type,"vstack");
 const other:Record<symbol,unknown>={[NODE]:()=>({type:"vstack",entries:[]})};
 (f.ui as unknown as {layoutRoot:Record<symbol,unknown>}).layoutRoot=other;
 await new Promise(resolve=>setTimeout(resolve,180));
 assert.equal((other[NODE] as ()=>any)().type,"vstack","no debe quedar ningún temporizador modificando el siguiente host");
});


test("T11 Light retira el lateral y Power mantiene la reserva real",()=>{
 const f=host(180);let preset:"light"|"neutral"|"power"="neutral";
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot,()=>preset);
 assert.equal(h.active(),true);
 preset="light";h.refresh();assert.equal(h.active(),false);
 assert.equal((f.root[NODE] as ()=>any)().type,"vstack");
 preset="power";h.refresh();assert.equal(h.active(),true);
 assert.equal((f.root[NODE] as ()=>any)().entries[1].basis,50);
 h.dispose();assert.equal(f.root[NODE],f.original);
});

test("T11 bottom conserva el editor; hidden y 12 filas desactivan el panel fijo",()=>{
 const f=host(180);(f.ui.terminal as any).rows=40;
 let position:"auto"|"right"|"bottom"|"hidden"="bottom";
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot,()=>"neutral",()=>position);
 const layout=(f.root[NODE] as ()=>any)();
 assert.equal(layout.type,"vstack");assert.equal(layout.gap,1);
 assert.equal(layout.entries[1].basis,8);assert.equal(layout.entries[0].grow,1);
 (f.ui.terminal as any).columns=80;
 assert.equal(h.active(),true);
 (f.ui.terminal as any).rows=12;
 assert.equal(h.active(),false);
 (f.ui.terminal as any).rows=40;
 position="hidden";assert.equal(h.active(),false);
 assert.equal((f.root[NODE] as ()=>any)(),f.node);
 position="right";assert.equal(h.active(),false);
 (f.ui.terminal as any).columns=140;
 assert.equal((f.root[NODE] as ()=>any)().type,"hstack");
 h.dispose();assert.equal(f.root[NODE],f.original);
});
test("T11 la densidad minimal muestra únicamente títulos observados, sin cambiar el snapshot",()=>{
 const f=host(180);let density:"comfortable"|"compact"|"minimal"="comfortable";
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot,()=>"neutral",()=>"right",()=>density);
 const component=(f.root[NODE] as ()=>any)().entries[1].component;
 const comfortable=component.render(50);
 density="compact";const compact=component.render(50);
 density="minimal";const minimal=component.render(50);
 assert.ok(minimal.length<=compact.length&&compact.length<=comfortable.length);
 assert.ok(minimal.some((row:string)=>row.includes("REVIEW")));
 assert.deepEqual(snapshot,{todos:[],agents:[],jobs:[],changes:{branch:"feat/revision",files:1}});
 h.dispose();
});

test("T11: clic en cabecera pliega la sección real sin abrir una ventana ni ejecutar tareas",()=>{
 const f=host();let calls=0;let focus:unknown={handleInput(){},render(){return[];},invalidate(){}};
 const editor=focus;
 (f.ui as any).getFocusedComponent=()=>focus;
 (f.ui as any).setFocus=(component:unknown)=>{focus=component;};
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>{calls++;return snapshot;});
 const outer=(f.root[NODE] as ()=>any)().entries[1].component;
 const content=outer[NODE]().component;
 const rows=content.render(48);
 const index=rows.findIndex((s:string)=>s.includes("CHANGES"));
 assert.ok(index>0);
 assert.equal(content.handleMouse({type:"press",button:"right",y:index} as any),undefined);
 assert.equal(content.handleMouse({type:"press",button:"left",y:-1} as any),undefined);
 assert.equal(focus,editor,"eventos ajenos no roban el foco");
 const click=content.handleMouse({type:"press",button:"left",y:index} as any);
 assert.deepEqual(click,{handled:true,focus:true});
 if(click.focus)(f.ui as any).setFocus(content);
 assert.equal(h.selectedSection(),"CHANGES");
 assert.deepEqual(h.collapsedSections(),["CHANGES"]);
 assert.ok(content.render(48).some((row:string)=>row.includes("▸ CHANGES")));
 assert.equal(focus,content);
 assert.ok(calls>=1);
 content.handleInput(" ");
 assert.deepEqual(h.collapsedSections(),[]);
 assert.ok(content.render(48).some((row:string)=>row.includes("▾ CHANGES")));
 content.handleInput("\u001b");
 assert.equal(focus,editor,"Escape devuelve el foco original");
 assert.equal(h.selectedSection(),"CHANGES");
 h.dispose();
});
test("T11: teclado Tab/j/k, Enter y q solo cambian selección o plegado",()=>{
 const f=host();let focus:unknown={};const editor=focus;
 (f.ui as any).getFocusedComponent=()=>focus;
 (f.ui as any).setFocus=(node:unknown)=>{focus=node;};
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot);
 const view=(f.root[NODE] as ()=>any)().entries[1].component;
 const content=view[NODE]().component;
 const rows=content.render(50);
 const heading=rows.findIndex((row:string)=>row.includes("TODOS"));
 const result=content.handleMouse({type:"press",button:"left",y:heading} as any);
 if(result?.focus)(f.ui as any).setFocus(content);
 assert.equal(h.selectedSection(),"TODOS");
 content.handleInput("\t");assert.equal(h.selectedSection(),"JOBS");
 content.handleInput("j");assert.equal(h.selectedSection(),"AGENTS");
 content.handleInput("k");assert.equal(h.selectedSection(),"JOBS");
 content.handleInput("\r");assert.deepEqual(h.collapsedSections(),["TODOS","JOBS"]);
 content.handleInput("x");assert.deepEqual(h.collapsedSections(),["TODOS","JOBS"],"tecla desconocida no ejecuta acciones");
 content.handleInput("q");assert.equal(focus,editor);
 h.dispose();
});
test("T11: al ocultar el lateral, cambiar de modo o cerrar se devuelve el foco",()=>{
 for(const reason of ["hidden","regular","dispose"] as const){
  const f=host();let focus:unknown={};const editor=focus;
  let position:"auto"|"hidden"="auto";
  (f.ui as any).getFocusedComponent=()=>focus;
  (f.ui as any).setFocus=(node:unknown)=>{focus=node;};
  const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot,()=>"neutral",()=>position);
  const content=(f.root[NODE] as ()=>any)().entries[1].component[NODE]().component;
  const index=content.render(48).findIndex((row:string)=>row.includes("AGENTS"));
  const event=content.handleMouse({type:"press",button:"left",y:index} as any);
  if(event?.focus)(f.ui as any).setFocus(content);
  assert.equal(focus,content);
  if(reason==="hidden"){position="hidden";h.refresh();}
  if(reason==="regular"){(f.ui as any).mode="regular";(f.root[NODE] as ()=>any)();}
  if(reason==="dispose")h.dispose();
  assert.equal(focus,editor,reason+" no debe dejar foco sobre el componente retirado");
  h.dispose();
  assert.equal(f.root[NODE],f.original);
 }
});

test("T11 respeta las teclas de navegación redefinidas por el usuario",()=>{
 const f=host();let focus:unknown={};const editor=focus;
 (f.ui as any).getFocusedComponent=()=>focus;
 (f.ui as any).setFocus=(node:unknown)=>{focus=node;};
 const bindings=new KeybindingsManager(TUI_KEYBINDINGS,{
  "tui.select.down":"ctrl+n","tui.select.up":"ctrl+p",
  "tui.input.tab":"ctrl+t","tui.select.cancel":"ctrl+x","tui.select.confirm":"ctrl+f",
 });
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot,undefined,undefined,undefined,bindings);
 const content=(f.root[NODE] as ()=>any)().entries[1].component[NODE]().component;
 const title=content.render(48).findIndex((line:string)=>line.includes("TODOS"));
 const event=content.handleMouse({type:"press",button:"left",y:title} as any);
 if(event?.focus)(f.ui as any).setFocus(content);
 content.handleInput("\t");assert.equal(h.selectedSection(),"TODOS","Tab asignado a otra acción no mueve selección");
 content.handleInput("\u0014");assert.equal(h.selectedSection(),"JOBS","Ctrl+T del usuario avanza");
 content.handleInput("\u000e");assert.equal(h.selectedSection(),"AGENTS","Ctrl+N del usuario baja");
 content.handleInput("\u0010");assert.equal(h.selectedSection(),"JOBS","Ctrl+P del usuario sube");
 content.handleInput("\r");assert.deepEqual(h.collapsedSections(),["TODOS"],"Enter sustituido no pliega");
 content.handleInput("\u0006");assert.deepEqual(h.collapsedSections(),["TODOS","JOBS"],"Ctrl+F pliega");
 content.handleInput("\u001b");assert.equal(focus,content,"Escape reemplazado no abandona el lateral");
 content.handleInput("\u0018");assert.equal(focus,editor,"Ctrl+X devuelve el foco");
 h.dispose();
});
test("T11 scroll mantiene visible la sección seleccionada sin desplazar la conversación",()=>{
 const f=host();let focus:unknown={};(f.ui as any).getFocusedComponent=()=>focus;
 (f.ui as any).setFocus=(component:unknown)=>{focus=component;};
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot);
 const outer=(f.root[NODE] as ()=>any)().entries[1].component;
 const content=outer[NODE]().component;
 const rows=content.render(48);
 const title=rows.findIndex((line:string)=>line.includes("TODOS"));
 const ev=content.handleMouse({type:"press",button:"left",y:title} as any);
 if(ev?.focus)(f.ui as any).setFocus(content);
 // La altura real la proporciona el árbol de Pi. El scroll secundario es independiente.
 outer.updateLayout(content.render(48).length,2,()=>{});
 const previous=outer.scrollTop;
 content.handleInput("\t");
 assert.equal(h.selectedSection(),"JOBS");
 assert.ok(outer.scrollTop>previous,"se muestra la cabecera seleccionada fuera de las 2 filas");
 h.dispose();
});
test("T11 no devuelve foco a un editor de un host que cambió",()=>{
 const f=host();let focus:unknown={};const editor=focus;
 (f.ui as any).getFocusedComponent=()=>focus;
 (f.ui as any).setFocus=(component:unknown)=>{focus=component;};
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot);
 const content=(f.root[NODE] as ()=>any)().entries[1].component[NODE]().component;
 const y=content.render(48).findIndex((line:string)=>line.includes("TODOS"));
 const event=content.handleMouse({type:"press",button:"left",y} as any);
 if(event?.focus)(f.ui as any).setFocus(content);
 const replacement:Record<symbol,unknown>={[NODE]:()=>({type:"vstack",entries:[]})};
 (f.ui as any).layoutRoot=replacement;
 h.sync();
 assert.equal(focus,null,"al cambiar de propietario no reactivar el editor antiguo");
 assert.notEqual(focus,editor);
 h.dispose();
});
test("T11 no acepta teclas tras perder foco por otro componente",()=>{
 const f=host();let focus:unknown={};(f.ui as any).getFocusedComponent=()=>focus;
 (f.ui as any).setFocus=(next:unknown)=>{focus=next;};
 const h=installAsenNativeRail(f.ui,fakeTheme,()=>snapshot);
 const content=(f.root[NODE] as ()=>any)().entries[1].component[NODE]().component;
 const y=content.render(48).findIndex((line:string)=>line.includes("TODOS"));
 const event=content.handleMouse({type:"press",button:"left",y} as any);
 if(event?.focus)(f.ui as any).setFocus(content);
 focus={}; // El editor recupera el foco directamente desde Pi.
 content.handleInput("j");assert.equal(h.selectedSection(),"TODOS");
 assert.equal(h.collapsedSections().length,1);
 h.dispose();
});

test("T11 superficie: tintado rellena el lateral real y transparente mantiene su salida",()=>{
 const f=host(180);let surface:"transparent"|"tinted"="transparent";
 const theme={
  fg(_role:string,text:string){return text;},
  bold(text:string){return text;},
  bg(_role:string,text:string){return "\u001b[48;5;238m"+text+"\u001b[0m";}
 } as never;
 const h=installAsenNativeRail(f.ui,theme,()=>snapshot,undefined,undefined,undefined,undefined,()=>surface);
 const scroll=(f.root[NODE] as ()=>any)().entries[1].component;
 const content=scroll[NODE]().component;
 const transparent=content.render(50);
 assert.ok(transparent.some((row:string)=>row.includes("TODOS")));
 assert.ok(transparent.every((row:string)=>!row.includes("\u001b[48;5;238m")));
 surface="tinted";h.refresh();
 const tinted=content.render(50);
 assert.equal(tinted.length,transparent.length);
 assert.ok(tinted.every((row:string)=>row.includes("\u001b[48;5;238m")));
 assert.ok(tinted.every((row:string)=>visibleWidth(row)===50));
 assert.deepEqual(tinted.map((row:string)=>row.replace(/\u001b\[[0-9;]*m/gu,"").trimEnd()),
  transparent.map((row:string)=>row.trimEnd()));
 h.dispose();
});
