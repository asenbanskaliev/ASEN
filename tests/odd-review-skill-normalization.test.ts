import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {auditSkillDocument} from "../src/skills/document.js";
for(const name of ["asen-odd","asen-defect-workflow","asen-adversarial-review"]){
 test(`${name} parser, body, sections and escape integrity`,async()=>{
  const source=await readFile(`skills/${name}/SKILL.md`,"utf8"),audit=auditSkillDocument(source,{directoryName:name});
  assert.deepEqual(audit.issues,[]);assert.ok(audit.bodyWordCount>=180&&audit.bodyWordCount<=450,String(audit.bodyWordCount));
  assert.equal(source.includes("\\n"),false);
  assert.deepEqual([...source.matchAll(/^## (.+)$/gm)].map(m=>m[1]),["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"]);
 });
}
test("ODD distinguishes tracking, delegation, workflow and authority",async()=>{
 const text=await readFile("skills/asen-odd/SKILL.md","utf8");
 for(const marker of ["full-memory-mirror","TODO","resume","Read-only","MemoryContext","Delegation selects agents","workflow selection chooses a mode","Live Pi integration"])assert.ok(text.includes(marker));
});
test("all three matrix rows retain PARTIAL with no file-presence promotion",async()=>{
 const matrix=JSON.parse(await readFile("registry/parity/skill-contract-parity-v1.json","utf8"));
 for(const name of ["asen-odd","asen-defect-workflow","asen-adversarial-review"]){const row=matrix.rows.find((r:{asenSkill:string})=>r.asenSkill===`skills/${name}/SKILL.md`);assert.equal(row?.status,"PARTIAL");assert.ok(row.gaps.length);}
});
