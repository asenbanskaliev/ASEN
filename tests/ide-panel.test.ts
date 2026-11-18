import assert from "node:assert/strict";
import test from "node:test";
import {
 ASEN_PANEL_SECTIONS,renderAsenPanel,renderAsenPanelSection,
 renderAsenWorkRow,renderAsenStatusLine,type AsenPanelSnapshot,
} from "../src/runtime/ui/ide-panel.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {projectHostStatus} from "../src/runtime/ui/host-status-projection.js";
import {inspectIntegrationProfiles} from "../src/runtime/ui/integration-profile-inspection.js";
import {projectParallelAgentFlow} from "../src/runtime/ui/agent-flow-overview.js";
import {renderM1Surface} from "../src/runtime/ui/m1-readonly-rail.js";

type Todo=AsenPanelSnapshot["todos"][number];
type Agent=AsenPanelSnapshot["agents"][number];
type Job=AsenPanelSnapshot["jobs"][number];
const task=(state:string,title="Inspect repository",reason?:string):Todo=>({
 title,current:{state,...(reason?{reason}:{}),sessionId:"s",projectId:"p"},
} as unknown as Todo);
const agent=(state:Agent["state"],role="explorer"):Agent=>({
 id:"agent-123",role,state,sessionId:"s",projectId:"p",
 owner:{kind:"user",id:"u"},createdAt:"2026-11-05T00:00:00Z",
 updatedAt:"2026-11-05T00:00:00Z",
});
const job=(state:Job["state"],command="node test.mjs"):Job=>({
 id:"job-1",sessionId:"s",projectId:"p",state,
 createdAt:"2026-11-05T00:00:00Z",updatedAt:"2026-11-05T00:00:01Z",
 command,mode:"background",exitCode:null,eventCount:0,tail:[],
});
const snapshot=(updates:Partial<AsenPanelSnapshot>={}):AsenPanelSnapshot=>({
 todos:[],agents:[],jobs:[],...updates,
});
test("M1 panel order is stable, every section supports collapse without mutating store",()=>{
 const base=snapshot({
  todos:[task("running")],agents:[agent("running")],
  jobs:[job("running")],changes:{branch:"test-branch",files:2},
  profile:"free-local",permission:"normal",
 });
 const rendered=renderAsenPanel(base,58),titles=rendered.filter(row=>row.startsWith("▾ "));
 assert.deepEqual(titles.map(row=>row.split(" · ")[0]?.slice(2)),[...ASEN_PANEL_SECTIONS]);
 assert.ok(rendered.some(row=>row.includes("Git test-branch")));
 const collapsed=renderAsenPanel(base,58,["AGENTS","JOBS"]);
 assert.ok(collapsed.some(row=>row.startsWith("▸ AGENTS")));
 assert.ok(collapsed.some(row=>row.startsWith("▸ JOBS")));
 assert.ok(!collapsed.some(row=>row.includes("explorer · running")));
 assert.equal(base.agents[0]?.state,"running","Rendering cannot advance agents");
 assert.ok([...rendered,...collapsed].every(row=>visibleWidth(row)<=58));
});
test("M1 TODO map preserves succeeded as awaiting review, blocked reason and cancelled",()=>{
 const rows=renderAsenPanelSection(snapshot({
  todos:[task("planned"),task("succeeded","Risky change","Needs independent verification"),
   task("blocked","Waiting approval","Permission denied"),task("done"),task("cancelled")],
 }),"TODOS",70);
 assert.ok(rows.some(row=>row.includes("◇")&&row.includes("awaiting independent review")));
 assert.ok(rows.some(row=>row.includes("Needs independent verification")));
 assert.ok(rows.some(row=>row.includes("Permission denied")));
 assert.ok(rows.some(row=>row.includes("✓ 1 done")));
 assert.ok(rows.some(row=>row.includes("✕ 1 cancelled")));
 assert.ok(!rows.some(row=>row.includes("✓ 2 done")),"Succeeded is not done");
});
test("M1 agent and jobs ordering is read-only and never fabricates model or costs",()=>{
 const rows=renderAsenPanelSection(snapshot({
  agents:[agent("completed","explorer"),agent("interrupted","worker"),agent("running","verifier")],
  jobs:[job("running","npm run check"),job("failed","node rejected.js")],
 }),"AGENTS",72);
 assert.ok(rows[0]?.includes("worker · interrupted"));
 assert.ok(rows[1]?.includes("verifier · running"));
 assert.ok(!rows.join("\n").includes("$"));
 assert.ok(!rows.join("\n").includes("gpt-"));
 const work=renderAsenWorkRow(snapshot({agents:[agent("running")],jobs:[job("running")],todos:[task("blocked")]}),60);
 assert.match(work??"",/1 agents/u);
 assert.match(work??"",/1 jobs/u);
 assert.match(work??"",/0\/1 todos/u);
 assert.equal(renderAsenWorkRow(snapshot({todos:[task("done")]}),60),undefined);
});
test("M1 status omits fields not observed and projects verified values without pricing claims",()=>{
 const baseline=renderAsenStatusLine(snapshot(),52);
 assert.equal(baseline,"ASEN");
 const row=renderAsenStatusLine(snapshot({
  changes:{branch:"feat/ui",files:4},permission:"yolo",model:"provider/free-model",effort:"medium",
  contextPercent:83,cost:0,subscription:true,
 }),110);
 assert.match(row,/feat\/ui ±4/u);
 assert.match(row,/yolo/u);
 assert.match(row,/provider\/free-model/u);
 assert.match(row,/ctx 83%/u);
 assert.match(row,/\$0\.00 sub/u);
 assert.ok(visibleWidth(row)<=110);
});
test("M1 malicious terminal controls and extremely long titles are bounded",()=>{
 const title="\u001b[31m"+"A".repeat(1000)+"\nSECRET";
 for(const width of [12,35,80,140]){
  const panel=renderAsenPanel(snapshot({
   todos:[task("running",title)],agents:[agent("failed","worker\u001b[0m")],
   changes:{branch:"main\u001b[2J",files:4},
  }),width);
  assert.ok(panel.every(row=>visibleWidth(row)<=width));
  assert.ok(panel.every(row=>!row.includes("\u001b")&&!row.includes("\n")));
 }
 assert.throws(()=>renderAsenPanel(snapshot(),11),/width/u);
 assert.throws(()=>renderAsenStatusLine(snapshot(),0),/width/u);
});
test("Jobs exposes bounded IDs instead of execution payloads and excludes historical active counts",()=>{
 const historical={...job("running","SECRET_SENTINEL"),recoveredAt:"2026-11-06T00:00:00Z",resumable:false};
 for(const width of [12,40,72]){
  const base=snapshot({jobs:[historical]}),before=structuredClone(base);
  const rows=renderAsenPanelSection(base,"JOBS",width);
  assert.doesNotMatch(rows.join("\n"),/SECRET_SENTINEL|asen-background-status/);
  assert.ok(rows.every(row=>visibleWidth(row)<=width));assert.deepEqual(base,before);
  assert.equal(renderAsenWorkRow(base,width),undefined);
  assert.ok(renderAsenPanel(base,width).some(row=>row.includes("JOBS · 0")));
 }
 const rows=renderAsenPanelSection(snapshot({jobs:[historical]}),"JOBS",100);
 assert.match(rows.join("\n"),/job-1 · background · running · historical/);
 assert.match(rows.join("\n"),/\/asen-job-inspect \[id\]/);
 assert.doesNotMatch(renderAsenPanelSection(snapshot(),"JOBS",72).join("\n"),/asen-background-status/);
});
test("explicit observation state overrides stale legacy values without changing legacy omissions",()=>{
 const observed=snapshot({hostStatus:projectHostStatus(),model:"stale/model",contextPercent:90,cost:123,subscription:true});
 const before=structuredClone(observed);
 assert.equal(renderAsenStatusLine(observed,100),"ASEN │ selected ? │ responding ? │ ctx ? │ cost/sub ?");
 assert.equal(renderAsenStatusLine(snapshot(),100),"ASEN");
 assert.deepEqual(observed,before);
 for(const width of [12,35,80,140])assert.ok(visibleWidth(renderAsenStatusLine(observed,width))<=width);
});
test("INTEGRATIONS states the permission meaning once without repeating the mode banner",()=>{
 const inspection=inspectIntegrationProfiles({getCommands:()=>[],getAllTools:()=>[]});
 const yolo=renderAsenPanelSection(snapshot({integrationInspection:inspection,permission:"yolo"}),"INTEGRATIONS",120);
 assert.ok(yolo.some(row=>row.startsWith("  permissions standing permission for ordinary primary work")),yolo.join("\n"));
 assert.doesNotMatch(yolo.join("\n"),/Permission:|connected|healthy/i);
 assert.equal(yolo.filter(row=>/permission/iu.test(row)).length,1,"The elevated mode must not repeat as a second banner");
 const auto=renderAsenPanelSection(snapshot({integrationInspection:inspection,permission:"auto"}),"INTEGRATIONS",120);
 assert.ok(auto.some(row=>row.startsWith("  permissions independent classifier checks each action")),auto.join("\n"));
 const superYolo=renderAsenPanelSection(snapshot({integrationInspection:inspection,permission:"super-yolo"}),"INTEGRATIONS",120);
 assert.ok(superYolo.some(row=>row.startsWith("  permissions no routine permission prompts")),superYolo.join("\n"));
 for(const permission of [undefined,"normal"])
  assert.doesNotMatch(renderAsenPanelSection(snapshot({integrationInspection:inspection,...(permission?{permission}:{})}),"INTEGRATIONS",120).join("\n"),/permissions/i,"Normal mode must not state an elevated meaning row");
});
test("the composed status line orders workspace, permission and host segments",()=>{
 const hostStatus=projectHostStatus({model:{provider:"p",id:"m"},thinkingLevel:"high",getContextUsage(){return{tokens:80,contextWindow:100,percent:80};}});
 assert.equal(renderAsenStatusLine(snapshot({changes:{branch:"main",files:3},permission:"YOLO",hostStatus}),100),
  "ASEN │ main ±3 │ YOLO │ selected p/m · high │ responding ? │ ctx 80% warning ▰▰▰▰▰▰▱▱ │ cost/sub ?");
 assert.equal(renderAsenStatusLine(snapshot({changes:{branch:"release",files:0},permission:"normal",hostStatus:projectHostStatus()}),100),
  "ASEN │ release clean │ selected ? │ responding ? │ ctx ? │ cost/sub ?","Normal mode adds no second banner");
 const narrow=renderAsenStatusLine(snapshot({changes:{branch:"main",files:3},permission:"YOLO",hostStatus}),12);
 assert.ok(visibleWidth(narrow)<=12,"the added unknown segment must respect the canonical width floor");
});
// UFC-M1-01 G1 (RED against shipped code): the host path must state the truthful cost/sub
// unknown. Today the cost segment renders only on the legacy path (ide-panel.ts:176-177),
// so the host-path row demonstrably omits the UI-08 cost/sub state.
test("UFC-M1-01 host path carries the truthful cost/sub unknown segment",()=>{
 const row=renderAsenStatusLine(snapshot({hostStatus:projectHostStatus()}),140);
 assert.match(row,/cost\/sub \?/u,"UI-08 requires the cost/sub state visible on the host path");
 assert.ok(!/\$\d/u.test(row),"an unknown state must never render as a currency figure");
 const legacy=renderAsenStatusLine(snapshot({cost:2.5,subscription:true}),140);
 assert.match(legacy,/\$2\.50 sub/u,"the observed legacy path keeps its shipped figures");
 assert.ok(!renderAsenStatusLine(snapshot(),140).includes("cost"),"no host and no observed cost keeps the segment omitted");
});
// UFC-M1-01 G2 coverage pin (the click affordance never shipped; this guards the boundary
// while UI-C15 stays CI-only; recorded as coverage, not a functional RED).
test("UFC-M1-01 no clickability is claimed while UI-C15 remains CI-only",()=>{
 for(const input of [{},{hostStatus:projectHostStatus()}]){
  const row=renderAsenStatusLine(snapshot(input),140);
  assert.ok(!row.includes("\u001b]8;;"),"no OSC-8 hyperlink affordance may be emitted without a host capability receipt");
  assert.doesNotMatch(row,/click/iu,"the status row must not claim a clickable usage affordance");
 }
 for(const width of [12,35,80,140])
  assert.ok(visibleWidth(renderAsenStatusLine(snapshot({hostStatus:projectHostStatus()}),width))<=width);
});
// UFC-M1-02 G1 (functional RED): an OBSERVED integration state must surface in the status
// row. Today renderAsenStatusLine ignores snapshot.integrationInspection entirely, so the
// UI-07 presence state is demonstrably absent from the composed row even when observed.
test("UFC-M1-02 status row states the observed integrations presence",()=>{
 const throwing=inspectIntegrationProfiles({}); // readers missing -> unavailable, observed fact
 assert.match(renderAsenStatusLine(snapshot({integrationInspection:throwing}),160),
  /integrations unavailable/u,"UI-07 requires the observed presence state visible on the row");
 const reported=inspectIntegrationProfiles({getCommands:()=>[{name:"asen-usage"}],getAllTools:()=>[{name:"read",namespace:{name:"asen"}}]});
 assert.match(renderAsenStatusLine(snapshot({integrationInspection:reported}),160),/integrations reported/u);
 const empty=inspectIntegrationProfiles({getCommands:()=>[],getAllTools:()=>[]});
 assert.match(renderAsenStatusLine(snapshot({integrationInspection:empty}),160),/integrations empty/u);
});
// UFC-M1-02 boundary pins: presence never reads as connection; unobserved keeps omission.
test("UFC-M1-02 presence never implies connection and omission stays legacy-safe",()=>{
 const row=renderAsenStatusLine(snapshot({integrationInspection:inspectIntegrationProfiles({getCommands:()=>[{name:"asen-doctor"}],getAllTools:()=>[]})}),160);
 assert.doesNotMatch(row,/connected|healthy/iu,"presence of a registered tool is not a connection (UI-07 discipline)");
 assert.equal(renderAsenStatusLine(snapshot(),160),"ASEN","snapshots without an inspection keep the shipped omission");
});


