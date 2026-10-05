import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {auditSkillDocument} from "../src/skills/document.js";
import {selectSkills,type SkillPhase} from "../src/skills/registry.js";

const skillPath="skills/asen-delivery-branch/SKILL.md";
const matrixPath="registry/parity/skill-contract-parity-v1.json";
const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");
const selected=(phase:SkillPhase)=>selectSkills({phase}).map(skill=>skill.id);
const markers=(text:string,patterns:readonly RegExp[])=>patterns.forEach(pattern=>assert.match(text,pattern));

test("runtime selection activates delivery branch only for its phase",()=>{
 assert.ok(selected("delivery-branch").includes("asen-delivery-branch"));
 for(const phase of ["issue","delivery-chain","docs","collaboration-message","archive"] as const)
  assert.ok(!selected(phase).includes("asen-delivery-branch"),`unexpected delivery branch activation for ${phase}`);
});

test("delivery branch Skill passes the parser audit, ordered sections, and body budget",async()=>{
 const text=await read(skillPath),audit=auditSkillDocument(text,{directoryName:"asen-delivery-branch"});
 assert.deepEqual(audit.issues,[]);
 assert.ok(audit.bodyWordCount>=180&&audit.bodyWordCount<=450);
 assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
});

test("activation covers delivery stages and excludes adjacent workflows",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /branch creation or preparation.*commit preparation.*push.*pull-request creation or update preparation.*PR labels.*delivery status/is,
  /exclude.*ordinary issue drafting.*chained or stacked planning.*generic documentation.*merge-only requests unless exact delivery state/is
 ]);
});

test("contract requires exact policy, candidate, authority, and readback facts",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /exact `\[HOST\/\]OWNER\/REPO`.*explicit base branch.*current target policy.*genuine open approved issue/is,
  /supported branch and Conventional Commit names.*PR template or explicit waiver.*required-check policy.*exactly one permitted `type:\*` label.*candidate-bound test and diff facts/is,
  /separate one-use `remote_read` authority.*policy inspection.*each fresh pre-label read/is,
  /separate one-use mutation authority.*local branch creation.*every commit.*push.*PR open or update.*label mutation.*merge/is,
  /exact readback.*`confirmed`, `no_write`, or `unknown`.*`unknown` blocks every later stage/is,
  /exactly empty initial labels.*genuine confirmed PR.*authorized fresh exact pre-read.*conditional baseline token.*one combined mutation and readback.*preserve unrelated labels/is,
  /protected `size:exception` requires MAINTAIN or ADMIN.*specific rationale/is,
  /required checks as exact-case policy identities.*observed states.*workflow names do not prove required checks/is,
  /successful checks leave merge pending separate current authority/is
 ]);
});

test("decision gates and output distinguish every delivery stage and evidence class",async()=>{
 const text=await read(skillPath);
 markers(text,[
  /Return draft\/stop with the smallest missing fact/,
  /Return prepare-only material/,
  /Local branch or next commit is authorized.*Attempt once.*exact confirmed readback/is,
  /Push is authorized.*confirm the exact remote head/is,
  /PR open or update is authorized.*confirm target, content, head, and empty labels/is,
  /Label mutation is authorized.*conditional combined mutation and readback/is,
  /Checks succeed.*merge pending.*separate current merge authority/is,
  /Return target.*policy\/base.*approved issue.*branch\/commits.*PR\/template\/type label/is,
  /local tests versus remote required-check observations.*every action's `confirmed`, `no_write`, or `unknown` state.*pending actions\/authority.*unresolved facts/is
 ]);
});

test("contract contains no foreign branding, private authority, or unsafe fallback",async()=>{
 const text=await read(skillPath),forbiddenBrand=["Gen","tle(?: AI|-AI)"].join("");
 assert.doesNotMatch(text,new RegExp(`${forbiddenBrand}|\\.atl\\b|gh auth|personal access token|private key`,"i"));
 assert.doesNotMatch(text,/assume (?:a|the) default (?:branch|repository)|force[- ]push|retry until confirmed|merge-ready/i);
 markers(text,[
  /never infer a default branch or repository.*probe ambient credentials.*invent issue approval, labels, checks, permissions, or template facts/is,
  /blanket-check declarations.*force-update.*blindly retry.*claim merge/is,
  /stop on `no_write` or `unknown`/is
 ]);
});

test("SRC-SKILL-001 retains only the Pi Free generated-output gap with exact C1-C4 evidence",async()=>{
 const matrix=JSON.parse(await read(matrixPath)) as {rows:Array<Record<string,unknown>>};
 const row=matrix.rows.find(candidate=>candidate.sourceId==="SRC-SKILL-001");
 assert.ok(row);
 assert.equal(row.status,"PARTIAL");
 assert.deepEqual(row.gaps,[{contractId:"BRANCH-OUT-001",note:"Generated-output compliance still requires Pi Free positive and negative probes in GSP-06."}]);
 assert.deepEqual(row.evidence,[
  "tests/delivery-branch-skill-contract.test.ts — activation, parser/style, semantic, prohibited-behavior, and matrix evidence",
  "tests/branch-preparation.test.ts — deterministic exact-target policy and branch/PR preparation behavior",
  "tests/local-delivery.test.ts — deterministic separately authorized branch and commit behavior",
  "tests/remote-delivery.test.ts — deterministic push and empty-label PR publication behavior",
  "tests/pr-label-publication.test.ts — deterministic conditional label, exact-check, and pending-merge behavior",
  "tests/repository-operation-policy.test.ts — deterministic exact-operation authority and readback behavior"
 ]);
});
