import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {PiChildOpeningJournal,openVerifiedPiChildSessions} from "../src/runtime/agents/parallel-parent-child-launch.js";
import {ParallelTodoWorktreeJournal,newParallelTodoWorktreeBatchId} from "../src/runtime/agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../src/runtime/agents/parallel-todo-session-links.js";
import {prepareParallelWorkerWorktrees} from "../src/runtime/agents/parallel-worktrees.js";

const sha="a".repeat(40);
const intent=(root:string)=>({
 sourceSessionId:"sesion-padre",sourceProjectId:root,batchId:"lote-a",
 expectedHead:sha,roots:[join(root,"hijo-a"),join(root,"hijo-b")],state:"claimed-not-verified" as const
});
function fixture(t:TestContext){
 const root=resolve(realpathSync(mkdtempSync(join(tmpdir(),"asen-pi-hijos-"))));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,file:join(root,"intentos.json"),journal:new PiChildOpeningJournal(join(root,"intentos.json"))};
}
test("E2A: sin capacidad nativa de Pi no se crean sesiones ni se consumen intentos",async t=>{
 const f=fixture(t);
 const outcome=await openVerifiedPiChildSessions({
  source:{sessionId:"sesion-padre",projectId:f.root},batchId:"lote-a",
  allocations:[],sessions:{} as never,attempts:f.journal,
 });
 assert.equal(outcome.status,"blocked");assert.equal(outcome.grantsAuthority,false);
 assert.equal(outcome.writerStarted,false);assert.equal(outcome.autoRetry,false);
 assert.deepEqual(await f.journal.inspect(),[]);
});
test("E2A: diario durable de apertura no admite segundo intento ni otra carpeta solapada",async t=>{
 const f=fixture(t);
 await f.journal.claim(intent(f.root));
 const original=readFileSync(f.file,"utf8");
 await assert.rejects(()=>f.journal.claim(intent(f.root)),/duplicado/iu);
 assert.equal(readFileSync(f.file,"utf8"),original);
 assert.equal((await f.journal.inspect()).length,1);
 const second={...intent(f.root),batchId:"lote-b",roots:[join(f.root,"hijo-c"),join(f.root,"hijo-a")]};
 await assert.rejects(()=>f.journal.claim(second),/duplicado/iu);
 assert.equal((await f.journal.inspect()).length,1);
});
test("E2A: dos aperturas concurrentes jamás reclaman el mismo lote",async t=>{
 const f=fixture(t),i=intent(f.root);
 const attempts=await Promise.allSettled([f.journal.claim(i),f.journal.claim(i)]);
 assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(attempts.filter(x=>x.status==="rejected").length,1);
 assert.equal((await f.journal.inspect()).length,1);
});
test("E2A: si el diario está alterado se bloquea sin limpiarlo",async t=>{
 const f=fixture(t);await f.journal.claim(intent(f.root));
 const broken='{"schema":"falsa","records":[]}\n';
 writeFileSync(f.file,broken);
 await assert.rejects(()=>f.journal.inspect(),/inválido/iu);
 await assert.rejects(()=>f.journal.claim({...intent(f.root),batchId:"lote-nuevo",roots:[join(f.root,"x"),join(f.root,"y")]}),/inválido/iu);
 assert.equal(readFileSync(f.file,"utf8"),broken);
});
test("E2A: un adaptador de host inventado no puede abrir árboles falsos",async t=>{
 const f=fixture(t);let calls=0;
 await assert.rejects(()=>openVerifiedPiChildSessions({
  source:{sessionId:"sesion-padre",projectId:f.root},batchId:"lote-a",
  allocations:[{taskId:"a",root:join(f.root,"hijo-a"),sourceRoot:f.root,baseRevision:sha,
   writeSurfaces:["a.ts"],grantsAuthority:false,autoMerge:false},
   {taskId:"b",root:join(f.root,"hijo-b"),sourceRoot:f.root,baseRevision:sha,
   writeSurfaces:["b.ts"],grantsAuthority:false,autoMerge:false}],
  sessions:{} as never,attempts:f.journal,host:{
   openChildSession:async()=>{calls++;return {sessionId:"ficticia",projectId:f.root};},
   inspectChildSession:async()=>true,confirmAttachment:async()=>true,
   validateParent:async()=>{}
  }
 }),/Forged or stale worktree allocation/iu);
 assert.equal(calls,0);assert.deepEqual(await f.journal.inspect(),[]);
});

