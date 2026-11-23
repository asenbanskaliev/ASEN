import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const objectiveSource=load("../odd/tasks/flujo-de-agentes-estado-18-objetivos.md");
const delegationSource=load("../docs/audit/plan-quirurgico-delegacion-automatica-12-puntos-2026-11-21.md");
const matrix=load("../odd/tasks/flujo-agentes-18-objetivos-12-puntos-aceptacion-20261123.md");
function rows(doc:string){return doc.split("\n").filter(line=>/^\|\s*\d{2}\s*\|/u.test(line))
 .map(line=>line.split("|").slice(1,-1).map(cell=>cell.trim()));}
test("la aceptación conserva los 18 objetivos canónicos sin renombrarlos",()=>{
 const source=objectiveSource.split("\n").map(line=>line.match(/^\|\s*(\d{2})\s*\|\s*([^|]+?)\s*\|/u))
  .filter((match):match is RegExpMatchArray=>match!==null).map(match=>match[2]!.replaceAll("**","").trim());
 const actual=rows((matrix.split("## 18 objetivos")[1]??"").split("## 12 puntos adicionales")[0]??"");
 assert.equal(source.length,18);assert.equal(actual.length,18);
 for(let i=0;i<18;i++){assert.equal(actual[i]?.[0],String(i+1).padStart(2,"0"));assert.equal(actual[i]?.[1],source[i]);}
});
test("la aceptación conserva los 12 puntos originales de delegación",()=>{
 const source=delegationSource.split("\n").map(line=>line.match(/^\|\s*\*\*(\d{2})\.\s*([^*]+)\*\*\s*\|/u))
  .filter((match):match is RegExpMatchArray=>match!==null).map(match=>match[2]!.trim());
 const actual=rows((matrix.split("## 12 puntos adicionales")[1]??"").split("## Evidencia verificable")[0]??"");
 assert.equal(source.length,12);assert.equal(actual.length,12);
 for(let i=0;i<12;i++){assert.equal(actual[i]?.[0],String(i+1).padStart(2,"0"));assert.equal(actual[i]?.[1],source[i]);}
});
test("los ensayos parciales no promueven el estado global ni simulan aprobación",()=>{
 assert.match(matrix,/globalFull:false/u);assert.doesNotMatch(matrix,/globalFull:true\s+.*aceptado/iu);
 for(const row of rows(matrix)){assert.ok(row.length>=4);assert.notEqual(row[2],"FULL");}
 assert.match(matrix,/no se fusiona en `main`/u);
});
