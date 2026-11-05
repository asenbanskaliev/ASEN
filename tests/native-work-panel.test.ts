import test from "node:test";
import assert from "node:assert/strict";
import {createNativeWorkPanel} from "../src/runtime/native-work-panel.js";
import {ASEN_PANEL_SECTIONS,type AsenPanelSnapshot} from "../src/runtime/ide-panel.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

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
