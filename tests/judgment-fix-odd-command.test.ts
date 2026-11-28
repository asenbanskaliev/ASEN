import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {registerOrdinaryReviewCommand} from "../src/review/ordinary-review-command.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";
import type {ScopedOddTodo} from "../src/review/odd-agent-review-flow.js";

type Command=Parameters<Parameters<typeof registerOrdinaryReviewCommand>[0]>[1];
function fixture(t:TestContext){
 const projectId=realpathSync(mkdtempSync(join(tmpdir(),"asen-fix-odd-command-")));
 t.after(()=>rmSync(projectId,{recursive:true,force:true}));
 const sessionId="pi-propietaria",requestId="informe-original",candidateTreeIdentity="b".repeat(40);
 const id=createHash("sha256").update([requestId,sessionId,projectId,candidateTreeIdentity].join("\0")).digest("hex");
 const proposal:StoredJudgmentFixProposal={
  id,requestId,sessionId,repositoryRoot:projectId,
  candidateRevision:candidateTreeIdentity,candidateTreeIdentity,
  paths:["src/reparar.ts"],status:"proposal-only",requiredAction:"new-odd-plan",
  modelRequested:"unknown",modelActual:"unknown",createdAt:"2026-11-16T00:00:00.000Z",
  requiresFreshWriterConsent:true,autoLaunch:false,autoMerge:false,acceptance:"not-accepted"
 };
 let session=sessionId,reads=0,writes=0;
 const notifications:Array<{message:string;level:string}>=[];
 const commands=new Map<string,Command>();
 const context={
  cwd:projectId,hasUI:false,sessionManager:{getSessionId:()=>session},
  ui:{notify:(message:string,level:"info"|"error")=>notifications.push({message,level})}
 };
 function register(reader:()=>Promise<readonly StoredJudgmentFixProposal[]>,readTodos?:()=>Promise<readonly ScopedOddTodo[]>,readArchive?:()=>Promise<readonly ScopedOddTodo[]>){
  return registerOrdinaryReviewCommand((name,command)=>commands.set(name,command),
   undefined,undefined,readTodos?async()=>readTodos():undefined,{
    record:async()=>{writes++;throw new Error("No se deben escribir propuestas al consultar");},
    list:async()=>{reads++;return reader();}
   },readArchive?async()=>readArchive():undefined);
 }
 const run=(args:string)=>commands.get("asen-review")!.handler(args,context);
 return {proposal,context,register,run,notifications,
  readCount:()=>reads,writeCount:()=>writes,
  setSession:(value:string)=>{session=value;}};
}
test("M4 bloquea Judgment Day del Todo enlazado a Fix sin evidencia congelada",async (t:TestContext)=>{
 const projectId=realpathSync(process.cwd()),sessionId="pi-propietaria";
 const taskId="todo-12345678-1234-4123-8123-123456789abc";
 const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:projectId,encoding:"utf8"}).trim();
 const at="2026-11-16T00:00:00.000Z",proposalId="a".repeat(64);
 const current={taskId,sessionId,projectId,revision:3,state:"succeeded" as const,at};
 const plan={role:"worker" as const,skillPaths:[],writeSurfaces:["src/reparar.ts"],
  writerAuthorizationBasis:"{}",candidate:{id:"candidato",repository:projectId,revision,createdAt:at}};
 const todo:ScopedOddTodo={taskId,title:"Reparar",events:[current],current,plan,
  requestId:`asen-plan:fix-${proposalId.slice(0,24)}:worker`};
 let row=todo,routeLookups=0;
 const commands=new Map<string,Command>();
 registerOrdinaryReviewCommand((name,command)=>commands.set(name,command),undefined,
  async()=>{routeLookups++;return undefined;},async()=>[row]);
 const notices:Array<{message:string;level?:string}> = [];
 const context={cwd:projectId,hasUI:true,sessionManager:{getSessionId:()=>sessionId},
  ui:{notify:(message:string,level?:string)=>notices.push({message,...(level?{level}:{})})}};
 const run=(mode:string)=>commands.get("asen-review")!.handler(`todo ${taskId} ${mode}`,context);
 const source={proposalId,treeIdentity:"b".repeat(40)};
 await t.test("la ayuda indica qué exige el rejuicio de un Todo Fix",async()=>{
  const usage=await commands.get("asen-review")!.handler("help",context);
  assert.match(String(usage),/Judgment Day de un Todo vinculado a Fix requiere linaje de reparación verificado y evidencia por cada hallazgo congelado\./u);
  assert.deepEqual(notices,[{message:usage,level:"info"}]);
 });
 for(const [name,fixSource] of [
  ["origen presente, sin hallazgos congelados",source],
  ["árbol malformado",{...source,treeIdentity:"inválido"}],
  ["propuesta ajena al identificador del Todo",{...source,proposalId:"c".repeat(64)}]
 ] as const)await t.test(name,async()=>{
  routeLookups=0;
  notices.length=0;
  row={...todo,plan:{...plan,fixSource}};
  const reason="Fix-linked Todo Judgment Day requires verified repair lineage and explicit evidence for each frozen finding";
  assert.deepEqual(await run("judgment-day"),{status:"blocked",reason});
  assert.deepEqual(notices,[{message:reason,level:"error"}]);
  assert.equal(routeLookups,0,"El rechazo debe ocurrir antes de resolver perfiles o preparar la revisión");
 });
 await t.test("un Todo normal no se clasifica por un prefijo parecido a Fix",async()=>{
  routeLookups=0;
  row=todo;
  assert.equal((await run("judgment-day") as {status:string}).status,"unavailable","Sin registro de modelos se conserva la salida ordinaria");
  assert.equal(routeLookups,4);
 });
 await t.test("la revisión adaptativa del Todo Fix sigue el flujo ordinario",async()=>{
  routeLookups=0;
  row={...todo,plan:{...plan,fixSource:source}};
  assert.equal((await run("adaptive") as {status:string}).status,"unavailable");
  assert.equal(routeLookups,4);
 });
});

