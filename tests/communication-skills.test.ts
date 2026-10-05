import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {selectSkills,type SkillPhase} from "../src/skills/registry.js";

const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const communicationSkillIds=["asen-doc-design","asen-collaboration-message"] as const;
const paths={
 doc:"skills/asen-doc-design/SKILL.md",
 comment:"skills/asen-collaboration-message/SKILL.md"
} as const;

const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");
const bodyOf=(text:string)=>text.replace(/^---\n[\s\S]*?\n---\n/,"");
const words=(text:string)=>text.match(/[\p{L}\p{N}][\p{L}\p{N}'’/-]*/gu)??[];

function assertStyle(text:string,name:string){
 const match=text.match(/^---\n([\s\S]*?)\n---\n/);
 assert.ok(match,`${name}: missing frontmatter`);
 const lines=match[1]!.split("\n");
 assert.match(lines[0]!,new RegExp(`^name: ${name}$`));
 assert.match(lines[1]!,/^description: "Trigger: .+"$/);
 assert.ok(lines[1]!.length<=263,`${name}: description exceeds 250 characters`);
 assert.equal(lines[2],"license: Apache-2.0");
 assert.equal(lines[3],"metadata:");
 assert.match(lines[4]!,/^  author: \S.+$/);
 assert.match(lines[5]!,/^  version: "?\d+\.\d+\.\d+"?$/);
 assert.equal(lines.length,6,`${name}: frontmatter must contain only required fields`);
 const headings=[...bodyOf(text).matchAll(/^## (.+)$/gm)].map(item=>item[1]);
 assert.deepEqual(headings,sections,`${name}: sections must be exact and ordered`);
 const count=words(bodyOf(text)).length;
 assert.ok(count>=180&&count<=450,`${name}: body token approximation ${count} is outside 180-450`);
}

function assertMarkers(text:string,markers:RegExp[]){
 for(const marker of markers)assert.match(text,marker);
}

function selectedCommunicationSkills(phase:SkillPhase){
 const selected=new Set(selectSkills({phase}).map(skill=>skill.id));
 return communicationSkillIds.filter(id=>selected.has(id));
}

test("runtime registry routes communication Skills only for their activation phases",()=>{
 assert.deepEqual(selectedCommunicationSkills("docs"),["asen-doc-design"]);
 assert.deepEqual(selectedCommunicationSkills("collaboration-message"),["asen-collaboration-message"]);
 assert.deepEqual(selectedCommunicationSkills("explore"),[]);
});

test("communication Skills follow exact frontmatter, section, and body-budget style",async()=>{
 for(const [name,path] of Object.entries(paths).map(([key,path])=>[key==="doc"?"asen-doc-design":"asen-collaboration-message",path] as const))
  assertStyle(await read(path),name);
});

test("documentation design selects human documentation and rejects non-document work",async()=>{
 const text=await read(paths.doc);
 assertMarkers(text,[
  /human-facing.*technical.*architecture.*review.*onboarding.*contributor/is,
  /must not activate.*private scratch notes.*source comments.*ordinary code changes/is
 ]);
});

test("documentation design encodes the complete authoring and validation contract",async()=>{
 const text=await read(paths.doc);
 assertMarkers(text,[
  /audience.*reader task/is,
  /answer|decision|outcome/,
  /quick path/i,
  /progressive disclosure/i,
  /chunk/i,
  /signpost/i,
  /review order/i,
  /out-of-scope/i,
  /actionable checklist|reusable template/i,
  /tables only when.*comparison|tables only when.*ambiguity/is,
  /validate.*commands.*claims.*links.*reader-task usability/is,
  /audience.*outcome\/action.*review path.*scope boundary.*validation.*unresolved risks/is
 ]);
});

test("collaboration messaging selects human async messages and rejects other prose",async()=>{
 const text=await read(paths.comment);
 assertMarkers(text,[
  /human.*repository.*asynchronous collaboration messages/is,
  /must not activate.*UI copy.*documentation.*source comments.*message itself is requested/is
 ]);
});

test("collaboration messaging encodes language, tone, priority, and authority constraints",async()=>{
 const text=await read(paths.comment);
 assertMarkers(text,[
  /target-context language/i,
  /explicit user language or tone override/i,
  /English.*English.*Spanish.*Spanish.*mixed.*target-message language/is,
  /public Spanish.*neutral.*professional/is,
  /warm.*direct.*evidence-based.*no blame/is,
  /1–3 short paragraphs|1-3 short paragraphs/i,
  /highest-value actionable point first/i,
  /no preference pile-on/i,
  /technical impact.*reason/is,
  /exactly one clear next action/i,
  /required correction.*suggestion.*approval.*bounded question/is,
  /prohibit.*em dash|do not use em dashes/i,
  /never claim approval.*verification.*intent.*authority/is
 ]);
});

test("communication matrix rows stay PARTIAL with local evidence and only the Pi Free probe gap",async()=>{
 const matrix=JSON.parse(await read("registry/parity/skill-contract-parity-v1.json"));
 for(const sourceId of ["SRC-SKILL-003","SRC-SKILL-004"]){
  const row=matrix.rows.find((candidate:{sourceId:string})=>candidate.sourceId===sourceId);
  assert.ok(row,`missing ${sourceId}`);
  assert.equal(row.status,"PARTIAL");
  assert.deepEqual(row.gaps,[{
   contractId:sourceId==="SRC-SKILL-003"?"DOC-OUT-001":"COMMENT-OUT-001",
   note:"Generated-output compliance still requires Pi Free positive and negative probes in GSP-06."
  }]);
  assert.ok(row.evidence.includes("tests/communication-skills.test.ts"));
 }
});