test("T07 existing Pi panel shows cross-session flow in TODOS AGENTS CHANGES INTEGRATIONS without invented PASS",()=>{
 const overview=projectParallelAgentFlow([{
  batchId:"flow-1",state:"prepared",tasks:[
   {sourceTodoId:"source-worker-1",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
    changes:{status:"scoped-changes",changedPaths:["a.ts"],outOfScopePaths:[],
     headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false},
    childSession:{id:"pi-child-1",agents:[{id:"worker-1",role:"worker",state:"running"}]}},
   {sourceTodoId:"source-worker-2",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:false,
    changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
     headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false}}
  ]
 }]);
 const source=snapshot({agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview},
  todos:[],agents:[],jobs:[]});
 const before=structuredClone(source);
 for(const width of [24,50,110]){
  const todos=renderAsenPanelSection(source,"TODOS",width).join("\n");
  const agents=renderAsenPanelSection(source,"AGENTS",width).join("\n");
  const changes=renderAsenPanelSection(source,"CHANGES",width).join("\n");
  const integrations=renderAsenPanelSection(source,"INTEGRATIONS",width).join("\n");
  if(width>=50){
   assert.match(todos,/Linked source Todos:/u);
   assert.match(agents,/Worktree Workers:/u);
   assert.match(changes,/Linked worktrees:/u);
   assert.match(integrations,/Cross-session ODD:/u);
  }
  const rendered=renderAsenPanel(source,width);
  assert.ok(rendered.every(line=>visibleWidth(line)<=width));
  assert.ok(rendered.every(line=>!line.includes("\u001b")&&!line.includes("\n")));
 }
 assert.equal(source.agentFlow?.overview.tasks[0]?.modelActual,"unknown");
 assert.equal(source.agentFlow?.overview.acceptance,"not-accepted");
 assert.deepEqual(source,before);
});

