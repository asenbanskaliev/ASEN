import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {captureWorkspaceReviewProjection} from "../src/review/workspace-review-projection.js";
import {draftOddFromStoredFix} from "../src/review/judgment-fix-odd-draft.js";
import {inspectLiveFixCandidate,assertFixProjectionComplete} from "../src/review/judgment-fix-odd-preflight.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";

function fixture(t:TestContext,addUntracked=false){
 const projectId=realpathSync(mkdtempSync(join(tmpdir(),"asen-fix-tree-")));
 t.after(()=>rmSync(projectId,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",projectId,...args],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"]
 }).trim();
 git("init","-q");git("config","user.name","Pruebas ASEN");
 git("config","user.email","asen-test@example.invalid");
 writeFileSync(join(projectId,"code.ts"),"valor original\n");
 git("add","code.ts");git("commit","-qm","candidato inicial");
 writeFileSync(join(projectId,"code.ts"),"valor corregible\n");
 if(addUntracked)writeFileSync(join(projectId,"nuevo.ts"),"archivo nuevo\n");
 const paths=addUntracked?["code.ts","nuevo.ts"]:["code.ts"];
 const observed=captureWorkspaceReviewProjection({
  repositoryRoot:projectId,intendedUntracked:addUntracked?["nuevo.ts"]:[]
 },paths);
 const tree=observed.candidateTree,sessionId="pi-fix-propietaria",requestId="revisión-original";
 const id=createHash("sha256").update([requestId,sessionId,projectId,tree].join("\0")).digest("hex");
 const proposal:StoredJudgmentFixProposal={
  id,requestId,sessionId,repositoryRoot:projectId,
  candidateRevision:tree,candidateTreeIdentity:tree,paths,
  status:"proposal-only",requiredAction:"new-odd-plan",
  modelRequested:"unknown",modelActual:"unknown",
  createdAt:"2026-11-16T00:00:00.000Z",
  requiresFreshWriterConsent:true,autoLaunch:false,autoMerge:false,
  acceptance:"not-accepted"
 };
 const identity={sessionId,projectId};
 return {projectId,git,proposal,identity,draft:draftOddFromStoredFix({proposal,identity})};
}
test("T08 verifica un árbol Git real sin marcar revisión aceptada ni autorizar escritura",t=>{
 const f=fixture(t);
 const before=f.git("status","--porcelain");
 const result=inspectLiveFixCandidate(f.draft);
 assert.equal(result.status,"candidate-revalidated");
 assert.equal(result.candidateTreeIdentity,f.proposal.candidateTreeIdentity);
 assert.equal(result.matchedSource,true);
 assert.equal(result.repositoryHead,f.git("rev-parse","HEAD"));
 assert.equal(result.writerAuthority,false);
 assert.equal(result.autoLaunch,false);
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(f.git("status","--porcelain"),before);
});
test("T08 bloquea un cambio del contenido revisado aunque Git HEAD no cambie",t=>{
 const f=fixture(t);
 writeFileSync(join(f.projectId,"code.ts"),"alterado después del juicio\n");
 assert.throws(()=>inspectLiveFixCandidate(f.draft),
  /candidate changed after the original/u);
});
test("T08 bloquea archivos nuevos fuera del alcance aprobado por los jueces",t=>{
 const f=fixture(t);
 writeFileSync(join(f.projectId,"extra.ts"),"contenido ajeno\n");
 assert.throws(()=>inspectLiveFixCandidate(f.draft),/candidate changed after the original/u);
});
test("T08 verifica archivos nuevos si aparecen expresamente en el informe",t=>{
 const f=fixture(t,true);
 const result=inspectLiveFixCandidate(f.draft);
 assert.equal(result.candidateTreeIdentity,f.proposal.candidateTreeIdentity);
 assert.deepEqual(f.draft.writeSurfaces,["code.ts","nuevo.ts"]);
});
test("T08 nunca convierte una disputa entre jueces en árbol autorizado",t=>{
 const f=fixture(t);
 const disputed=draftOddFromStoredFix({
  proposal:{...f.proposal,requiredAction:"manual-triage"},identity:f.identity
 });
 assert.throws(()=>inspectLiveFixCandidate(disputed),/not eligible/u);
});
test("T08 reconoce un nuevo HEAD con el mismo árbol completo y exige autorización nueva",t=>{
 const f=fixture(t);
 f.git("add","code.ts");
 f.git("commit","-qm","código revisado incorporado al historial");
 // Judgment Day revisó el árbol completo, no la identidad histórica del
 // commit padre. Cambiar únicamente el historial no modifica esos bytes.
 const observed=inspectLiveFixCandidate(f.draft);
 assert.equal(observed.repositoryHead,f.git("rev-parse","HEAD"));
 assert.equal(observed.candidateTreeIdentity,f.proposal.candidateTreeIdentity);
 assert.equal(observed.writerAuthority,false);
 assert.equal(observed.autoLaunch,false);
});

test("T08 un Fix limitado no confunde alcance Writer y árbol revisado completo",t=>{
 const f=fixture(t);
 writeFileSync(join(f.projectId,"otro.ts"),"cambio también revisado\n");
 const full=captureWorkspaceReviewProjection({repositoryRoot:f.projectId,intendedUntracked:["otro.ts"]});
 const limited=draftOddFromStoredFix({proposal:{
  ...f.proposal,candidateTreeIdentity:full.candidateTree,
  candidateRevision:full.candidateTree,paths:["code.ts"],
  id:createHash("sha256").update([
   f.proposal.requestId,f.identity.sessionId,f.projectId,full.candidateTree
  ].join("\0")).digest("hex")
 },identity:f.identity});
 assert.equal(inspectLiveFixCandidate(limited).candidateTreeIdentity,full.candidateTree);
 assert.deepEqual(limited.writeSurfaces,["code.ts"]);
 writeFileSync(join(f.projectId,"otro.ts"),"cambio posterior\n");
 assert.throws(()=>inspectLiveFixCandidate(limited),/candidate changed after the original/u);
});

test("T08 rechaza archivos aparecidos después de enumerar los no rastreados",t=>{
 const f=fixture(t,true);
 const original=captureWorkspaceReviewProjection({
  repositoryRoot:f.projectId,intendedUntracked:["nuevo.ts"]
 });
 assert.deepEqual(original.unexpectedUntracked,[]);
 assert.doesNotThrow(()=>assertFixProjectionComplete(original));
 writeFileSync(join(f.projectId,"posterior.ts"),"archivo sin revisar\n");
 const later=captureWorkspaceReviewProjection({
  repositoryRoot:f.projectId,intendedUntracked:["nuevo.ts"]
 });
 assert.deepEqual(later.unexpectedUntracked,["posterior.ts"]);
 assert.throws(()=>assertFixProjectionComplete(later),/unreviewed untracked/u);
 assert.equal(later.candidateTree,original.candidateTree,
  "El mismo árbol seleccionado no implica que el directorio completo siga limpio");
});
