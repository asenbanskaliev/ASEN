import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error The standalone progress consistency auditor is plain ESM.
import {auditEfPlanMarkdown,readEfPlan,EF_IDS} from "../scripts/audit-ef-plan.mjs";

test("F7 all 28 EF remain ordered, evidence-linked and honest about FULL",()=>{
 const result=auditEfPlanMarkdown(readEfPlan());
 assert.equal(result.total,28);
 assert.ok(result.verified>=7);
 assert.equal(result.partial+result.blocked,28-result.verified);
 assert.equal(result.globalFull,false);
 assert.deepEqual(result.entries.map((item:{id:string})=>item.id),EF_IDS);
 const verified=new Set(result.entries.filter((item:{status:string})=>item.status==="VERIFICADO")
  .map((item:{id:string})=>item.id));
 for(const id of ["EF-000","EF-003","EF-102","EF-103","EF-202","EF-301","EF-602"])
  assert.ok(verified.has(id),`Previously verified ${id} must not regress`);
});
test("F7 unchecked or untracked EF cannot silently appear completed",()=>{
 const doc=readEfPlan();
 const completed=doc.match(/^- \[x\] EF-003 .+$/mu)?.[0];
 assert.ok(completed);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace(completed,completed.replace("[x]","[ ]"))),/verification evidence/);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace(completed,"")),/exactly 28/);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace("EF-003 Crear","EF-099 Crear")),/identity/);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace(completed,completed+"\n"+completed)),/exactly 28/);
});
test("F7 source, regression and exact CI fields are mandatory to check off a task",()=>{
 const doc=readEfPlan(),completed=doc.match(/^- \[x\] EF-003 .+$/mu)?.[0];
 assert.ok(completed);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace("scripts/agent-observable-parity.mjs","scripts/nonexistent-unit.mjs")),/traceability/);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace("tests/agent-observable-parity.test.ts","tests/unknown.test.ts")),/traceability/);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace(completed,completed.replace(/CI `[0-9]+`/u,"CI `none`"))),/receipt/);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace(completed,completed.replace(/SHA `[a-f0-9]{40}`/u,"SHA `garbage`"))),/receipt/);
});
test("F7 partial or blocked tasks require a concrete remaining criterion",()=>{
 const doc=readEfPlan();
 const pending=doc.match(/^- \[ \] EF-002 .+$/mu)?.[0];
 assert.ok(pending);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace(pending,pending.replace(/\*\*BLOQUEADO:\*\* .+$/u,""))),/remaining blocker/);
 assert.throws(()=>auditEfPlanMarkdown(doc.replace(pending,pending.replace("[ ]","[x]"))),/checked without/);
});
test("F7 the displayed total cannot diverge from the checkboxes",()=>{
 const doc=readEfPlan();
 assert.throws(()=>auditEfPlanMarkdown(doc.replace("Resumen del plan:** 7/28","Resumen del plan:** 8/28")),/summary disagrees/);
});