test("T04/T08 el comando real enlaza Fix con el borrador ODD sin crear tareas",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.proposal]);
 const result=await f.run("fix-plan "+f.proposal.id) as {
  status:string;sourceProposalId:string;writeSurfaces:string[];
  writerAuthority:boolean;nextCommand:string;candidateStatus:string;
 };
 assert.equal(result.status,"draft-only");
 assert.equal(result.sourceProposalId,f.proposal.id);
 assert.deepEqual(result.writeSurfaces,["src/reparar.ts"]);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.nextCommand,"/asen-plan");
 assert.equal(result.candidateStatus,"not-revalidated");
 assert.equal(f.readCount(),2,"Hay que revalidar el origen después de consultar el diario");
 assert.equal(f.writeCount(),0);
 assert.equal(f.notifications.length,1);
 assert.equal(f.notifications[0]?.level,"info");
});
test("T08 no permite consultar propuestas de otra sesión ni inventar un identificador",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.proposal]);
 assert.deepEqual(await f.run("fix-plan "+"0".repeat(64)),{
  status:"blocked",reason:"The original Fix proposal is not available to this Pi session"
 });
 f.setSession("pi-ajena");
 await assert.rejects(async()=>await f.run("fix-plan "+f.proposal.id),
  /outside the owning Pi session/u);
 assert.equal(f.writeCount(),0);
});
test("T08 bloquea cambios de sesión o propuesta durante su lectura",async t=>{
 const f=fixture(t);
 let calls=0;
 f.register(async()=>{
  calls++;
  if(calls===2)return [{...f.proposal,paths:["src/otra.ts"]}];
  return [f.proposal];
 });
 await assert.rejects(async()=>await f.run("fix-plan "+f.proposal.id),
  /proposal changed during ODD draft/u);
 assert.equal(f.writeCount(),0);
});
test("T08 cancela si cambia la sesión durante la recuperación privada",async t=>{
 const f=fixture(t);
 f.register(async()=>{f.setSession("pi-nueva");return [f.proposal];});
 await assert.rejects(async()=>await f.run("fix-plan "+f.proposal.id),
  /session changed/u);
 assert.equal(f.writeCount(),0);
});
test("T08 las propuestas en disputa no inician correcciones",async t=>{
 const f=fixture(t);
 f.register(async()=>[{...f.proposal,requiredAction:"manual-triage"}]);
 const result=await f.run("fix-plan "+f.proposal.id) as {
  status:string;autoLaunch:boolean;requiresFreshWriterConsent:boolean;
  nextCommand:string|null;requiresHumanTriage:boolean
 };
 assert.equal(result.status,"manual-triage-required");
 assert.equal(result.nextCommand,null);
 assert.equal(result.requiresHumanTriage,true);
 assert.equal(result.autoLaunch,false);
 assert.equal(result.requiresFreshWriterConsent,true);
 assert.equal(f.notifications[0]?.level,"error");
 assert.equal(f.writeCount(),0);
});