test("T06/T07 distingue cola y lanzamiento no acreditado en TODOS y AGENTS",()=>{
 const overview=projectParallelAgentFlow([{batchId:"lote-pendiente",state:"prepared",
  supervisorClaimed:true,tasks:[
   {sourceTodoId:"origen-a",sourceTodoUnchanged:true,worktreePresent:true,
    handoffClaimed:true,changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
     headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false},
    childSession:{id:"child-a",agents:[]}},
   {sourceTodoId:"origen-b",sourceTodoUnchanged:true,worktreePresent:true,
    handoffClaimed:true,changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
     headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false},
    childSession:{id:"child-b",agents:[{id:"worker-b",role:"worker",state:"queued"}]}}
  ]}]);
 const scope=snapshot({todos:[],agents:[],jobs:[],
  agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview}});
 const todos=renderAsenPanelSection(scope,"TODOS",140).join("\n");
 const agents=renderAsenPanelSection(scope,"AGENTS",140).join("\n");
 assert.match(todos,/launch-unverified/u);
 assert.match(todos,/queued-observed/u);
 assert.match(agents,/Lanzamientos sin verificar: 1/u);
 assert.match(agents,/Agentes hijos en cola \(sin ejecutar\): 1/u);
 assert.match(agents,/Worktree Workers: 0 active observed/u);
 const status=renderAsenWorkRow(scope,160);
 assert.ok(status);
 assert.match(status,/1 hijos en cola/u);
 assert.match(status,/1 lanzamientos sin verificar/u);
 assert.doesNotMatch(status,/child Workers observed|merged|accepted/iu);
 assert.doesNotMatch(todos+"\n"+agents,/merged|accepted:true|model actually used/iu);
});

