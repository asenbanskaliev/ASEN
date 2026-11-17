import test from "node:test";
import assert from "node:assert/strict";
import {createNativeWorkPanel} from "../src/runtime/ui/native-work-panel.js";
import {ASEN_PANEL_SECTIONS,renderAsenPanel,type AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {KeybindingsManager,TUI_KEYBINDINGS} from "@earendil-works/pi-tui";
import {inspectIntegrationProfiles} from "../src/runtime/ui/integration-profile-inspection.js";
import {projectParallelAgentFlow} from "../src/runtime/ui/agent-flow-overview.js";

const snapshot={todos:[],agents:[],jobs:[],changes:{branch:"main",files:0},profile:"free",permission:"normal"} satisfies AsenPanelSnapshot;
test("sheet overview collapses empty bodies and bounds inventory without losing observed detail",()=>{
 const integrationInspection=inspectIntegrationProfiles({
  getCommands:()=>Array.from({length:32},(_,i)=>({name:`command-${i}`,source:"extension"})),
  getAllTools:()=>[],
 });
 const data={...snapshot,todosObserved:true,integrationInspection};
 const before=structuredClone(data);
 const panel=createNativeWorkPanel(data,{requestRender(){},close(){},terminalRows:()=>200});
 const overview=panel.render(120).join("\n");
 assert.match(overview,/No work in this session/u);
 for(const repeated of [/No tasks/u,/No owned jobs/u,/No agents/u,/command-31/u])assert.doesNotMatch(overview,repeated);
 assert.match(overview,/Commands: reported.*limited|Commands: reported/u);
 assert.match(overview,/Tools: empty/u);
 assert.match(overview,/connection: unknown/u);
 assert.match(overview,/no pending results/u);
 for(let i=0;i<5;i++)panel.handleInput("\t");
 panel.handleInput("\r");
 const detail=panel.render(120).join("\n");
 assert.match(detail,/command-31 · configured · extension · connection unknown/u);
 assert.match(detail,/Agent profile: unavailable/u);
 panel.handleInput("\u007f");
 assert.doesNotMatch(panel.render(120).join("\n"),/command-31/u);
 assert.deepEqual(data,before);
 const folded=createNativeWorkPanel(data,{requestRender(){},close(){},terminalRows:()=>100});
 folded.handleInput("\t");folded.handleInput("\t");folded.handleInput(" ");
 assert.equal((folded.render(120).join("\n").match(/No work in this session/gu)??[]).length,1);
 const unknown=createNativeWorkPanel({todos:[],agents:[],jobs:[]},{requestRender(){},close(){},terminalRows:()=>100});
 assert.match(unknown.render(120).join("\n"),/unavailable/u);
 assert.match(unknown.render(120).join("\n"),/unverified/u);
});
test("sheet fits live overlay height with pinned title and persistent scroll position indicator",()=>{
 let height=7,calls=0;
 const panel=createNativeWorkPanel(snapshot,{requestRender(){},close(){},terminalRows:()=>50,availableRows:()=>{calls++;return height;}});
 for(const width of [12,35,80,139,160]){
  const lines=panel.render(width);
  assert.ok(lines.length<=height);
  assert.match(lines[0]!,/Panel/u);
  assert.match(lines.at(-1)!,/↓|more/u);
  assert.ok(lines.every(line=>visibleWidth(line)<=width));
 }
 for(let i=0;i<100;i++)panel.handleInput("j");
 assert.match(panel.render(80).at(-1)!,/↑/u,"indicator remains at bottom");
 for(const value of [1,2,3,0,NaN]){
  height=value;
  const lines=panel.render(80);
  assert.ok(lines.length<=Math.max(1,Number.isFinite(value)?value:1));
  assert.match(lines.join("\n"),/q close/u);
 }
 assert.equal(calls,11,"height getter is read once per render, not polled");
 const fallback=createNativeWorkPanel(snapshot,{requestRender(){},close(){},terminalRows:()=>10});
 assert.ok(fallback.render(80).length<=9);
});
test("theme adapter styles sanitized fitted rows with a visible focus marker and muted unknowns",()=>{
 const calls:{kind:string;role:string;text:string}[]=[];
 const theme={
  fg(role:string,text:string){calls.push({kind:"fg",role,text});return text;},
  bg(role:string,text:string){calls.push({kind:"bg",role,text});return text;},
  bold(text:string){calls.push({kind:"bold",role:"",text});return text;},
 };
 const data={...snapshot,profile:"界e\u0301\u001b[31m injected"};
 const panel=createNativeWorkPanel(data,{theme,requestRender(){},close(){},terminalRows:()=>100});
 const plain=panel.render(80);
 assert.match(plain.join("\n"),/> ▾ TODOS/u);
 assert.ok(calls.some(c=>c.role==="accent"&&c.text.includes("TODOS")));
 assert.ok(calls.some(c=>c.role==="muted"&&c.text.includes("unknown")));
 assert.equal(calls.filter(c=>c.kind==="bg"&&c.role==="customMessageBg").length,plain.length);
 assert.ok(calls.every(c=>!c.text.includes("\u001b")&&visibleWidth(c.text)<=80));
 panel.handleInput("\t");
 assert.match(panel.render(80).join("\n"),/> ▾ JOBS/u);
 panel.handleInput(" ");
 assert.match(panel.render(80).join("\n"),/> ▸ JOBS/u);
});
test("theme output is retained after fitting and live height overrides terminal rows without effects",()=>{
 let height=3,redraws=0,closes=0;
 const theme={fg(_role:string,text:string){return `[fg]${text}[/fg]`;},bg(_role:string,text:string){return `[bg]${text}[/bg]`;},bold(text:string){return `[bold]${text}[/bold]`;}};
 const panel=createNativeWorkPanel(snapshot,{theme,availableRows:()=>height,terminalRows:()=>{throw new Error("must not read fallback");},requestRender(){redraws++;},close(){closes++;}});
 const rows=panel.render(40);
 assert.equal(rows.length,3);
 assert.match(rows[0]!,/^\[bg\]\[fg\]\[bold\]Panel/u);
 assert.match(rows[0]!,/\[\/bold\]\[\/fg\]\[\/bg\]$/u);
 height=1;panel.render(40);
 for(const key of ["j","k","\t"," ","\r","\u007f"])panel.handleInput(key);
 assert.equal(redraws,0,"unavailable short-height navigation is inert");
 panel.handleInput("q");assert.equal(closes,1);
 height=20;
 for(const width of [0,NaN,Infinity])assert.equal(panel.render(width).length,1);
 assert.equal(redraws,0,"render never requests another frame");
});

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

test("CHANGES Enter requests the host viewer without running Git inside the panel",()=>{
 let opened=0,closed=0,current=true;
 const p=createNativeWorkPanel({...snapshot,changes:{branch:"feature",files:2}},{
  requestRender(){},close(){closed++;},openChanges(){opened++;},terminalRows:()=>30,
  stillCurrent:()=>current,
 });
 for(let index=0;index<3;index++)p.handleInput("\t");
 assert.match(p.render(100)[0]!,/CHANGES/u);
 p.handleInput("\r");p.handleInput("\r");p.handleInput("q");
 assert.equal(opened,1);assert.equal(closed,0,"activation is single-use; host owns modal dismissal and Git action");
 const q=createNativeWorkPanel(snapshot,{requestRender(){},close(){closed++;},openChanges(){opened++;},terminalRows:()=>30,stillCurrent:()=>current});
 for(let index=0;index<3;index++)q.handleInput("\t");
 q.handleInput("q");assert.equal(opened,1,"cancel does not activate viewer");
 current=false;q.handleInput("\r");
 assert.equal(opened,1,"stale panel cannot activate viewer");assert.equal(closed,1,"el cierre no puede repetirse");
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
 assert.equal(closes,1,"el modal ya cerrado no debe volver a cerrarse");
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
  assert.match(lines[0]!,/Panel/u);
  assert.ok(lines.every(line=>visibleWidth(line)<=width),`full panel fits ${width}`);
  assert.match(lines.join("\n"),/TODOS/u,"stacked section remains discoverable");
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
  panel.handleInput("j");assert.equal(closes,1,"un cierre anterior invalida nuevas entradas");
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
 assert.equal(closes,1,"la sesión cerrada no acepta nuevas entradas");
 assert.deepEqual(snapshot,before,"navigation must not mutate projection data");
 const disabled=createNativeWorkPanel(snapshot,{
  keybindings:new KeybindingsManager(TUI_KEYBINDINGS,{"tui.select.cancel":[]}),
  requestRender(){},close:()=>closes++,terminalRows:()=>20,
 });
 disabled.handleInput("\u001b");assert.equal(closes,1);
 disabled.handleInput("q");assert.equal(closes,2,"q remains the panel-local close alias");
});


test("native panel mouse clicks target only actually rendered headings after scroll and folding",()=>{
 let renders=0;
 const panel=createNativeWorkPanel(snapshot,{
  requestRender(){renders++;},close(){},terminalRows:()=>30
 });
 const overview=panel.render(110);
 const heading=overview.findIndex((line,index)=>index>0&&/▾ CHANGES/u.test(line));
 assert.ok(heading>0,"CHANGES heading must appear in rendered rows");
 assert.equal(panel.handleMouse({type:"press",button:"left",x:1,y:0} as any),undefined,
  "title is not an interactive section heading");
 assert.equal(panel.handleMouse({type:"press",button:"left",x:1,y:heading} as any)?.handled,true);
 assert.match(panel.render(110).join("\n"),/▸ CHANGES/u,"clicked CHANGES folds, not a different section");
 assert.equal(panel.handleMouse({type:"press",button:"right",x:1,y:heading} as any),undefined);
 assert.equal(panel.handleMouse({type:"press",button:"left",x:1,y:100} as any),undefined);
 assert.equal(renders,1);
 const tiny=createNativeWorkPanel(snapshot,{requestRender(){renders++;},close(){},terminalRows:()=>2});
 assert.equal(tiny.render(110).length,1);
 assert.equal(tiny.handleMouse({type:"press",button:"left",x:0,y:1} as any),undefined,
  "close-only overlay has no clickable sections");
});

test("T07 native overlay exposes linked Worker flow without a parent Agent or Todo",()=>{
 const overview=projectParallelAgentFlow([{
  batchId:"linked",state:"prepared",tasks:[
   {sourceTodoId:"work-a",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
    changes:{status:"scoped-changes",changedPaths:["work-a.ts"],outOfScopePaths:[],
     sourceVerified:true,headMatchesBase:true,acceptance:"not-accepted",autoMerge:false},
    childSession:{id:"pi-child",agents:[{id:"worker-a",role:"worker",state:"running"}]}},
   {sourceTodoId:"work-b",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:false,
    changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
     sourceVerified:true,headMatchesBase:true,acceptance:"not-accepted",autoMerge:false}}
  ]
 }]);
 const data={...snapshot,agentFlow:{state:"observed" as const,totalRecordedBatches:1,limited:false,overview}};
 const before=structuredClone(data),panel=createNativeWorkPanel(data,{
  requestRender(){},close(){},terminalRows:()=>130
 });
 const rows=panel.render(130);
 assert.match(rows.join("\n"),/Linked source Todos: 2/u);
 assert.match(rows.join("\n"),/TODOS.*2 linked/u);
 assert.match(rows.join("\n"),/AGENTS.*1 child observed/u);
 assert.doesNotMatch(rows.join("\n"),/No work in this session/u);
 assert.match(rows.join("\n"),/Worktree Workers: 1 active observed/u);
 assert.match(rows.join("\n"),/Linked worktrees: 1\/2/u);
 assert.match(rows.join("\n"),/Cross-session ODD: linked/u);
 assert.doesNotMatch(rows.join("\n"),/actual model: (?!unknown)/u);
 for(const width of [12,35,80,130]){
  const output=panel.render(width);
  assert.ok(output.every(row=>visibleWidth(row)<=width));
 }
 assert.deepEqual(data,before);
});

