import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {registerOrdinaryReviewCommand} from "../src/review/ordinary-review-command.js";
import type {ScopedOddTodo} from "../src/review/odd-agent-review-flow.js";

function fixture(t:TestContext){
 const root=realpathSync(mkdtempSync(join(tmpdir(),"asen-odd-review-cmd-")));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");
 git("config","user.name","ASEN prueba");
 git("config","user.email","asen-review@example.invalid");
 writeFileSync(join(root,"archivo.txt"),"original\n");
 git("add","archivo.txt");
 git("commit","-qm","base de revisión");
 const sha=git("rev-parse","HEAD"),sessionId="pi-odd-review";
 const taskId="todo-11111111-2222-4333-8444-555555555555";
 const task:ScopedOddTodo={
  taskId,title:"Worker real",requestId:"asen-plan:tarea-1:worker",
  events:[{taskId,sessionId,projectId:root,revision:1,state:"planned",at:"2026-11-15T00:00:00Z"}],
  current:{taskId,sessionId,projectId:root,revision:2,state:"succeeded",at:"2026-11-15T01:00:00Z"},
  plan:{role:"worker",skillPaths:[],candidate:{
   id:"tarea-1",repository:root,revision:sha,createdAt:"2026-11-15T00:00:00Z"
  },writeSurfaces:["archivo.txt"],writerAuthorizationBasis:"{\"scope\":\"known\"}"}
 };
 let session=sessionId,reads=0;
 const notifications:unknown[]=[];
 const ui={notify:(message:string,level:string)=>notifications.push({message,level})};
 const context={
  cwd:root,hasUI:true,sessionManager:{getSessionId:()=>session},ui
 };
 const commands=new Map<string,{handler:(args:string|undefined,ctx:unknown)=>Promise<unknown>|unknown}>();
 const register=(reader:()=>Promise<readonly ScopedOddTodo[]>)=>
  registerOrdinaryReviewCommand((name,command)=>commands.set(name,command as never),
   {observe:async()=>({status:"unavailable"})} as never,async()=>undefined,async()=>{
    reads++;return reader();
   });
 const run=(args:string,provided:unknown=context)=>commands.get("asen-review")!.handler(args,provided);
 return {root,sha,task,taskId,register,run,context,notifications,
  setSession:(value:string)=>{session=value;},reads:()=>reads,git};
}
test("T04 revisión de ODD desde el comando real sin permisos ni modelo lanzado",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.task]);
 const result=await f.run("todo "+f.taskId) as {
  status:string;writeSurfaces:string[];reviewerModelActual:string;writerAuthority:boolean
 };
 assert.equal(result.status,"review-setup-required");
 assert.deepEqual(result.writeSurfaces,["archivo.txt"]);
 assert.equal(result.reviewerModelActual,"unknown");
 assert.equal(result.writerAuthority,false);
 assert.equal(f.reads(),2,"La tarea debe volver a leerse tras resolver los perfiles");
 assert.equal(f.git("status","--porcelain"),"");
});
test("T04 sesión ajena o candidato cambiado detiene el enlace antes de revisión",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.task]);
 const changed:ScopedOddTodo={...f.task,current:{...f.task.current,sessionId:"ajena"}};
 f.register(async()=>[changed]);
 const result=await f.run("todo "+f.taskId) as {status:string;blockers:string[]};
 assert.equal(result.status,"blocked");
 assert.ok(result.blockers.some(x=>/another Pi session/u.test(x)));
 assert.equal(f.git("status","--porcelain"),"");
});
test("T04 cualquier cambio de sesión durante la consulta obliga a repetirla",async t=>{
 const f=fixture(t);
 let count=0;
 f.register(async()=>{count++;if(count===2)f.setSession("pi-distinta");return [f.task];});
 await assert.rejects(async()=>await f.run("todo "+f.taskId),/session changed/u);
});
test("T04 no permite inspección sin interfaz ni acceso al almacén ODD",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.task]);
 f.context.hasUI=false;
 await assert.rejects(async()=>await f.run("todo "+f.taskId),/active Pi UI/u);
});

