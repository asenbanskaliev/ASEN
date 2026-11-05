/** R4-01: derive a requirement inventory from the frozen ODD, never from a model claim.
 * Historical checkmarks are not same-SHA or independent attestations.
 */
import assert from "node:assert/strict";
import {EF_IDS} from "./audit-ef-plan.mjs";

const range=(prefix,count)=>Array.from({length:count},(_,i)=>prefix+String(i+1).padStart(2,"0"));
const UI_IDS=Object.freeze(range("UI-",14));
const AB_IDS=Object.freeze(range("C",20));
const UI_CASE_IDS=Object.freeze(range("UI-C",24));
const SPEC_IDS=Object.freeze(range("S",20));

function between(text,start,end){
 assert.equal(typeof text,"string","ODD must be text");
 const i=text.indexOf(start),j=text.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,"ODD section missing or reordered: "+start);
 return text.slice(i,j);
}
function checkIds(actual,expected,label){
 assert.deepEqual(actual,expected,label+" must contain every canonical identity once and in order");
}
function uiCaseRefs(input){
 const result=new Set();
 for(const token of input.match(/UI-C\d{2}(?:\/\d{2})*(?:\.\.\d{2})?/gu)??[]){
  const body=token.slice(4);
  if(body.includes("..")){
   const [start,end]=body.split("..").map(Number);
   assert.ok(start>=1&&end<=24&&end>=start,"Invalid UI case range");
   for(let n=start;n<=end;n++)result.add("UI-C"+String(n).padStart(2,"0"));
  }else for(const part of body.split("/"))result.add("UI-C"+part);
 }
 return [...result];
}
function uiDependencies(input){
 const ids=new Set();
 for(const match of input.matchAll(/UI-(\d{2})(?:\.\.UI-(\d{2}))?|FREF/gu)){
  if(match[0]==="FREF"){ids.add("FREF");continue;}
  const start=Number(match[1]),end=match[2]?Number(match[2]):start;
  assert.ok(start>=1&&end<=14&&start<=end,"Invalid UI dependency range");
  for(let i=start;i<=end;i++)ids.add("UI-"+String(i).padStart(2,"0"));
 }
 return [...ids];
}
export function buildR4RequirementInventory({efMarkdown,uiMarkdown}){
 const plan=between(efMarkdown,"## Plan ejecutable: tareas y dependencias","## Estrategia de tandas grandes y CI");
 const efRows=[...plan.matchAll(/^- \[([ x])\] (EF-\d{3}) ([^\r\n]+)$/gmu)]
  .map(m=>({id:m[2],status:m[1]==="x"?"CHECKED_HISTORICAL":
   m[3].includes("**BLOQUEADO:**")?"BLOCKED":"PARTIAL",claim:m[3]}));
 checkIds(efRows.map(x=>x.id),EF_IDS,"EF checklist");
 for(const row of efRows)if(row.status!=="CHECKED_HISTORICAL")
  assert.ok(row.claim.includes("**PARCIAL:**")||row.claim.includes("**BLOQUEADO:**"),"Unclassified EF: "+row.id);
 const tasks=between(uiMarkdown,"## 6. Tareas UI nuevas","## 7. Casos de paridad visual");
 const uiRows=[...tasks.matchAll(/^- \[([ x])\] \*\*(UI-\d{2}):[^\r\n]*$/gmu)].map(m=>{
  const raw=m[0];
  // UI-14 uses UI-C01..24: the period delimiter cannot split that case range.
  const testSpan=raw.match(/Tests: (.*)\. Evidencia/u);
  const depSpan=raw.match(/Dependencias: (.*?)\. Tests:/u);
  assert.ok(testSpan&&depSpan,"Missing explicit UI tests/dependencies: "+m[2]);
  const testCases=uiCaseRefs(testSpan[1]);
  assert.ok(testCases.length>0,"UI task without acceptance cases: "+m[2]);
  return {id:m[2],status:m[1]==="x"?"CHECKED_HISTORICAL":"PENDING",
   dependencies:uiDependencies(depSpan[1]),
   testCases};
 });
 checkIds(uiRows.map(x=>x.id),UI_IDS,"UI tasks");
 for(const row of uiRows)assert.ok(row.dependencies.every(id=>id==="FREF"||(UI_IDS.includes(id)&&id!==row.id)),
  "UI dependency must point to another known task: "+row.id);
 assert.deepEqual(uiRows.find(x=>x.id==="UI-14")?.dependencies,UI_IDS.slice(0,13),
  "UI-14 must depend on all implementation tasks");
 const specs=[...efMarkdown.matchAll(/^### (S\d{2}) — /gmu)].map(x=>x[1]);
 checkIds(specs,SPEC_IDS,"S01-S20 specs");
 const ab=between(efMarkdown,"## Matriz de aceptación común","## Plan ejecutable");
 const abCases=[...ab.matchAll(/^\| (C\d{2}) \|[^\r\n]*\| (PENDING|PASS|FAIL|BLOCKED) \|\s*$/gmu)].map(x=>({id:x[1],status:x[2]}));
 checkIds(abCases.map(x=>x.id),AB_IDS,"A/B cases");
 const uiCasesText=between(uiMarkdown,"## 7. Casos de paridad visual","## 8. Secuencia");
 const uiCases=[...uiCasesText.matchAll(/^\| (UI-C\d{2}) \|/gmu)].map(x=>x[1]);
 checkIds(uiCases,UI_CASE_IDS,"UI-C01..24");
 const coverage=UI_CASE_IDS.map(id=>({id,
  owners:uiRows.filter(row=>row.id!=="UI-14"&&row.testCases.includes(id)).map(row=>row.id),
  finalGate:uiRows.some(row=>row.id==="UI-14"&&row.testCases.includes(id))}));
 const unowned=coverage.filter(row=>row.owners.length===0).map(row=>row.id);
 assert.deepEqual(unowned,[],"Every UI case needs an implementation owner outside UI-14");
 assert.ok(coverage.every(row=>row.finalGate),"UI-14 must cover all UI cases for final acceptance");
 const summary={efTotal:efRows.length,efCheckedHistorical:efRows.filter(x=>x.status==="CHECKED_HISTORICAL").length,
  efPartial:efRows.filter(x=>x.status==="PARTIAL").length,efBlocked:efRows.filter(x=>x.status==="BLOCKED").length,
  uiTotal:uiRows.length,uiCheckedHistorical:uiRows.filter(x=>x.status==="CHECKED_HISTORICAL").length,
  abCases:abCases.length,uiCases:uiCases.length,specs:specs.length};
 return Object.freeze({schema:"asen-r4-requirement-inventory/v1",summary,
  ef:efRows,ui:uiRows,specs,abCases,uiCases:coverage,
  disclaimer:"Historical checkmarks and test ownership are structural inventory, not real-provider, UI or independent-review attestations."});
}
