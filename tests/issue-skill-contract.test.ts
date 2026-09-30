import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {auditSkillDocument} from "../src/skills/document.js";
import {selectSkills,type SkillPhase} from "../src/skills/registry.js";

const skillPath="skills/asen-issue-workflow/SKILL.md";
const matrixPath="registry/parity/skill-contract-parity-v1.json";
const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");
const selected=(phase:SkillPhase)=>selectSkills({phase}).map(skill=>skill.id);
const markers=(text:string,patterns:readonly RegExp[])=>patterns.forEach(pattern=>assert.match(text,pattern));

test("runtime selection activates the issue Skill only for the issue phase",()=>{
 assert.ok(selected("issue").includes("asen-issue-workflow"));
 for(const phase of ["delivery-branch","delivery-chain","docs","collaboration-message"] as const)
  assert.ok(!selected(phase).includes("asen-issue-workflow"),`unexpected issue activation for ${phase}`);
});

test("issue Skill passes the actual document audit with exact sections and target budget",async()=>{
 const text=await read(skillPath),audit=auditSkillDocument(text,{directoryName:"asen-issue-workflow"});
 assert.deepEqual(audit.issues,[]);
 assert.ok(audit.bodyWordCount>=180&&audit.bodyWordCount<=450);
 assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
});

test("activation includes issue work and excludes ordinary delivery and generic docs",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /creating, drafting, triaging, commenting on, or approving issues/is,
  /bug reports and feature requests/is,
  /do not activate.*ordinary pull-request or branch delivery.*generic documentation/is
 ]);
});

test("issue contract encodes exact preparation, authority, and one-attempt behavior",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /exact `\[HOST\/\]OWNER\/REPO`.*repository policy.*authoritative YAML Issue Form/is,
  /preserve every required control.*declared order/is,
  /open and closed issues.*complete evidence/is,
  /exact answers.*first-person affirmations.*never invent facts, answers, affirmations, labels, permissions, or authority/is,
  /privacy-scan the exact title, body, and labels.*reviewed redactions/is,
  /labels declared by the form.*existing in the exact repository inventory.*allowed by policy/is,
  /MAINTAIN or ADMIN.*direct exact-action authority.*TRIAGE is insufficient/is,
  /`size:exception`.*specific rationale/is,
  /smallest missing fact.*do not probe credentials/is,
  /one create or comment attempt.*one exact readback.*no retry/is,
  /`confirmed`, `no_write`, or `unknown`.*`unknown` blocks every later mutation/is,
  /genuine `confirmed` publication.*exact current pre-read.*immutable baseline conditional token/is,
  /one combined add\/remove mutation.*one readback.*preserving unrelated labels/is
 ]);
});

test("decision gates and output cover every terminal issue path",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /Return draft-only with the smallest missing fact/,
  /conforming duplicate.*canonical duplicate evidence/is,
  /does not conform.*Repair or narrow the candidate/is,
  /Complete evidence shows no duplicate.*Prepare a new issue/is,
  /Publication is not genuinely confirmed.*perform no later mutation/is,
  /Confirmed publication.*fresh exact-action authority/is,
  /exact target, selected form, duplicate decision and evidence, reviewed material/is,
  /publication or mutation attempt and readback.*final `confirmed`, `no_write`, or `unknown` outcome.*unresolved authority/is
 ]);
});

test("contract contains no upstream branding, private authority, or unsafe fallback",async()=>{
 const text=await read(skillPath);
 assert.doesNotMatch(text,/Gentle(?: AI|-AI)|\.atl\b|gh auth|personal access token|private key/i);
 assert.doesNotMatch(text,/assume (?:a|the) default repository|infer permission|retry until confirmed/i);
 assert.match(text,/do not probe credentials.*use a permissive fallback/is);
 assert.match(text,/never retry an uncertain write/i);
});

test("issue matrix row stays PARTIAL with only Pi Free generated-output work outstanding",async()=>{
 const matrix=JSON.parse(await read(matrixPath)) as {rows:Array<Record<string,unknown>>};
 const row=matrix.rows.find(candidate=>candidate.sourceId==="SRC-SKILL-006");
 assert.ok(row);
 assert.equal(row.status,"PARTIAL");
 assert.deepEqual(row.gaps,[{contractId:"ISSUE-OUT-001",note:"Generated-output compliance still requires Pi Free positive and negative probes in GSP-06."}]);
 assert.deepEqual(row.evidence,[
  "tests/issue-skill-contract.test.ts — activation, style, semantic, prohibited-behavior, and matrix evidence",
  "tests/issue-preparation.test.ts — 15/15 deterministic form, privacy, and duplicate-decision behaviors",
  "tests/issue-publication.test.ts — 11/11 deterministic publication and post-publication mutation behaviors",
  "tests/repository-operation-policy.test.ts — 11/11 deterministic authority, one-attempt, and protected-label behaviors"
 ]);
});
