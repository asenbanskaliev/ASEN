import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {registerOrdinaryReviewCommand} from "../src/review/ordinary-review-command.js";
import {captureWorkspaceReviewProjection} from "../src/review/workspace-review-projection.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";

type Command=Parameters<Parameters<typeof registerOrdinaryReviewCommand>[0]>[1];
function setup(t:TestContext){
 const root=realpathSync(mkdtempSync(join(tmpdir(),"asen-fix-save-")));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"]
 }).trim();
 git("init","-q");git("config","user.name","ASEN test");
 git("config","user.email","asen@example.invalid");
 mkdirSync(join(root,"src"));
 writeFileSync(join(root,"src","reparar.ts"),"original\n");
 git("add","src/reparar.ts");git("commit","-qm","base");
 writeFileSync(join(root,"src","reparar.ts"),"revisado\n");
 const tree=captureWorkspaceReviewProjection({
  repositoryRoot:root,intendedUntracked:[]
 },["src/reparar.ts"]).candidateTree;
 const sessionId="pi-duena",requestId="informe-original";
 const id=createHash("sha256").update([requestId,sessionId,root,tree].join("\0")).digest("hex");
 const proposal:StoredJudgmentFixProposal={
  id,requestId,sessionId,repositoryRoot:root,
  candidateRevision:tree,candidateTreeIdentity:tree,paths:["src/reparar.ts"],
  status:"proposal-only",requiredAction:"new-odd-plan",
  modelRequested:"unknown",modelActual:"unknown",
  createdAt:"2026-11-16T00:00:00.000Z",
  requiresFreshWriterConsent:true,autoLaunch:false,autoMerge:false,
  acceptance:"not-accepted"
 };
 const human=JSON.stringify({
  instruction:"Corregir el defecto comprobado y añadir pruebas sin modificar otros archivos.",
  taskIdentity:"fix-"+id.slice(0,24),intent:"defect",
  scope:{kind:"known",expectedPaths:["src/reparar.ts"]},
  writes:[{path:"src/reparar.ts",changeKind:"behavior"}],
  riskOperations:[],session:{estimatedMinutes:20,continuation:false},
  testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:10},
  unresolvedDecisions:[]
 });
 let session=sessionId,plans=0,confirms=0,reads=0,consent=true,changed=false;
 const commands=new Map<string,Command>();
 const captured:Array<{raw:string;source:{proposalId:string;treeIdentity:string}}>=[];
 const context={
  cwd:root,hasUI:true,sessionManager:{getSessionId:()=>session},
  ui:{
   notify:(_message:string,_level:"info"|"error")=>{},
   editor:async()=>{if(changed)writeFileSync(join(root,"src","reparar.ts"),"fuera del informe\n");return human;},
   confirm:async()=>{confirms++;return consent;}
  }
 };
 const registration=(inDispute=false)=>registerOrdinaryReviewCommand(
  (name,cmd)=>commands.set(name,cmd),undefined,undefined,undefined,{
   record:async()=>{throw new Error("No se debe registrar una segunda propuesta");},
   list:async()=>{reads++;return [{
    ...proposal,...(inDispute?{requiredAction:"manual-triage" as const}:{})
   }];},
   plan:async(_ctx,raw,source)=>{
    plans++;captured.push({raw,source});
    return JSON.stringify({
     persistence:{status:"saved"},execution:{started:false,authorized:false},
     executablePlan:{route:"orchestrate"},persistedTasks:[{todoId:"todo-fix-test"}]
    });
   }
  });
 const run=(args:string)=>commands.get("asen-review")!.handler(args,context);
 return {root,git,proposal,human,context,registration,run,captured,
  setConsent:(value:boolean)=>{consent=value;},
  setChanged:(value:boolean)=>{changed=value;},
  setSession:(value:string)=>{session=value;},
  plans:()=>plans,confirms:()=>confirms,reads:()=>reads};
}
test("T04/T08 guarda un plan ODD nuevo en el flujo Pi sin ejecutar Writer",async t=>{
 const f=setup(t);f.registration();
 const result=await f.run("fix-plan "+f.proposal.id+" save") as {
  status:string;plannedTaskCount:number;authorized:boolean;
  writerAuthority:boolean;autoLaunch:boolean;autoMerge:boolean
 };
 assert.equal(result.status,"plan-saved-no-dispatch");
 assert.equal(result.plannedTaskCount,1);
 assert.equal(result.authorized,false);
 assert.equal(result.writerAuthority,false);
 assert.equal(result.autoLaunch,false);
 assert.equal(result.autoMerge,false);
 assert.equal(f.plans(),1);
 assert.equal(f.confirms(),1);
 assert.equal(f.captured[0]?.raw,f.human);
 assert.deepEqual(f.captured[0]?.source,{
  proposalId:f.proposal.id,treeIdentity:f.proposal.candidateTreeIdentity
 });
 assert.match(f.git("status","--porcelain"),/src\/reparar\.ts/u);
});
test("T08 rechazo del usuario no guarda tareas ni crea permisos",async t=>{
 const f=setup(t);f.registration();f.setConsent(false);
 const result=await f.run("fix-plan "+f.proposal.id+" save") as {status:string};
 assert.equal(result.status,"cancelled");
 assert.equal(f.plans(),0);
 assert.equal(f.confirms(),1);
});
test("T08 cambio de archivos durante el editor cancela el guardado",async t=>{
 const f=setup(t);f.registration();f.setChanged(true);
 await assert.rejects(async()=>f.run("fix-plan "+f.proposal.id+" save"),
  /candidate changed after the original/u);
 assert.equal(f.plans(),0);
 assert.equal(f.confirms(),0);
});
test("T08 disputa entre jueces no permite guardar plan",async t=>{
 const f=setup(t);f.registration(true);
 const result=await f.run("fix-plan "+f.proposal.id+" save") as {status:string};
 assert.equal(result.status,"blocked");
 assert.equal(f.plans(),0);
 assert.equal(f.confirms(),0);
});
test("T08 cambio de sesión impide persistencia tras consentimiento",async t=>{
 const f=setup(t);f.registration();
 f.context.ui.confirm=async()=>{f.setSession("pi-ajena");return true;};
 await assert.rejects(async()=>f.run("fix-plan "+f.proposal.id+" save"),
  /session changed/u);
 assert.equal(f.plans(),0);
});
