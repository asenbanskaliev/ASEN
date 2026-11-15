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
// Metadata-only coverage for the project-owned legacy Skills, not body conformance.
const metadataSkillNames=[
 "apply","archive","context-init","design","explore","go-testing","phase-protocol",
 "proposal","review","safe-change","specification","status","tasks","verify"
].map(suffix=>`asen-${suffix}`);
function assertProjectMetadata(text:string,directoryName:string){
 const normalized=text.replace(/\r\n?/g,"\n");
 const header=/^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized)?.[1];
 assert.ok(header,"closed frontmatter is required");
 // MIT follows package.json/LICENSE; ASEN and 1.0.0 follow existing Skill metadata.
 // Keep metadata presence independent of legacy body and reference conformance.
 assert.match(header,/^name: [^\n]+\ndescription: "(?:[^"\\]|\\.)*"\nlicense: MIT\nmetadata:\n  author: ASEN\n  version: "(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"$/);
 const indexed=parseSkillIndexMetadata(normalized);
 assert.equal(indexed?.name,directoryName);
 assert.ok(indexed?.description.startsWith("Trigger:"));
 assert.ok(indexed.description.length<=250);
}

for(const name of metadataSkillNames){
 test(`project Skill metadata is present and valid: ${name}`,async()=>{
  assertProjectMetadata(await read(`skills/${name}/SKILL.md`),name);
 });
}

test("exploration delivery rules are nested under output without changing their content",async()=>{
 const text=await read("skills/asen-explore/SKILL.md");
 const current=auditSkillDocument(text,{directoryName:"asen-explore"});
 assert.ok(!current.issues.some(issue=>issue.code==="invalid-section-order"));
 assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
 const heading="### Background Completion Contract";
 assert.ok(text.indexOf(heading)>text.indexOf("## Output Contract"));
 assert.ok(text.indexOf(heading)<text.indexOf("## References"));
 for(const rule of [
  "- Return a compact read-only report tied to the original question; distinguish observed facts from assumptions and unknowns.",
  "- When started asynchronously, retain the task ID; completion is delivered by an event, not by sleep or repeated status polling. Inspect status only when there is a genuine next orchestration decision.",
  "- Never interpret an Explorer report as permission to write, merge, rerun a failed worker, or accept a reviewer result."
 ]) assert.ok(text.includes(rule),"Existing background rule must be preserved");
 const extraH2=replace(text,heading,"## Background Completion Contract");
 const invalid=auditSkillDocument(extraH2,{directoryName:"asen-explore"});
 assert.ok(invalid.issues.some(issue=>issue.code==="invalid-section-order"));
 assert.deepEqual(invalid.metadata,current.metadata);
 assert.equal(invalid.bodyWordCount,current.bodyWordCount);
});

test("project Skill metadata validation rejects missing or malformed fields",()=>{
 const valid=validDocument().replace("license: Apache-2.0","license: MIT");
 assertProjectMetadata(valid,"example-skill");
 for(const [from,to] of [
  ["license: MIT\n",""],["license: MIT","license: unknown"],
  ["metadata:\n  author: ASEN\n  version: \"1.0.0\"",""],
  ["  author: ASEN","  author:"],["  author: ASEN","  author: invented-author"],
  ['  version: "1.0.0"','  version: "1.0"'],
  ['  version: "1.0.0"','  version: "01.0.0"'],
  ["metadata:","extra: value\nmetadata:"],
  ["  author: ASEN","  author: ASEN\n  author: duplicate"]
 ]) assert.throws(()=>assertProjectMetadata(valid.replace(from!,to!),"example-skill"));
 assert.throws(()=>assertProjectMetadata(valid,"wrong-directory"));
});

test("project Skill metadata validation is separate from legacy body conformance",()=>{
 const header=validDocument().replace("license: Apache-2.0","license: MIT").split("## Activation Contract")[0]!;
 const legacy=`${header}## Legacy section\nShort legacy body.\n`;
 assertProjectMetadata(legacy,"example-skill");
 assertHas(legacy,"invalid-section-order");
 assertHas(legacy,"body-below-target");
});

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

test("accepts ASEN MIT policy without weakening strict license or document checks",()=>{
 const mit=replace(validDocument(),"license: Apache-2.0","license: MIT");
 assert.deepEqual(codes(mit),[]);
 for(const license of ["", "license: BSD-3-Clause", "license: unknown", 'license: "MIT"'])
  assertHas(replace(mit,"license: MIT",license),"invalid-frontmatter");
 assertHas(replace(mit,"  author: ASEN","  author:"),"invalid-frontmatter");
 assertHas(replace(mit,'  version: "1.0.0"','  version: "1.0"'),"invalid-frontmatter");
 assertHas(replace(mit,"## Hard Rules","## Other Rules"),"invalid-section-order");
 assertHas(replace(mit,"references/details.md","../outside.md"),"nonlocal-reference");
 assertHas(replace(validDocument(20),"license: Apache-2.0","license: MIT"),"body-below-target");
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
