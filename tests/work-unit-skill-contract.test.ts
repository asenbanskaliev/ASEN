import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {auditSkillDocument} from "../src/skills/document.js";
import {selectSkills,type SkillPhase,type SkillSelectionContext} from "../src/skills/registry.js";

const skillPath="skills/asen-work-unit/SKILL.md";
const matrixPath="registry/parity/skill-contract-parity-v1.json";
const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");
const selected=(context:SkillSelectionContext)=>selectSkills(context).map(skill=>skill.id);
const markers=(text:string,patterns:readonly RegExp[])=>patterns.forEach(pattern=>assert.match(text,pattern));

test("direct runtime triggers activate work-unit behavior and unrelated phases do not",()=>{
 for(const context of [{codeChange:true},{behaviorChange:true},{filesTouched:2},{phase:"tasks" as SkillPhase}])
  assert.ok(selected(context).includes("asen-work-unit"),`missing work-unit for ${JSON.stringify(context)}`);
 for(const phase of ["issue","docs","collaboration-message","archive"] as const)
  assert.ok(!selected({phase}).includes("asen-work-unit"),`unexpected work-unit activation for ${phase}`);
});

test("delivery-chain selection includes its required work-unit execution discipline",()=>{
 const ids=selected({phase:"delivery-chain"});
 assert.ok(ids.includes("asen-delivery-chain"));
 assert.ok(ids.includes("asen-work-unit"));
});

test("work-unit Skill passes parser audit, ordered sections, and body budget",async()=>{
 const text=await read(skillPath),audit=auditSkillDocument(text,{directoryName:"asen-work-unit"});
 assert.deepEqual(audit.issues,[]);
 assert.ok(audit.bodyWordCount>=180&&audit.bodyWordCount<=450);
 assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
});

test("activation covers implementation boundaries and excludes adjacent-only work",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /implementation, refactor, or bug-fix work.*commit splits or review boundaries.*task-to-commit traceability.*evidence\/rollback alignment/is,
  /do not activate for prose-only collaboration or issue-only triage/is,
  /Delivery Chain owns chain strategy decisions.*Work Unit activates within each chain slice.*cohesive commit\/evidence\/review boundaries/is
 ]);
});

test("one behavior, complete partition, and honest accounting define the boundary",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /one observable behavior and one independent rollback boundary per unit/is,
  /implementation, focused tests, runtime evidence, documentation, and task record together/is,
  /split mixed behaviors; never split by file type or code-golf/is,
  /explicit feature branch.*stop on the explicit default branch/is,
  /authored additions plus deletions at or below 400.*Delivery Chain/is,
  /task document in exact expected changed paths.*partition every changed path exactly once/is,
  /generated artifact.*path-bound lowercase SHA evidence.*never let generated output hide or reduce authored lines/is
 ]);
});

test("evidence, commit freeze, and one-shot provenance remain exact",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /focused tests, runtime harness evidence, and documentation as `required`.*exact boundary-approved `n_a` reason/is,
  /previous reviewed boundary and delivery relationship exactly/is,
  /after all source mutation.*Conventional Commit snapshot.*one consistent lowercase Git object width/is,
  /current tree to equal frozen commit tree.*exact commit identity in the task document/is,
  /first evidence-recording and candidate-binding attempts as one-shot.*burn provenance/is,
  /stop on drift, failed verification, malformed evidence, reused provenance, or missing authority/is
 ]);
});

test("review candidate identity is exact and grants no authority",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /exact commit or repository-bound PR slice, never a task checkbox, TODO, branch, or accumulated feature branch/is,
  /exact repository, task, boundary, revision, tree, previous-boundary, and dependency facts/is,
  /planning and recording as evidence only.*no review verdict, readiness, publication, merge, or repository authority/is,
  /candidate identity, delivery relationship, and unresolved facts.*no authority, verdict, readiness, publication, or merge claim/is
 ]);
});

test("contract contains no foreign branding or unsafe boundary fallback",async()=>{
 const text=await read(skillPath),forbiddenBrand=["Gen","tle(?: AI|-AI)"].join("");
 assert.doesNotMatch(text,new RegExp(`${forbiddenBrand}|\\.atl\\b|gh auth|personal access token|private key`,"i"));
 assert.doesNotMatch(text,/use a task checkbox as the review candidate|retry burned claims until accepted|ignore tree drift/i);
 markers(text,[/never split by file type or code-golf/is,/stop on drift/is,/never retry a burned claim/is]);
});

test("SRC-SKILL-012 retains only the Pi Free gap with deterministic E1 and Skill evidence",async()=>{
 const matrix=JSON.parse(await read(matrixPath)) as {rows:Array<Record<string,unknown>>};
 const row=matrix.rows.find(candidate=>candidate.sourceId==="SRC-SKILL-012");
 assert.ok(row);
 assert.equal(row.status,"PARTIAL");
 assert.deepEqual(row.gaps,[{contractId:"UNIT-OUT-001",note:"Generated-output compliance still requires Pi Free positive and negative probes in GSP-06."}]);
 assert.deepEqual(row.evidence,[
  "tests/work-unit-skill-contract.test.ts — activation, parser/style, semantic, prohibited-behavior, and matrix evidence",
  "tests/work-unit-policy.test.ts — deterministic branch, split, line-budget, path, applicability, and boundary-provenance evidence",
  "tests/work-unit-evidence.test.ts — deterministic one-shot evidence, exact partition, generated identity, commit, tree, task, and delivery-relation evidence",
  "tests/work-unit-review-candidate.test.ts — deterministic exact commit or repository-bound PR-slice candidate evidence"
 ]);
});
