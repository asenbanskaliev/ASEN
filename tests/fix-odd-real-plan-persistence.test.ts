import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {controlledInstructionPlanCommand} from "../src/runtime/lifecycle/route-command.js";
import {dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {captureWorkspaceReviewProjection} from "../src/review/workspace-review-projection.js";
import {draftOddFromStoredFix} from "../src/review/judgment-fix-odd-draft.js";
import {validateFreshFixOddRequest} from "../src/review/judgment-fix-odd-planning.js";
import {inspectLiveFixCandidate} from "../src/review/judgment-fix-odd-preflight.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";
import type {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";

function fixture(t:TestContext){
 const base=realpathSync(mkdtempSync(join(tmpdir(),"asen-fix-real-plan-")));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const repo=join(base,"repo");mkdirSync(repo);
 const git=(...args:string[])=>execFileSync("git",["-C",repo,...args],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"]
 }).trim();
 git("init","-q");git("config","user.name","ASEN prueba");
 git("config","user.email","asen@example.invalid");
 mkdirSync(join(repo,"src"));writeFileSync(join(repo,"src","fix.ts"),"original\n");
 git("add","src/fix.ts");git("commit","-qm","base");
 writeFileSync(join(repo,"src","fix.ts"),"cambio revisado\n");
 const root=realpathSync(repo),tree=captureWorkspaceReviewProjection({
  repositoryRoot:root,intendedUntracked:[]
 },["src/fix.ts"]).candidateTree;
 const sessionId="pi-revisión-real",requestId="juicio-fix",id=createHash("sha256")
  .update([requestId,sessionId,root,tree].join("\0")).digest("hex");
 const proposal:StoredJudgmentFixProposal={
  id,requestId,sessionId,repositoryRoot:root,
  candidateRevision:tree,candidateTreeIdentity:tree,paths:["src/fix.ts"],
  status:"proposal-only",requiredAction:"new-odd-plan",
  modelRequested:"unknown",modelActual:"unknown",
  createdAt:"2026-11-16T00:00:00.000Z",
  requiresFreshWriterConsent:true,autoLaunch:false,autoMerge:false,
  acceptance:"not-accepted"
 };
 const draft=draftOddFromStoredFix({proposal,identity:{sessionId,projectId:root}});
 const instruction="Corregir el defecto de src/fix.ts, manteniendo el alcance revisado y añadiendo pruebas.";
 const raw=JSON.stringify({
  instruction,taskIdentity:"fix-"+id.slice(0,24),intent:"defect",
  scope:{kind:"known",expectedPaths:["src/fix.ts"]},
  writes:[{path:"src/fix.ts",changeKind:"behavior"}],
  riskOperations:[],session:{estimatedMinutes:30,continuation:false},
  testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:10},
  unresolvedDecisions:[]
 });
 return {base,root,git,tree,id,sessionId,raw,draft};
}
test("T04/T08 almacena un ODD real con origen Fix, sin ejecutar agentes",async t=>{
 const f=fixture(t),observed=inspectLiveFixCandidate(f.draft);
 assert.equal(observed.matchedSource,true);
 validateFreshFixOddRequest(f.draft,f.raw);
 const candidate={id:"fix-nuevo",repository:f.root,
  revision:f.git("rev-parse","HEAD"),createdAt:new Date().toISOString()};
 const output=JSON.parse(controlledInstructionPlanCommand(f.raw,f.root,candidate)) as {
  executablePlan:{route:string;topologicalOrder:string[];tasks:Array<{
   id:string;title:string;role:string;instruction:string;dependsOn:string[];
   skillPaths:string[];priority:number;model?:string;thinking?:string;
   skillSelection?:unknown;candidate?:unknown;candidateRevision?:string;
   writeSurfaces?:string[];writerAuthorizationBasis?:string
  }>}
 };
 assert.equal(output.executablePlan.route,"orchestrate");
 const store=await SessionTodoStore.open(join(f.base,"todos.json"));
 const ordered=output.executablePlan.topologicalOrder.map(id=>
  output.executablePlan.tasks.find(task=>task.id===id)!);
 const fixSource={proposalId:f.id,treeIdentity:f.tree};
 const drafts=ordered.map(task=>({
  title:task.title,requestId:"asen-plan:"+task.id,
  dependsOn:task.dependsOn.map(id=>"asen-plan:"+id),
  description:task.instruction,
  plan:{
   role:task.role,skillPaths:task.skillPaths,priority:task.priority,
   ...(task.model?{model:task.model}:{}),
   ...(task.thinking?{thinking:task.thinking}:{}),
   ...(task.skillSelection?{skillSelection:task.skillSelection}:{}),
   ...(task.candidate?{candidate:task.candidate}:{}),
   ...(task.candidateRevision?{candidateRevision:task.candidateRevision}:{}),
   ...(task.writeSurfaces?{writeSurfaces:task.writeSurfaces}:{}),
   ...(task.writerAuthorizationBasis?{writerAuthorizationBasis:task.writerAuthorizationBasis}:{}),
   ...(task.role==="worker"?{fixSource}:{})
  }
 }));
 const identity={sessionId:f.sessionId,projectId:f.root};
 const persisted=await store.addPlan(drafts as unknown as Parameters<typeof store.addPlan>[0],identity);
 assert.ok(persisted.length>=2);
 const worker=(await store.list(identity)).find(row=>row.plan?.role==="worker");
 assert.ok(worker);
 assert.deepEqual(worker.plan?.fixSource,fixSource);
 assert.equal(worker.current.state,"planned");
 let asks=0,starts=0;
 const runtime={
  startControlledWorker:async()=>{starts++;throw new Error("No se debe iniciar el Worker");}
 } as unknown as AgentRuntime;
 const links={} as TaskAgentLinkStore;
 const input={
  todos:store,agents:runtime,links,identity,
  validateIdentity:async()=>{},
  confirm:async()=>{asks++;return false;}
 };
 const declined=await dispatchNextPlanTask(input);
 assert.equal(declined.status,"blocked");
 assert.equal(asks,1,"La escritura necesita un consentimiento nuevo, no heredado");
 assert.equal(starts,0);
 writeFileSync(join(f.root,"src","fix.ts"),"cambio posterior\n");
 const stale=await dispatchNextPlanTask(input);
 assert.equal(stale.status,"blocked");
 assert.match(stale.status==="blocked"?stale.reason:"",/Fix ODD reviewed tree changed/u);
 assert.equal(asks,1,"Un candidato alterado se bloquea ANTES del diálogo Writer");
 assert.equal(starts,0);
 // Un cambio durante el diálogo no puede aprovechar el consentimiento dado
 // para un árbol distinto, aunque el HEAD de Git permanezca igual.
 writeFileSync(join(f.root,"src","fix.ts"),"cambio revisado\n");
 const changedDuringConsent=await dispatchNextPlanTask({
  ...input,confirm:async()=>{
   asks++;writeFileSync(join(f.root,"src","fix.ts"),"alterado en el diálogo\n");
   return true;
  }
 });
 assert.equal(changedDuringConsent.status,"blocked");
 assert.match(changedDuringConsent.status==="blocked"?changedDuringConsent.reason:"",
  /Fix ODD reviewed tree changed while awaiting Writer approval/u);
 assert.equal(asks,2);
 assert.equal(starts,0,"No se ejecuta Writer sobre una versión distinta de la aceptada");
});
