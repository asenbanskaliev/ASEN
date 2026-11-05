import test from "node:test";
import assert from "node:assert/strict";
import {createNativeWorkPanel} from "../src/runtime/native-work-panel.js";
import {ASEN_PANEL_SECTIONS,type AsenPanelSnapshot} from "../src/runtime/ide-panel.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {KeybindingsManager,TUI_KEYBINDINGS} from "@earendil-works/pi-tui";

const snapshot={todos:[],agents:[],jobs:[],changes:{branch:"main",files:0},profile:"free",permission:"normal"} satisfies AsenPanelSnapshot;
test("M2 native overlay renders six real sections, scrolls and changes section without effects",()=>{
 let redraws=0,closes=0,current=true,rows=10;
 const overlay=createNativeWorkPanel(snapshot,{
  requestRender:()=>redraws++,close:()=>closes++,terminalRows:()=>rows,
  stillCurrent:()=>current,
 });
 const at160=overlay.render(160);
 assert.match(at160.join("\n"),/TODOS/u);
 assert.ok(at160.every(line=>visibleWidth(line)<=160));
 const at139=overlay.render(139);
 assert.ok(at139.every(line=>visibleWidth(line)<=139));
 overlay.handleInput("\t");
 assert.match(overlay.render(80)[0]??"",/JOBS/u);
 overlay.handleInput("\r");
 assert.match(overlay.render(80).join("\n"),/JOBS/u);
 overlay.handleInput("\u007f");
 overlay.handleInput(" ");
 assert.ok(overlay.render(80).some(line=>line.includes("▸")));
 overlay.handleInput("j");
 overlay.handleInput("\u001b[A");
 assert.ok(redraws>=6);
 assert.equal(closes,0);
 current=false;
 assert.match(overlay.render(80)[0]??"",/scope changed/u);
 overlay.handleInput("j");
 assert.equal(closes,1,"stale native overlay must close without agent action");
 overlay.handleInput("q");
 assert.equal(closes,2);
 overlay.invalidate();
 rows=5;
 assert.ok(overlay.render(35).every(line=>visibleWidth(line)<=35));
 assert.equal(ASEN_PANEL_SECTIONS.length,6);
});

test("panel honors injected host navigation bindings and disabled defaults",()=>{
 const keys=new KeybindingsManager(TUI_KEYBINDINGS,{
  "tui.select.down":"ctrl+n","tui.select.up":"ctrl+p",
  "tui.input.tab":"ctrl+t","tui.select.confirm":"ctrl+f",
  "tui.select.cancel":"ctrl+x","tui.editor.deleteCharBackward":"ctrl+b",
 });
 let redraws=0,closes=0,current=true;
 const before=structuredClone(snapshot);
 const panel=createNativeWorkPanel(snapshot,{
  keybindings:keys,requestRender:()=>redraws++,close:()=>closes++,
  terminalRows:()=>8,stillCurrent:()=>current,
 });
 const initial=panel.render(80);
 panel.handleInput("\u000e");
 assert.notDeepEqual(panel.render(80),initial,"configured down must scroll");
 panel.handleInput("\u0010");
 assert.deepEqual(panel.render(80),initial,"configured up must restore viewport");
 panel.handleInput("\u0014");
 assert.match(panel.render(80)[0]!,/JOBS/u);
 panel.handleInput("\u0006");
 assert.doesNotMatch(panel.render(80).join("\n"),/TODOS/u,"configured confirm opens detail");
 panel.handleInput("\u0002");
 assert.match(panel.render(80).join("\n"),/TODOS/u,"configured back restores all sections");
 const rendersBefore=redraws;
 for(const replaced of ["\u001b[B","\u001b[A","\t","\r","\u007f","\u001b"] )panel.handleInput(replaced);
 assert.equal(redraws,rendersBefore,"reassigned host defaults must not remain active");
 assert.equal(closes,0);
 panel.handleInput(" ");
 panel.handleInput("j");panel.handleInput("k");
 assert.equal(redraws,rendersBefore+3,"panel-local fold and scroll aliases remain available");
 panel.handleInput("\u0018");assert.equal(closes,1);
 current=false;panel.handleInput("\u0014");
 assert.equal(closes,2,"scope rejection precedes configured navigation");
 assert.deepEqual(snapshot,before,"navigation must not mutate projection data");
 const disabled=createNativeWorkPanel(snapshot,{
  keybindings:new KeybindingsManager(TUI_KEYBINDINGS,{"tui.select.cancel":[]}),
  requestRender(){},close:()=>closes++,terminalRows:()=>20,
 });
 disabled.handleInput("\u001b");assert.equal(closes,2);
 disabled.handleInput("q");assert.equal(closes,3,"q remains the panel-local close alias");
});
