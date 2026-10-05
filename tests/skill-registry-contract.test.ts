import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {auditSkillDocument} from "../src/skills/document.js";
import {selectSkills} from "../src/skills/registry.js";

const skillPath="skills/asen-skill-registry/SKILL.md";
const sections=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];
const read=async(path:string)=>(await readFile(path,"utf8")).replace(/\r\n?/g,"\n");

await test("registry Skill follows the strict style and body budget",async()=>{
 const text=await read(skillPath),audit=auditSkillDocument(text,{directoryName:"asen-skill-registry"});
 assert.deepEqual(audit.issues,[]);
 assert.ok(audit.bodyWordCount>=180&&audit.bodyWordCount<=450);
 assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match=>match[1]),sections);
});

await test("registry Skill declares activation and non-activation boundaries",async()=>{
 const text=await read(skillPath);
 for(const marker of [
  /activate.*refresh.*index.*discover/is,
  /installed.*project.*user.*global.*Skills/is,
  /must not activate.*candidate-bound.*static Skill authority/is,
  /must not activate.*arbitrary code changes/is,
 ]) assert.match(text,marker);
});

await test("registry Skill encodes deterministic discovery, cache, and authority semantics",async()=>{
 const text=await read(skillPath);
 for(const marker of [
  /\.asen\/skill-registry\.md.*schema-1 cache/is,
  /project.*user.*global.*configured.*order.*canonical lexical.*first accepted.*wins/is,
  /recursive/is,
  /invalid.*missing.*excluded.*duplicate.*unreadable.*outside-source/is,
  /successful empty registry/is,
  /fingerprint.*add.*remove.*move.*content.*source-order.*tamper/is,
  /exact canonical paths?.*unknown.*fail closed/is,
  /atomic.*registry first.*cache second/is,
  /valid.*hit.*no local rewrite/is,
  /memory mirror.*hit.*miss.*never blocks.*local/is,
  /forbid.*inject.*dynamic paths.*candidate-bound static authority/is,
 ]) assert.match(text,marker);
 assert.doesNotMatch(text,/\.atl(?:\/|\\|\b)/i);
});

await test("registry Skill requires complete output and ambiguity reporting",async()=>{
 const text=await read(skillPath);
 for(const marker of [/path.*count.*cache status.*entries.*diagnostics.*persistence/is,/unresolved ambigu/is]) assert.match(text,marker);
});

await test("runtime selection activates only the registry phase",()=>{
 assert.deepEqual(selectSkills({phase:"skill-registry"}).map(skill=>skill.id),["asen-skill-registry"]);
 assert.ok(!selectSkills({phase:"explore"}).some(skill=>skill.id==="asen-skill-registry"));
});

await test("registry parity remains honestly PARTIAL with one bounded GSP-06 gap",async()=>{
 const matrix=JSON.parse(await read("registry/parity/skill-contract-parity-v1.json"));
 const row=matrix.rows.find((candidate:{sourceId:string})=>candidate.sourceId==="SRC-SKILL-011");
 assert.equal(row.status,"PARTIAL");
 assert.deepEqual(row.gaps,[{
  contractId:"REGISTRY-OUT-001",
  note:"GSP-06 must add Pi Free activation, generated-output reporting, and exact-path delegation probes.",
 }]);
 assert.deepEqual(row.evidence,[
  "tests/skill-discovery.test.ts",
  "tests/generated-skill-registry.test.ts",
  "tests/skill-registry-contract.test.ts",
 ]);
});

await test("CAP-SKL-001 remains specified outside this slice scope",async()=>{
 const capability=await read("registry/capabilities/CAP-SKL-001-pi-native-skills.yaml");
 assert.match(capability,/^id: CAP-SKL-001$/m);
 assert.match(capability,/^status: specified$/m);
});
