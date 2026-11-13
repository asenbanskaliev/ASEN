import {test} from "node:test";
import assert from "node:assert/strict";
import {createNativeCommandPalette,type NativeCommandPaletteControls} from "../src/runtime/native-command-palette.js";
import type {RegisteredCommand} from "../src/runtime/command-palette.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import type {TuiMouseEvent} from "@earendil-works/pi-tui";
const entry=(label:string,group="Work",name=label,description=""):Readonly<RegisteredCommand>=>Object.freeze({label,group,name,description,implemented:true});
const entries=Object.freeze([entry("Alpha"),entry("Beta"),entry("Gamma","Inspect")]);
const strip=(s:string)=>s.replace(/\x1b\[[0-9;]*m/gu,"");
function fixture(rows:readonly Readonly<RegisteredCommand>[]=entries,extra:Partial<NativeCommandPaletteControls>={}){
 const results:(string|undefined)[]=[];let renders=0,height=12,current=true;
 const palette=createNativeCommandPalette(rows,{availableRows:()=>height,requestRender:()=>renders++,complete:value=>results.push(value),stillCurrent:()=>current,...extra});
 return {palette,results,text:(width=70)=>palette.render(width).map(strip),input:(s:string)=>palette.handleInput(s),height:(n:number)=>height=n,stale:()=>current=false,renders:()=>renders};
}
const focus=(f:ReturnType<typeof fixture>)=>f.text().find(s=>s.startsWith("> "));
const mouse=(f:ReturnType<typeof fixture>,extra:Partial<TuiMouseEvent>={})=>f.palette.handleMouse({type:"click",button:"left",x:3,y:3,screenX:53,screenY:33,width:70,height:8,shift:false,alt:false,ctrl:false,...extra});
test("headings are separate, commands alone selectable; arrows and Ctrl J/K do not wrap",()=>{
 const f=fixture();assert.deepEqual(f.text().slice(0,7),["Commands","› Search","Work","> Alpha","  Beta","Inspect","  Gamma"]);
 f.input("\x1b[A");assert.equal(focus(f),"> Alpha");
 f.input("\n");assert.equal(focus(f),"> Beta");assert.deepEqual(f.results,[]);
 f.input("\x1b[B");f.input("\x1b[B");assert.equal(focus(f),"> Gamma");
 f.input("\x0b");assert.equal(focus(f),"> Beta");
 f.input("\r");f.input("\r");f.input("\x03");assert.deepEqual(f.results,["Beta"]);
});
test("trimmed case-insensitive ranks are stable within groups, never reorder groups",()=>{
 const f=fixture([entry("xxab"),entry("a-b"),entry("AB first"),entry("ab second"),entry("other","Work","cab"),entry("last","Work","z","about"),entry("AB inspect","Inspect"),entry("hidden","Empty")]);
 for(const c of " aB ")f.input(c);
 assert.deepEqual(f.text().slice(2,-1),["Work","> AB first","  ab second","  xxab","  a-b","  other","  last","Inspect","  AB inspect"]);
 f.input("\x1b[B");f.input("\x7f");assert.equal(focus(f),"> AB first");
 f.input("\x15");assert.equal(focus(f),"> xxab");assert.match(f.text()[1]!,/Search/u);
});
test("no matches has no hidden confirmation; Backspace and Ctrl U reset selection",()=>{
 const f=fixture();f.input("\x1b[B");f.input("z");assert.match(f.text().join("\n"),/No commands match/u);
 f.input("\r");assert.deepEqual(f.results,[]);f.input("\x7f");assert.equal(focus(f),"> Alpha");
 f.input("B");assert.equal(focus(f),"> Beta");f.input("\x15");assert.equal(focus(f),"> Alpha");
});
test("cancel completes exactly once; empty snapshot cannot select",()=>{
 for(const key of ["\x1b","\x03"]){const f=fixture();f.input(key);f.input("\r");f.input(key);assert.deepEqual(f.results,[undefined]);}
 const f=fixture([]);f.text();f.input("\r");assert.deepEqual(f.results,[]);
});
test("restricted BMP input ignores paste, astral, Tab, mouse and unsafe format/control data",()=>{
 const f=fixture();for(const s of ["Beta","😀","\t","\x1b[<0;4;5M","\x1b[M !!","\x1b[200~Beta\x1b[201~","\u0085","\ud800","\u202e"])f.input(s);
 assert.equal(f.text()[1],"› Search");f.input("B");assert.equal(focus(f),"> Beta");
});
test("live geometry is bounded; viewport follows focus, no confirmation without visible command",()=>{
 const f=fixture(Array.from({length:12},(_,i)=>entry(`Item ${i}`,`Group ${Math.floor(i/3)}`)));
 f.height(7);for(let i=0;i<11;i++)f.input("\x1b[B");
 const screen=f.text();assert.ok(screen.length<=7);assert.ok(screen.includes("> Item 11"));assert.match(screen.join("\n"),/↑.*more/u);
 f.height(1);f.text();f.input("\r");assert.deepEqual(f.results,[]);
 f.height(12);f.text(2);f.input("\r");assert.deepEqual(f.results,[]);
 f.height(12);f.text();f.input("\r");assert.deepEqual(f.results,["Item 11"]);
});
test("Unicode fitting sanitizes before styling and preserves trusted ANSI; invalid dimensions safe",()=>{
 const label="界é👩‍💻\x1b[31m\u202e";
 const f=fixture([entry(label,"\x1b\u202eGroup")],{theme:{fg:(_role,text)=>`\x1b[32m${text}\x1b[0m`,bg:(_role,text)=>`\x1b[40m${text}\x1b[0m`,bold:text=>`\x1b[1m${text}\x1b[0m`}});
 for(const height of [NaN,Infinity,-1,0,1,3,5,9])for(const width of [NaN,Infinity,-1,0,1,2,12,19,80]){
  f.height(height);const lines=f.palette.render(width);const cols=Number.isFinite(width)?Math.max(1,Math.floor(width)):1;
  assert.ok(lines.length<=Math.max(1,Number.isFinite(height)?Math.floor(height):1));
  for(const line of lines){assert.match(line,/\x1b\[32m/u);assert.ok(visibleWidth(strip(line))<=cols);assert.doesNotMatch(strip(line),/[\x00-\x1f\u202e]/u);}
 }
 f.height(12);f.text();f.input("\r");assert.deepEqual(f.results,[label]);
});
test("interaction-local bindings replace defaults including disabling; Ctrl J/K remain reference navigation",()=>{
 const f=fixture(entries,{keybindings:{matches:(data,action)=>data==="!"&&action==="tui.select.down"}});
 f.text();for(const s of ["\x1b[B","\r","\x1b","\x7f","\x15"])f.input(s);
 assert.equal(focus(f),"> Alpha");assert.deepEqual(f.results,[]);
 f.input("!");assert.equal(focus(f),"> Beta");f.input("\n");assert.equal(focus(f),"> Gamma");
 assert.match(f.text().at(-1)!,/host keys/u);
});
test("stale scope rejects commands but permits safe teardown; disposed/completed stay inert and snapshot immutable",()=>{
 const before=JSON.stringify(entries);const f=fixture();f.input("\r");assert.deepEqual(f.results,[]);
 f.text();f.stale();f.input("\r");f.palette.invalidate();assert.deepEqual(f.results,[]);assert.equal(f.renders(),0);
 assert.match(f.text().join(""),/scope changed/u);assert.deepEqual(f.results,[]);
 f.input("\x1b");assert.deepEqual(f.results,[undefined]);
 const disposed=fixture();disposed.text();disposed.palette.dispose();disposed.input("\x1b");disposed.input("A");disposed.palette.invalidate();assert.deepEqual(disposed.results,[]);assert.equal(disposed.renders(),0);
 const done=fixture();done.text();done.input("\r");const n=done.renders();done.input("B");done.palette.invalidate();assert.equal(done.renders(),n);
 assert.equal(JSON.stringify(entries),before);
});
test("mouse owns only painted command rows, uses local not screen origin, press never completes",()=>{
 const f=fixture();assert.equal(mouse(f)?.handled,undefined);f.text();
 for(const y of [0,1,2,5,7])assert.equal(mouse(f,{y})?.handled,undefined);
 for(const x of [-1,70])assert.equal(mouse(f,{x})?.handled,undefined);
 assert.equal(mouse(f,{type:"press",y:4})?.handled,true);assert.deepEqual(f.results,[]);
 assert.equal(mouse(f,{y:4,screenX:900,screenY:800})?.handled,true);
 mouse(f,{y:4});assert.deepEqual(f.results,["Beta"]);
});
test("hover selects and paints; wheel sign moves one without wrap and requires repaint",()=>{
 const f=fixture();f.text();const n=f.renders();
 assert.equal(mouse(f,{type:"move",button:"none",y:4})?.render,true);assert.ok(f.renders()>n);
 assert.deepEqual(f.results,[]);assert.equal(mouse(f)?.handled,undefined);assert.equal(focus(f),"> Beta");
 mouse(f,{type:"wheel",button:"none",y:4,wheelDelta:99});assert.equal(focus(f),"> Gamma");
 mouse(f,{type:"wheel",button:"none",y:6,wheelDelta:99});assert.equal(focus(f),"> Gamma");
 mouse(f,{type:"wheel",button:"none",y:6,wheelDelta:-99});assert.equal(focus(f),"> Beta");
 mouse(f,{type:"wheel",button:"none",y:4,wheelDelta:-99});assert.equal(focus(f),"> Alpha");
 mouse(f,{type:"wheel",button:"none",wheelDelta:-99});assert.equal(focus(f),"> Alpha");
});
test("mouse rejects resize, stale budgets/models, key-invalidated frames, scope and disposal",()=>{
 const changes:Array<(f:ReturnType<typeof fixture>)=>void>=[f=>f.height(11),f=>f.input("B"),f=>f.input("\x1b[B"),f=>f.palette.invalidate(),f=>f.stale(),f=>f.palette.dispose()];
 for(const change of changes){
  const f=fixture();f.text();change(f);mouse(f);assert.deepEqual(f.results,[]);
 }
 for(const delta of [{width:69},{height:7}]){const f=fixture();f.text();mouse(f,delta);mouse(f);assert.deepEqual(f.results,[]);}
 const f=fixture();f.height(3);f.text();mouse(f,{height:1});assert.deepEqual(f.results,[]);
});
test("expired scope cancels once without command authority, including custom/default-disabled cancel bindings",()=>{
 for(const cancel of ["\x1b","\x03","!"]){
  const custom=cancel==="!";
  const f=fixture(entries,custom?{keybindings:{matches:(data,action)=>data==="!"&&action==="tui.select.cancel"}}:{});
  f.text();f.stale();
  for(const input of ["B","\x1b[B","\x7f","\x15","\r"])f.input(input);
  f.palette.invalidate();assert.equal(f.renders(),0);assert.deepEqual(f.results,[]);
  assert.match(f.text().join(""),/scope changed/u);assert.deepEqual(f.results,[]);
  if(custom){f.input("\x1b");f.input("\x03");assert.deepEqual(f.results,[]);}
  f.input(cancel);assert.deepEqual(f.results,[undefined]);
  f.input("\r");f.input(cancel);f.palette.dispose();f.input(cancel);f.palette.invalidate();
  assert.deepEqual(f.results,[undefined]);assert.equal(f.renders(),0);
 }
});
