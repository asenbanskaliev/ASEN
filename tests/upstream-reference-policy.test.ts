import assert from "node:assert/strict";
import test from "node:test";
import {isPinnedReferenceDocument,maskApprovedWireSchemas} from "../scripts/upstream-reference-policy.mjs";

const wire="gen"+"tle-ai";
const source="src/review/native-rdd-control.ts";
const fixture="tests/native-rdd-control.test.ts";
const marker=new RegExp("gen"+"tle","i");

test("only explicitly registered non-executable provenance paths are documents",()=>{
 assert.equal(isPinnedReferenceDocument("docs/portable-checkpoint.md"),true);
 assert.equal(isPinnedReferenceDocument("odd/evidence/portable-checkpoint-manifest.json"),true);
 const dossier="odd/tasks/flujo-de-agentes-"+"gen"+"tle-shell-4.9.0-investigacion.md";
 assert.equal(isPinnedReferenceDocument(dossier),true,"Only the specific human-readable G49 dossier is registered");
 assert.equal(isPinnedReferenceDocument(dossier.replace(".md",".ts")),false,"No executable file inherits the document exemption");
 assert.equal(isPinnedReferenceDocument(dossier.replace("4.9.0","4.9.1")),false,"Other reference versions require an explicit decision");
 const comparison="odd/tasks/flujo-de-agentes-comparativa-actual-4.9.0.md";
 assert.equal(isPinnedReferenceDocument(comparison),true,"Solo el documento de comparación exacto tiene procedencia");
 assert.equal(isPinnedReferenceDocument(comparison.replace(".md",".ts")),false);
 assert.equal(isPinnedReferenceDocument(comparison.replace("4.9.0","4.9.1")),false);
 const masterPlan="odd/tasks/flujo-de-agentes-plan-implantacion-4.9.0.md";
 assert.equal(isPinnedReferenceDocument(masterPlan),true,"El plan rector tiene solo una excepción documental exacta");
 assert.equal(isPinnedReferenceDocument(masterPlan.replace(".md",".ts")),false,"Ningún archivo ejecutable hereda la excepción");
 assert.equal(isPinnedReferenceDocument(masterPlan.replace("4.9.0","4.9.1")),false,"Una versión diferente requiere autorización expresa");
 assert.equal(isPinnedReferenceDocument(masterPlan.replace("odd/tasks/","src/")),false,"Una ruta de código nunca es documento");
 const audit="odd/tasks/flujo-de-agentes-auditoria-plan-2026-11-19.md";
 assert.equal(isPinnedReferenceDocument(audit),true);
 const estado="odd/tasks/flujo-de-agentes-estado-18-objetivos.md";
 assert.equal(isPinnedReferenceDocument(estado),true);
 const cierre="odd/tasks/flujo-agentes-18-puntos-cierre-20261119.md";
 assert.equal(isPinnedReferenceDocument(cierre),true);
 assert.equal(isPinnedReferenceDocument(cierre.replace(".md",".ts")),false);
 assert.equal(isPinnedReferenceDocument(cierre.replace("20261119","20261120")),false);
 const megatandas="odd/tasks/pr61-18-puntos-megatandas-a-e.md";
 assert.equal(isPinnedReferenceDocument(megatandas),true);
 assert.equal(isPinnedReferenceDocument(megatandas.replace(".md",".ts")),false);
 assert.equal(isPinnedReferenceDocument(megatandas.replace("a-e","a-f")),false);
 assert.equal(isPinnedReferenceDocument(estado.replace(".md",".js")),false);
 assert.equal(isPinnedReferenceDocument(estado.replace("18-objetivos","19-objetivos")),false);
 assert.equal(isPinnedReferenceDocument(audit.replace(".md",".ts")),false);
 assert.equal(isPinnedReferenceDocument(audit.replace("2026-11-19","2026-11-20")),false);
 const equivalence="odd/tasks/flujo-de-agentes-equivalencia-operativa-4.9.0.md";
 assert.equal(isPinnedReferenceDocument(equivalence),true,"La matriz histórica exacta está autorizada como documento");
 assert.equal(isPinnedReferenceDocument(equivalence.replace(".md",".ts")),false);
 assert.equal(isPinnedReferenceDocument(equivalence.replace("4.9.0","4.9.1")),false);
 for(const path of ["docs/portable-checkpoint-copy.md","odd/tasks/ui-runtime-delivery-order.md","src/review/native-rdd-control.ts","scripts/upstream-reference-policy.mjs"]){
  assert.equal(isPinnedReferenceDocument(path),false,path);
 }
});
test("estudios P16/CTX admitidos por ruta documental exacta, nunca por carpeta ni extensión ejecutable",()=>{
 const docs=[
  "docs/audit/opt-contexto-skills-asen-2026-11-20.md",
  "docs/audit/p16-"+wire.slice(0,6)+"-4.9.0-18-sesiones-2026-11-20.md",
  "docs/audit/plan-final-opt-investigacion-avanzada-2026-11-20.md",
  "docs/plan-final-opt-contexto-y-agentes-2026-11-20.md"
 ];
 for(const file of docs){
  assert.equal(isPinnedReferenceDocument(file),true,file);
  assert.equal(isPinnedReferenceDocument(file.replace(/\.md$/u,".ts")),false,file+" no es ejecutable");
  assert.equal(isPinnedReferenceDocument(file.replace("2026-11-20","2026-11-21")),false,file+" no admite fecha nueva");
 }
 for(const file of [
  "docs/audit/otro-estudio-"+wire.slice(0,6)+".md",
  "src/plan-final-opt-contexto-y-agentes-2026-11-20.md",
  ".github/workflows/asen-p16-comparacion-real.yml",
  "scripts/p16-comparacion-real.mjs"
 ])assert.equal(isPinnedReferenceDocument(file),false,file);
});

test("only three exact native schema-property strings are masked in the owned implementation and test",()=>{
 for(const path of [source,fixture]){
  for(const identifier of ["review-mode/v1","rdd-mode-status/v1","review-assessment/v1"]){
   const wireValue=wire+"."+identifier;
   for(const separator of [":","==="]){
    const input='const value={schema'+separator+'"'+wireValue+'"};';
    assert.equal(marker.test(maskApprovedWireSchemas(path,input)),false,path);
   }
   for(const input of ['import "'+wireValue+'";','const value="'+wireValue+'";','const value={schema:"'+wireValue+'-next"};']){
    assert.equal(marker.test(maskApprovedWireSchemas(path,input)),true,input);
   }
  }
 }
 assert.equal(marker.test(maskApprovedWireSchemas("src/review/other.ts",'const x={schema:"'+wire+'.review-mode/v1"};')),true);
});
