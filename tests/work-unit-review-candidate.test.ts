import {execFileSync} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {prepareOrdinaryReview,claimOrdinaryReviewRequest,bindOrdinaryReviewCheckout} from "../src/review/ordinary-review-controller.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planWorkUnitBoundary, type ReadyWorkUnitBoundary, type WorkUnitBoundaryInput } from "../src/delivery/work-unit-policy.js";
import { recordCompletedWorkUnit, type CompletedWorkUnit, type WorkUnitEvidenceInput } from "../src/delivery/work-unit-evidence.js";
import { recordWorkUnitReviewCandidate, type WorkUnitReviewCandidateInput } from "../src/delivery/work-unit-review-candidate.js";

const tracker = "odd/tasks/skill-contract-parity.md";
const repository = "https://github.com/acme/asen";
const commit = "a".repeat(40);
const tree = "b".repeat(40);
const parent = "c".repeat(40);
function completed(chain = false,snapshot={identity:commit,treeIdentity:tree,parentIdentity:parent}): CompletedWorkUnit {
  const boundaryInput: WorkUnitBoundaryInput = {
    featureIdentity: "GSP-04", taskIdentity: "GSP-04E1b2", taskDocumentPath: tracker,
    purpose: "Bind an exact review candidate", behaviorIds: ["candidate-binding"],
    currentBranch: "feat/review-candidate", defaultBranch: "main", authoredAdditions: 100, authoredDeletions: 2,
    expectedChangedPaths: ["src/delivery/work-unit-review-candidate.ts", "tests/work-unit-review-candidate.test.ts", tracker],
    rollbackBoundaries: ["Revert GSP-04E1b2"], generatedArtifacts: [],
    previousReviewedBoundary: chain ? "GSP-04E1b1" : null,
    focusedTests: { kind: "required" }, runtimeHarness: { kind: "required" },
    documentation: { kind: "n_a", reason: "No documentation surface" },
    deliveryRelationship: chain ? { kind: "chain_slice", sliceId: "E1b2" } : { kind: "single" },
  };
  const boundary = planWorkUnitBoundary(boundaryInput) as ReadyWorkUnitBoundary;
  const evidence: WorkUnitEvidenceInput = {
    featureIdentity: boundary.featureIdentity, taskIdentity: boundary.taskIdentity, taskDocumentPath: tracker,
    boundaryId: boundary.boundaryId, repositoryIdentity: repository, purpose: boundary.purpose,
    deliveryRelationship: boundary.deliveryRelationship, previousReviewedBoundary: boundary.previousReviewedBoundary,
    rollbackBoundary: boundary.rollbackBoundaries[0]!,
    commit: { identity: snapshot.identity, treeIdentity: snapshot.treeIdentity, parentIdentity: snapshot.parentIdentity, message: "feat(delivery): bind review candidate", currentTreeIdentity: snapshot.treeIdentity },
    authoredAdditions: boundary.authoredAdditions, authoredDeletions: boundary.authoredDeletions,
    changedPaths: [...boundary.expectedChangedPaths], behaviorPaths: ["src/delivery/work-unit-review-candidate.ts"],
    focusedTestPaths: ["tests/work-unit-review-candidate.test.ts"], documentationPaths: [], generatedArtifacts: [],
    focusedTests: { status: "pass", command: "npx tsx --test tests/work-unit-review-candidate.test.ts", scenario: "candidate contract", exitCode: 0, summary: "Focused checks passed" },
    runtimeHarness: { status: "pass", command: "npm run audit:skill-parity", scenario: "runtime contract", exitCode: 0, summary: "Runtime checks passed" },
    documentation: { status: "n_a", reason: "No documentation surface" }, taskDocumentCommitIdentity: snapshot.identity,
  };
  return recordCompletedWorkUnit(boundary, evidence);
}
function candidate(record: CompletedWorkUnit, overrides: Partial<WorkUnitReviewCandidateInput> = {}): WorkUnitReviewCandidateInput {
  return {
    kind: "commit", identity: record.commit.identity, revision: record.commit.identity, treeIdentity: record.commit.treeIdentity,
    repositoryIdentity: repository, featureIdentity: record.featureIdentity, taskIdentity: record.taskIdentity,
    taskDocumentPath: record.taskDocumentPath, boundaryId: record.boundaryId,
    previousReviewedBoundary: record.previousReviewedBoundary, deliveryRelationship: record.deliveryRelationship,
    ...overrides,
  };
}
function reject(overrides: Partial<WorkUnitReviewCandidateInput>): void {
  const record = completed();
  assert.throws(() => recordWorkUnitReviewCandidate(record, candidate(record, overrides)));
}

