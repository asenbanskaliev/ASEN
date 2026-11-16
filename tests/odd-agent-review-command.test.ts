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
   undefined,async()=>({model:"nvidia/reviewer"}),async()=>{
    reads++;return reader();
   });
 const run=(args:string)=>commands.get("asen-review")!.handler(args,context);
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
