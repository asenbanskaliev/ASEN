import assert from "node:assert/strict";
import test from "node:test";
import {renderAsenStatusLine,type AsenPanelSnapshot} from "../src/runtime/ide-panel.js";
import {projectHostStatus} from "../src/runtime/host-status-projection.js";
import {truncateForTerminal,visibleWidth} from "../src/runtime/responsive-layout.js";

const snapshot=(updates:Partial<AsenPanelSnapshot>={}):AsenPanelSnapshot=>({todos:[],agents:[],jobs:[],...updates});
const observed=(percent:number)=>snapshot({hostStatus:projectHostStatus({
 model:{provider:"p",id:"m"},getContextUsage(){return {tokens:percent,contextWindow:100,percent};},
})});

test("P32 public host formatter adds eight context cells only when the complete row fits",()=>{
 // State thresholds come from projectHostStatus (80 warning, 95 error), BEFORE rounding.
 // Cell quantization uses the displayed integer percentage, not the raw fraction.
 const cases=[
  [0,"0%","▱▱▱▱▱▱▱▱"],[6.49,"6%","▱▱▱▱▱▱▱▱"],
  [6.5,"7%","▰▱▱▱▱▱▱▱"],[18.49,"18%","▰▱▱▱▱▱▱▱"],
  [18.5,"19%","▰▰▱▱▱▱▱▱"],[79.5,"80%","▰▰▰▰▰▰▱▱"],
  [80,"80% warning","▰▰▰▰▰▰▱▱"],[94.5,"95% warning","▰▰▰▰▰▰▰▰"],
  [95,"95% error","▰▰▰▰▰▰▰▰"],[100,"100% error","▰▰▰▰▰▰▰▰"],
 ] as const;
 for(const [percent,label,cells] of cases){
  const input=observed(percent),before=structuredClone(input);
  const prior=`ASEN │ selected p/m │ responding ? │ ctx ${label} │ cost/sub ?`;
  const candidate=`ASEN │ selected p/m │ responding ? │ ctx ${label} ${cells} │ cost/sub ?`;
  const exactFit=visibleWidth(candidate);
  for(const width of new Set([180,140,80,35,12,exactFit,exactFit-1])){
   const expected=width>=exactFit?candidate:truncateForTerminal(prior,width);
   assert.equal(renderAsenStatusLine(input,width),expected,`percent=${percent}, width=${width}`);
   assert.ok(visibleWidth(expected)<=width);
  }
  assert.deepEqual(input,before,"Formatting cannot mutate the public projection");
 }
 // Workspace/permission/inventory consume the SAME row budget; no fixed breakpoint.
 const composed={...observed(80),changes:{branch:"main",files:3},permission:"YOLO"};
 const old="ASEN │ main ±3 │ YOLO │ selected p/m │ responding ? │ ctx 80% warning │ cost/sub ?";
 const next="ASEN │ main ±3 │ YOLO │ selected p/m │ responding ? │ ctx 80% warning ▰▰▰▰▰▰▱▱ │ cost/sub ?";
 for(const width of [visibleWidth(next),visibleWidth(next)-1,80,35,12])
  assert.equal(renderAsenStatusLine(composed,width),width>=visibleWidth(next)?next:truncateForTerminal(old,width));
});

test("P32 prior formatter legacy, unknown and terminal-safe bounded rows stay byte-compatible",()=>{
 const legacy=snapshot({model:"p/m",contextPercent:100,cost:2.5,subscription:true});
 const unknown=snapshot({hostStatus:projectHostStatus(),model:"stale",contextPercent:100,cost:99});
 const controlled=snapshot({changes:{branch:"main\u001b[2J",files:0},contextPercent:100,cost:0});
 const cases=[
  [legacy,"ASEN │ p/m │ ctx 100% │ $2.50 sub"],
  [unknown,"ASEN │ selected ? │ responding ? │ ctx ? │ cost/sub ?"],
  [controlled,"ASEN │ main�[2J clean │ ctx 100% │ $0.00"],
  [snapshot(),"ASEN"],
 ] as const;
 for(const [input,prior] of cases){
  const before=structuredClone(input);
  for(const width of [180,140,80,35,12]){
   const row=renderAsenStatusLine(input,width);
   assert.equal(row,truncateForTerminal(prior,width));
   assert.doesNotMatch(row,/[▰▱\u001b]/u);
   assert.ok(visibleWidth(row)<=width);
  }
  assert.deepEqual(input,before);
 }
});
