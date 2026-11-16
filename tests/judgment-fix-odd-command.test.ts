import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {registerOrdinaryReviewCommand} from "../src/review/ordinary-review-command.js";
import type {StoredJudgmentFixProposal} from "../src/review/judgment-fix-proposal-journal.js";

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
 function register(reader:()=>Promise<readonly StoredJudgmentFixProposal[]>){
  return registerOrdinaryReviewCommand((name,command)=>commands.set(name,command),
   undefined,undefined,undefined,{
    record:async()=>{writes++;throw new Error("No se deben escribir propuestas al consultar");},
    list:async()=>{reads++;return reader();}
   });
 }
 const run=(args:string)=>commands.get("asen-review")!.handler(args,context);
 return {proposal,context,register,run,notifications,
  readCount:()=>reads,writeCount:()=>writes,
  setSession:(value:string)=>{session=value;}};
}
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
  status:string;autoLaunch:boolean;requiresFreshWriterConsent:boolean
 };
 assert.equal(result.status,"manual-triage-required");
 assert.equal(result.autoLaunch,false);
 assert.equal(result.requiresFreshWriterConsent,true);
 assert.equal(f.notifications[0]?.level,"error");
 assert.equal(f.writeCount(),0);
});