test("T07 actualización automática consulta solo mientras el modal continúa abierto",{timeout:10_000},async t=>{
 let reads=0,paints=0,finish!:()=>void;
 const observed=new Promise<void>(resolve=>{finish=resolve;});
 const pane=createNativeWorkPanel(snapshot,{
  requestRender(){paints++;},close(){},terminalRows:()=>30,
  refresh:async()=>{reads++;return snapshot;},
  onRefreshed:()=>finish(),autoRefreshMs:1000,
 });
 t.after(()=>pane.dispose());
 let watchdog:ReturnType<typeof setTimeout>|undefined;
 try{
  await Promise.race([observed,new Promise<void>((_resolve,reject)=>{
   watchdog=setTimeout(()=>reject(Error("La actualización automática no llegó")),5500);
  })]);
 }finally{if(watchdog)clearTimeout(watchdog);}
 assert.ok(reads>=1);assert.ok(paints>=1);
 pane.dispose();
 const before=reads;
 await new Promise(resolve=>setTimeout(resolve,1200));
 assert.equal(reads,before,"Un modal cerrado no mantiene consultas de hijos");
});

test("T06/T07 ventana abierta actualiza Workers reales observados sin ejecutar ni aceptar cambios",async()=>{
 const running=projectParallelAgentFlow([{batchId:"live-real",state:"prepared",supervisorClaimed:true,tasks:[
  {sourceTodoId:"source-a",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
   changes:{status:"clean",changedPaths:[],outOfScopePaths:[],sourceVerified:true,
    headMatchesBase:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"child-a",agents:[{id:"agent-a",role:"worker",state:"running"}]}},
  {sourceTodoId:"source-b",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
   changes:{status:"clean",changedPaths:[],outOfScopePaths:[],sourceVerified:true,
    headMatchesBase:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"child-b",agents:[{id:"agent-b",role:"worker",state:"queued"}]}}
 ]}]);
 const finished=projectParallelAgentFlow([{batchId:"live-real",state:"prepared",supervisorClaimed:true,tasks:[
  {sourceTodoId:"source-a",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
   changes:{status:"scoped-changes",changedPaths:["a.ts"],outOfScopePaths:[],sourceVerified:true,
    headMatchesBase:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"child-a",agents:[{id:"agent-a",role:"worker",state:"completed"}]}},
  {sourceTodoId:"source-b",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
   changes:{status:"out-of-scope",changedPaths:["fuera.ts"],outOfScopePaths:["fuera.ts"],
    sourceVerified:true,headMatchesBase:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"child-b",agents:[{id:"agent-b",role:"worker",state:"failed"}]}}
 ]}]);
 const observed=(overview:typeof running)=>({...snapshot,agentFlow:{
  state:"observed" as const,totalRecordedBatches:1,limited:false,overview
 }});
 let current=observed(running),calls=0,paints=0,closed=0;
 const pane=createNativeWorkPanel(current,{requestRender(){paints++;},close(){closed++;},
  terminalRows:()=>160,refresh:async()=>{calls++;return current;}});
 assert.match(pane.render(120).join("\n"),/Worktree Workers: 1 active observed/u);
 current=observed(finished);
 await pane.refreshNow();
 const after=pane.render(120).join("\n");
 assert.match(after,/Worktree Workers: 0 active observed/u);
 assert.match(after,/Linked worktrees: 2\/2/u);
 assert.match(after,/blocked/u);
 assert.equal(calls,1);assert.equal(paints,1);
 assert.equal(finished.autoMerge,false);
 assert.equal(finished.acceptance,"not-accepted");
 pane.dispose();
 await pane.refreshNow();
 assert.equal(calls,1,"Cerrar la ventana detiene las lecturas");
 assert.equal(closed,0);
});

