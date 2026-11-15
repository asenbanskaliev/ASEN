import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {registerParallelWorktreeCommand} from "../src/runtime/lifecycle/parallel-worktree-command.js";
import {ParallelTodoWorktreeJournal,newParallelTodoWorktreeBatchId} from "../src/runtime/agents/parallel-todo-journal.js";
import {bindParallelSourceTodos,type SourceTodoRow} from "../src/runtime/agents/parallel-todo-bindings.js";
import {ParallelChildSessionJournal} from "../src/runtime/agents/parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "../src/runtime/agents/parallel-child-plan-claims.js";
import {ParallelWorkerObservationJournal} from "../src/runtime/agents/parallel-worker-observation-journal.js";
import type {PublicAgentRecord} from "../src/runtime/agents/agent-lifecycle.js";
import type {TaskAgentLink} from "../src/runtime/agents/task-agent-link-store.js";
import type {TodoContext} from "../src/runtime/lifecycle/todo-store.js";
import {readAgentFlowPanelObservation} from "../src/runtime/ui/agent-flow-panel-source.js";

function fixture(t:TestContext){
 const source=resolve(mkdtempSync(join(tmpdir(),"asen-t06-linked-source-"))),
  parent=resolve(mkdtempSync(join(tmpdir(),"asen-t06-linked-worktrees-"))),
  privateRoot=resolve(mkdtempSync(join(tmpdir(),"asen-t06-linked-private-")));
 const git=(...args:string[])=>execFileSync("git",["-C",source,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","ASEN T06 linked");
 git("config","user.email","asen-t06@example.invalid");
 writeFileSync(join(source,"backend.txt"),"backend\n");
 writeFileSync(join(source,"frontend.txt"),"frontend\n");
 git("add","backend.txt","frontend.txt");git("commit","-qm","baseline");
 const head=git("rev-parse","HEAD"),identity:TodoContext={sessionId:"pi-t06",projectId:source},
  journalFile=join(privateRoot,"parallel-worktrees.json"),journal=new ParallelTodoWorktreeJournal(journalFile),
  sessionLinksFile=join(privateRoot,"parallel-worktree-sessions.json"),sessions=new ParallelChildSessionJournal(sessionLinksFile,journal),
  planClaimsFile=join(privateRoot,"parallel-child-plan-claims.json"),
  observationFile=join(privateRoot,"parallel-worker-observations.json"),handoffs:string[]=[],
  scopes=[{taskId:"todo-backend",writeSurfaces:["backend.txt"]},{taskId:"todo-frontend",writeSurfaces:["frontend.txt"]}],
  notifications:string[]=[],confirmMessages:string[]=[];
 const row=(taskId:string,file:string,revision=1,state="planned"):SourceTodoRow=>{
  const event={taskId,sessionId:identity.sessionId,projectId:identity.projectId,revision,state,at:"2026-11-15T17:00:00.000Z"};
  return {taskId,title:taskId,requestId:"asen-plan:"+taskId+":worker",description:"Work "+file,
   events:[event],current:event,plan:{role:"worker",skillPaths:["skills/asen-apply/SKILL.md"],
    skillSelection:{phase:"apply",codeChange:true},
    candidate:{id:"source",repository:source,revision:head,createdAt:"2026-11-15T17:00:00.000Z"},
    writeSurfaces:[file],writerAuthorizationBasis:'{"instruction":"work"}'}
  } as unknown as SourceTodoRow;
 };
 const childRows=new Map<string,SourceTodoRow[]>(),
  childAgentRecords=new Map<string,PublicAgentRecord[]>(),
  childTaskLinks=new Map<string,TaskAgentLink[]>(),
  dispatchedChildren:{sourceTodoId:string;childTodoId:string;model:string}[]=[];
 let rows=[row("todo-backend","backend.txt"),row("todo-frontend","frontend.txt")],
  session=identity.sessionId,approve=true,editorAnswer=JSON.stringify({parentDir:parent,units:scopes});
 const commands=new Map<string,{handler:(args:string,ctx:unknown)=>Promise<unknown>}>();
 registerParallelWorktreeCommand((name,command)=>commands.set(name,command as never),{
  journalFile,sessionLinksFile,planClaimsFile,observationFile,
  planChildTodo:async input=>{handoffs.push(input);return {status:"model-free-ODD-planner-stub"};},
  loadTodos:async identity=>identity.sessionId==="pi-t06"?rows:childRows.get(identity.sessionId)??[],
  loadChildAgentRecords:async identity=>childAgentRecords.get(identity.sessionId)??[],
  loadChildTaskAgentLinks:async identity=>childTaskLinks.get(identity.sessionId)??[],
  // Instrumented ONLY: proves the supervisor delegates exact Pi user consent.
  // Real production uses dispatchNextPlanTask + AgentRuntime + TrustedTaskAgentBinder.
  launchChildWorker:async(unit,confirm,validateParent)=>{
   await validateParent();
   const authorized=await confirm({id:unit.childTodoId,title:"ODD child Worker",role:"worker",
    instruction:"Perform only authorized child scope",writeSurfaces:unit.writeSurfaces,
    candidateRevision:unit.baseRevision});
   if(!authorized)return {status:"blocked" as const,reason:"Per-Worker Pi consent declined"};
   dispatchedChildren.push({sourceTodoId:unit.sourceTodoId,childTodoId:unit.childTodoId,model:unit.model});
   const current=childRows.get(unit.childSessionId)??[];
   childRows.set(unit.childSessionId,current.map(t=>t.taskId===unit.childTodoId?
    {...t,current:{...t.current,state:"running"}} as SourceTodoRow:t));
   const now="2026-11-15T22:00:00.000Z",agentId="instrumented-"+unit.childTodoId;
   childAgentRecords.set(unit.childSessionId,[{
    id:agentId,role:"worker",state:"running",
    sessionId:unit.childSessionId,projectId:unit.childProjectId,
    owner:{kind:"user",id:"pi:"+unit.childSessionId},createdAt:now,updatedAt:now
   }]);
   childTaskLinks.set(unit.childSessionId,[{taskId:unit.childTodoId,
    agentId,sessionId:unit.childSessionId,projectId:unit.childProjectId,
    createdAt:now}]);
   return {status:"dispatched" as const,role:"worker" as const,
    todoId:unit.childTodoId,agentId};
  },
  loadChildAgents:async identity=>identity.sessionId==="child-pi-1"?
   [{id:"child-worker-1",role:"worker",state:"running"}]:[]
 });
 const ctx:any={cwd:source,mode:"tui",hasUI:true,
  sessionManager:{getSessionId:()=>session},ui:{
   notify:(message:string)=>notifications.push(message),
   editor:async()=>editorAnswer,
   confirm:async(_title:string,message:string)=>{confirmMessages.push(message);return approve;}
  }};
 const run=(command:string)=>commands.get("asen-worktrees")!.handler(command,ctx);
 const runChild=(command:string,root:string,id="child-pi-1")=>
  commands.get("asen-worktrees")!.handler(command,{
   ...ctx,cwd:root,sessionManager:{getSessionId:()=>id}
  });
 t.after(()=>{
  if(existsSync(source))try{
   for(const line of git("worktree","list","--porcelain").split(/\r?\n/u)){
    if(line.startsWith("worktree ")){
     const root=line.slice(9);if(root!==source)try{git("worktree","remove","--force",root);}catch{}
    }
   }
  }catch{}
  rmSync(source,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});
  rmSync(privateRoot,{recursive:true,force:true});
 });
 return {source,parent,head,identity,scopes,rows,run,runChild,journal,sessions,handoffs,ctx,
  journalFile,sessionLinksFile,planClaimsFile,observationFile,
  setChildObservations:(id:string,todos:SourceTodoRow[],agents:PublicAgentRecord[],links:TaskAgentLink[])=>{
   childRows.set(id,todos);childAgentRecords.set(id,agents);childTaskLinks.set(id,links);
  },
  getChildObservations:(id:string)=>({
   todos:childRows.get(id)??[],agents:childAgentRecords.get(id)??[],
   links:childTaskLinks.get(id)??[]
  }),
  dispatchedChildren,
  notices:notifications,confirmMessages,
  setRows:(next:SourceTodoRow[])=>{rows=next;},setSession:(next:string)=>{session=next;},
  setConsent:(next:boolean)=>{approve=next;},setEditor:(value:string)=>{editorAnswer=value;},row};
}

test("T06 linked worktree command reserves actual ODD Todo identities before creating Git worktrees",async t=>{
 const f=fixture(t);
 const result=await f.run("prepare-todos") as {status:string;batchId:string;sourceTodoBound:boolean;
  worktrees:readonly {taskId:string;root:string;head:string}[];autoMerge:boolean;grantsAuthority:boolean};
 assert.equal(result.status,"prepared");assert.equal(result.sourceTodoBound,true);
 assert.equal(result.worktrees.length,2);assert.equal(result.autoMerge,false);assert.equal(result.grantsAuthority,false);
 const stored=await f.journal.list(f.identity);
 assert.equal(stored.length,1);assert.equal(stored[0]!.state,"prepared");assert.equal(stored[0]!.id,result.batchId);
 assert.deepEqual(stored[0]!.tasks.map(x=>x.taskId),["todo-backend","todo-frontend"]);
 assert.equal(f.confirmMessages.length,1);
 const status=await f.run("status") as {status:string;autoResume:boolean;records:readonly {
  state:string;tasks:readonly {sourceTodoId:string;sourceTodoUnchanged:boolean;worktreePresent:boolean;acceptance:string}[]
 }[]};
 assert.equal(status.status,"audit-only");assert.equal(status.autoResume,false);
 assert.equal(status.records[0]!.state,"prepared");
 assert.equal(status.records[0]!.tasks.every(x=>x.sourceTodoUnchanged&&x.worktreePresent&&x.acceptance==="not-accepted"),true);
 await assert.rejects(()=>f.run("prepare-todos"),/already reserved/u);
 assert.equal((await f.journal.list(f.identity)).length,1);
});

test("T06 linked mode declines and refuses stale Todo revisions without reserving",async t=>{
 const f=fixture(t);
 f.setConsent(false);
 assert.deepEqual(await f.run("prepare-todos"),{status:"declined",grantsAuthority:false});
 assert.equal((await f.journal.list(f.identity)).length,0);
 f.setConsent(true);
 f.ctx.ui.confirm=async()=>{
  f.setRows([f.row("todo-backend","backend.txt",2),f.row("todo-frontend","frontend.txt")]);
  return true;
 };
 await assert.rejects(()=>f.run("prepare-todos"),/state changed/u);
 assert.equal((await f.journal.list(f.identity)).length,0);
});

test("T06 linked mode rejects changed scopes, foreign Todo and missing planned Workers before confirmation",async t=>{
 const f=fixture(t);
 f.setEditor(JSON.stringify({parentDir:f.parent,units:[
  {taskId:"todo-backend",writeSurfaces:["frontend.txt"]},
  {taskId:"todo-frontend",writeSurfaces:["frontend.txt"]}]}));
 await assert.rejects(()=>f.run("prepare-todos"),/Source Todo|Overlapping/u);
 assert.equal(f.confirmMessages.length,0);
 f.setEditor(JSON.stringify({parentDir:f.parent,units:f.scopes}));
 f.setRows([f.row("todo-backend","backend.txt",1,"running"),f.row("todo-frontend","frontend.txt")]);
 const result=await f.run("prepare-todos") as {status:string};
 assert.equal(result.status,"blocked");
 assert.equal((await f.journal.list(f.identity)).length,0);
});

test("T06 interrupted reservation remains visible, blocks duplicate planning, never authorizes replay",async t=>{
 const f=fixture(t),bindings=bindParallelSourceTodos({
  identity:f.identity,expectedHead:f.head,rows:f.rows,units:f.scopes
 });
 const id=newParallelTodoWorktreeBatchId();
 const reserved=await f.journal.reserve({identity:f.identity,id,head:f.head,parentDir:f.parent,bindings});
 assert.equal(reserved.state,"reserved");
 const inspection=await f.run("status") as {autoResume:boolean;records:readonly {state:string;tasks:readonly {worktreePresent:boolean}[]}[]};
 assert.equal(inspection.autoResume,false);assert.equal(inspection.records[0]!.state,"reserved");
 assert.equal(inspection.records[0]!.tasks.every(t=>t.worktreePresent===false),true);
 await assert.rejects(()=>f.journal.reserve({identity:f.identity,id:newParallelTodoWorktreeBatchId(),head:f.head,parentDir:f.parent,bindings}),/already reserved/u);
 await assert.rejects(()=>f.journal.markPrepared({identity:f.identity,id,allocations:[]}),/absent, stale/u);
 const foreign=await f.journal.list({sessionId:"other-session",projectId:f.source});
 assert.equal(foreign.length,0);
});

test("T06 durable reservations reject overlapping sibling batches but allow disjoint scope reuse",async t=>{
 const f=fixture(t),first=bindParallelSourceTodos({
  identity:f.identity,expectedHead:f.head,rows:f.rows,units:f.scopes
 });
 await f.journal.reserve({identity:f.identity,id:newParallelTodoWorktreeBatchId(),head:f.head,parentDir:f.parent,bindings:first});
 const changed=[{...first[0]!,taskId:"new-backend",requestId:"asen-plan:new-backend:worker"},
  {...first[1]!,taskId:"new-frontend",requestId:"asen-plan:new-frontend:worker"}];
 await assert.rejects(()=>f.journal.reserve({
  identity:{sessionId:"another-session",projectId:f.source},
  id:newParallelTodoWorktreeBatchId(),head:f.head,parentDir:f.parent,bindings:changed
 }),/write scopes overlap/u);
 const disjoint=changed.map((b,i)=>({...b,writeSurfaces:[i?"extra-two.ts":"extra-one.ts"]}));
 const saved=await f.journal.reserve({identity:f.identity,id:newParallelTodoWorktreeBatchId(),head:f.head,parentDir:f.parent,bindings:disjoint});
 assert.equal(saved.state,"reserved");
 assert.equal((await f.journal.list(f.identity)).length,2);
});

test("T06 child Pi attachment never attributes unrelated agents or grants Writer/merge authority",async t=>{
 const f=fixture(t),prepared=await f.run("prepare-todos") as {status:string;worktrees:readonly {root:string}[]};
 assert.equal(prepared.status,"prepared");
 const child=prepared.worktrees[0]!.root;
 const attached=await f.runChild("attach",child) as {status:string;grantsAuthority:boolean;autoDispatch:boolean;sourceTodoId:string};
 assert.equal(attached.status,"attached");
 assert.equal(attached.grantsAuthority,false);assert.equal(attached.autoDispatch,false);
 assert.equal(attached.sourceTodoId,"todo-backend");
 const links=await f.sessions.listSource(f.identity);
 assert.equal(links.length,1);
 assert.equal(links[0]!.childProjectId,child);assert.equal(links[0]!.authority,"none");
 const state=await f.run("status") as {status:string;records:readonly {tasks:readonly {
  sourceTodoId:string;acceptance:string;childSession?:{id:string;agents:readonly {id:string;state:string}[]}
 }[]}[]};
 const associated=state.records[0]!.tasks[0]!;
 assert.equal(associated.childSession?.id,"child-pi-1");
 assert.deepEqual(associated.childSession?.agents,[],
  "attached child session is not a genuine ODD Worker launch or task-agent binding");
 assert.equal(associated.acceptance,"not-accepted");
 await assert.rejects(()=>f.runChild("attach",child),/already linked/u);
 assert.equal((await f.sessions.listSource(f.identity)).length,1);
});

test("T06 child session attachment refuses consent, wrong worktree and reused session",async t=>{
 const f=fixture(t),prepared=await f.run("prepare-todos") as {worktrees:{root:string}[]};
 const first=prepared.worktrees[0]!.root,second=prepared.worktrees[1]!.root;
 f.setConsent(false);
 assert.deepEqual(await f.runChild("attach",first),{status:"declined",grantsAuthority:false,autoDispatch:false});
 assert.equal((await f.sessions.listSource(f.identity)).length,0);
 f.setConsent(true);
 await assert.rejects(()=>f.runChild("attach",f.source),/no prepared source ODD Todo/u);
 assert.equal((await f.runChild("attach",first) as {status:string}).status,"attached");
 await assert.rejects(()=>f.runChild("attach",second,"child-pi-1"),/already linked/u);
 assert.equal((await f.sessions.listSource(f.identity)).length,1);
});

test("T06 child attachment fails closed if worktree HEAD diverges from prepared source",async t=>{
 const f=fixture(t),prepared=await f.run("prepare-todos") as {worktrees:{root:string}[]};
 const root=prepared.worktrees[0]!.root;
 execFileSync("git",["-C",root,"config","user.name","T06 child"],{stdio:"ignore"});
 execFileSync("git",["-C",root,"config","user.email","child@example.invalid"],{stdio:"ignore"});
 writeFileSync(join(root,"backend.txt"),"different\n");
 execFileSync("git",["-C",root,"add","backend.txt"],{stdio:"ignore"});
 execFileSync("git",["-C",root,"commit","-qm","child changed HEAD"],{stdio:"ignore"});
 await assert.rejects(()=>f.runChild("attach",root),/exact linked Git candidate/u);
 assert.equal((await f.sessions.listSource(f.identity)).length,0);
});

test("T06 /asen-worktrees review remains advisory and catches a real out-of-scope Git write",async t=>{
 const f=fixture(t),prepared=await f.run("prepare-todos") as {worktrees:readonly {root:string}[]};
 const before=await f.run("review") as {status:string;grantsAuthority:boolean;autoMerge:boolean;
  reconciliation:readonly {disposition:string;acceptance:string;blockers:readonly string[]}[]};
 assert.equal(before.status,"review-preview");assert.equal(before.autoMerge,false);
 assert.equal(before.reconciliation[0]!.disposition,"not-started");
 assert.equal(before.reconciliation[0]!.acceptance,"not-accepted");
 writeFileSync(join(prepared.worktrees[0]!.root,"frontend.txt"),"crossed scope\n");
 const after=await f.run("review") as typeof before;
 assert.equal(after.reconciliation[0]!.disposition,"blocked");
 assert.equal(after.reconciliation[0]!.blockers.some(x=>/outside authorized scope/u.test(x)),true);
 assert.equal(after.grantsAuthority,false);assert.equal(after.autoMerge,false);
});

test("T06 one-shot ODD handoff re-plans an exact original Worker in its Pi worktree after new consent",async t=>{
 const f=fixture(t);
 const basis=(taskId:string,file:string)=>JSON.stringify({
  instruction:"Implement only "+file+" within its approved scope",
  taskIdentity:taskId,intent:"implementation",
  scope:{kind:"known",expectedPaths:[file]},
  writes:[{path:file,changeKind:"behavior"}],
  riskOperations:[],
  session:{estimatedMinutes:20,continuation:false},
  testing:{kind:"required"},
  review:{kind:"dual_explicit",estimatedMinutes:5},
  unresolvedDecisions:[]
 });
 f.setRows(f.rows.map((row,i)=>{
  const exactBasis=basis(i?"todo-frontend":"todo-backend",i?"frontend.txt":"backend.txt");
  return {...row,
   description:"Perform only the authorized, scoped work for: "+(JSON.parse(exactBasis) as {instruction:string}).instruction,
   plan:{...row.plan!,writerAuthorizationBasis:exactBasis}
  } as SourceTodoRow;
 }));
 const prepared=await f.run("prepare-todos") as {worktrees:readonly {root:string}[]};
 const child=prepared.worktrees[0]!.root;
 assert.equal((await f.runChild("attach",child) as {status:string}).status,"attached");
 const start=await f.runChild("plan-todo",child) as {status:string;sourceTodoId:string;grantsAuthority:boolean;autoRetry:boolean};
 assert.equal(start.status,"handed-to-own-odd-planner");
 assert.equal(start.grantsAuthority,false);assert.equal(start.autoRetry,false);
 assert.equal(start.sourceTodoId,"todo-backend");
 assert.equal(f.handoffs.length,1);
 assert.deepEqual(JSON.parse(f.handoffs[0]!),JSON.parse(basis("todo-backend","backend.txt")));
 const source=await f.run("status") as {records:readonly {tasks:readonly {sourceTodoId:string;handoffClaimed:boolean}[]}[]};
 assert.equal(source.records[0]!.tasks.find(row=>row.sourceTodoId==="todo-backend")?.handoffClaimed,true);
 await assert.rejects(()=>f.runChild("plan-todo",child),/previously claimed/u);
 assert.equal(f.handoffs.length,1);
});

test("T06 child ODD handoff never launches after declining consent, Git scope drift or missing link",async t=>{
 const f=fixture(t);
 const basis=JSON.stringify({
  instruction:"Update backend.txt",taskIdentity:"todo-backend",intent:"implementation",
  scope:{kind:"known",expectedPaths:["backend.txt"]},
  writes:[{path:"backend.txt",changeKind:"behavior"}],riskOperations:[],
  session:{estimatedMinutes:20,continuation:false},
  testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:5},
  unresolvedDecisions:[]
 });
 f.setRows(f.rows.map((row,i)=>({
  ...row,
  ...(i?{}:{description:"Perform only the authorized, scoped work for: Update backend.txt"}),
  plan:{...row.plan!,writerAuthorizationBasis:i?row.plan!.writerAuthorizationBasis:basis}
 } as SourceTodoRow)));
 const prepared=await f.run("prepare-todos") as {worktrees:readonly {root:string}[]};
 const root=prepared.worktrees[0]!.root;
 await assert.rejects(()=>f.runChild("plan-todo",root),/must be attached/u);
 assert.equal((await f.runChild("attach",root) as {status:string}).status,"attached");
 f.setConsent(false);
 assert.deepEqual(await f.runChild("plan-todo",root),{
  status:"declined",grantsAuthority:false,autoDispatch:false
 });
 assert.equal(f.handoffs.length,0);
 f.setConsent(true);
 writeFileSync(join(root,"frontend.txt"),"unexpected out-of-scope change\n");
 await assert.rejects(()=>f.runChild("plan-todo",root),/must remain clean/u);
 assert.equal(f.handoffs.length,0);
});

