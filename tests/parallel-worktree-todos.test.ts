import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {registerParallelWorktreeCommand} from "../src/runtime/lifecycle/parallel-worktree-command.js";
import {ParallelTodoWorktreeJournal,newParallelTodoWorktreeBatchId} from "../src/runtime/agents/parallel-todo-journal.js";
import {bindParallelSourceTodos,type SourceTodoRow} from "../src/runtime/agents/parallel-todo-bindings.js";
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
  journalFile,loadTodos:async()=>rows
 });
 const ctx:any={cwd:source,mode:"tui",hasUI:true,
  sessionManager:{getSessionId:()=>session},ui:{
   notify:(message:string)=>notifications.push(message),
   editor:async()=>editorAnswer,
   confirm:async(_title:string,message:string)=>{confirmMessages.push(message);return approve;}
  }};
 const run=(command:string)=>commands.get("asen-worktrees")!.handler(command,ctx);
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
 return {source,parent,head,identity,scopes,rows,run,journal,ctx,
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
