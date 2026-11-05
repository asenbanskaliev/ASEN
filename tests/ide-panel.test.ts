import assert from "node:assert/strict";
import test from "node:test";
import {
 ASEN_PANEL_SECTIONS,renderAsenPanel,renderAsenPanelSection,
 renderAsenWorkRow,renderAsenStatusLine,type AsenPanelSnapshot,
} from "../src/runtime/ide-panel.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

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
