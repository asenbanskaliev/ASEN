import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error The standalone progress consistency auditor is plain ESM.
import {auditEfPlanMarkdown,readEfPlan,EF_IDS} from "../scripts/audit-ef-plan.mjs";

test("F7 all 28 EF remain ordered, evidence-linked and honest about FULL",()=>{
 const result=auditEfPlanMarkdown(readEfPlan());
 assert.equal(result.total,28);
 assert.ok(result.verified>=8);
 assert.equal(result.partial+result.blocked,28-result.verified);
 assert.equal(result.globalFull,false);
 assert.deepEqual(result.entries.map((item:{id:string})=>item.id),EF_IDS);
 const verified=new Set(result.entries.filter((item:{status:string})=>item.status==="VERIFICADO")
  .map((item:{id:string})=>item.id));
 for(const id of ["EF-000","EF-001","EF-003","EF-102","EF-103","EF-202","EF-301","EF-602"])
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
 const count=auditEfPlanMarkdown(doc).verified;
 const tampered=doc.replace(
  /\*\*Resumen del plan:\*\* [0-9]{1,2}\/28 EF/u,
  `**Resumen del plan:** ${count===0?1:count-1}/28 EF`,
 );
 assert.notEqual(tampered,doc,"Summary marker must exist");
 assert.throws(()=>auditEfPlanMarkdown(tampered),/summary disagrees/);
});


test("F0 EF-001 closure is traceable to a real three-OS CI run and primary-tool consent tests",()=>{
 const record=auditEfPlanMarkdown(readEfPlan()).entries
  .find((item:{id:string})=>item.id==="EF-001") as
  {id:string;status:string;source:string;test:string;ciRun:string;ciSha:string}|undefined;
 assert.ok(record);
 assert.equal(record.status,"VERIFICADO");
 assert.equal(record.source,"src/security/primary-tool-policy.ts");
 assert.equal(record.test,"tests/ef001-confirmation-regressions.test.ts");
 assert.equal(record.ciRun,"41724028665");
 assert.equal(record.ciSha,"e05ed7525b214591501ea085767e3d8c33c42ff1");
 const summary=auditEfPlanMarkdown(readEfPlan());
 assert.ok(summary.verified>=8,"EF-001 closure must not regress in future grouped batches");
 assert.equal(summary.globalFull,false);
});
