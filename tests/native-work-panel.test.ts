import test from "node:test";
import assert from "node:assert/strict";
import {createNativeWorkPanel} from "../src/runtime/native-work-panel.js";
import {ASEN_PANEL_SECTIONS,renderAsenPanel,type AsenPanelSnapshot} from "../src/runtime/ide-panel.js";
import {truncateForTerminal,visibleWidth} from "../src/runtime/responsive-layout.js";
import {KeybindingsManager,TUI_KEYBINDINGS} from "@earendil-works/pi-tui";

const snapshot={todos:[],agents:[],jobs:[],changes:{branch:"main",files:0},profile:"free",permission:"normal"} satisfies AsenPanelSnapshot;
test("REVIEW derives only stored Todo states that actually await review",()=>{
 const todos=["succeeded","blocked","done","running"].map((state,index)=>({taskId:`todo-${index}`,title:`Todo ${index}`,events:[],current:{state,taskId:`todo-${index}`}})) as any;
 const output=renderAsenPanel({...snapshot,todos,todosObserved:true},120).join("\n");
 assert.match(output,/REVIEW · 1 needs review/u);
 assert.match(output,/Results awaiting review · 1/u);
 assert.match(renderAsenPanel({...snapshot,todos},120).join("\n"),/REVIEW · unverified/u);
 assert.match(renderAsenPanel({...snapshot,todosObserved:true},120).join("\n"),/REVIEW · no pending results/u);
 assert.match(renderAsenPanel({...snapshot,review:{pending:2}},120).join("\n"),/REVIEW · 2 needs review/u);
});
test("detail mode expands session lists to 100 while the overview keeps its compact limits",()=>{
 const todos=Array.from({length:101},(_,index)=>({taskId:`todo-${index}`,title:`Todo ${index}`,events:[],current:{state:"planned",taskId:`todo-${index}`}})) as any;
 const agents=Array.from({length:101},(_,index)=>({id:`agent-${index}`,role:"explorer",state:"queued",updatedAt:`2026-01-01T00:00:${String(index%60).padStart(2,"0")}Z`})) as any;
 const panel=createNativeWorkPanel({...snapshot,todos,agents},{requestRender(){},close(){},terminalRows:()=>400});
 const overview=panel.render(200).join("\n");
 assert.match(overview,/… 89 more/u,"overview retains the twelve-Todo summary cap");
 panel.handleInput("\r");
 const detail=panel.render(200).join("\n");
 assert.match(detail,/Todo 99/u);assert.doesNotMatch(detail,/Todo 100/u);
 panel.handleInput("\u007f");panel.handleInput("\t");panel.handleInput("\t");
 panel.handleInput("\r");
 const agentDetail=panel.render(200).join("\n");
 assert.match(agentDetail,/… 1 more/u,"detail is bounded at one hundred agents");
});
test("REVIEW counts the exact acceptance block but excludes technical and near-match blocks",()=>{
 const reason="Linked review result requires explicit user acceptance";
 const todos=[
  {state:"succeeded"},
  {state:"blocked",reason},
  {state:"blocked",reason:"Agent launch was interrupted before dispatch"},
  {state:"blocked",reason:reason+" later"},
  {state:"done",reason},
 ].map((current,index)=>({taskId:`review-${index}`,title:`Review ${index}`,events:[],current:{...current,taskId:`review-${index}`}})) as any;
 const before=structuredClone(todos);
 const output=renderAsenPanel({...snapshot,todos,todosObserved:true},160).join("\n");
 assert.match(output,/REVIEW · 2 needs review/u);
 assert.match(output,/Results awaiting review · 2/u);
 assert.match(output,/2 stored Todo results awaiting review/u);
 assert.deepEqual(todos,before,"review projection never acknowledges or accepts a result");
});
test("JOBS detail retains exactly one hundred entries and compact overview only eight",()=>{
 const jobs=Array.from({length:101},(_,index)=>({
  id:`job-${String(index).padStart(3,"0")}`,sessionId:"session-a",projectId:"/project-a",
  command:"fixture",mode:"background" as const,state:"queued" as const,
  createdAt:"2026-11-08T00:00:00.000Z",updatedAt:new Date(Date.UTC(2026,10,8,0,0,index)).toISOString(),
  exitCode:null,eventCount:0,tail:[],
 }));
 const before=structuredClone(jobs);
 const panel=createNativeWorkPanel({...snapshot,jobs},{requestRender(){},close(){},terminalRows:()=>400});
 const overview=panel.render(200).join("\n");
 assert.match(overview,/… 93 more/u);
 assert.equal((overview.match(/job-\d{3}/gu)??[]).length,8);
 panel.handleInput("\t");panel.handleInput("\r");
 const detail=panel.render(200).join("\n");
 assert.match(detail,/… 1 more/u);
 assert.equal((detail.match(/job-\d{3}/gu)??[]).length,100);
 assert.match(detail,/job-100/u);assert.match(detail,/job-001/u);
 assert.doesNotMatch(detail,/job-000/u,"oldest item is outside the bounded detail");
 assert.deepEqual(jobs,before,"detail navigation cannot reorder or mutate owned jobs");
});
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

