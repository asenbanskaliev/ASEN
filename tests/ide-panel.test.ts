import assert from "node:assert/strict";
import test from "node:test";
import {
 ASEN_PANEL_SECTIONS,renderAsenPanel,renderAsenPanelSection,
 renderAsenWorkRow,renderAsenStatusLine,type AsenPanelSnapshot,
} from "../src/runtime/ide-panel.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {projectHostStatus} from "../src/runtime/host-status-projection.js";
import {inspectIntegrationProfiles} from "../src/runtime/integration-profile-inspection.js";

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
  "ASEN │ main ±3 │ YOLO │ selected p/m · high │ responding ? │ ctx 80% warning │ cost/sub ?");
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