test("T07 worktree status exposes a read-only overview grounded in real prepared Todos",async t=>{
 const f=fixture(t),prepared=await f.run("prepare-todos") as {status:string;worktrees:readonly {root:string}[]};
 assert.equal(prepared.status,"prepared");
 const source=await f.run("status") as {flowOverview:{
  kind:string;totalBatches:number;totalTasks:number;stages:Record<string,number>;
  modelActual?:string;tasks:readonly {taskId:string;modelActual:string;modelConsumedProven:boolean;nextAction:string}[];
  grantsAuthority:boolean;autoLaunch:boolean;autoMerge:boolean;acceptance:string;
 }};
 assert.equal(source.flowOverview.kind,"read-only-flow-overview");
 assert.equal(source.flowOverview.totalBatches,1);
 assert.equal(source.flowOverview.totalTasks,2);
 assert.equal(source.flowOverview.stages["attach-required"],2);
 assert.equal(source.flowOverview.tasks[0]!.modelActual,"unknown");
 assert.equal(source.flowOverview.tasks[0]!.modelConsumedProven,false);
 assert.equal(source.flowOverview.autoLaunch,false);
 assert.equal(source.flowOverview.grantsAuthority,false);
 assert.equal(source.flowOverview.autoMerge,false);
 assert.equal(source.flowOverview.acceptance,"not-accepted");
 const attached=await f.runChild("attach",prepared.worktrees[0]!.root) as {status:string};
 assert.equal(attached.status,"attached");
 const observed=await f.run("review") as typeof source;
 assert.equal(observed.flowOverview.stages["child-plan-required"],1);
 assert.equal(observed.flowOverview.stages["attach-required"],1);
 assert.equal(observed.flowOverview.acceptance,"not-accepted");
});


