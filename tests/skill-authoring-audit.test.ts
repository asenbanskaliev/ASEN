import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {auditSkillDocument,parseSkillIndexMetadata,type SkillAuditIssueCode} from "../src/skills/document.js";
import {selectSkills,type SkillPhase} from "../src/skills/registry.js";

const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const paths={authoring:"skills/asen-skill-authoring/SKILL.md",audit:"skills/asen-skill-audit/SKILL.md"} as const;
const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");
const filler=(count:number)=>Array.from({length:count},(_,index)=>`rule${index}`).join(" ");
const validDocument=(bodyWords=180)=>`---
name: example-skill
description: "Trigger: example request. Apply the example runtime contract."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
${filler(bodyWords-22)}
## Hard Rules
Apply rules.
## Decision Gates
Choose safely.
## Execution Steps
1. Execute deterministically.
## Output Contract
Return evidence.
## References
- \`references/details.md\`
`;
const codes=(text:string,directoryName="example-skill")=>auditSkillDocument(text,{directoryName}).issues.map(issue=>issue.code);
const replace=(text:string,from:string,to:string)=>{assert.ok(text.includes(from));return text.replace(from,to);};

function assertHas(text:string,code:SkillAuditIssueCode,directoryName?:string){
 assert.ok(codes(text,directoryName).includes(code),`expected ${code}`);
}

function selected(phase:SkillPhase){
 return selectSkills({phase}).map(skill=>skill.id).filter(id=>id==="asen-skill-authoring"||id==="asen-skill-audit");
}

test("accepts a strict valid Skill document",()=>{
 const result=auditSkillDocument(validDocument(),{directoryName:"example-skill"});
 assert.deepEqual(result.issues,[]);
 assert.equal(result.metadata?.name,"example-skill");
 assert.ok(result.bodyWordCount>=180&&result.bodyWordCount<=450);
});

test("indexes old minimal frontmatter without claiming strict validity",()=>{
 const old=`---\nname: Legacy Skill\ndescription: one line discovery text\n---\nOld body.`;
 assert.deepEqual(parseSkillIndexMetadata(old),{name:"Legacy Skill",description:"one line discovery text"});
 assert.notDeepEqual(codes(old,"Legacy Skill"),[]);
});

test("rejects ambiguous or multiline discovery metadata",()=>{
 const base=`---\nname: legacy-skill\ndescription: one line discovery text\n---\nOld body.`;
 for(const invalid of [
  replace(base,"name: legacy-skill","name: legacy-skill\nname: duplicate"),
  replace(base,"description: one line discovery text","description: one line discovery text\ndescription: duplicate"),
  replace(base,"description: one line discovery text","description: >-\n  folded discovery text"),
  replace(base,"description: one line discovery text","description: |2-\n    block discovery text"),
  replace(base,"description: one line discovery text","description: one line discovery text\n  indented continuation")
 ]) assert.equal(parseSkillIndexMetadata(invalid),null);
});

test("rejects an indented description continuation after a blank line",()=>{
 const invalid=`---\nname: legacy-skill\ndescription: plain\n\n  continued text\nlicense: Apache-2.0\nmetadata:\n  author: ASEN\n---\nOld body.`;
 assert.equal(parseSkillIndexMetadata(invalid),null);
});

test("reports every strict frontmatter and naming issue class",()=>{
 assertHas("no frontmatter","missing-frontmatter");
 assertHas("---\nname: broken\n","invalid-frontmatter");
 const valid=validDocument();
 assertHas(replace(valid,"license: Apache-2.0","extra: value\nlicense: Apache-2.0"),"unexpected-frontmatter-field");
 assertHas(replace(valid,"  version: \"1.0.0\"","  extra: value\n  version: \"1.0.0\""),"unexpected-metadata-field");
 assertHas(replace(valid,"name: example-skill","name: Example Skill"),"invalid-name","Example Skill");
 assertHas(valid,"name-directory-mismatch","other-skill");
});

test("rejects metadata children outside the metadata mapping",()=>{
 const misplaced=replace(validDocument(),"metadata:\n  author: ASEN\n  version: \"1.0.0\"","  author: ASEN\nmetadata:\n  version: \"1.0.0\"");
 assertHas(misplaced,"invalid-frontmatter");
});