test("T07 missing or unreadable flow never claims a model, Worker or successful integration",()=>{
 const rows=renderAsenPanelSection(snapshot({agentFlowUnavailable:true}),"INTEGRATIONS",90).join("\n");
 assert.match(rows,/Cross-session ODD: unavailable/u);
 assert.doesNotMatch(rows,/PASS|actual model [^u]|healthy/u);
});

test("T07 distingue sesión local vacía del trabajo de hijos y enseña el siguiente paso sin ejecutar",()=>{
 const overview=projectParallelAgentFlow([{batchId:"batch-ui",state:"prepared",tasks:[
  {sourceTodoId:"worker-ui-a",sourceTodoUnchanged:true,worktreePresent:true,
   handoffClaimed:true,changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
    headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"pi-child-a",agents:[{id:"real-a",role:"worker",state:"running"}]}},
  {sourceTodoId:"worker-ui-b",sourceTodoUnchanged:true,worktreePresent:true,
   handoffClaimed:false,changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
    headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false}}
 ]}]);
 const base=snapshot({todos:[],agents:[],jobs:[],
  agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview}});
 const before=structuredClone(base);
 const todos=renderAsenPanelSection(base,"TODOS",140).join("\n");
 const agents=renderAsenPanelSection(base,"AGENTS",140).join("\n");
 assert.match(todos,/No local Todos · linked worktree tasks observed/u);
 assert.match(todos,/next observe-agent/u);
 assert.match(todos,/next attach-child-session/u);
 assert.match(agents,/Sin agentes locales · tareas hijas vinculadas/u);
 assert.match(agents,/Worktree Workers: 1 active observed/u);
 assert.doesNotMatch(todos+"\n"+agents,/model verified|accepted:true|merge complete/iu);
 assert.equal(base.agentFlow?.overview.tasks[0]?.modelActual,"unknown");
 assert.deepEqual(base,before);
});

