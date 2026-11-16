import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {draftOddFromStoredFix} from "../src/review/judgment-fix-odd-draft.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";

function fixture(t:TestContext){
 const projectId=realpathSync(mkdtempSync(join(tmpdir(),"asen-fix-odd-")));
 t.after(()=>rmSync(projectId,{recursive:true,force:true}));
 const sessionId="sesion-propietaria",requestId="rev-1",candidateTreeIdentity="a".repeat(40);
 const id=createHash("sha256").update([
  requestId,sessionId,projectId,candidateTreeIdentity
 ].join("\0")).digest("hex");
 const proposal:StoredJudgmentFixProposal={
  id,requestId,sessionId,repositoryRoot:projectId,
  candidateRevision:candidateTreeIdentity,candidateTreeIdentity,
  paths:["src/modulo.ts"],status:"proposal-only",
  requiredAction:"new-odd-plan",modelRequested:"nvidia/modelo-previsto",
  modelActual:"unknown",createdAt:"2026-11-16T00:00:00.000Z",
  requiresFreshWriterConsent:true,autoLaunch:false,
  autoMerge:false,acceptance:"not-accepted"
 };
 return {proposal,identity:{sessionId,projectId}};
}
test("T04/T08 propone un borrador ODD limitado, sin ejecutar Writer ni modelo",t=>{
 const {proposal,identity}=fixture(t);
 const result=draftOddFromStoredFix({proposal,identity});
 assert.equal(result.status,"draft-only");
 assert.equal(result.sourceProposalId,proposal.id);
 assert.deepEqual(result.writeSurfaces,proposal.paths);
 assert.equal(result.sourceCandidateTree,proposal.candidateTreeIdentity);
 assert.equal(result.candidateStatus,"not-revalidated");
 assert.equal(result.instructionStatus,"not-provided");
 assert.equal(result.nextCommand,"/asen-plan");
 assert.equal(result.modelRequested,"unknown");
 assert.equal(result.modelActuallyUsed,"unknown");
 assert.equal(result.requiresFreshCandidate,true);
 assert.equal(result.requiresFreshWriterConsent,true);
 assert.equal(result.requiresNewOddPlan,true);
 assert.equal(result.requiresUserInstruction,true);
 assert.equal(result.authorized,false);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.autoLaunch,false);
 assert.equal(result.autoMerge,false);
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.globalFull,false);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.writeSurfaces),true);
});
test("T08 una disputa entre jueces obliga a decidir antes del nuevo ODD",t=>{
 const {proposal,identity}=fixture(t);
 const result=draftOddFromStoredFix({
  proposal:{...proposal,requiredAction:"manual-triage"},identity
 });
 assert.equal(result.status,"manual-triage-required");
 assert.equal(result.authorized,false);
 assert.equal(result.autoLaunch,false);
});
test("T08 impide usar propuestas de otras sesiones o proyectos",t=>{
 const {proposal,identity}=fixture(t);
 const foreign=resolve(tmpdir(),"otro-proyecto");
 for(const candidate of [
  {proposal,identity:{...identity,sessionId:"otra-sesion"}},
  {proposal,identity:{...identity,projectId:foreign}},
  {proposal:{...proposal,sessionId:"otra-sesion"},identity},
  {proposal:{...proposal,repositoryRoot:foreign},identity},
 ]){
  assert.throws(()=>draftOddFromStoredFix(candidate),/outside the owning Pi session/u);
 }
});
test("T08 bloquea falsificaciones, ámbitos sensibles y autoridad heredada",t=>{
 const {proposal,identity}=fixture(t);
 const malformed:StoredJudgmentFixProposal[]=[
  {...proposal,id:"0".repeat(64)},
  {...proposal,candidateRevision:"b".repeat(40)},
  {...proposal,candidateTreeIdentity:"b".repeat(40)},
  {...proposal,status:"authorized" as never},
  {...proposal,modelActual:"nvidia/ya-utilizado" as never},
  {...proposal,requiresFreshWriterConsent:false as never},
  {...proposal,autoLaunch:true as never},
  {...proposal,autoMerge:true as never},
  {...proposal,acceptance:"accepted" as never},
  {...proposal,paths:[]},
  {...proposal,paths:["src/a.ts","src/a.ts"]},
  {...proposal,paths:["../escape.ts"]},
  {...proposal,paths:[".env"]},
  {...proposal,paths:[".git/config"]},
  {...proposal,paths:["src/archivo\nmalicioso.ts"]}
 ];
 for(const altered of malformed){
  assert.throws(()=>draftOddFromStoredFix({proposal:altered,identity}),
   /Stored Fix proposal/u,JSON.stringify(altered));
 }
});
