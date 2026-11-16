import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {dirname,join,resolve} from "node:path";
import {mkdtempSync,rmSync,readdirSync,readFileSync,writeFileSync} from "node:fs";
import {SessionTodoStore,todoProjectStorageFile} from "../src/runtime/lifecycle/todo-store.js";
import {tmpdir} from "node:os";
import {draftOddFromStoredFix} from "../src/review/judgment-fix-odd-draft.js";
import {inspectFixOddRecovery} from "../src/review/judgment-fix-odd-recovery.js";
import type {ScopedOddTodo} from "../src/review/odd-agent-review-flow.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";

const projectId=resolve(tmpdir(),"asen-fix-recovery-source");
const sessionId="pi-recuperacion",requestId="informe-original",tree="a".repeat(40);
const id=createHash("sha256").update([requestId,sessionId,projectId,tree].join("\0")).digest("hex");
const proposal:StoredJudgmentFixProposal={
 id,requestId,sessionId,repositoryRoot:projectId,
 candidateRevision:tree,candidateTreeIdentity:tree,paths:["src/fix.ts"],
 status:"proposal-only",requiredAction:"new-odd-plan",
 modelRequested:"unknown",modelActual:"unknown",
 createdAt:"2026-11-16T00:00:00.000Z",
 requiresFreshWriterConsent:true,autoLaunch:false,autoMerge:false,acceptance:"not-accepted"
};
const identity={sessionId,projectId};
const draft=draftOddFromStoredFix({proposal,identity});
const taskId="todo-11111111-2222-4333-8444-555555555555";
const request="asen-plan:fix-"+id.slice(0,24)+":worker";
function worker():ScopedOddTodo{
 return {
  taskId,title:"Reparación pendiente",requestId:request,description:"No reutilizar permisos",
  events:[{taskId,sessionId,projectId,revision:1,state:"planned",at:"2026-11-16T00:00:00.000Z"}],
  current:{taskId,sessionId,projectId,revision:1,state:"planned",at:"2026-11-16T00:00:00.000Z"},
  plan:{role:"worker",skillPaths:[],writeSurfaces:["src/fix.ts"],
   fixSource:{proposalId:id,treeIdentity:tree}}
 };
}
test("T08 identifica el Worker guardado tras perder la respuesta sin reintentar",()=>{
 const result=inspectFixOddRecovery({draft,identity,todos:[worker()]});
 assert.equal(result.status,"worker-observed");
 assert.equal(result.workerTodoId,taskId);
 assert.equal(result.workerState,"planned");
 assert.equal(result.actualModel,"unknown");
 assert.equal(result.autoLaunch,false);
 assert.equal(result.autoRetry,false);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(Object.isFrozen(result),true);
});
test("T08 un diario activo vacío no demuestra que el plan nunca se guardó",()=>{
 const result=inspectFixOddRecovery({draft,identity,todos:[]});
 assert.equal(result.status,"not-observed");
 assert.equal(result.workerTodoId,null);
 assert.match(result.reason,/interrupted save or earlier unavailable archive/u);
 assert.equal(result.autoRetry,false);
});
test("T08 rechazo de informes falsos, duplicados, ámbito distinto y sesión ajena",()=>{
 const source=worker();
 const cases=[
  [source,{...source,taskId:"todo-b"}],
  [{...source,plan:{...source.plan!,fixSource:{proposalId:id,treeIdentity:"b".repeat(40)}}}],
  [{...source,plan:{...source.plan!,writeSurfaces:["src/otro.ts"]}}],
  [{...source,requestId:"asen-plan:otra:worker"}],
  [{...source,current:{...source.current,sessionId:"otra"}}]
 ] as const;
 for(const todos of cases){
  const result=inspectFixOddRecovery({draft,identity,todos:todos as unknown as ScopedOddTodo[]});
  assert.equal(result.status,"inconsistent");
  assert.equal(result.autoRetry,false);
  assert.equal(result.workerTodoId,null);
  assert.equal(result.writerAuthority,false);
 }
});
test("T08 no permite consultar el guardado de otra sesión o proyecto",()=>{
 for(const other of [
  {...identity,sessionId:"otra"},
  {...identity,projectId:resolve(tmpdir(),"otro-proyecto")}
 ]){
  assert.throws(()=>inspectFixOddRecovery({draft,identity:other,todos:[worker()]}),
   /original read-only Pi session/u);
 }
});