test("T07 barra inferior reconoce Workers hijos reales sin actividades locales",()=>{
 const overview=projectParallelAgentFlow([{batchId:"batch-bar",state:"prepared",tasks:[
  {sourceTodoId:"bar-worker-a",sourceTodoUnchanged:true,worktreePresent:true,
   handoffClaimed:true,changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
    headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"bar-child-a",agents:[{id:"bar-a",role:"worker",state:"running"}]}},
  {sourceTodoId:"bar-worker-b",sourceTodoUnchanged:true,worktreePresent:true,
   handoffClaimed:true,changes:{status:"scoped-changes",changedPaths:["x.ts"],outOfScopePaths:[],
    headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false},
   childSession:{id:"bar-child-b",agents:[{id:"bar-b",role:"worker",state:"completed"}]}}
 ]}]);
 const source=snapshot({todos:[],agents:[],jobs:[],
  agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview}});
 const row=renderAsenWorkRow(source,120);
 assert.ok(row);assert.match(row,/1 child Workers observed/u);
 assert.match(row,/1 child review pending/u);
 assert.doesNotMatch(row,/accepted|completed successfully|merged/iu);
 assert.equal(renderAsenWorkRow(snapshot(),120),undefined);
 for(const width of [12,32,80,120])
  assert.ok(visibleWidth(renderAsenWorkRow(source,width)!)<=width);
});

