import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {registerParallelWorktreeCommand} from "../src/runtime/lifecycle/parallel-worktree-command.js";

function fixture(t:TestContext){
 const root=resolve(mkdtempSync(join(tmpdir(),"asen-t06-cmd-root-"))),
  parent=resolve(mkdtempSync(join(tmpdir(),"asen-t06-cmd-worktrees-")));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","ASEN T06");git("config","user.email","asen-t06@example.invalid");
 writeFileSync(join(root,"a.txt"),"a\n");writeFileSync(join(root,"b.txt"),"b\n");
 git("add","a.txt","b.txt");git("commit","-qm","base");
 let session="session-1",confirmAnswer=true,edited:string|undefined=JSON.stringify({
  parentDir:parent,units:[{taskId:"a",writeSurfaces:["a.txt"]},{taskId:"b",writeSurfaces:["b.txt"]}]
 });
 const notices:{message:string;kind:string}[]=[];
 const calls:{title:string;message:string}[]=[];
 const cmds=new Map<string,{handler:(args?:string,ctx?:unknown)=>Promise<unknown>}>();
 registerParallelWorktreeCommand((name,command)=>cmds.set(name,command as never));
 const ctx:any={cwd:root,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>session},
  ui:{
   notify:(message:string,kind:string)=>notices.push({message,kind}),
   editor:async()=>edited,
   confirm:async(title:string,message:string)=>{calls.push({title,message});return confirmAnswer;}
  }};
 t.after(()=>{
  for(const entry of cmds.keys())assert.equal(entry,"asen-worktrees");
  if(existsSync(root))try{
   const paths=git("worktree","list","--porcelain").split(/\r?\n/u).filter(line=>line.startsWith("worktree ")).map(line=>line.slice(9));
   for(const p of paths.filter(p=>p!==root))try{git("worktree","remove","--force",p);}catch{}
  }catch{}
  rmSync(root,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});
 });
 const run=(args?:string)=>cmds.get("asen-worktrees")!.handler(args,ctx);
 return {root,parent,git,run,ctx,calls,notices,setSession:(v:string)=>{session=v;},setConfirm:(v:boolean)=>{confirmAnswer=v;},setEdited:(v:string|undefined)=>{edited=v;}};
}

test("T06 worktree command exposes usage without changing Git",async t=>{
 const f=fixture(t);const before=f.git("worktree","list","--porcelain");
 const result=await f.run("");
 assert.match(String(result),/Uso: \/asen-worktrees prepare/u);
 assert.equal(f.calls.length,0);assert.equal(f.git("worktree","list","--porcelain"),before);
});

test("T06 worktree command refuses headless or unowned sessions",async t=>{
 const f=fixture(t);
 f.ctx.hasUI=false;
 const result=await f.run("prepare") as {status:string};
 assert.equal(result.status,"unavailable");
 assert.equal(f.calls.length,0);
});

test("T06 worktree command cancel and decline never stage Git worktrees",async t=>{
 const f=fixture(t);const baseline=f.git("worktree","list","--porcelain");
 f.setEdited(undefined);
 assert.deepEqual(await f.run("prepare"),{status:"cancelled",grantsAuthority:false});
 f.setEdited(JSON.stringify({parentDir:f.parent,units:[{taskId:"a",writeSurfaces:["a.txt"]},{taskId:"b",writeSurfaces:["b.txt"]}]}));
 f.setConfirm(false);
 assert.deepEqual(await f.run("prepare"),{status:"declined",grantsAuthority:false});
 assert.equal(f.git("worktree","list","--porcelain"),baseline);
 assert.equal(f.calls.length,1);
});

test("T06 consent creates exactly two worktrees and reports no execution or integration authority",async t=>{
 const f=fixture(t),result=await f.run("prepare") as {
  status:string;worktrees:{taskId:string;root:string;head:string}[];grantsAuthority:boolean;autoMerge:boolean;next:string;
 };
 assert.equal(result.status,"prepared");
 assert.equal(result.worktrees.length,2);assert.notEqual(result.worktrees[0]!.root,result.worktrees[1]!.root);
 assert.equal(result.grantsAuthority,false);assert.equal(result.autoMerge,false);
 assert.match(result.next,/consentimiento Worker individual/u);
 for(const worktree of result.worktrees){
  assert.equal(f.git("rev-parse","HEAD"),worktree.head);
  assert.equal(existsSync(worktree.root),true);
 }
 assert.equal(f.calls.length,1);
 assert.match(f.calls[0]!.message,/NO se lanzará ningún Worker/u);
});