test("T07 main work panel reads a bounded source Todo + worktree + Pi child observation",async t=>{
 const f=fixture(t);
 const load=()=>readAgentFlowPanelObservation({
  identity:f.identity,journalFile:f.journalFile,sessionLinksFile:f.sessionLinksFile,
  planClaimsFile:f.planClaimsFile,loadTodos:async()=>f.rows,
  // An unrelated session Worker must not count as a planned/authorized child.
  loadChildAgentRecords:async()=>[{id:"child-worker-1",role:"worker",state:"running",
   sessionId:"child-pi-1",projectId:f.source,owner:{kind:"user",id:"unrelated"},
   createdAt:"2026-11-15T18:00:00.000Z",updatedAt:"2026-11-15T18:01:00.000Z"}],
  loadChildTaskAgentLinks:async()=>[]
 });
 const absent=await load();
 assert.equal(absent.state,"absent");assert.equal(absent.overview.totalTasks,0);
 const created=await f.run("prepare-todos") as {status:string;worktrees:readonly {root:string}[]};
 assert.equal(created.status,"prepared");
 const first=await load();
 assert.equal(first.state,"observed");assert.equal(first.totalRecordedBatches,1);
 assert.equal(first.limited,false);assert.equal(first.overview.totalTasks,2);
 assert.equal(first.overview.stages["attach-required"],2);
 const attached=await f.runChild("attach",created.worktrees[0]!.root) as {status:string};
 assert.equal(attached.status,"attached");
 const withChild=await load();
 assert.equal(withChild.overview.stages["running-observed"],0);
 assert.equal(withChild.overview.stages["child-plan-required"],1);
 assert.equal(withChild.overview.stages["attach-required"],1);
 assert.equal(withChild.overview.tasks[0]!.modelActual,"unknown");
 assert.equal(withChild.overview.tasks[0]!.modelConsumedProven,false);
 assert.equal(withChild.overview.acceptance,"not-accepted");
 assert.equal(withChild.overview.autoMerge,false);
 writeFileSync(join(created.worktrees[0]!.root,"frontend.txt"),"out-of-scope\\n");
 const unsafe=await load();
 assert.equal(unsafe.overview.stages.blocked,1);
 assert.equal(unsafe.overview.tasks[0]!.nextAction,"inspect-blocker");
 assert.equal(unsafe.overview.acceptance,"not-accepted");
});