test("validates strict metadata scalar values",()=>{
 const valid=validDocument();
 assert.deepEqual(codes(replace(valid,'  version: "1.0.0"',"  version: 2.3.4")),[]);
 for(const invalid of [
  replace(valid,"  author: ASEN","  author:"),
  replace(valid,"  author: ASEN",'  author: "   "'),
  replace(valid,"  author: ASEN","  author: >\n    ASEN"),
  replace(valid,'  version: "1.0.0"','  version: "1.2"'),
  replace(valid,'  version: "1.0.0"',"  version: 1.2.3-beta"),
  replace(valid,'  version: "1.0.0"',"  version: 01.2.3")
 ]) assertHas(invalid,"invalid-frontmatter");
});

test("reports every strict description issue",()=>{
 const valid=validDocument();
 for(const description of [
  "description: Trigger: unquoted",
  "description: \"Not trigger first\"",
  `description: \"Trigger: ${"x".repeat(245)}\"`,
  "description: >\n  Trigger: folded text"
 ]) assertHas(replace(valid,/^description:.*$/m.exec(valid)![0],description),"invalid-description");
});

test("reports the recommended body ceiling only above 700 words",()=>{
 const atCeiling=auditSkillDocument(validDocument(700),{directoryName:"example-skill"});
 assert.equal(atCeiling.bodyWordCount,700);
 assert.ok(!atCeiling.issues.some(issue=>issue.code==="body-above-recommended-ceiling"));
 const aboveCeiling=auditSkillDocument(validDocument(701),{directoryName:"example-skill"});
 assert.equal(aboveCeiling.bodyWordCount,701);
 assert.ok(aboveCeiling.issues.some(issue=>issue.code==="body-above-recommended-ceiling"));
});

test("reports section, budget, Keywords, and nonlocal-reference issue classes",()=>{
 const valid=validDocument();
 assertHas(replace(valid,"## Hard Rules","## Execution Steps"),"invalid-section-order");
 assertHas(validDocument(20),"body-below-target");
 assertHas(validDocument(451),"body-above-target");
 const huge=validDocument(1001);assertHas(huge,"body-above-hard-limit");assertHas(huge,"body-above-target");
 assertHas(replace(valid,"## References","## Keywords\nforbidden\n## References"),"forbidden-keywords-section");
 for(const target of ["../outside.md","/absolute.md","https://example.com/doc"])
  assertHas(replace(valid,"references/details.md",target),"nonlocal-reference");
});

test("authoring and audit Skills follow strict style and stay in budget",async()=>{
 for(const [kind,path] of Object.entries(paths)){
  const text=await read(path);
  const result=auditSkillDocument(text,{directoryName:`asen-skill-${kind}`});
  assert.deepEqual(result.issues,[],`${kind}: ${JSON.stringify(result.issues)}`);
  assert.ok(result.bodyWordCount>=180&&result.bodyWordCount<=450);
  assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
 }
});

test("authoring contract encodes parity-aligned decisions and output",async()=>{
 const text=await read(paths.authoring);
 for(const marker of [/normative.*skill-style-guide/is,/reusable.*one-off/is,/exact frontmatter/is,/assets\/.*references\//is,/must not.*Keywords/is,/180–450.*700.*1000/is,/\.asen\/skill-registry\.md/is,/new-versus-updated.*supporting files.*registry impact.*verification/is]) assert.match(text,marker);
});

test("audit contract defaults safe, preserves intent, and reports completely",async()=>{
 const text=await read(paths.audit);
 for(const marker of [/default.*audit-only/is,/preserve.*intent.*activation/is,/\.asen\/skill-registry\.md/is,/ambigu/is,/apply only.*explicit/is,/move.*references\/.*assets\/.*not.*delet/is,/registry refresh/is,/audited paths.*severity.*changes.*registry.*ambigu/is]) assert.match(text,marker);
});

test("runtime registry routes authoring and audit activation phases",()=>{
 assert.deepEqual(selected("skill-authoring"),["asen-skill-authoring"]);
 assert.deepEqual(selected("skill-audit"),["asen-skill-audit"]);
 assert.deepEqual(selected("explore"),[]);
});

test("authoring and audit matrix rows remain PARTIAL with deterministic evidence",async()=>{
 const matrix=JSON.parse(await read("registry/parity/skill-contract-parity-v1.json"));
 for(const sourceId of ["SRC-SKILL-009","SRC-SKILL-010"]){
  const row=matrix.rows.find((candidate:{sourceId:string})=>candidate.sourceId===sourceId);
  assert.equal(row.status,"PARTIAL");
  assert.deepEqual(row.gaps,[{contractId:sourceId.endsWith("009")?"AUTHOR-OUT-001":"AUDIT-OUT-001",note:"Generated-output compliance still requires Pi Free positive and negative probes in GSP-06."}]);
  assert.ok(row.evidence.includes("tests/skill-authoring-audit.test.ts"));
 }
});