test("records an exact frozen commit candidate without mutating inputs", () => {
  const record = completed();
  const input = candidate(record);
  const before = structuredClone(input);
  const result = recordWorkUnitReviewCandidate(record, input);
  assert.deepEqual(input, before);
  assert.deepEqual(result, { completedWorkUnit: record, ...input });
  assert.equal(Object.isFrozen(result) && Object.isFrozen(result.completedWorkUnit) && Object.isFrozen(result.deliveryRelationship), true);
});
test("records a repository-bound PR slice with retained chain provenance", () => {
  const record = completed(true);
  const input = candidate(record, { kind: "pr_slice", identity: `${repository}/pull/27` });
  const result = recordWorkUnitReviewCandidate(record, input);
  assert.equal(result.identity, `${repository}/pull/27`);
  assert.equal(result.previousReviewedBoundary, "GSP-04E1b1");
  assert.deepEqual(result.deliveryRelationship, { kind: "chain_slice", sliceId: "E1b2" });
});
test("rejects forged and reused completed records", () => {
  const record = completed();
  assert.throws(() => recordWorkUnitReviewCandidate(structuredClone(record), candidate(record)), /not recorded/u);
  recordWorkUnitReviewCandidate(record, candidate(record));
  assert.throws(() => recordWorkUnitReviewCandidate(record, candidate(record)), /already/u);
});
test("burns completed provenance before malformed first-attempt validation", () => {
  const record = completed();
  assert.throws(() => recordWorkUnitReviewCandidate(record, { ...candidate(record), extra: true } as WorkUnitReviewCandidateInput));
  assert.throws(() => recordWorkUnitReviewCandidate(record, candidate(record)), /already/u);
});
test("rejects cross-task, repository, document, and boundary facts", () => {
  for (const overrides of [
    { featureIdentity: "other" }, { taskIdentity: "other" }, { taskDocumentPath: "odd/tasks/other.md" },
    { repositoryIdentity: "https://github.com/acme/other" }, { boundaryId: "d".repeat(64) },
  ]) reject(overrides);
});
test("rejects revision, tree, commit identity, previous-boundary, and delivery mismatches", () => {
  reject({ revision: parent });
  reject({ treeIdentity: parent });
  reject({ identity: parent });
  reject({ previousReviewedBoundary: "prior" });
  reject({ deliveryRelationship: { kind: "chain_slice", sliceId: "other" } });
  const chain = completed(true);
  assert.throws(() => recordWorkUnitReviewCandidate(chain, candidate(chain, { previousReviewedBoundary: null })));
});
test("rejects non-canonical or cross-repository PR identities", () => {
  for (const identity of [
    "https://github.com/other/asen/pull/1", `${repository}/pull/1?x=1`, `${repository}/pull/1#x`,
    `${repository}/pull/1/`, `${repository}/pull/0`, `${repository}/pull/01`,
    "https://user@github.com/acme/asen/pull/1",
  ]) reject({ kind: "pr_slice", identity });
});
test("rejects branch, TODO, checkbox, feature, and all other candidate kinds", () => {
  for (const kind of ["branch", "TODO", "checkbox", "feature", "commit "]) {
    reject({ kind: kind as WorkUnitReviewCandidateInput["kind"] });
  }
});
test("rejects extras, symbols, prototypes, and accessors without invoking them", () => {
  for (const alter of [
    (value: any) => { value.extra = true; },
    (value: any) => { Object.defineProperty(value, Symbol("hidden"), { value: true }); },
    (value: any) => Object.setPrototypeOf(value, { inherited: true }),
  ]) {
    const record = completed();
    const input: any = candidate(record);
    alter(input);
    assert.throws(() => recordWorkUnitReviewCandidate(record, input));
  }
  const record = completed();
  const input = candidate(record);
  let reads = 0;
  Object.defineProperty(input, "identity", { enumerable: true, get() { reads += 1; return commit; } });
  assert.throws(() => recordWorkUnitReviewCandidate(record, input));
  assert.equal(reads, 0);
});
test("exposes no verdict, readiness, authority, publication, merge, or mutation surface", () => {
  const record = completed();
  const result = recordWorkUnitReviewCandidate(record, candidate(record));
  for (const name of ["verdict", "approved", "ready", "readiness", "authority", "authorityToken", "publication", "merge", "mutation", "callback", "adapter", "git", "network"]) {
    assert.equal(name in result, false);
  }
});
test("E rechaza Proxy del candidato antes de ejecutar traps y consume el completed",()=>{
 const record=completed(),input=candidate(record);let llamadas=0;
 const proxy=new Proxy(input,{getPrototypeOf(){llamadas++;return Object.prototype;}});
 assert.throws(()=>recordWorkUnitReviewCandidate(record,proxy));assert.equal(llamadas,0);
 assert.throws(()=>recordWorkUnitReviewCandidate(record,input),/claimed/);
});
test("E prepara candidato genuino una vez sin emitir autoridad ni aceptar clones",()=>{
 const record=completed(),c=recordWorkUnitReviewCandidate(record,candidate(record)),input={authorId:"autor",reviewerId:"revisor",sessionId:"sesion"};
 const request=prepareOrdinaryReview(c,input);assert.equal(request.candidate,c);assert.equal(request.status,"prepared");
 assert.equal(Object.isFrozen(request)&&Object.isFrozen(request.participants),true);
 for(const key of ["authority","verdict","approved","mutation","delivery","merge"])assert.equal(key in request,false);
 assert.throws(()=>prepareOrdinaryReview(c,input),/consumido/);assert.throws(()=>prepareOrdinaryReview({...c},input),/genuino/);
 assert.throws(()=>claimOrdinaryReviewRequest(structuredClone(request),"sesion"),/genuina/);
 assert.equal(claimOrdinaryReviewRequest(request,"sesion"),request);assert.throws(()=>claimOrdinaryReviewRequest(request,"sesion"),/consumida/);
});
test("E consume el candidato antes del rechazo de metadatos malformados",()=>{
 for(const caso of ["proxy","accesor","autor-igual","extra"]){
  const record=completed(),c=recordWorkUnitReviewCandidate(record,candidate(record));let llamadas=0;
  let input:any={authorId:"autor",reviewerId:"revisor",sessionId:"sesion"};
  if(caso==="proxy")input=new Proxy(input,{getPrototypeOf(){llamadas++;return Object.prototype;}});
  if(caso==="accesor")Object.defineProperty(input,"authorId",{enumerable:true,get(){llamadas++;return "autor";}});
  if(caso==="autor-igual")input.reviewerId="autor";if(caso==="extra")input.authority=true;
  assert.throws(()=>prepareOrdinaryReview(c,input));assert.equal(llamadas,0);
  assert.throws(()=>prepareOrdinaryReview(c,{authorId:"autor",reviewerId:"revisor",sessionId:"sesion"}),/consumido/);
 }
});
test("E rechaza sesión ajena y consume preparación antes del rechazo",()=>{
 const record=completed(),c=recordWorkUnitReviewCandidate(record,candidate(record)),request=prepareOrdinaryReview(c,{authorId:"autor",reviewerId:"revisor",sessionId:"sesion"});
 assert.throws(()=>claimOrdinaryReviewRequest(request,"otra"),/sesión/);assert.throws(()=>claimOrdinaryReviewRequest(request,"sesion"),/consumida/);
});
test("E liga revisión al HEAD, árbol y padre reales; rechaza cambios y consume la solicitud",t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"asen-review-checkout-")));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
 git("init","-q");const commitLocal=()=>git("-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","test(review): candidato sintético");
 commitLocal();const parentIdentity=git("rev-parse","HEAD");commitLocal();const snapshot={identity:git("rev-parse","HEAD"),treeIdentity:git("rev-parse","HEAD^{tree}"),parentIdentity};
 const prepare=(changes:Partial<typeof snapshot>={})=>{const r=completed(false,{...snapshot,...changes});return prepareOrdinaryReview(recordWorkUnitReviewCandidate(r,candidate(r)),{authorId:"autor",reviewerId:"revisor",sessionId:"sesion"});};
 const request=prepare(),bound=bindOrdinaryReviewCheckout(request,"sesion",root);
 assert.equal(bound.revision,snapshot.identity);assert.equal(bound.treeIdentity,snapshot.treeIdentity);assert.equal(Object.isFrozen(bound),true);
 assert.throws(()=>bindOrdinaryReviewCheckout(request,"sesion",root),/consumida/);
 for(const changes of [{identity:"f".repeat(40)},{treeIdentity:"f".repeat(40)},{parentIdentity:"f".repeat(40)}]){
  const bad=prepare(changes);assert.throws(()=>bindOrdinaryReviewCheckout(bad,"sesion",root));assert.throws(()=>bindOrdinaryReviewCheckout(bad,"sesion",root),/consumida/);
 }
 const dirty=prepare();writeFileSync(join(root,"no-rastreado.txt"),"dato sintético");
 assert.throws(()=>bindOrdinaryReviewCheckout(dirty,"sesion",root),/checkout/);assert.throws(()=>bindOrdinaryReviewCheckout(dirty,"sesion",root),/consumida/);
 rmSync(join(root,"no-rastreado.txt"));const drift=prepare();commitLocal();assert.throws(()=>bindOrdinaryReviewCheckout(drift,"sesion",root),/checkout/);
 writeFileSync(join(root,"tracked.txt"),"original");git("add","tracked.txt");commitLocal();
 const original={identity:git("rev-parse","HEAD"),treeIdentity:git("rev-parse","HEAD^{tree}"),parentIdentity:git("rev-parse","HEAD^")};
 writeFileSync(join(root,"tracked.txt"),"modificado");git("add","tracked.txt");commitLocal();const replacement=git("rev-parse","HEAD");
 git("reset","--hard",original.identity);writeFileSync(join(root,"tracked.txt"),"modificado");git("add","tracked.txt");git("replace",original.identity,replacement);
 const replaced=prepare(original);assert.throws(()=>bindOrdinaryReviewCheckout(replaced,"sesion",root),/checkout/);
 assert.throws(()=>bindOrdinaryReviewCheckout(replaced,"sesion",root),/consumida/);
 git("replace","-d",original.identity);git("reset","--hard",original.identity);
 for(const flag of ["assume-unchanged","skip-worktree"]){
  const hidden=prepare(original);git("update-index",`--${flag}`,"tracked.txt");writeFileSync(join(root,"tracked.txt"),"modificado");
  assert.throws(()=>bindOrdinaryReviewCheckout(hidden,"sesion",root),/checkout/);assert.throws(()=>bindOrdinaryReviewCheckout(hidden,"sesion",root),/consumida/);
  git("update-index",`--no-${flag}`,"tracked.txt");git("reset","--hard",original.identity);
 }


});
