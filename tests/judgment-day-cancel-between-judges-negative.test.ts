import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {runJudgmentDay} from "../src/review/judgment-day.js";
import type {PiReviewRegistry,PiReviewerModel} from "../src/review/pi-model-reviewer.js";

test("E3: cancelar durante el primer juez impide llamar al segundo y emitir aceptación",async t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-jueces-cancelacion-"));
 const view=mkdtempSync(join(tmpdir(),"asen-jueces-vista-"));
 let workspace:ReturnType<typeof openWorkspaceReview>|undefined;
 t.after(()=>{
  try{if(workspace)closeWorkspaceReview(workspace);}
  finally{rmSync(root,{recursive:true,force:true});rmSync(view,{recursive:true,force:true});}
 });
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{stdio:["ignore","pipe","pipe"],encoding:"utf8"});
 git("init","-q");git("config","user.name","Prueba ASEN");git("config","user.email","prueba@invalid.example");
 writeFileSync(join(root,"codigo.ts"),"antes\n");git("add","codigo.ts");git("commit","-qm","Base de prueba");
 writeFileSync(join(root,"codigo.ts"),"despues\n");
 workspace=openWorkspaceReview({repositoryRoot:resolve(root),intendedUntracked:[],sessionId:"cancelacion-e3",reviewerId:"simulado/juez-a",viewParent:resolve(view),risk:{riskId:"E3",reason:"Cancelación entre revisores",severity:"high",lenses:["risk","reliability"]}});
 const evidence=readWorkspaceReviewEvidence(workspace);
 const author:PiReviewerModel={provider:"autor",id:"escritor"};
 const judgeA:PiReviewerModel={provider:"simulado",id:"juez-a"};
 const judgeB:PiReviewerModel={provider:"simulado",id:"juez-b"};
 const controller=new AbortController();
 const calls:string[]=[];
 const registry:PiReviewRegistry={
  getAvailable:()=>[author,judgeA,judgeB],
  hasConfiguredAuth:model=>model.provider==="simulado",
  streamSimple:(model)=>{
   calls.push(model.id);
   return (async function*(){
    if(model.id==="juez-a")controller.abort();
    yield {type:"done" as const,reason:"stop" as const,message:{role:"assistant" as const,provider:model.provider,content:[{type:"text" as const,text:JSON.stringify({verdict:"pass",summary:"Dictamen simulado",findings:[]})}]}};
   })();
  }
 };
 await assert.rejects(()=>runJudgmentDay({registry,author,judgeA,judgeB,evidence,requirements:"No continuar tras cancelar",signal:controller.signal}),/cancelled/u);
 assert.deepEqual(calls,["juez-a"],"el segundo juez no debe ejecutarse tras cancelar el primero");
 assert.equal(controller.signal.aborted,true);
});
