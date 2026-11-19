import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {selectSkills} from "../src/skills/registry.js";

function gate(){
 let resolve!:()=>void;
 return {promise:new Promise<void>(ready=>{resolve=ready;}),resolve:()=>resolve()};
}
async function until(check:()=>boolean,reason:string){
 for(let i=0;i<300;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,15));}
 assert.fail(reason);
}
async function bounded<T>(operation:Promise<T>,reason:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(reason)),7000);})]);}
 finally{if(timer)clearTimeout(timer);}
}

test("E2B: una lectura que termina mientras el padre está ocupado despierta la siguiente sin duplicados",async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"asen-e2-aviso-pendiente-")));
 const owner={sessionId:"aviso-pendiente",projectId:root};
 const todos=await SessionTodoStore.open(join(root,"todos.json"));
 const started:string[]=[],finishes=new Map<string,()=>void>();
 const runtime=await AgentRuntime.open({storeFile:join(root,"agents.json"),maxConcurrency:3,runner:{
  run:async(request:{id:string;prompt:string})=>{
   started.push(request.prompt);
   await new Promise<void>(resolve=>{finishes.set(request.prompt,resolve);});
   return {id:request.id,ok:true,output:"Solo lectura: "+request.prompt};
  }
 } as never});
 const selection={phase:"explore"} as const;
 const skills=selectSkills(selection).map(x=>x.path);
 await todos.addPlan(["primera","segunda","tercera"].map((name,index)=>({
  title:name,requestId:"asen-plan:aviso-"+index+":explorer",dependsOn:[],description:name,
  plan:{role:"explorer" as const,priority:index+1,skillSelection:selection,skillPaths:skills}
 })),owner);
 const entered=gate(),release=gate();
 const originalList=todos.list.bind(todos);
 let held=false;
 (todos as any).list=async(identity:typeof owner)=>{
  const rows=await originalList(identity);
  // Bloqueamos una sola lectura del panel, cuando los dos primeros runners
  // ya arrancaron. Mientras tanto el primer agente terminará.
  // Solo retenemos la llamada del coordinador. El conciliador terminal debe
  // poder leer el mismo almacén y asentar el resultado sin quedar bloqueado.
  if(!held&&started.length===1&&(new Error().stack??"").includes("advancePlan")){
   held=true;entered.resolve();await release.promise;
  }
  return rows;
 };
 const events=new Map<string,Array<(evt:any,ctx:any)=>unknown>>();
 const ctx:any={cwd:root,mode:"rpc",hasUI:true,
  sessionManager:{getSessionId:()=>owner.sessionId,getEntries:()=>[]},
  ui:{notify(){},setWidget(){},setStatus(){}}
 };
 createAsenExtension({homeDir:()=>root,agentRuntimeFactory:()=>Promise.resolve(runtime),
  todoStoreFactory:()=>Promise.resolve(todos),autoAdvancePlans:true,
  enableWorkspaceRuntime:false,enableMemoryRuntime:false})({
  registerTool(){},registerCommand(){},
  on(name:string,fn:(evt:any,ctx:any)=>unknown){events.set(name,[...(events.get(name)??[]),fn]);}
 } as any);
 t.after(async()=>{
  release.resolve();
  for(const finish of finishes.values())finish();
  try{for(const handler of events.get("session_shutdown")??[])await handler({},ctx);}
  finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 const opening=Promise.all((events.get("session_start")??[]).map(fn=>fn({reason:"new"},ctx)));
 await bounded(entered.promise,"El padre no quedó ocupado tras la primera lectura");
 assert.deepEqual(started,["primera"]);
 finishes.get("primera")?.();
 let finished=false;
 for(let i=0;i<250;i++){
  const rows=await originalList(owner);
  if(rows.find(r=>r.description==="primera")?.current.state==="done"){finished=true;break;}
  await new Promise(resolve=>setTimeout(resolve,15));
 }
 assert.equal(finished,true,"se asentó el primer resultado antes de liberar al padre");
 await new Promise(resolve=>setTimeout(resolve,60));
 release.resolve();
 await bounded(opening,"La sesión de origen no terminó de arrancar");
 await bounded(until(()=>started.includes("tercera"),"El aviso terminal se perdió y la tercera tarea no arrancó"),"La tercera lectura no se inició");
 assert.deepEqual(started,["primera","segunda","tercera"]);
 finishes.get("segunda")?.();finishes.get("tercera")?.();
 assert.equal(started.length,3,"no se repitió ninguna unidad anterior");
});
