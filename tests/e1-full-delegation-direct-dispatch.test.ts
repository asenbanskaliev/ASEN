import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {mkdir,mkdtemp,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import {writeProfilesFile} from "../src/runtime/lifecycle/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/lifecycle/profiles.js";

test("E1B: Pi despacha el Writer directo del perfil completo sin dar escritura al padre",async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-e1b-directa-")));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 const worktree=join(root,"proyecto");await mkdir(worktree);
 const project=await realpath(worktree),sessionId="delegacion-real";
 await writeFile(join(project,"README.md"),"Documento inicial\n");
 // Los archivos locales de estado de ASEN no son cambios del candidato Git.
 // Cualquier otro archivo inesperado sigue siendo visible al control de limpieza.
 await writeFile(join(project,".gitignore"),".asen/\n");
 const git=(...args:string[])=>{
  const run=spawnSync("git",["-C",project,...args],{encoding:"utf8",windowsHide:true});
  assert.equal(run.status,0,run.stderr);
 };
 git("init","-q");git("add","README.md",".gitignore");
 git("-c","user.name=ASEN CI","-c","user.email=asen@example.invalid","commit","-qm","Base de prueba");
 const profileFile=join(root,"profiles.json"),storeFile=join(root,"todos.json"),agentsFile=join(root,"agents.json");
 await writeProfilesFile(profileFile,{schema:ASEN_PROFILES_SCHEMA,active:"agentes",
  profiles:[{name:"agentes",mode:"full-delegation",routes:{worker:{model:"local/modelo-elegido"}}}]});
 const tools=new Map<string,any>(),events=new Map<string,Array<(event:any,ctx:any)=>unknown>>();
 const launches:any[]=[];
 const pi={
  registerTool(tool:any){tools.set(tool.name,tool);},
  registerCommand(){},getCommands(){return [];},getAllTools(){return [];},
  on(name:string,handler:(event:any,ctx:any)=>unknown){events.set(name,[...(events.get(name)??[]),handler]);},
 };
 const context:any={cwd:project,mode:"rpc",hasUI:true,
  sessionManager:{getSessionId:()=>sessionId,getEntries:()=>[]},
  modelRegistry:{find:(provider:string,id:string)=>provider==="local"&&id==="modelo-elegido"?{
   provider,id,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}
  }:undefined},
  ui:{notify(){},setStatus(){},setWidget(){},confirm:async()=>false},
 };
 createPiExtension({homeDir:()=>root,profilesFile:profileFile,todoStoreFile:storeFile,agentStoreFile:agentsFile,
  enableMemoryRuntime:false,enableWorkspaceRuntime:false,autoAdvancePlans:false,
  agentRunner:{run:async(request:any)=>{launches.push(request);return {id:request.id,ok:true,output:"Solo se examinaron los archivos autorizados"};}},
 })(pi as any);
 t.after(async()=>{for(const h of events.get("session_shutdown")??[])await h({},context);});
 for(const h of events.get("session_start")??[])await h({reason:"new"},context);
 const clean=spawnSync("git",["-C",project,"status","--porcelain"],{encoding:"utf8",windowsHide:true});
 assert.equal(clean.status,0,clean.stderr);
 assert.equal(clean.stdout,"","El candidato debe continuar limpio después de iniciar Pi");
 const planTool=tools.get("asen_plan_request"),dispatchTool=tools.get("asen_plan_dispatch_next");
 assert.ok(planTool);assert.ok(dispatchTool);
 const request={instruction:"Modificar solo el documento autorizado",intent:"implementation",
  scope:{kind:"known",expectedPaths:["README.md"]},
  writes:[{path:"README.md",changeKind:"documentation"}],riskOperations:[],
  session:{estimatedMinutes:10,continuation:false},testing:{kind:"required"},
  review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]};
 const plan=await planTool.execute("plan",request,new AbortController().signal,()=>{},context);
 assert.equal(plan.details.route,"direct");
 assert.deepEqual(plan.details.executablePlan.tasks.map((x:{role:string})=>x.role),["worker"]);
 assert.equal(plan.details.execution.started,false);
 let permissions=0;
 const declined=await dispatchTool.execute("denegado",{},new AbortController().signal,()=>{},context);
 assert.equal(declined.details.status,"blocked");
 assert.equal(launches.length,0);
 context.ui.confirm=async()=>{permissions++;return true;};
 const approved=await dispatchTool.execute("aprobado",{},new AbortController().signal,()=>{},context);
 assert.equal(approved.details.status,"dispatched",approved.details.reason);
 assert.equal(approved.details.role,"worker");
 assert.equal(permissions,1);
 // La respuesta "dispatched" no basta: el runner debe recibir exactamente
 // un Worker, con el modelo y los archivos autorizados.
 // Al arrancar en máquinas Windows el despachador puede tardar varios segundos
 // en terminar las comprobaciones del candidato y las autorizaciones.
 const limit=Date.now()+(process.platform==="win32"?30000:10000);
 while(launches.length===0&&Date.now()<limit)
  await new Promise(resolve=>setTimeout(resolve,20));
 if(launches.length===0){
  const journal=JSON.parse(await readFile(agentsFile,"utf8"));
  const entry=journal.entries?.find((item:any)=>item.record?.id===approved.details.agentId)?.record;
  assert.fail("El Writer no llegó al ejecutor: "+JSON.stringify({
   status:entry?.state??"sin-registro",summary:String(entry?.summary??"sin-detalles").slice(0,700)
  }));
 }
 assert.equal(launches.length,1,"una autorización produce un solo lanzamiento");
 assert.equal(launches[0].model,"local/modelo-elegido");
 assert.deepEqual(launches[0].writeSurfaces,["README.md"]);
 // El modelo del perfil se verifica en la tarea persistida, no se cambia
 // arbitrariamente ni se amplía el ámbito del Writer.
 const todos=(await import("../src/runtime/lifecycle/todo-store.js")).SessionTodoStore;
 const store=await todos.open(storeFile),rows=await store.list({sessionId,projectId:project});
 const worker=rows.find(row=>row.plan?.role==="worker");
 assert.deepEqual(worker?.plan?.writeSurfaces,["README.md"]);
 assert.equal(worker?.plan?.model,"local/modelo-elegido");
});