async function prepareAttributedChildren(f:ReturnType<typeof fixture>,withoutLink=false){
 const prepared=await f.run("prepare-todos") as {status:string;worktrees:readonly {root:string}[]};
 assert.equal(prepared.status,"prepared");assert.equal(prepared.worktrees.length,2);
 for(let i=0;i<2;i++){
  const childId="child-pi-"+(i+1),project=prepared.worktrees[i]!.root;
  assert.equal((await f.runChild("attach",project,childId) as {status:string}).status,"attached");
  const file=i?"frontend.txt":"backend.txt",taskId="child-todo-"+(i+1),
   requestId="asen-plan:child-"+(i+1)+":worker";
  const base=f.row(taskId,file),current={
   ...base.current,sessionId:childId,projectId:project,state:"succeeded" as const
  };
  const childTodo={...base,current,requestId,
   plan:{...base.plan!,candidate:{...base.plan!.candidate!,repository:project,revision:f.head},
    writeSurfaces:[file]}
  } as SourceTodoRow;
  const agent:PublicAgentRecord={
   id:requestId.slice("asen-plan:".length),role:"worker",state:"completed",
   sessionId:childId,projectId:project,owner:{kind:"user",id:"pi:"+childId},
   createdAt:"2026-11-15T19:00:00.000Z",updatedAt:"2026-11-15T19:01:00.000Z"
  };
  const taskAgentLink:TaskAgentLink={
   taskId,agentId:requestId.slice("asen-plan:".length),sessionId:childId,projectId:project,
   createdAt:"2026-11-15T19:00:00.000Z"
  };
  f.setChildObservations(childId,[childTodo],[agent],withoutLink&&i===1?[]:[taskAgentLink]);
 }
 const claims=new ParallelChildPlanClaimJournal(f.planClaimsFile),
  sessions=await f.sessions.listSource(f.identity);
 assert.equal(sessions.length,2);
 for(const link of sessions)await claims.claim(link);
 return prepared;
}

