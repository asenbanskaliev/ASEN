import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {auditSkillDocument} from "../src/skills/document.js";
import {getSkillContract,selectSkills,type SkillPhase,type SkillSelectionContext} from "../src/skills/registry.js";

const skillPath="skills/asen-tdd/SKILL.md";
const matrixPath="registry/parity/skill-contract-parity-v1.json";
const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");
const selected=(context:SkillSelectionContext)=>selectSkills(context).map(skill=>skill.id);
const markers=(text:string,patterns:readonly RegExp[])=>patterns.forEach(pattern=>assert.match(text,pattern));

test("asen-tdd has the exact runtime contract and selects only from behavior-change facts",()=>{
 const contract=getSkillContract("asen-tdd");
 assert.deepEqual(contract,{
  id:"asen-tdd",path:"skills/asen-tdd/SKILL.md",triggers:["behavior-change"],requires:["asen-work-unit"],evidence:["lifecycle-completion"],blocks:["verification"]
 });
 assert.ok(selected({behaviorChange:true}).includes("asen-tdd"));
 for(const context of [{},{codeChange:true},{behaviorChange:false},{filesTouched:2},{verification:true}])
  assert.ok(!selected(context).includes("asen-tdd"),`unexpected TDD activation for ${JSON.stringify(context)}`);
 for(const phase of ["explore","tasks","apply","verify","archive"] as SkillPhase[])
  assert.ok(!selected({phase}).includes("asen-tdd"),`unexpected TDD activation for ${phase}`);
});

test("TDD Skill passes the actual parser audit, exact section order, and body budget",async()=>{
 const text=await read(skillPath),audit=auditSkillDocument(text,{directoryName:"asen-tdd"});
 assert.deepEqual(audit.issues,[]);
 assert.ok(audit.bodyWordCount>=180&&audit.bodyWordCount<=450);
 assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
});

test("activation is derived from genuine ODD behavior and testing facts and blocks ambiguity",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /genuine ODD.*behavior-changing write.*testing is required/is,
  /ambiguous or contradictory.*block before cycle authority/is,
  /do not activate.*non-behavior.*behaviorChange/is
 ]);
});

test("strict phases use runner-derived evidence and exact direct-child diffs",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /fixed local Node TAP.*RED twice.*assertion/is,
  /arbitrary nonzero exit.*caller-supplied/is,
  /RED.*test-only.*GREEN.*behavior-only.*triangulation.*test-only.*refactor.*behavior-only/is,
  /direct-child/is,
  /minimum GREEN.*unchanged RED tests/is,
  /V8.*materially distinct decision paths.*structurally single.*N\/A/is
 ]);
});

test("completion distinguishes strict TDD from the sole verified alternative",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /performed or explicitly not needed.*refactor/is,
  /baseline-already-passes.*only non-TDD alternative/is,
  /exact baseline.*direct behavior-only child.*per-case V8/is,
  /never label.*TDD/is,
  /genuine one-use.*promotion/is
 ]);
});

test("recovery and completion gates exclude generic authority and rollback claims",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /HMAC-bound v2.*verify\/archive-only/is,
  /legacy generic.*audit-only/is,
  /exact `lifecycle-completion`.*verification gate/is,
  /no.*test, review, mutation, release, or delivery authority/is,
  /no same-binding anti-rollback claim/is
 ]);
 assert.doesNotMatch(text,/retry RED until|treat generic cycles as completion|grants? (?:review|mutation|release|delivery) authority/is);
});

test("SRC-SKILL-005 binds deterministic TDD evidence while remaining PARTIAL",async()=>{
 const matrix=JSON.parse(await read(matrixPath)) as {rows:Array<Record<string,unknown>>};
 const row=matrix.rows.find(candidate=>candidate.sourceId==="SRC-SKILL-005");
 assert.ok(row);
 assert.equal(row.asenSkill,"skills/asen-odd/SKILL.md");
 assert.equal(row.status,"PARTIAL");
 assert.deepEqual(row.gaps,[
  {contractId:"ODD-RULE-001",note:"Deterministic ODD normalization and Pi-host tracking bridge are implemented; Pi Free generated-output evidence remains pending GSP-06."},
  {contractId:"ODD-OUT-001",note:"Pi Free positive and negative generated-output, package, and platform evidence remains pending GSP-06."}
 ]);
 assert.deepEqual(row.evidence,[
  "tests/tdd-skill-contract.test.ts — runtime selection, parser/style, semantic, prohibited-behavior, and matrix evidence",
  "tests/lifecycle-tdd-applicability.test.ts — genuine ODD fact-bound applicability and contradiction evidence",
  "tests/tdd-deterministic-red.test.ts — fixed Node TAP runner and deterministic assertion-derived RED evidence",
  "tests/tdd-strict-green.test.ts — exact direct-child minimum GREEN evidence",
  "tests/tdd-strict-triangulation.test.ts — per-case V8 decision-path triangulation and structural N/A evidence",
  "tests/tdd-refactor-completion.test.ts — performed-or-not-needed refactor completion evidence",
  "tests/tdd-non-tdd-alternative.test.ts — baseline-already-passes verified non-TDD evidence",
  "tests/tdd-completion-record.test.ts — exact strict and alternative completion-record evidence",
  "tests/lifecycle-tdd-completion.test.ts — genuine one-use lifecycle promotion evidence",
  "tests/lifecycle-tdd-persistence.test.ts — HMAC-bound v2 verify/archive recovery evidence",
  "tests/evidence-tdd.test.ts — exact lifecycle-completion gate and legacy audit-only evidence"
 ]);
});