test("T02/T05/T06/T07 panel diferencia modelo solicitado, intento y recibo de modelo real",()=>{
 const overview=projectParallelAgentFlow([{batchId:"lote-pi-observado",state:"prepared",
  supervisorClaimed:true,tasks:[
   {sourceTodoId:"todo-origen-a",sourceTodoUnchanged:true,worktreePresent:true,
    handoffClaimed:true,receiptRecorded:true,
    changes:{status:"scoped-changes",changedPaths:["codigo.ts"],outOfScopePaths:[],
     headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false},
    childSession:{id:"sesion-a",modelRequested:"nvidia/modelo-solicitado",
     agents:[{id:"agente-a",role:"worker",state:"completed"}]}},
   {sourceTodoId:"todo-origen-b",sourceTodoUnchanged:true,worktreePresent:true,
    handoffClaimed:false,receiptRecorded:false,
    changes:{status:"clean",changedPaths:[],outOfScopePaths:[],
     headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted",autoMerge:false}}
  ]}]);
 const panel=snapshot({agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview}});
 const before=structuredClone(panel);
 const rows=renderAsenPanelSection(panel,"AGENTS",140).join("\n");
 assert.match(rows,/requested nvidia\/modelo-solicitado · actual unknown/u);
 assert.match(rows,/Supervisor attempts recorded: 2 tasks/u);
 assert.match(rows,/Collected Worker receipts: 1 · human review required/u);
 assert.doesNotMatch(rows,/actual nvidia|FULL|automatically approved/iu);
 assert.equal(overview.tasks[0]!.modelActual,"unknown");
 assert.equal(overview.tasks[0]!.modelConsumedProven,false);
 assert.deepEqual(panel,before);
});

test("T11: un origen fallido no dibuja cero tareas o agentes como si se hubieran observado",()=>{
 const data=snapshot({activityUnavailable:true,todos:[],agents:[],jobs:[]});
 for(const width of [12,24,40,50,140]){
  const rows=renderAsenPanel(data,width);
  if(width>=40){
   assert.ok(rows.some(row=>row.includes("TODOS · unavailable")));
   assert.ok(rows.some(row=>row.includes("JOBS · unavailable")));
   assert.ok(rows.some(row=>row.includes("AGENTS · unavailable")));
   assert.ok(rows.some(row=>row.includes("Actividad no disponible")));
  }else{
   assert.ok(rows.some(row=>row.includes("TODOS")));
   assert.ok(rows.some(row=>row.includes("JOBS")));
   assert.ok(rows.some(row=>row.includes("AGENTS")));
  }
  assert.doesNotMatch(rows.join("\n"),/No tasks in this session|No owned jobs|No agents|TODOS · 0\/0|JOBS · 0 running/);
  assert.ok(rows.every(row=>visibleWidth(row)<=width));
 }
 assert.deepEqual(data,snapshot({activityUnavailable:true,todos:[],agents:[],jobs:[]}));
});

test("T11: revisión y actividad no reutilizan resultados previos ante fallo de lectura",()=>{
 const old=snapshot({
  activityUnavailable:true,todosObserved:true,
  todos:[task("succeeded","Revisión antigua"),task("blocked")],
  agents:[agent("running")],jobs:[job("running")],review:{pending:2},
 });
 const review=renderAsenPanelSection(old,"REVIEW",100).join("\n");
 assert.match(review,/Actividad no disponible/u);
 assert.doesNotMatch(review,/Results awaiting review|ODD Workers|2 stored/u);
 const headings=renderAsenPanel(old,100).join("\n");
 assert.match(headings,/REVIEW · unverified/u);
 assert.doesNotMatch(headings,/REVIEW · 2 needs review/u);
 const row=renderAsenWorkRow(old,100)??"";
 assert.match(row,/actividad no disponible/u);
 assert.doesNotMatch(row,/agents|jobs|todos|review pending/iu);
 const recovered={...old,activityUnavailable:false};
 assert.match(renderAsenPanelSection(recovered,"REVIEW",100).join("\n"),/Results awaiting review · 2/u);
 assert.match(renderAsenWorkRow(recovered,100)??"",/1 agents/u);
});


test("T11/T07: la fuente hija desconocida no puede reutilizar observaciones antiguas en ningún ancho",()=>{
 const previous=projectParallelAgentFlow([{batchId:"hijos-antiguos",state:"prepared",tasks:[{
  sourceTodoId:"worker-antiguo",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
  changes:{status:"clean",changedPaths:[],outOfScopePaths:[],sourceVerified:true,
   headMatchesBase:true,acceptance:"not-accepted",autoMerge:false},
  childSession:{id:"sesion-anterior",agents:[{id:"agent-antiguo",role:"worker",state:"running"}]}
 },{
  // Los lotes genuinos contienen de 2 a 4 tareas; un registro unitario es inválido.
  sourceTodoId:"worker-pendiente",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:false,
  changes:{status:"clean",changedPaths:[],outOfScopePaths:[],sourceVerified:true,
   headMatchesBase:true,acceptance:"not-accepted",autoMerge:false}
 }]}]);
 const input=snapshot({todos:[],agents:[],jobs:[],agentFlowUnavailable:true,
  agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview:previous}});
 const before=structuredClone(input);
 for(const width of [24,40,50,80,120,139,140,180]){
  const rows=renderAsenPanel(input,width).join("\n");
  assert.doesNotMatch(rows,/Worktree Workers: 1 active observed|Linked source Todos: 1|sesion-anterior|worker-antiguo|agent-antiguo/u);
  if(width>=50)assert.match(rows,/hijos no disponibles/u);
  else assert.match(rows,/TODOS|AGENTS/u,"Los títulos siguen siendo visibles");
  const compact=renderAsenWorkRow(input,width)??"";
  if(width>=40)assert.match(compact,/hijos no disponibles/u);
  else assert.match(compact,/hijos \?/u);
  assert.match(compact,/\/asen-panel$/u,"El comando de inspección no debe truncarse");
  assert.ok(visibleWidth(compact)<=width);
  assert.doesNotMatch(compact,/child Workers observed|1 linked|PASS|accepted/iu);
  const fallback=renderM1Surface(input,width);
  if(width<140){
   if(width>=40)assert.match(fallback.lines.join("\n"),/hijos no disponibles/u);
   else assert.match(fallback.lines.join("\n"),/hijos \?/u);
   assert.match(fallback.lines.join("\n"),/\/asen-panel$/u);
   assert.ok(fallback.lines.every(line=>visibleWidth(line)<=width));
  }
 }
 assert.deepEqual(input,before,"La presentación no debe modificar la evidencia");
 assert.equal(renderAsenWorkRow(snapshot(),80),undefined,"Sin fallo ni actividad no se añade un aviso ficticio");
});