test("T06 parent coordinator collects two exact child Worker audit receipts and never fabricates acceptance",async t=>{
 const f=fixture(t),prepared=await prepareAttributedChildren(f);
 const result=await f.run("collect") as {status:string;batchId:string;observed:readonly {agentState:string;modelActual:string}[];acceptance:string;grantsAuthority:boolean;autoMerge:boolean;autoRetry:boolean};
 assert.equal(result.status,"observed-needs-independent-review");
 assert.equal(result.observed.length,2);
 assert.deepEqual(result.observed.map(x=>x.agentState),["completed","completed"]);
 assert.equal(result.observed[0]!.modelActual,"unknown");
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.grantsAuthority,false);assert.equal(result.autoMerge,false);assert.equal(result.autoRetry,false);
 const journal=new ParallelWorkerObservationJournal(f.observationFile);
 const links=await f.sessions.listSource(f.identity);
 const receipts=await journal.listSource(f.identity,links);
 assert.equal(receipts.length,2);
 assert.equal(receipts.every(x=>x.acceptance==="not-accepted"&&x.modelConsumedProven===false),true);
 const status=await f.run("status") as {records:readonly {tasks:readonly {workerReceipt?:{agentId:string;agentState:string}}[]}[]};
 assert.equal(status.records[0]!.tasks.filter(x=>x.workerReceipt?.agentState==="completed").length,2);
 await assert.rejects(()=>f.run("collect"),/already recorded/u);
 assert.equal((await journal.listSource(f.identity,links)).length,2);
 assert.equal(prepared.worktrees.length,2);
});

