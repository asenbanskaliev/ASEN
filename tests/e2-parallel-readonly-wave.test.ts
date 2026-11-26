import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {selectSkills} from "../src/skills/registry.js";

async function waitUntil(predicate:()=>boolean,description:string){
 for(let attempt=0;attempt<200;attempt++){
  if(predicate())return;
  await new Promise(resolve=>setTimeout(resolve,15));
 }
 assert.fail("No se observó el estado esperado: "+description);
}

test("E2B: dos lecturas independientes se ejecutan a la vez, la tercera espera y no se repite",async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-e2-lecturas-")));
 const identity={sessionId:"oleada-pi",projectId:root};
 const todos=await SessionTodoStore.open(join(root,"todos.json"));
 const pendientes=new Map<string,()=>void>(),lanzamientos:string[]=[];
 let activos=0,maximos=0;
 const agents=await AgentRuntime.open({storeFile:join(root,"agents.json"),maxConcurrency:4,runner:{
  run:async(request:{id:string;prompt:string})=>{
   lanzamientos.push(request.prompt);activos++;maximos=Math.max(maximos,activos);
   await new Promise<void>(resolve=>pendientes.set(request.prompt,resolve));
   activos--;
   return {id:request.id,ok:true,output:"Lectura terminada: "+request.prompt};
  },
 } as never});
 const selection={phase:"explore"} as const;
 const paths=selectSkills(selection).map(skill=>skill.path);
 const tasks=await todos.addPlan(["lectura-uno","lectura-dos","lectura-tres"].map((name,index)=>({
  title:name,requestId:"asen-plan:oleada-"+index+":explorer",description:name,dependsOn:[],
  plan:{role:"explorer" as const,skillPaths:paths,skillSelection:selection,priority:index+1},
 })),identity);
 assert.equal(tasks.length,3);
 const handlers=new Map<string,Array<(event:any,ctx:any)=>unknown>>();
 const ctx:any={
  cwd:root,mode:"rpc",hasUI:true,
  sessionManager:{getSessionId:()=>identity.sessionId,getEntries:()=>[]},
  ui:{notify(){},setWidget(){},setStatus(){}},
 };
 createAsenExtension({homeDir:()=>root,
  agentRuntimeFactory:()=>Promise.resolve(agents),todoStoreFactory:()=>Promise.resolve(todos),
  enableMemoryRuntime:false,enableWorkspaceRuntime:false,autoAdvancePlans:true,
 })( {registerTool(){},registerCommand(){},on:(name:string,handler:(event:any,ctx:any)=>unknown)=>{
  handlers.set(name,[...(handlers.get(name)??[]),handler]);
 }} as any);
 t.after(async()=>{
  for(const release of pendientes.values())release();
  try{for(const handler of handlers.get("session_shutdown")??[])await handler({},ctx);}
  finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 for(const handler of handlers.get("session_start")??[])await handler({reason:"new"},ctx);
 await waitUntil(()=>lanzamientos.length>=2,"dos lecturas iniciales");
 assert.deepEqual(lanzamientos,["lectura-uno","lectura-dos"]);
 assert.equal(maximos,2);
 assert.equal(pendientes.has("lectura-tres"),false);
 const before=await todos.list(identity);
 assert.equal(before.find(row=>row.taskId===tasks[2]?.taskId)?.current.state,"planned");
 // El evento terminal arranca la tercera unidad, sin tocar la segunda.
 pendientes.get("lectura-uno")?.();
 await waitUntil(()=>lanzamientos.length===3,"tercera lectura tras terminar la primera");
 assert.equal(lanzamientos[2],"lectura-tres");
 assert.equal(maximos,2,"nunca se solapan tres ejecuciones");
 pendientes.get("lectura-dos")?.();
 pendientes.get("lectura-tres")?.();
 await waitUntil(()=>activos===0,"terminación de la tanda");
 assert.equal(lanzamientos.length,3,"ninguna tarea se repite");
});

test("E2B: la segunda plaza de lectura nunca despacha un Writer sin permiso",async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-e2-no-writer-")));
 const identity={sessionId:"proteccion-oleada",projectId:root};
 const todos=await SessionTodoStore.open(join(root,"todos.json"));
 const releases:Array<()=>void>=[];let launches=0,confirmations=0;
 const agents=await AgentRuntime.open({storeFile:join(root,"agents.json"),runner:{
  run:async(request:{id:string})=>{
   launches++;
   await new Promise<void>(resolve=>{releases.push(resolve);});
   return {id:request.id,ok:true,output:"Lectura terminada"};
  }
 } as never});
 const selection={phase:"explore"} as const,writer={phase:"apply"} as const;
 const [read,write,secondRead]=await todos.addPlan([
  {title:"Leer",requestId:"asen-plan:uno:explorer",dependsOn:[],description:"Consultar",
   plan:{role:"explorer",priority:1,skillPaths:selectSkills(selection).map(skill=>skill.path),skillSelection:selection}},
  {title:"Editar",requestId:"asen-plan:dos:worker",dependsOn:[],description:"Modificar código",
   plan:{role:"worker",priority:2,skillPaths:selectSkills(writer).map(skill=>skill.path),skillSelection:writer}},
  {title:"Otra lectura",requestId:"asen-plan:tres:explorer",dependsOn:[],description:"Consultar por separado",
   plan:{role:"explorer",priority:3,skillPaths:selectSkills(selection).map(skill=>skill.path),skillSelection:selection}},
 ],identity);
 const handlers=new Map<string,Array<(event:any,ctx:any)=>unknown>>();
 const ctx:any={cwd:root,mode:"rpc",hasUI:true,sessionManager:{getSessionId:()=>identity.sessionId,getEntries:()=>[]},
  ui:{notify(){},setWidget(){},setStatus(){},confirm:async()=>{confirmations++;return true;}}};
 createAsenExtension({homeDir:()=>root,
  agentRuntimeFactory:()=>Promise.resolve(agents),todoStoreFactory:()=>Promise.resolve(todos),
  enableMemoryRuntime:false,enableWorkspaceRuntime:false,autoAdvancePlans:true,
 })( {registerTool(){},registerCommand(){},on:(name:string,handler:(event:any,ctx:any)=>unknown)=>{
  handlers.set(name,[...(handlers.get(name)??[]),handler]);
 }} as any);
 t.after(async()=>{
  for(const release of releases)release();
  try{for(const handler of handlers.get("session_shutdown")??[])await handler({},ctx);}
  finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 for(const handler of handlers.get("session_start")??[])await handler({reason:"new"},ctx);
 await waitUntil(()=>launches===2,"dos lecturas independientes");
 assert.equal((await todos.list(identity)).find(row=>row.taskId===read?.taskId)?.current.state,"running");
 assert.equal((await todos.list(identity)).find(row=>row.taskId===write?.taskId)?.current.state,"planned");
 assert.equal((await todos.list(identity)).find(row=>row.taskId===secondRead?.taskId)?.current.state,"running");
 assert.equal((await agents.list(identity)).filter(record=>record.state==="running").length,2);
 assert.equal(confirmations,0,"la segunda plaza no pregunta ni autoriza escrituras");
});