test("T04/T05 ODD adaptativo conserva el ámbito y no usa modelos si se rechaza el consentimiento",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.task]);
 writeFileSync(join(f.root,"archivo.txt"),"cambio\n");
 let modelCalls=0,consentCalls=0,editPaths=0;
 const author={provider:"author",id:"original"},reviewer={provider:"free",id:"independiente"};
 const context={
  ...f.context,model:author,
  modelRegistry:{
   getAvailable:()=>[author,reviewer],
   hasConfiguredAuth:(model:{provider:string})=>model.provider==="free",
   streamSimple:()=>{modelCalls++;return (async function*(){yield {type:"done"};})();},
  },
  ui:{
   notify:()=>{},
   select:async(_title:string,options:string[])=>options[0],
   editor:async(title:string)=>{
    if(title.includes("Rutas exactas"))editPaths++;
    return title.includes("untracked")?"[]":"Inspeccionar únicamente el cambio ODD";
   },
   confirm:async()=>{consentCalls++;return false;}
  }
 };
 const result=await f.run("todo "+f.taskId+" adaptive",context) as {status:string};
 assert.equal(result.status,"cancelled");
 assert.equal(editPaths,0,"El ámbito procede del Todo verificado, no de texto libre");
 assert.equal(consentCalls,1);
 assert.equal(modelCalls,0);
 assert.equal(f.git("status","--porcelain").includes("archivo.txt"),true);
});
test("T04 ODD adaptativo bloquea ampliación de archivos sin ejecutar el revisor",async t=>{
 const f=fixture(t);
 f.register(async()=>[f.task]);
 writeFileSync(join(f.root,"archivo.txt"),"cambio\n");
 let calls=0;
 const author={provider:"author",id:"original"},reviewer={provider:"free",id:"revisor"};
 const ctx={
  ...f.context,model:author,
  modelRegistry:{
   getAvailable:()=>[author,reviewer],
   hasConfiguredAuth:(model:{provider:string})=>model.provider==="free",
   streamSimple:()=>{calls++;return (async function*(){yield {type:"done"};})();},
  },
  ui:{
   notify:()=>{},
   select:async(_title:string,options:string[])=>options[0],
   editor:async(title:string)=>title.includes("untracked")?'["otro.txt"]':"Validar",
   confirm:async()=>true
  }
 };
 await assert.rejects(async()=>await f.run("todo "+f.taskId+" adaptive",ctx),/alcance untracked|outside the frozen task scope/u);
 assert.equal(calls,0);
});

test("4R no publica dictamen si el Todo cambia durante la respuesta del último revisor",async t=>{
 const fixtureState=fixture(t);
 let current=fixtureState.task,calls=0;
 fixtureState.register(async()=>[current]);
 writeFileSync(join(fixtureState.root,"archivo.txt"),"cambio bajo revisión\n");
 const author={provider:"author",id:"original"},reviewer={provider:"free",id:"independiente"};
 const ctx={
  ...fixtureState.context,model:author,
  modelRegistry:{
   getAvailable:()=>[author,reviewer],
   hasConfiguredAuth:(model:{provider:string})=>model.provider==="free",
   streamSimple:()=>{
    calls++;
    return (async function*(){
     const answer={verdict:"pass",summary:"El candidato no tiene hallazgos",findings:[]};
     if(calls===1)current={...current,current:{...current.current,state:"blocked" as const}};
     yield {type:"done" as const,reason:"stop" as const,
      message:{role:"assistant",provider:"free",content:[{type:"text",text:JSON.stringify(answer)}]}};
    })();
   }
  },
  ui:{
   notify:()=>{},
   select:async(_title:string,options:string[])=>options[0],
   editor:async(title:string)=>title.includes("untracked")?"[]":"Revisar solamente los cambios aprobados",
   confirm:async()=>true
  }
 };
 await assert.rejects(async()=>await fixtureState.run("todo "+fixtureState.taskId+" adaptive",ctx),
  /ODD Todo or Git HEAD changed/u);
 assert.equal(calls,1,"No debe llamar a otro revisor tras alterar la tarea");
 assert.equal(fixtureState.git("status","--porcelain")," M archivo.txt");
});