test("T08 recupera un Worker archivado, sin inferir éxito ni permiso",()=>{
 const source=worker();
 const saved={...source,current:{...source.current,state:"done" as const}};
 const result=inspectFixOddRecovery({draft,identity,todos:[],archivedTodos:[saved]});
 assert.equal(result.status,"archived-worker-observed");
 assert.equal(result.observedIn,"archive");
 assert.equal(result.workerTodoId,taskId);
 assert.equal(result.workerState,"done");
 assert.equal(result.authorized,false);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.autoRetry,false);
 assert.equal(result.autoLaunch,false);
 assert.equal(result.acceptance,"not-accepted");
});
test("T08 un archivo terminal cancelado no se confunde con una reparación",()=>{
 const saved={...worker(),current:{...worker().current,state:"cancelled" as const}};
 const result=inspectFixOddRecovery({draft,identity,todos:[],archivedTodos:[saved]});
 assert.equal(result.status,"archived-worker-observed");
 assert.equal(result.workerState,"cancelled");
 assert.match(result.reason,/archived does not mean reviewed/u);
});
test("T08 rechaza duplicados cruzados, archivo no terminal y archivo falso",()=>{
 const source=worker();
 const cases=[
  {todos:[source],archivedTodos:[{...source,current:{...source.current,state:"done" as const}}]},
  {todos:[],archivedTodos:[source]},
  {todos:[],archivedTodos:[{...source,current:{...source.current,state:"done" as const},
   plan:{...source.plan!,fixSource:{proposalId:id,treeIdentity:"b".repeat(40)}}}]},
  {todos:[],archivedTodos:[{...source,current:{...source.current,state:"done" as const,
   sessionId:"otra-sesion"}}]},
  {todos:[],archivedTodos:[{...source,current:{...source.current,state:"done" as const},
   requestId:"asen-plan:otro-fix:worker"}]},
 ];
 for(const caseInput of cases){
  const result=inspectFixOddRecovery({draft,identity,
   todos:caseInput.todos as ScopedOddTodo[],archivedTodos:caseInput.archivedTodos as ScopedOddTodo[]});
  assert.equal(result.status,"inconsistent");
  assert.equal(result.workerTodoId,null);
  assert.equal(result.autoRetry,false);
 }
});

test("T08 recupera un Fix desde el archivo privado real, sin relanzar",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-fix-archive-real-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const store=await SessionTodoStore.openProjectScoped(root,join(root,"antiguo.json"));
 const plan={
  role:"worker" as const,skillPaths:["skills/asen-apply/SKILL.md"],
  skillSelection:{phase:"apply" as const,risk:"medium" as const,
   codeChange:true,behaviorChange:true,filesTouched:1},
  candidate:{id:"fix-archivo",repository:projectId,revision:tree,createdAt:new Date().toISOString()},
  writeSurfaces:["src/fix.ts"],
  writerAuthorizationBasis:JSON.stringify({instruction:"Corregir defecto del informe"}),
  fixSource:{proposalId:id,treeIdentity:tree}
 };
 const [saved]=await store.addPlan([{
  title:"Fix archivado",requestId:request,dependsOn:[],
  description:"Perform only the authorized, scoped work for: Corregir defecto del informe",
  plan
 }],identity);
 assert.ok(saved);
 await store.update(saved.taskId,identity,1,"running");
 await store.update(saved.taskId,identity,2,"done","Resultado histórico, sin aceptación automática");
 assert.equal((await store.list(identity)).length,0);
 const archive=await store.archived(identity);
 assert.equal(archive.length,1);
 const result=inspectFixOddRecovery({draft,identity,
  todos:await store.list(identity),archivedTodos:archive});
 assert.equal(result.status,"archived-worker-observed");
 assert.equal(result.workerTodoId,saved.taskId);
 assert.equal(result.workerState,"done");
 assert.equal(result.authorized,false);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.autoRetry,false);
 const archiveDir=join(dirname(todoProjectStorageFile(root,projectId)),"archive");
 const archiveName=readdirSync(archiveDir).find(name=>name.startsWith("archive-"));
 assert.ok(archiveName);
 const archiveFile=join(archiveDir,archiveName);
 const original=readFileSync(archiveFile,"utf8");
 // Se mantiene un JSON válido, pero su huella ya no coincide con el nombre.
 writeFileSync(archiveFile,original+" ");
 await assert.rejects(()=>store.archived(identity),/checksum mismatch/u);
 writeFileSync(archiveFile,original);
 assert.equal((await store.archived(identity)).length,1);
});
