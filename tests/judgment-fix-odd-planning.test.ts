import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {draftOddFromStoredFix} from "../src/review/judgment-fix-odd-draft.js";
import {validateFreshFixOddRequest} from "../src/review/judgment-fix-odd-planning.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";

function fixture(t:TestContext){
 const projectId=realpathSync(mkdtempSync(join(tmpdir(),"asen-fix-odd-facts-")));
 t.after(()=>rmSync(projectId,{recursive:true,force:true}));
 const sessionId="pi-revisión",requestId="solicitud-revisión",tree="a".repeat(40);
 const id=createHash("sha256").update([requestId,sessionId,projectId,tree].join("\0")).digest("hex");
 const proposal:StoredJudgmentFixProposal={
  id,requestId,sessionId,repositoryRoot:projectId,
  candidateRevision:tree,candidateTreeIdentity:tree,
  paths:["src/modulo.ts"],status:"proposal-only",requiredAction:"new-odd-plan",
  modelRequested:"unknown",modelActual:"unknown",
  createdAt:"2026-11-16T00:00:00.000Z",
  requiresFreshWriterConsent:true,autoLaunch:false,autoMerge:false,acceptance:"not-accepted"
 };
 const identity={sessionId,projectId};
 const draft=draftOddFromStoredFix({proposal,identity});
 const input={
  instruction:"Corregir la lógica observada, limitar el cambio a src/modulo.ts y añadir pruebas.",
  taskIdentity:"fix-"+id.slice(0,24),intent:"defect",
  scope:{kind:"known",expectedPaths:["src/modulo.ts"]},
  writes:[{path:"src/modulo.ts",changeKind:"behavior"}],
  riskOperations:[],session:{estimatedMinutes:30,continuation:false},
  testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:12},
  unresolvedDecisions:[]
 };
 return {draft,input,proposal,identity};
}
test("T04/T08 usuario crea hechos nuevos vinculados al ámbito sin conceder Writer",t=>{
 const f=fixture(t);
 const raw=JSON.stringify(f.input);
 const result=validateFreshFixOddRequest(f.draft,raw);
 assert.equal(result.raw,raw);
 assert.equal(result.route,"orchestrate");
 assert.equal(result.taskIdentity,f.input.taskIdentity);
 assert.deepEqual(result.scope,["src/modulo.ts"]);
 assert.equal(result.readyToSavePlan,true);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.authorized,false);
 assert.equal(result.modelConsumed,false);
 assert.equal(result.autoLaunch,false);
});
test("T08 bloquea instrucciones inventadas, cambio de ámbito y consentimiento falso",t=>{
 const f=fixture(t);
 const invalid=[
  {...f.input,taskIdentity:"otra"},
  {...f.input,instruction:"Arreglar"},
  {...f.input,scope:{kind:"known",expectedPaths:["src/otro.ts"]}},
  {...f.input,writes:[{path:"src/otro.ts",changeKind:"behavior"}]},
  {...f.input,writes:[...f.input.writes,{path:"src/otro.ts",changeKind:"behavior"}]},
  {...f.input,review:{kind:"ordinary",estimatedMinutes:10}},
  {...f.input,testing:{kind:"n_a",reason:"sin pruebas"}},
  {...f.input,unresolvedDecisions:["No definido"]},
  {...f.input,riskOperations:["credential_or_auth"]},
  {...f.input,writes:[{path:"src/modulo.ts",changeKind:"security"}]},
  {...f.input,role:"worker",consent:true}
 ];
 for(const value of invalid){
  assert.throws(()=>validateFreshFixOddRequest(f.draft,JSON.stringify(value)),
   /Fix ODD/,JSON.stringify(value));
 }
});
test("T08 no permite planificar un dictamen en disputa",t=>{
 const f=fixture(t);
 const disputed=draftOddFromStoredFix({
  proposal:{...f.proposal,requiredAction:"manual-triage"},identity:f.identity
 });
 assert.throws(()=>validateFreshFixOddRequest(disputed,JSON.stringify(f.input)),
  /Fix ODD requires a fresh/u);
});
test("T08 rechaza JSON no suministrado, inválido, excesivo o con campos extra",t=>{
 const f=fixture(t);
 for(const raw of [null,"","sin JSON","{}",JSON.stringify({...f.input,
  instruction:"X".repeat(4000)})]){
  assert.throws(()=>validateFreshFixOddRequest(f.draft,raw),/Fix ODD/);
 }
});
