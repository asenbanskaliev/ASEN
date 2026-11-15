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
import type {TodoContext} from "../src/runtime/lifecycle/todo-store.js";

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
  planClaimsFile=join(privateRoot,"parallel-child-plan-claims.json"),handoffs:string[]=[],
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
 let rows=[row("todo-backend","backend.txt"),row("todo-frontend","frontend.txt")],
  session=identity.sessionId,approve=true,editorAnswer=JSON.stringify({parentDir:parent,units:scopes});
 const commands=new Map<string,{handler:(args:string,ctx:unknown)=>Promise<unknown>}>();
 registerParallelWorktreeCommand((name,command)=>commands.set(name,command as never),{
  journalFile,sessionLinksFile,planClaimsFile,planChildTodo:async input=>{handoffs.push(input);return {status:"model-free-ODD-planner-stub"};},
  loadTodos:async identity=>identity.sessionId==="pi-t06"?rows:[],
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

test("T06 consented child Pi attachment observes agents without granting Worker or merge authority",async t=>{
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
 assert.deepEqual(associated.childSession?.agents,[{id:"child-worker-1",role:"worker",state:"running"}]);
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
 f.setRows(f.rows.map((row,i)=>({
  ...row,plan:{...row.plan!,writerAuthorizationBasis:basis(i?"todo-frontend":"todo-backend",i?"frontend.txt":"backend.txt")}
 } as SourceTodoRow)));
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
  ...row,plan:{...row.plan!,writerAuthorizationBasis:i?row.plan!.writerAuthorizationBasis:basis}
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
