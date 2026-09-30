import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {auditSkillDocument} from "../src/skills/document.js";
import {selectSkills,type SkillPhase} from "../src/skills/registry.js";

const skillPath="skills/asen-delivery-chain/SKILL.md";
const matrixPath="registry/parity/skill-contract-parity-v1.json";
const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");
const selected=(phase:SkillPhase)=>selectSkills({phase}).map(skill=>skill.id);
const markers=(text:string,patterns:readonly RegExp[])=>patterns.forEach(pattern=>assert.match(text,pattern));

test("runtime selection activates delivery chain only for its phase",()=>{
 assert.ok(selected("delivery-chain").includes("asen-delivery-chain"));
 for(const phase of ["delivery-branch","issue","docs","collaboration-message","archive"] as const)
  assert.ok(!selected(phase).includes("asen-delivery-chain"),`unexpected delivery chain activation for ${phase}`);
});

test("delivery chain Skill passes parser audit, ordered sections, and body budget",async()=>{
 const text=await read(skillPath),audit=auditSkillDocument(text,{directoryName:"asen-delivery-chain"});
 assert.deepEqual(audit.issues,[]);
 assert.ok(audit.bodyWordCount>=180&&audit.bodyWordCount<=450);
 assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
});

test("activation covers budget risk, generated scope, and explicit chain requests",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /exceeds or risks 400 complete changed lines.*about 60 minutes/is,
  /generated artifacts push complete scope over budget/is,
  /requests chained or stacked PRs, review slices, or reviewer-load control/is,
  /exclude ordinary focused under-budget branch or PR delivery and commit-only planning/is
 ]);
});

test("one-pass complete accounting cannot hide or discard evidence",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /one honest slicing pass.*cohesive deliverable behavior and rollback boundary/is,
  /keep tests and docs with their behavior.*never slice by file type/is,
  /never.*delete, compress, or restyle evidence to fit/is,
  /exactly 400 complete additions plus deletions.*roughly 60 review minutes/is,
  /generated artifacts retain SHA and classification evidence.*complete budgets.*complete snapshot/is,
  /never use them to hide authored lines/is
 ]);
});

test("strategy gates require explicit bases and preserve one strategy",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /exact explicit integration branch; never infer a default/is,
  /preserve one selected strategy throughout/is,
  /focused, under both budgets, and no chain request.*`single`/is,
  /independently landable.*`stacked-main`.*explicit integration branch/is,
  /dependent integration.*`feature-chain`.*draft\/no-merge tracker.*child 1.*later child.*immediate parent/is,
  /no honest cohesive fit.*`exception-required`.*replan or `size:exception`.*never grant authority/is
 ]);
});

test("validation, diagrams, stop conditions, and output remain complete",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /exact ordered commit partition, bases, dependencies, clean expected-versus-observed diff paths/is,
  /complete verification, docs, rollback, start, end, follow-up, and out-of-scope evidence/is,
  /reject cycles, forward dependencies, and polluted child diffs/is,
  /current slice with 📍 in every dependency diagram/is,
  /over budget or has a polluted diff.*stop and replan/is,
  /planning grants no publication, merge, or readiness authority/is,
  /authored, generated, and complete budgets.*tracker or exception status.*pending publication and merge authority.*unresolved facts/is
 ]);
});

test("contract contains no foreign branding, private authority, or unsafe fallback",async()=>{
 const text=await read(skillPath),forbiddenBrand=["Gen","tle(?: AI|-AI)"].join("");
 assert.doesNotMatch(text,new RegExp(`${forbiddenBrand}|\\.atl\\b|gh auth|personal access token|private key`,"i"));
 assert.doesNotMatch(text,/assume (?:a|the) default branch|split by file type|mix strategies|merge-ready|publish automatically/i);
 markers(text,[/never infer a default/is,/do not publish or merge/is,/pending separate exact authority/is]);
});

test("SRC-SKILL-002 retains only the Pi Free gap with deterministic D1a, D1b, and Skill evidence",async()=>{
 const matrix=JSON.parse(await read(matrixPath)) as {rows:Array<Record<string,unknown>>};
 const row=matrix.rows.find(candidate=>candidate.sourceId==="SRC-SKILL-002");
 assert.ok(row);
 assert.equal(row.status,"PARTIAL");
 assert.deepEqual(row.gaps,[{contractId:"CHAIN-OUT-001",note:"Generated-output compliance still requires Pi Free positive and negative probes in GSP-06."}]);
 assert.deepEqual(row.evidence,[
  "tests/delivery-chain-skill-contract.test.ts — activation, parser/style, semantic, prohibited-behavior, and matrix evidence",
  "tests/chain-policy.test.ts — deterministic strategy, slicing, dependency, clean-diff, and complete slice evidence",
  "tests/chain-artifact-accounting.test.ts — deterministic path-bound generated-artifact and complete-budget evidence"
 ]);
});