test("T07 descarta lecturas tardías y marca como no disponible un registro de hijo ilegible",async()=>{
 const active=projectParallelAgentFlow([{batchId:"batch",state:"prepared",tasks:[
  {sourceTodoId:"a",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
   changes:{status:"clean",changedPaths:[],outOfScopePaths:[],sourceVerified:true,
    headMatchesBase:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"child-a",agents:[{id:"agent-a",role:"worker",state:"running"}]}},
  {sourceTodoId:"b",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:false,
   changes:{status:"clean",changedPaths:[],outOfScopePaths:[],sourceVerified:true,
    headMatchesBase:true,acceptance:"not-accepted",autoMerge:false}}
 ]}]);
 const data={...snapshot,agentFlow:{state:"observed" as const,totalRecordedBatches:1,limited:false,overview:active}};
 let releases!: (value:AsenPanelSnapshot)=>void,rendered=0,current=true,closed=0;
 const pane=createNativeWorkPanel(data,{requestRender(){rendered++;},close(){closed++;},
  stillCurrent:()=>current,terminalRows:()=>140,
  refresh:()=>new Promise(resolve=>{releases=resolve;})});
 const pending=pane.refreshNow();
 current=false;releases({...snapshot});
 await pending;
 assert.equal(closed,1,"Un cambio de sesión cierra la ventana");
 assert.equal(rendered,0,"No se presentan datos de otra sesión");
 const failing=createNativeWorkPanel(data,{requestRender(){rendered++;},close(){},
  terminalRows:()=>140,refresh:async()=>{throw Error("datos privados");}});
 await failing.refreshNow();
 const after=failing.render(140).join("\n");
 assert.match(after,/Cross-session ODD: unavailable/u);
 assert.doesNotMatch(after,/Worktree Workers: 1 active observed/u);
 assert.doesNotMatch(after,/datos privados/u);
 failing.dispose();
});

test("T11 ratón y teclado pliegan la misma sección sin lanzar agentes",()=>{
 const options={requestRender(){},close(){},terminalRows:()=>60};
 const keyboard=createNativeWorkPanel(snapshot,options),mouse=createNativeWorkPanel(snapshot,options);
 for(let i=0;i<3;i++)keyboard.handleInput("\t");
 keyboard.handleInput(" ");
 const before=mouse.render(100);
 const y=before.findIndex(line=>/▾ CHANGES/u.test(line));
 assert.ok(y>0);
 assert.equal(mouse.handleMouse({type:"press",button:"left",x:1,y} as any)?.handled,true);
 assert.deepEqual(mouse.render(100),keyboard.render(100));
 mouse.handleInput("q");keyboard.handleInput("q");
});