test("T06 stale session and malformed request fail closed before consent",async t=>{
 const f=fixture(t);
 const initial=f.git("worktree","list","--porcelain");
 f.ctx.ui.editor=async()=>{f.setSession("different");return "{}";};
 await assert.rejects(()=>f.run("prepare"),/session or project changed/u);
 f.setSession("session-1");f.ctx.ui.editor=async()=>'{ "parentDir": ".", "units": [], "injected": true }';
 await assert.rejects(()=>f.run("prepare"),/exactly parentDir and units/u);
 assert.equal(f.calls.length,0);
 assert.equal(f.git("worktree","list","--porcelain"),initial);
});


test("Megatanda B: preparación automática evita dependencias y reservas de otra sesión antes del diálogo",async t=>{
 const f=fixture(t),root=realpathSync(f.root),head=f.git("rev-parse","HEAD");
 const {ParallelTodoWorktreeJournal,newParallelTodoWorktreeBatchId}=await import("../src/runtime/agents/parallel-todo-journal.js");
 const {bindParallelSourceTodos}=await import("../src/runtime/agents/parallel-todo-bindings.js");
 type SourceTodoRow=import("../src/runtime/agents/parallel-todo-bindings.js").SourceTodoRow;
 const journalFile=join(f.parent,"reservations.json");
 const journal=new ParallelTodoWorktreeJournal(journalFile);
 const worker=(taskId:string,scope:string,sessionId="session-1",dependsOn:string[]=[]):SourceTodoRow=>{
  const current={taskId,sessionId,projectId:root,revision:1,state:"planned",at:"2026-11-24T00:00:00.000Z"};
  return {taskId,title:taskId,requestId:"asen-plan:"+taskId+":worker",description:"Ensayo",
   current,events:[current],dependsOn,plan:{role:"worker",skillPaths:[],
    skillSelection:{phase:"apply"},candidate:{id:taskId,repository:root,revision:head,createdAt:current.at},
    writeSurfaces:[scope],writerAuthorizationBasis:'{"instruction":"Ensayo"}'}} as unknown as SourceTodoRow;
 };
 const reserved=[worker("old-a","SRC/API","session-other"),worker("old-b","old.txt","session-other")];
 const owner={sessionId:"session-other",projectId:root};
 await journal.reserve({identity:owner,id:newParallelTodoWorktreeBatchId(),head,parentDir:f.parent,
  bindings:bindParallelSourceTodos({identity:owner,expectedHead:head,rows:reserved,
   units:reserved.map(row=>({taskId:row.taskId,writeSurfaces:row.plan!.writeSurfaces!}))})});
 const a=worker("todo-a","src/api/file.ts"),b=worker("todo-b","b.txt"),c=worker("todo-c","c.txt");
 const d=worker("todo-d","d.txt","session-1",["todo-b","todo-c"]);
 let rows=[a,d,b,c];
 const initial=f.git("worktree","list","--porcelain");
 let run!:(args:string,ctx:any)=>Promise<unknown>;
 registerParallelWorktreeCommand((_name,command)=>{run=command.handler;},{journalFile,loadTodos:async()=>rows});
 f.setConfirm(false);
 assert.deepEqual(await run("prepare-auto",f.ctx),{status:"declined",grantsAuthority:false});
 assert.equal(f.calls.length,1);
 assert.match(f.calls[0]!.message,/todo-b: b.txt/u);
 assert.match(f.calls[0]!.message,/todo-c: c.txt/u);
 assert.doesNotMatch(f.calls[0]!.message,/todo-a:|todo-d:|old-a|session-other/u);
 rows=[a,d,b];
 const blocked=await run("prepare-auto",f.ctx) as {status:string};
 assert.equal(blocked.status,"blocked");
 assert.equal(f.calls.length,1,"No se pide permiso para una pareja imposible");
 assert.equal(f.git("worktree","list","--porcelain"),initial);
 assert.equal((await journal.list(owner)).length,1);
});