/** Usa dos worktrees Git reales. Solo el adaptador Pi es simulado: jamás acredita proveedor ni Writer. */
async function genuineFixture(t:TestContext,count:2|3=2){
 const source=fixture(t),parent=fixture(t),privateRoot=fixture(t);
 const localGitNames=new Set(execFileSync("git",["rev-parse","--local-env-vars"],
  {encoding:"utf8"}).trim().split(/\r?\n/u).filter(Boolean).map(name=>name.toUpperCase()));
 const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!localGitNames.has(name.toUpperCase())));
 const git=(...args:string[])=>execFileSync("git",["-C",source.root,...args],
  {encoding:"utf8",env,stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","Prueba ASEN");
 git("config","user.email","prueba@example.invalid");
 writeFileSync(join(source.root,"a.txt"),"a\\n");writeFileSync(join(source.root,"b.txt"),"b\\n");
 if(count===3)writeFileSync(join(source.root,"c.txt"),"c\\n");
 git("add","a.txt","b.txt",...(count===3?["c.txt"]:[]));git("commit","-qm","inicio");
 const head=git("rev-parse","HEAD"),batchId=newParallelTodoWorktreeBatchId();
 const identity={sessionId:"pi-padre-e2a",projectId:source.root};
 const units=[{taskId:"todo-a",writeSurfaces:["a.txt"]},
  {taskId:"todo-b",writeSurfaces:["b.txt"]},
  ...(count===3?[{taskId:"todo-c",writeSurfaces:["c.txt"]}]:[])];
 const journal=new ParallelTodoWorktreeJournal(join(privateRoot.root,"worktrees.json"));
 await journal.reserve({identity,id:batchId,head,parentDir:parent.root,bindings:units.map(x=>({
  taskId:x.taskId,requestId:"asen-plan:"+x.taskId+":worker",taskRevision:1,
  baseRevision:head,writeSurfaces:x.writeSurfaces,authority:"none" as const,
  needsNewWorktreePlan:true as const
 }))});
 const prepared=await prepareParallelWorkerWorktrees({sourceRoot:source.root,
  parentDir:parent.root,expectedHead:head,batchId,units,confirm:async()=>true});
 assert.equal(prepared.status,"prepared");
 if(prepared.status!=="prepared")throw Error("Worktrees no preparados");
 t.after(()=>{
  for(const entry of prepared.allocations){
   try{git("worktree","remove","--force",entry.root);}catch{/* conservar error previo */}
  }
 });
 await journal.markPrepared({identity,id:batchId,allocations:prepared.allocations});
 const sessions=new ParallelChildSessionJournal(join(privateRoot.root,"sessions.json"),journal);
 const attempts=new PiChildOpeningJournal(join(privateRoot.root,"opening.json"));
 return {source:identity,batchId,allocations:prepared.allocations,sessions,attempts,head};
}
test("E2A: dos sesiones hijas verificadas se enlazan sin abrir Writers ni permisos",async t=>{
 const f=await genuineFixture(t),started:string[]=[],confirmed:string[]=[];
 const host={validateParent:async()=>{},
  openChildSession:async(value:{sourceTodoId:string;projectId:string;expectedHead:string;readOnly:true})=>{
   assert.equal(value.readOnly,true);assert.equal(value.expectedHead,f.head);
   started.push(value.sourceTodoId);
   return {sessionId:"pi-"+value.sourceTodoId,projectId:value.projectId};
  },inspectChildSession:async()=>true,
  confirmAttachment:async(o:{sourceTodoId:string})=>{confirmed.push(o.sourceTodoId);return true;}
 };
 const result=await openVerifiedPiChildSessions({...f,host});
 assert.equal(result.status,"attached-needs-worker-permission");
 assert.deepEqual(started,["todo-a","todo-b"]);assert.deepEqual(confirmed,started);
 assert.equal(result.attached.length,2);assert.equal(result.grantsAuthority,false);
 assert.equal(result.writerStarted,false);assert.equal(result.autoRetry,false);
 assert.equal(result.autoMerge,false);
 const links=await f.sessions.listSource(f.source);
 assert.equal(links.length,2);
 assert.ok(links.every(x=>x.authority==="none"&&x.autoDispatch===false&&x.autoMerge===false));
 await assert.rejects(()=>openVerifiedPiChildSessions({...f,host}),/duplicado/iu);
 assert.equal(started.length,2,"El segundo intento no vuelve a abrir sesiones");
});
test("E2A: si el anfitrión no acredita una sesión, no abre la segunda y conserva el intento",async t=>{
 const f=await genuineFixture(t);let created=0;
 const result=await openVerifiedPiChildSessions({...f,host:{validateParent:async()=>{},
  openChildSession:async o=>{created++;return {sessionId:"no-verificada",projectId:o.projectId};},
  inspectChildSession:async()=>false,
  confirmAttachment:async()=>true
 }});
 assert.equal(result.status,"partial-needs-review");
 assert.equal(created,1);assert.equal(result.attached.length,0);
 assert.equal((await f.attempts.inspect()).length,1);
 assert.deepEqual(await f.sessions.listSource(f.source),[]);
});

test("E2A: diario alterado con SHA no textual se rechaza sin convertir datos",async t=>{
 const f=fixture(t);await f.journal.claim(intent(f.root));
 const value=JSON.parse(readFileSync(f.file,"utf8"));
 value.records[0].expectedHead=[sha];
 writeFileSync(f.file,JSON.stringify(value));
 await assert.rejects(()=>f.journal.inspect(),/Intento Pi alterado/u);
 await assert.rejects(()=>f.journal.claim({...intent(f.root),batchId:"otro-lote",
  roots:[join(f.root,"x"),join(f.root,"y")]}),/Intento Pi alterado/u);
});
test("E2A: pérdida de una sesión durante el enlace bloquea el lote sin repetirlo",async t=>{
 const f=await genuineFixture(t);let checks=0,created=0;
 const host={validateParent:async()=>{},openChildSession:async(request:{projectId:string})=>{
  created++;return {sessionId:"pi-real-ficticia",projectId:request.projectId};
 },inspectChildSession:async()=>++checks===1,confirmAttachment:async()=>true};
 const result=await openVerifiedPiChildSessions({...f,host});
 assert.equal(result.status,"partial-needs-review");
 assert.equal(created,1);assert.equal(result.writerStarted,false);
 assert.equal((await f.attempts.inspect()).length,1);
 assert.deepEqual(await f.sessions.listSource(f.source),[]);
 await assert.rejects(()=>openVerifiedPiChildSessions({...f,host}),/duplicado/iu);
});
test("E2A: callbacks de Pi conservan la identidad y los datos del anfitrión",async t=>{
 const f=await genuineFixture(t);
 const host={
  ownerToken:"pi-host-autenticado",seen:0,
  async validateParent(){assert.equal(this.ownerToken,"pi-host-autenticado");},
  async openChildSession(request:{sourceTodoId:string;projectId:string}){
   assert.equal(this.ownerToken,"pi-host-autenticado");
   return {sessionId:"pi-"+request.sourceTodoId,projectId:request.projectId};
  },
  async inspectChildSession(){
   assert.equal(this.ownerToken,"pi-host-autenticado");this.seen++;return true;
  },
  async confirmAttachment(){
   assert.equal(this.ownerToken,"pi-host-autenticado");return true;
  }
 };
 const outcome=await openVerifiedPiChildSessions({...f,host});
 assert.equal(outcome.status,"attached-needs-worker-permission");
 assert.equal(outcome.attached.length,2);
 assert.ok(host.seen>=8);
});

test("E2A: un lote incompleto no consume autorización ni abre ninguna sesión",async t=>{
 const f=await genuineFixture(t,3);let attempts=0;
 const host={validateParent:async()=>{},
  openChildSession:async (o:{projectId:string})=>{attempts++;return {sessionId:"sin-permiso",projectId:o.projectId};},
  inspectChildSession:async()=>true,confirmAttachment:async()=>true};
 await assert.rejects(()=>openVerifiedPiChildSessions({...f,
  allocations:f.allocations.slice(0,2),host}),/Lote Pi incompleto/u);
 assert.equal(attempts,0);
 assert.deepEqual(await f.attempts.inspect(),[]);
 assert.deepEqual(await f.sessions.listSource(f.source),[]);
});