test("T06 parent coordinator will not collect unrelated child Workers or invent missing Todo-agent associations",async t=>{
 const f=fixture(t);await prepareAttributedChildren(f,true);
 const result=await f.run("collect") as {status:string;blockers:readonly string[];grantsAuthority:boolean};
 assert.equal(result.status,"blocked");
 assert.ok(result.blockers.some(x=>/independently attributed/u.test(x)));
 assert.equal(result.grantsAuthority,false);
 const journal=new ParallelWorkerObservationJournal(f.observationFile);
 assert.equal((await journal.listSource(f.identity,await f.sessions.listSource(f.identity))).length,0);
});

test("T06 declining parent evidence collection leaves source and child journals unchanged",async t=>{
 const f=fixture(t);await prepareAttributedChildren(f);
 f.setConsent(false);
 const result=await f.run("collect") as {status:string;grantsAuthority:boolean};
 assert.equal(result.status,"declined");
 assert.equal(result.grantsAuthority,false);
 const journal=new ParallelWorkerObservationJournal(f.observationFile);
 assert.equal((await journal.listSource(f.identity,await f.sessions.listSource(f.identity))).length,0);
});

test("T06/T07 real issued task-agent links are required before any child Worker is shown as running",async t=>{
 const f=fixture(t);
 const created=await prepareAttributedChildren(f);
 assert.equal(created.worktrees.length,2);
 const load=()=>readAgentFlowPanelObservation({
  identity:f.identity,journalFile:f.journalFile,sessionLinksFile:f.sessionLinksFile,
  planClaimsFile:f.planClaimsFile,
  loadTodos:async identity=>identity.sessionId===f.identity.sessionId?f.rows:
   (identity.sessionId==="child-pi-1"?[f.row("irrelevant","backend.txt")]:[]),
  loadChildAgentRecords:async id=>id.sessionId==="child-pi-1"?[
   {id:"unrelated-agent",role:"worker",state:"running",
    sessionId:id.sessionId,projectId:id.projectId,owner:{kind:"user",id:"other"},
    createdAt:"2026-11-15T19:00:00.000Z",updatedAt:"2026-11-15T19:01:00.000Z"}
  ]:[],
  loadChildTaskAgentLinks:async()=>[]
 });
 const panel=await load();
 assert.equal(panel.overview.stages["running-observed"],0);
 assert.equal(panel.overview.stages["handoff-unverified"],2);
 assert.equal(panel.overview.tasks.every(task=>task.modelActual==="unknown"),true);
});