test("T08 recuperación de Fix lee el almacén real, sin reintentos ni permisos",async t=>{
 const f=fixture(t),taskId="todo-11111111-2222-4333-8444-555555555555";
 let todoReads=0;
 const todo:ScopedOddTodo={
  taskId,title:"Fix almacenado",
  requestId:"asen-plan:fix-"+f.proposal.id.slice(0,24)+":worker",
  events:[{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"planned",at:"2026-11-16T00:00:00.000Z"}],
  current:{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"planned",at:"2026-11-16T00:00:00.000Z"},
  plan:{role:"worker",skillPaths:[],writeSurfaces:["src/reparar.ts"],
   fixSource:{proposalId:f.proposal.id,treeIdentity:f.proposal.candidateTreeIdentity}}
 };
 f.register(async()=>[f.proposal],async()=>{todoReads++;return [todo];});
 const recovered=await f.run("fix-plan "+f.proposal.id+" status") as {
  status:string;workerTodoId:string;writerAuthority:boolean;autoRetry:boolean
 };
 assert.equal(recovered.status,"worker-observed");
 assert.equal(recovered.workerTodoId,taskId);
 assert.equal(recovered.writerAuthority,false);
 assert.equal(recovered.autoRetry,false);
 assert.equal(todoReads,2);
 assert.equal(f.readCount(),3);
 assert.equal(f.writeCount(),0);
});
test("T08 recuperación tras fallo ambiguo bloquea un diario que cambie entre lecturas",async t=>{
 const f=fixture(t),taskId="todo-22222222-2222-4333-8444-555555555555";
 let calls=0;
 const row:ScopedOddTodo={
  taskId,title:"Worker",
  requestId:"asen-plan:fix-"+f.proposal.id.slice(0,24)+":worker",
  events:[{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"planned",at:"2026-11-16T00:00:00.000Z"}],
  current:{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"planned",at:"2026-11-16T00:00:00.000Z"},
  plan:{role:"worker",skillPaths:[],writeSurfaces:["src/reparar.ts"],
   fixSource:{proposalId:f.proposal.id,treeIdentity:f.proposal.candidateTreeIdentity}}
 };
 f.register(async()=>[f.proposal],async()=>{
  calls++;return [{...row,current:{...row.current,revision:calls}}];
 });
 await assert.rejects(async()=>f.run("fix-plan "+f.proposal.id+" status"),
  /journal changed during recovery/u);
 assert.equal(f.writeCount(),0);
});
test("T08 recuperación sin lector ODD no inventa tareas",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.proposal]);
 const result=await f.run("fix-plan "+f.proposal.id+" status") as {status:string};
 assert.equal(result.status,"unavailable");
 assert.equal(f.writeCount(),0);
});

test("T08 comando recupera un Worker archivado sin reautorizar ni reiniciar",async t=>{
 const f=fixture(t),taskId="todo-33333333-2222-4333-8444-555555555555";
 let archiveReads=0;
 const archived:ScopedOddTodo={
  taskId,title:"Fix archivado",
  requestId:"asen-plan:fix-"+f.proposal.id.slice(0,24)+":worker",
  events:[{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"done",at:"2026-11-16T00:00:00.000Z"}],
  current:{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"done",at:"2026-11-16T00:00:00.000Z"},
  plan:{role:"worker",skillPaths:[],writeSurfaces:["src/reparar.ts"],
   fixSource:{proposalId:f.proposal.id,treeIdentity:f.proposal.candidateTreeIdentity}}
 };
 f.register(async()=>[f.proposal],async()=>[],async()=>{archiveReads++;return [archived];});
 const result=await f.run("fix-plan "+f.proposal.id+" status") as {
  status:string;observedIn:string;workerTodoId:string;autoRetry:boolean;authorized:boolean
 };
 assert.equal(result.status,"archived-worker-observed");
 assert.equal(result.observedIn,"archive");
 assert.equal(result.workerTodoId,taskId);
 assert.equal(result.autoRetry,false);
 assert.equal(result.authorized,false);
 assert.equal(archiveReads,2);
 assert.equal(f.writeCount(),0);
});
test("T08 impide recuperar de un archivo que cambia entre lecturas",async t=>{
 const f=fixture(t),taskId="todo-44444444-2222-4333-8444-555555555555";
 let archiveReads=0;
 const row:ScopedOddTodo={
  taskId,title:"Fix archivado",
  requestId:"asen-plan:fix-"+f.proposal.id.slice(0,24)+":worker",
  events:[{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"done",at:"2026-11-16T00:00:00.000Z"}],
  current:{taskId,sessionId:f.context.sessionManager.getSessionId(),
   projectId:f.context.cwd,revision:1,state:"done",at:"2026-11-16T00:00:00.000Z"},
  plan:{role:"worker",skillPaths:[],writeSurfaces:["src/reparar.ts"],
   fixSource:{proposalId:f.proposal.id,treeIdentity:f.proposal.candidateTreeIdentity}}
 };
 f.register(async()=>[f.proposal],async()=>[],async()=>{
  archiveReads++;return [{...row,current:{...row.current,revision:archiveReads}}];
 });
 await assert.rejects(async()=>f.run("fix-plan "+f.proposal.id+" status"),
  /journal changed during recovery/u);
 assert.equal(f.writeCount(),0);
});
