import test from "node:test";
import assert from "node:assert/strict";
import {randomInt} from "node:crypto";
import {existsSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
 createT08IsolatedRepository,removeT08IsolatedRepository,t08TemporaryRoot
} from "../src/runtime/agents/t08-isolated-repository.js";
import {T08_TARGET,T08_BUGGY_SOURCE,checkT08Behavior}
 from "../src/runtime/agents/t08-controlled-fixture.js";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview}
 from "../src/review/workspace-review-session.js";
import {inspectStoredFixSourceTree}
 from "../src/review/judgment-fix-odd-preflight.js";

const sourceSha="a".repeat(40);
const newRun=()=>String(randomInt(1_000_000_000,9_000_000_000));
function create(runId:string){
 const root=t08TemporaryRoot(runId);
 return createT08IsolatedRepository({
  root,controllerSha:sourceSha,originalSource:T08_BUGGY_SOURCE
 });
}

test("T08 genera un Git mínimo reproducible sin elevar límites del inspector",t=>{
 const id1=newRun(),id2=newRun();
 const first=create(id1),second=create(id2);
 t.after(()=>{
  removeT08IsolatedRepository(first.root,id1);
  removeT08IsolatedRepository(second.root,id2);
 });
 assert.equal(first.root,t08TemporaryRoot(id1));
 assert.equal(first.fixtureHead,second.fixtureHead);
 assert.equal(first.controllerSha,sourceSha);
 assert.equal(first.fixtureHead===sourceSha,false);
 assert.equal(first.target,T08_TARGET);
 assert.equal(first.originalHasOnlyFixture,true);
 assert.equal(checkT08Behavior(first.root),false);
 assert.equal(readFileSync(join(first.root,T08_TARGET),"utf8"),T08_BUGGY_SOURCE);
 const trees:string[]=[];
 for(const root of [first.root,second.root]){
  const opened=openWorkspaceReview({
   repositoryRoot:root,intendedUntracked:[T08_TARGET],
   sessionId:"t08-session-fixture",reviewerId:"t08-prueba",
   viewParent:tmpdir(),
   risk:{riskId:"t08-isolated",reason:"Prueba de un error controlado",
    severity:"high",lenses:["risk","reliability"]}
  },{reviewPaths:[T08_TARGET]});
  try{
   const report=readWorkspaceReviewEvidence(opened);
   assert.equal(report.modifiedFiles.length,1);
   assert.equal(report.modifiedFiles[0]?.path,T08_TARGET);
   assert.equal(report.repositoryState.baseCommit,first.fixtureHead);
   assert.equal(report.repositoryState.intendedUntracked.length,1);
   assert.equal(report.candidateFiles.length,1);
   const checked=inspectStoredFixSourceTree(root,[T08_TARGET],
    report.candidate.treeIdentity);
   assert.equal(checked.matchedSource,true);
   assert.equal(checked.repositoryHead,first.fixtureHead);
   trees.push(report.candidate.treeIdentity);
  }finally{closeWorkspaceReview(opened);}
 }
 assert.equal(trees[0],trees[1]);
 writeFileSync(join(first.root,T08_TARGET),
  T08_BUGGY_SOURCE+"\n// cambio externo");
 assert.throws(()=>inspectStoredFixSourceTree(first.root,[T08_TARGET],
  trees[0]!),/changed after the original/u);
});
test("T08 nunca reutiliza una muestra ni borra otra ruta por confusión",t=>{
 const id=newRun(),root=t08TemporaryRoot(id);
 const fixture=create(id);
 t.after(()=>removeT08IsolatedRepository(root,id));
 assert.equal(fixture.root,root);
 assert.throws(()=>create(id),/no reutiliza/u);
 assert.throws(()=>t08TemporaryRoot("../../../tmp"),/no válido/u);
 assert.throws(()=>createT08IsolatedRepository({
  root:join(tmpdir(),"datos-ajenos"),controllerSha:sourceSha,
  originalSource:T08_BUGGY_SOURCE
 }),/no válida/u);
 assert.throws(()=>createT08IsolatedRepository({
  root:t08TemporaryRoot(newRun()),controllerSha:"invalido",
  originalSource:T08_BUGGY_SOURCE
 }),/no válida/u);
 removeT08IsolatedRepository(root,newRun());
 assert.equal(existsSync(root),true);
 removeT08IsolatedRepository(root,id);
 assert.equal(existsSync(root),false);
});

test("T08 Git sintético ignora repositorio forzado del host",()=>{
 const keys=["GIT_DIR","GIT_WORK_TREE","GIT_INDEX_FILE","GIT_CONFIG_COUNT"],
  previous=keys.map(key=>process.env[key]),id=newRun();
 let root:string|undefined;
 try{
  process.env.GIT_DIR=join(tmpdir(),"git-inexistente");
  process.env.GIT_WORK_TREE=join(tmpdir(),"arbol-forzado");
  process.env.GIT_INDEX_FILE=join(tmpdir(),"indice-ajeno");
  process.env.GIT_CONFIG_COUNT="1";
  root=create(id).root;
  assert.equal(readFileSync(join(root,T08_TARGET),"utf8"),T08_BUGGY_SOURCE);
 }finally{
  keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
  if(root)removeT08IsolatedRepository(root,id);
 }
});