test("T06/T07 source views show only genuinely linked and ODD-claimed child Workers as terminal",async t=>{
 const f=fixture(t);
 await prepareAttributedChildren(f);
 const status=await f.run("status") as {flowOverview:{
  stages:Readonly<Record<string,number>>;tasks:readonly {workerObserved:string;modelActual:string}[];
  acceptance:string;autoMerge:boolean;
 }};
 assert.equal(status.flowOverview.stages["manual-review-required"],2);
 assert.equal(status.flowOverview.stages["running-observed"],0);
 assert.equal(status.flowOverview.tasks.every(t=>t.workerObserved==="terminal-unverified"),true);
 assert.equal(status.flowOverview.tasks.every(t=>t.modelActual==="unknown"),true);
 const fromPanel=await readAgentFlowPanelObservation({
  identity:f.identity,journalFile:f.journalFile,sessionLinksFile:f.sessionLinksFile,
  planClaimsFile:f.planClaimsFile,
  loadTodos:async id=>id.sessionId===f.identity.sessionId?f.rows:f.getChildObservations(id.sessionId).todos,
  loadChildAgentRecords:async id=>f.getChildObservations(id.sessionId).agents,
  loadChildTaskAgentLinks:async id=>f.getChildObservations(id.sessionId).links
 });
 assert.equal(fromPanel.overview.stages["manual-review-required"],2);
 assert.equal(fromPanel.overview.acceptance,"not-accepted");
 assert.equal(fromPanel.overview.autoMerge,false);
});

test("T06/T07 a genuinely ODD-linked running child is observable without claiming it succeeded",async t=>{
 const f=fixture(t);
 await prepareAttributedChildren(f);
 const linked=f.getChildObservations("child-pi-1");
 f.setChildObservations("child-pi-1",
  linked.todos.map(row=>({...row,current:{...row.current,state:"running"}} as SourceTodoRow)),
  linked.agents.map(agent=>({...agent,state:"running"})),linked.links
 );
 const status=await f.run("status") as {flowOverview:{
  stages:Readonly<Record<string,number>>;
  tasks:readonly {stage:string;modelActual:string;modelConsumedProven:boolean;acceptance:string}[];
  autoMerge:boolean;
 }};
 assert.equal(status.flowOverview.stages["running-observed"],1);
 assert.equal(status.flowOverview.stages["manual-review-required"],1);
 assert.equal(status.flowOverview.tasks.every(task=>task.acceptance==="not-accepted"),true);
 assert.equal(status.flowOverview.tasks.every(task=>task.modelConsumedProven===false),true);
 assert.equal(status.flowOverview.autoMerge,false);
});

