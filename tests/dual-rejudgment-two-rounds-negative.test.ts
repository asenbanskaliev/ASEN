import assert from "node:assert/strict";
import test from "node:test";
import {planWorkUnitBoundary,type ReadyWorkUnitBoundary,type WorkUnitBoundaryInput} from "../src/delivery/work-unit-policy.js";
import {recordCompletedWorkUnit,type WorkUnitEvidenceInput} from "../src/delivery/work-unit-evidence.js";
import {recordWorkUnitReviewCandidate,type WorkUnitReviewCandidateInput} from "../src/delivery/work-unit-review-candidate.js";
import {runDualReview,type DualFinding} from "../src/review/dual-review.js";
import {startDualRejudgment,recordDualRejudgment} from "../src/review/dual-rejudgment.js";

// E3/13: todos los resultados usan dos jueces simulados; jamás se llama a un proveedor.
const repository="https://github.com/acme/asen";
const documentPath="odd/tasks/skill-contract-parity.md";
const revision="a".repeat(40),tree="b".repeat(40),parent="c".repeat(40);

function genuineCandidate(){
 const input:WorkUnitBoundaryInput={
  featureIdentity:"E3-13",taskIdentity:"E3-13-rejudgment",taskDocumentPath:documentPath,
  purpose:"Probar el límite de dos rondas de revisión",behaviorIds:["dual-round-cap"],
  currentBranch:"feat/e3-review",defaultBranch:"main",authoredAdditions:100,authoredDeletions:2,
  expectedChangedPaths:["src/review/dual-rejudgment.ts","tests/dual-rejudgment-two-rounds-negative.test.ts",documentPath],
  rollbackBoundaries:["Revertir E3-13"],generatedArtifacts:[],
  previousReviewedBoundary:null,focusedTests:{kind:"required"},runtimeHarness:{kind:"required"},
  documentation:{kind:"n_a",reason:"No hay documento adicional"},
  deliveryRelationship:{kind:"single"},
 };
 const boundary=planWorkUnitBoundary(input) as ReadyWorkUnitBoundary;
 const evidence:WorkUnitEvidenceInput={
  featureIdentity:boundary.featureIdentity,taskIdentity:boundary.taskIdentity,
  taskDocumentPath:documentPath,boundaryId:boundary.boundaryId,
  repositoryIdentity:repository,purpose:boundary.purpose,
  deliveryRelationship:boundary.deliveryRelationship,previousReviewedBoundary:boundary.previousReviewedBoundary,
  rollbackBoundary:boundary.rollbackBoundaries[0]!,
  commit:{identity:revision,treeIdentity:tree,parentIdentity:parent,
   message:"test: comprobar dos rondas de revisión",currentTreeIdentity:tree},
  authoredAdditions:boundary.authoredAdditions,authoredDeletions:boundary.authoredDeletions,
  changedPaths:[...boundary.expectedChangedPaths],
  behaviorPaths:["src/review/dual-rejudgment.ts"],
  focusedTestPaths:["tests/dual-rejudgment-two-rounds-negative.test.ts"],
  documentationPaths:[],generatedArtifacts:[],
  focusedTests:{status:"pass",command:"node --import tsx --test tests/dual-rejudgment-two-rounds-negative.test.ts",
   scenario:"Contrato de rondas independientes",exitCode:0,summary:"PASS sintético: contrato de pruebas simulado, sin ejecución externa"},
  runtimeHarness:{status:"pass",command:"npm run audit:skill-parity",
   scenario:"Aislamiento de los dos jueces",exitCode:0,summary:"PASS sintético: comprobación simulada, sin ejecución externa"},
  documentation:{status:"n_a",reason:"No hay documento adicional"},
  taskDocumentCommitIdentity:revision,
 };
 const completed=recordCompletedWorkUnit(boundary,evidence);
 const candidate:WorkUnitReviewCandidateInput={
  kind:"commit",identity:revision,revision,treeIdentity:tree,
  repositoryIdentity:repository,featureIdentity:completed.featureIdentity,
  taskIdentity:completed.taskIdentity,taskDocumentPath:documentPath,
  boundaryId:completed.boundaryId,previousReviewedBoundary:completed.previousReviewedBoundary,
  deliveryRelationship:completed.deliveryRelationship,
 };
 return recordWorkUnitReviewCandidate(completed,candidate);
}

const finding=(id:string,severity:DualFinding["severity"]):DualFinding=>({
 id,severity,summary:"Hallazgo comprobable "+id,
});
async function genuineLedger(left:readonly DualFinding[],right:readonly DualFinding[]){
 let invoked=0;
 const ledger=await runDualReview(
  genuineCandidate(),
  async()=>{invoked++;return {judgeId:"juez-uno",findings:left};},
  async()=>{invoked++;return {judgeId:"juez-dos",findings:right};},
 );
 assert.equal(invoked,2,"Los dos jueces deben ejecutarse exactamente una vez");
 assert.equal(ledger.status,"frozen");
 assert.equal(Object.isFrozen(ledger),true);
 return ledger;
}