test("T07 observa Workers activos y en cola aunque Git esté bloqueado",()=>{
 const changes={status:"out-of-scope" as const,changedPaths:["prohibido.ts"],outOfScopePaths:["prohibido.ts"],headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted" as const,autoMerge:false as const};
 const overview=projectParallelAgentFlow([{batchId:"bloqueado",state:"prepared",tasks:[
  {sourceTodoId:"activo",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,changes,childSession:{id:"pi-a",agents:[{id:"ag-a",role:"worker",state:"running"}]}},
  {sourceTodoId:"cola",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,changes,childSession:{id:"pi-b",agents:[{id:"ag-b",role:"worker",state:"queued"}]}}
 ]}]);
 assert.equal(overview.stages.blocked,2);assert.equal(overview.stages["running-observed"],0);
 const input=snapshot({todos:[],agents:[],jobs:[],agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview}});
 const rows=renderAsenPanel(input,150).join("\n");
 assert.match(rows,/AGENTS · 0 local running · 1 child observed/u);
 assert.match(rows,/Worktree Workers: 1 active observed/u);
 assert.match(rows,/Agentes hijos en cola \(sin ejecutar\): 1/u);
 const row=renderAsenWorkRow(input,160)??"";
 assert.match(row,/2 child tasks blocked/u);assert.match(row,/1 child Workers observed/u);
 assert.match(row,/1 hijos en cola/u);
});
test("T07 REVIEW presenta revisión de hijos y no la confunde con cero resultados",()=>{
 const changes={status:"clean" as const,changedPaths:[],outOfScopePaths:[],headMatchesBase:true,sourceVerified:true,acceptance:"not-accepted" as const,autoMerge:false as const};
 const overview=projectParallelAgentFlow([{batchId:"revision",state:"prepared",tasks:[
  {sourceTodoId:"finalizado",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,changes,childSession:{id:"pi-fin",agents:[{id:"ag-fin",role:"worker",state:"completed"}]}},
  {sourceTodoId:"sin-lanzar",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:false,changes}
 ]}]);
 assert.equal(overview.stages["manual-review-required"],1);
 const input=snapshot({todos:[],todosObserved:true,agents:[],jobs:[],agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview}});
 const panel=renderAsenPanel(input,145).join("\n"),review=renderAsenPanelSection(input,"REVIEW",145).join("\n");
 assert.match(panel,/REVIEW · 0 local · 1 child needs review/u);
 assert.match(review,/Linked child results awaiting human review: 1/u);
 assert.doesNotMatch(review,/^No pending review results observed/mu);
 const unavailable=renderAsenPanel(snapshot({...input,agentFlowUnavailable:true}),145).join("\n");
 assert.match(unavailable,/REVIEW · 0 local · hijos no disponibles/u);
});
