import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL("../"+path,import.meta.url),"utf8");
const canonical=["Activation Contract","Hard Rules","Decision Gates","Execution Steps","Output Contract","References"];

test("La skill de comentarios conserva las seis secciones, sus reglas y el presupuesto",async()=>{
 const skill=await read("skills/asen-comment-writer/SKILL.md");
 const sections=[...skill.matchAll(/^## (.+)$/gm)].map(match=>match[1]);
 assert.deepEqual(sections,canonical);
 assert.match(skill,/^description: "Trigger: .+"$/m);
 assert.match(skill,/Match target context language/u);
 assert.match(skill,/No em dashes/u);
 assert.match(skill,/Comment Formula/u);
 const body=skill.slice(skill.indexOf("## Activation Contract"));
 const words=(body.match(/[\p{L}\p{N}]+/gu)??[]).length;
 assert.ok(words>=180&&words<=450,"La skill debe tener 180-450 palabras, observadas: "+words);
 assert.doesNotMatch(skill,/\.atl(?:\/|\\|\b)/u);
 const examples=await read("skills/asen-comment-writer/references/examples.md");
 for(const original of ["### Request change","### Approve with a note","### Ask for split"])
  assert.ok(examples.includes(original),"Ejemplo perdido: "+original);
 assert.match(skill,/references\/examples\.md/u);
});

test("La skill de mejora usa el registro propio de ASEN sin rutas heredadas",async()=>{
 const skill=await read("skills/asen-skill-improver/SKILL.md");
 assert.deepEqual([...skill.matchAll(/^## (.+)$/gm)].map(match=>match[1]),canonical);
 assert.match(skill,/^description: "Trigger: /mu);
 assert.match(skill,/Do not activate for one-off prose/u);
 assert.match(skill,/Verify support paths inside this repository/u);
 assert.match(skill,/Do not claim behavioral parity from format alone/u);
 assert.match(skill,/positive and negative tests/u);
 const body=skill.slice(skill.indexOf("## Activation Contract"));
 const words=(body.match(/[\p{L}\p{N}]+/gu)??[]).length;
 assert.ok(words>=180&&words<=450,"La skill de mejora excede el objetivo de palabras: "+words);
 assert.equal((skill.match(/\.asen\/skill-registry\.md/gu)??[]).length,2);
 assert.doesNotMatch(skill,/\.atl(?:\/|\\|\b)/u);
 assert.match(skill,/skills\/asen-skill-registry\/SKILL\.md/u);
 const target=await read("skills/asen-skill-registry/SKILL.md");
 assert.match(target,/\.asen\/skill-registry\.md/u);
});