test("E3/13: dos rondas con defectos vivos escalan; nunca existe una tercera",async()=>{
 const ledger=await genuineLedger(
  [finding("H1","high"),finding("M1","medium")],
  [finding("C1","critical")],
 );
 const first=startDualRejudgment(ledger);
 assert.equal(first.status,"correction");
 if(first.status!=="correction")throw new Error("Se esperaba la primera ronda");
 assert.equal(first.round,1);
 assert.deepEqual(first.findingIds,["C1","H1"],"Solo hallazgos graves congelados");
 assert.equal(Object.isFrozen(first),true);

 const second=recordDualRejudgment(first,{resolved:["H1"],regressions:["REG1"]});
 assert.equal(second.status,"correction");
 if(second.status!=="correction")throw new Error("Se esperaba la segunda ronda");
 assert.equal(second.round,2);
 assert.deepEqual(second.findingIds,["C1","REG1"]);
 assert.throws(()=>recordDualRejudgment(first,{resolved:[],regressions:[]}),/not live/u);

 const terminal=recordDualRejudgment(second,{resolved:["C1"],regressions:[]});
 assert.deepEqual(terminal,{
  status:"escalated",roundsUsed:2,surviving:["REG1"],ledgerId:ledger.ledgerId,
 });
 assert.equal(Object.isFrozen(terminal),true);
 assert.throws(()=>recordDualRejudgment(second,{resolved:[],regressions:[]}),/not live/u);
 assert.throws(()=>recordDualRejudgment(terminal,{resolved:[],regressions:[]}),/not live/u);
 for(const forbidden of ["writerAuthority","autoMerge","accepted","authorization"]){
  assert.equal(forbidden in terminal,false);
 }
});

test("E3/13: sin defectos graves, no se abre ninguna ronda",async()=>{
 const ledger=await genuineLedger([finding("L1","low")],[finding("M1","medium")]);
 assert.deepEqual(startDualRejudgment(ledger),{
  status:"approved",roundsUsed:0,surviving:[],ledgerId:ledger.ledgerId,
 });
 assert.throws(()=>startDualRejudgment(ledger),/already consumed/u);
});

test("E3/13: resolver lo grave en primera ronda evita una segunda",async()=>{
 const ledger=await genuineLedger([finding("H1","high")],[]);
 const first=startDualRejudgment(ledger);
 assert.equal(first.status,"correction");
 if(first.status!=="correction")throw new Error("Se esperaba corrección");
 assert.deepEqual(recordDualRejudgment(first,{resolved:["H1"],regressions:[]}),{
  status:"approved",roundsUsed:1,surviving:[],ledgerId:ledger.ledgerId,
 });
 assert.throws(()=>recordDualRejudgment(first,{resolved:[],regressions:[]}),/not live/u);
});

test("E3/13: el ledger clonado o inventado no abre revisión",async()=>{
 const ledger=await genuineLedger([finding("H1","high")],[]);
 assert.throws(()=>startDualRejudgment({...ledger}),/not genuine/u);
 assert.throws(()=>startDualRejudgment({status:"frozen",findings:ledger.findings}),/not genuine/u);
 const first=startDualRejudgment(ledger);
 assert.equal(first.status,"correction");
 assert.throws(()=>startDualRejudgment(ledger),/already consumed/u);
});

test("E3/13: fuera del ámbito congelado se bloquea y consume el intento",async()=>{
 const ledger=await genuineLedger([finding("H1","high")],[]);
 const first=startDualRejudgment(ledger);
 assert.equal(first.status,"correction");
 if(first.status!=="correction")throw new Error("Se esperaba corrección");
 assert.throws(()=>recordDualRejudgment(first,{resolved:["AJENO"],regressions:[]}),/exceeds frozen finding scope/u);
 assert.throws(()=>recordDualRejudgment(first,{resolved:["H1"],regressions:[]}),/not live/u);
});

test("E3/13: un dictamen duplicado no puede ser corregido dos veces",async()=>{
 const ledger=await genuineLedger([finding("H1","high")],[]);
 const first=startDualRejudgment(ledger);
 assert.equal(first.status,"correction");
 if(first.status!=="correction")throw new Error("Se esperaba corrección");
 assert.throws(()=>recordDualRejudgment(first,{resolved:["H1","H1"],regressions:[]}),/exceeds frozen finding scope/u);
 assert.throws(()=>recordDualRejudgment(first,{resolved:["H1"],regressions:[]}),/not live/u);
});