async function prepareSupervisorChildren(f:ReturnType<typeof fixture>){
 await prepareAttributedChildren(f);
 for(let i=0;i<2;i++){
  const id="child-pi-"+(i+1),values=f.getChildObservations(id);
  f.setChildObservations(id,values.todos.map(t=>({
   ...t,current:{...t.current,state:"planned"}
  } as SourceTodoRow)),[],[]);
 }
}

test("T06 parent supervisor launches two exact independently consented child Workers via delegated dispatcher",async t=>{
 const f=fixture(t);await prepareSupervisorChildren(f);
 const result=await f.run("supervise") as {status:string;started:readonly {
  sourceTodoId:string;childTodoId:string;agentId:string
 }[];grantsAuthority:boolean;autoRetry:boolean;autoMerge:boolean;acceptance:string};
 assert.equal(result.status,"started");
 assert.equal(result.started.length,2);
 assert.deepEqual(f.dispatchedChildren.map(x=>x.sourceTodoId),["todo-backend","todo-frontend"]);
 assert.equal(result.grantsAuthority,false);assert.equal(result.autoRetry,false);
 assert.equal(result.autoMerge,false);assert.equal(result.acceptance,"not-accepted");
 assert.equal(f.confirmMessages.length,6); // worktree + 2 attach + batch + 2 Worker prompts
 const again=await f.run("supervise") as {status:string;started:readonly unknown[]};
 assert.equal(again.status,"blocked");assert.equal(again.started.length,0);
 assert.equal(f.dispatchedChildren.length,2);
});

test("T06 supervisor refuses after consent declined for second Worker, never retries first",async t=>{
 const f=fixture(t);await prepareSupervisorChildren(f);
 let seen=0;
 f.ctx.ui.confirm=async(_title:string,message:string)=>{
  f.confirmMessages.push(message);
  seen++;
  return seen!==3; // Batch and first worker accepted, second rejected.
 };
 const result=await f.run("supervise") as {status:string;started:readonly unknown[];autoRetry:boolean};
 assert.equal(result.status,"partial-needs-review");
 assert.equal(result.started.length,1);assert.equal(f.dispatchedChildren.length,1);
 assert.equal(result.autoRetry,false);
 const again=await f.run("supervise") as {status:string};
 assert.equal(again.status,"blocked");
 assert.equal(f.dispatchedChildren.length,1);
});

test("T06 supervisor never starts a Worker when child ODD is unclaimed or its root is dirty",async t=>{
 const f=fixture(t);
 const created=await f.run("prepare-todos") as {worktrees:readonly {root:string}[]};
 assert.equal((await f.runChild("attach",created.worktrees[0]!.root) as {status:string}).status,"attached");
 const unclaimed=await f.run("supervise") as {status:string;blockers:readonly string[]};
 assert.equal(unclaimed.status,"blocked");
 assert.ok(unclaimed.blockers.some(x=>/not uniquely attached|not claimed/u.test(x)));
 assert.equal(f.dispatchedChildren.length,0);
});

test("T06 parent supervisor blocks all starts on dirty worktree without invoking any Worker",async t=>{
 const f=fixture(t);await prepareSupervisorChildren(f);
 const prepared=(await f.journal.list(f.identity))[0]!;
 writeFileSync(join(prepared.tasks[1]!.worktreeRoot,"frontend.txt"),"changed\\n");
 const result=await f.run("supervise") as {status:string;blockers:readonly string[]};
 assert.equal(result.status,"blocked");
 assert.ok(result.blockers.some(x=>/dirty, changed or unverifiable/u.test(x)));
 assert.equal(f.dispatchedChildren.length,0);
});

test("T06 parent never authorizes a silently changed paid model after batch confirmation",async t=>{
 const f=fixture(t);await prepareSupervisorChildren(f);
 f.ctx.ui.confirm=async(_title:string,message:string)=>{
  f.confirmMessages.push(message);
  const v=f.getChildObservations("child-pi-2");
  f.setChildObservations("child-pi-2",v.todos.map(row=>({
   ...row,plan:{...row.plan!,model:"paid-provider/changed-model"}
  } as SourceTodoRow)),v.agents,v.links);
  return true;
 };
 const result=await f.run("supervise") as {status:string;started:readonly unknown[]};
 assert.equal(result.status,"blocked");assert.equal(result.started.length,0);
 assert.equal(f.dispatchedChildren.length,0);
});

test("T06 late child model substitution during second Worker consent stops subsequent launches",async t=>{
 const f=fixture(t);await prepareSupervisorChildren(f);
 let confirms=0;
 f.ctx.ui.confirm=async(_title:string,message:string)=>{
  f.confirmMessages.push(message);confirms++;
  if(confirms===3){
   const v=f.getChildObservations("child-pi-2");
   f.setChildObservations("child-pi-2",v.todos.map(row=>({
    ...row,plan:{...row.plan!,model:"unapproved/paid-model"}
   } as SourceTodoRow)),v.agents,v.links);
  }
  return true;
 };
 await assert.rejects(()=>f.run("supervise"),/provenance changed/u);
 assert.equal(f.dispatchedChildren.length,1);
 const retry=await f.run("supervise") as {status:string};
 assert.equal(retry.status,"blocked");
 assert.equal(f.dispatchedChildren.length,1);
});
