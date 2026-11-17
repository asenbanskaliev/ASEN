import test from "node:test";
import assert from "node:assert/strict";
import type {TUI} from "@earendil-works/pi-tui";
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