test("native panel fits Close-only fallback at every width 1–11 and restores the full panel at 12",()=>{
 const unicode={...snapshot,changes:{branch:"界👩‍👩‍👧‍👦e\u0301",files:1},profile:"🚀界e\u0301"};
 const before=structuredClone(unicode);
 Object.freeze(unicode.changes);Object.freeze(unicode);
 let redraws=0;
 const panel=createNativeWorkPanel(unicode,{
  requestRender:()=>redraws++,close(){},terminalRows:()=>200,
 });
 for(let width=1;width<12;width++){
  assert.deepEqual(panel.render(width),[width<5?"q":"Close"],`Close affordance at ${width}`);
  assert.ok(panel.render(width).every(line=>visibleWidth(line)<=width));
  for(const hidden of ["j","k","\u001b[B","\u001b[A","\t"," ","\r","\n","\u007f","\b"])panel.handleInput(hidden);
 }
 assert.equal(redraws,0,"hidden navigation, folding and detail controls are inert");
 for(const width of [12,13,14,139,140]){
  const lines=panel.render(width);
  assert.equal(lines[0],truncateForTerminal("✿ ASEN PANEL · TODOS · j/k sections · Enter detail · Space fold · Esc close",width));
  assert.ok(lines.every(line=>visibleWidth(line)<=width),`full panel fits ${width}`);
  const content=renderAsenPanel(unicode,Math.max(12,width-2));
  assert.deepEqual(lines.slice(1,-1),content.map(line=>truncateForTerminal(" "+line,width)),"unchanged full-panel projection and Unicode fitting");
 }
 panel.handleInput("\t");
 assert.match(panel.render(80)[0]!,/JOBS/u,"navigation resumes after growing");
 panel.handleInput("\r");
 const detail=panel.render(80);
 panel.render(5);panel.handleInput("\u007f");panel.handleInput(" ");panel.handleInput("j");
 assert.deepEqual(panel.render(80),detail,"shrinking does not mutate existing detail/scroll/fold state");
 assert.deepEqual(unicode,before,"fallback and full-panel rendering preserve the snapshot");
});

test("Close-only fallback retains local close, host cancel and stale-scope rejection",()=>{
 for(const width of [1,5,11]){
  for(const closeKey of ["q","\u001b","\u0003"]){
   let closes=0;
   const panel=createNativeWorkPanel(snapshot,{requestRender(){},close:()=>closes++,terminalRows:()=>8});
   panel.render(width);panel.handleInput(closeKey);
   assert.equal(closes,1,`close ${JSON.stringify(closeKey)} at ${width}`);
  }
  let closes=0,redraws=0,current=true;
  const panel=createNativeWorkPanel(snapshot,{
   keybindings:new KeybindingsManager(TUI_KEYBINDINGS,{
    "tui.select.down":"ctrl+n","tui.input.tab":"ctrl+t","tui.select.confirm":"ctrl+f","tui.select.cancel":"ctrl+x",
   }),
   requestRender:()=>redraws++,close:()=>closes++,terminalRows:()=>8,stillCurrent:()=>current,
  });
  panel.render(width);
  for(const hidden of ["\u000e","\u0014","\u0006"," ","j","k","\u001b"])panel.handleInput(hidden);
  assert.equal(redraws,0,"configured hidden controls remain inert");
  assert.equal(closes,0,"replaced Escape binding stays disabled");
  panel.handleInput("\u0018");assert.equal(closes,1,"configured cancel remains enabled");
  current=false;
  assert.ok(panel.render(width).every(line=>visibleWidth(line)<=width),"stale message fits actual width");
  panel.handleInput("j");assert.equal(closes,2,"stale scope closes before hidden control rejection");
 }
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
