import assert from "node:assert/strict";
import test from "node:test";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {selectSkills} from "../src/skills/registry.js";
import {writeProfilesFile} from "../src/runtime/lifecycle/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/lifecycle/profiles.js";

test("G49-B evento terminal de Pi: una exploración fallida no se repite y otra independiente gratuita continúa",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-g49-b-terminal-"));
 const identity={sessionId:"coordinador-pi-b",projectId:root};
 const todos=await SessionTodoStore.open(join(root,"todos.json"));
 const requests:Array<{id:string;role:string;prompt:string;model?:string}>=[];
 const agents=await AgentRuntime.open({storeFile:join(root,"agents.json"),runner:{
  run:async(request:{id:string;role:string;prompt:string;model?:string})=>{
   requests.push(request);
   return {id:request.id,ok:request.prompt!=="Exploración que falla",
    output:request.prompt==="Exploración que falla"?"Error de prueba confirmado":"Evidencia de lectura independiente"};
  }
 } as never});
 const events=new Map<string,Array<(event:any,context:any)=>unknown>>();
 const piTools=new Map<string,any>();
 const model={provider:"local",id:"cero",cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
 const ctx:any={
  cwd:root,mode:"rpc",hasUI:true,model,
  modelRegistry:{find:(provider:string,id:string)=>provider==="local"&&id==="cero"?model:undefined},
  sessionManager:{getSessionId:()=>identity.sessionId,getEntries:()=>[]},
  ui:{notify(){},setWidget(){},setStatus(){}},
 };
 await writeProfilesFile(join(root,".asen","profiles.json"),{
  schema:ASEN_PROFILES_SCHEMA,active:"lecturas",profiles:[{name:"lecturas",routes:{explorer:{model:"local/cero"}}}],
 });
 const pi={
  on(name:string,callback:(event:any,context:any)=>unknown){events.set(name,[...(events.get(name)??[]),callback]);},
  registerCommand(){},registerTool(tool:any){piTools.set(tool.name,tool);}
 };
 createAsenExtension({
  homeDir:()=>root,agentRuntimeFactory:()=>Promise.resolve(agents),
  todoStoreFactory:()=>Promise.resolve(todos),
  enableMemoryRuntime:false,enableWorkspaceRuntime:false,
  autoAdvancePlans:true,
 })(pi as any);
 t.after(async()=>{
  try{for(const handler of events.get("session_shutdown")??[])await handler({},ctx);}
  finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 for(const handler of events.get("session_start")??[])await handler({reason:"new"},ctx);
 const selection={phase:"explore"} as const,skillPaths=selectSkills(selection).map(s=>s.path);
 const [first,second]=await todos.addPlan([
  {title:"Primera investigación",requestId:"asen-plan:fallida:explorer",
   dependsOn:[],description:"Exploración que falla",
   plan:{role:"explorer",skillPaths,skillSelection:selection,priority:1,model:"local/cero"}},
  {title:"Otra investigación independiente",requestId:"asen-plan:segunda:explorer",
   dependsOn:[],description:"Exploración independiente",
   plan:{role:"explorer",skillPaths,skillSelection:selection,priority:2,model:"local/cero"}},
 ],identity);
 assert.ok(first&&second);
 const tool=piTools.get("asen_agent_start");
 assert.ok(tool);
 const firstStart=await tool.execute("g49-b-failure",{prompt:"Exploración que falla",todoId:first.taskId},
  new AbortController().signal,()=>{},ctx);
 assert.equal(firstStart.details.role,"explorer");
 for(let attempt=0;attempt<250;attempt++){
  const rows=await todos.list(identity);
  if(rows.find(row=>row.taskId===first.taskId)?.current.state==="blocked"&&
     rows.find(row=>row.taskId===second.taskId)?.current.state==="done")break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 const rows=await todos.list(identity);
 assert.equal(rows.find(row=>row.taskId===first.taskId)?.current.state,"blocked");
 assert.equal(rows.find(row=>row.taskId===second.taskId)?.current.state,"done");
 assert.deepEqual(requests.map(r=>r.prompt),["Exploración que falla","Exploración independiente"]);
 assert.ok(requests.every(r=>r.role==="explorer"&&r.model==="local/cero"));
 const snapshots=await agents.list(identity);
 assert.deepEqual(snapshots.map(s=>s.state).sort(),["completed","failed"]);
 assert.equal(rows.some(row=>row.plan?.role==="worker"&&row.current.state==="running"),false);
});

test("G49-B reinicio de Pi reconcilia Explorer terminal antes de avanzar solo a su sucesor listo",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-g49-b-restart-"));
 const identity={sessionId:"coordinador-pi-reinicio",projectId:root};
 const todos=await SessionTodoStore.open(join(root,"todos.json"));
 await mkdir(join(root,".asen"));
 const links=new TaskAgentLinkStore(join(root,".asen","task-agent-links.json"));
 const requests:string[]=[];
 const agents=await AgentRuntime.open({storeFile:join(root,"agents.json"),runner:{
  run:async(request:{id:string;prompt:string})=>{
   requests.push(request.prompt);
   return {id:request.id,ok:true,output:`Resultado guardado: ${request.prompt}`};
  }
 } as never});
 const selection={phase:"explore"} as const,skillPaths=selectSkills(selection).map(skill=>skill.path);
 const [completedExplorer,dependentExplorer,unrelatedWriter]=await todos.addPlan([
  {title:"Exploración duradera",requestId:"asen-plan:reinicio:explorer",dependsOn:[],description:"Exploración completada antes del reinicio",
   plan:{role:"explorer",skillPaths,skillSelection:selection,priority:1}},
  {title:"Sucesora dependiente",requestId:"asen-plan:reinicio-sucesora:explorer",dependsOn:["asen-plan:reinicio:explorer"],description:"Exploración que depende del resultado guardado",
   plan:{role:"explorer",skillPaths,skillSelection:selection,priority:1}},
  {title:"Writer no autorizado",requestId:"asen-plan:reinicio:worker",dependsOn:[],description:"No debe iniciar durante la recuperación",
   plan:{role:"worker",skillPaths:[],skillSelection:{phase:"apply"},priority:2}},
 ],identity);
 assert.ok(completedExplorer&&dependentExplorer&&unrelatedWriter);
 const initial=await dispatchNextPlanTask({todos,agents,links,identity,autoApproveReadOnly:true,validateIdentity:async()=>{},confirm:async()=>true});
 assert.equal(initial.status,"dispatched");
 for(let attempt=0;attempt<100&&(await agents.list(identity))[0]?.state!=="completed";attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal((await agents.list(identity))[0]?.state,"completed");
 assert.equal((await todos.list(identity)).find(row=>row.taskId===completedExplorer.taskId)?.current.state,"running");
 const pi={on(){},registerCommand(){},registerTool(){}};
 const ctx:any={cwd:root,mode:"rpc",hasUI:true,sessionManager:{getSessionId:()=>identity.sessionId,getEntries:()=>[]},ui:{notify(){},setWidget(){},setStatus(){}}};
 const facade=createAsenExtension({homeDir:()=>root,agentRuntimeFactory:()=>Promise.resolve(agents),todoStoreFactory:()=>Promise.resolve(todos),enableMemoryRuntime:false,enableWorkspaceRuntime:false,autoAdvancePlans:true,deferSessionStart:true})(pi as any);
 t.after(async()=>{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 await facade.startSession(ctx,{reason:"restart"});
 for(let attempt=0;attempt<100;attempt++){
  const rows=await todos.list(identity);
  if(rows.find(row=>row.taskId===dependentExplorer.taskId)?.current.state==="done")break;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 const rows=await todos.list(identity);
 assert.equal(rows.find(row=>row.taskId===completedExplorer.taskId)?.current.state,"done");
 assert.equal(rows.find(row=>row.taskId===dependentExplorer.taskId)?.current.state,"done");
 assert.equal(rows.find(row=>row.taskId===unrelatedWriter.taskId)?.current.state,"planned");
 assert.deepEqual(requests,["Exploración completada antes del reinicio","Exploración que depende del resultado guardado"]);
});

test("G49-B reinicio bloquea solo el Todo local sin enlace duradero",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-g49-b-unlinked-"));
 const identity={sessionId:"coordinador-pi-sin-enlace",projectId:root};
 const foreign={sessionId:"otra-sesion-pi",projectId:root};
 const todos=await SessionTodoStore.open(join(root,"todos.json"));
 const runnerCalls:string[]=[];
 const agents=await AgentRuntime.open({storeFile:join(root,"agents.json"),runner:{
  run:async(request:{id:string;prompt:string})=>{
   runnerCalls.push(request.prompt);
   return {id:request.id,ok:true,output:"No debe ejecutarse"};
  }
 } as never});
 const local=await todos.add("Todo local sin enlace",identity);
 const foreignTodo=await todos.add("Todo ajeno sin enlace",foreign);
 const localRunning=(await todos.list(identity)).find(row=>row.taskId===local.taskId);
 const foreignRunning=(await todos.list(foreign)).find(row=>row.taskId===foreignTodo.taskId);
 assert.ok(localRunning&&foreignRunning);
 await todos.update(local.taskId,identity,localRunning.current.revision,"running","Trabajo local previo");
 await todos.update(foreignTodo.taskId,foreign,foreignRunning.current.revision,"running","Trabajo ajeno previo");
 const pi={on(){},registerCommand(){},registerTool(){}};
 const ctx:any={cwd:root,mode:"rpc",hasUI:true,sessionManager:{getSessionId:()=>identity.sessionId,getEntries:()=>[]},ui:{notify(){},setWidget(){},setStatus(){}}};
 const facade=createAsenExtension({homeDir:()=>root,agentRuntimeFactory:()=>Promise.resolve(agents),todoStoreFactory:()=>Promise.resolve(todos),enableMemoryRuntime:false,enableWorkspaceRuntime:false,autoAdvancePlans:true,deferSessionStart:true})(pi as any);
 t.after(async()=>{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 await facade.startSession(ctx,{reason:"restart"});
 const [localAfter,foreignAfter]=await Promise.all([todos.list(identity),todos.list(foreign)]);
 const localTodo=localAfter.find(row=>row.taskId===local.taskId);
 const foreignTodoAfter=foreignAfter.find(row=>row.taskId===foreignTodo.taskId);
 assert.equal(localTodo?.current.state,"blocked");
 assert.equal(localTodo?.current.reason,"Running Todo has no durable agent link; execution outcome unknown; explicit review required");
 assert.equal(foreignTodoAfter?.current.state,"running");
 assert.deepEqual(runnerCalls,[]);
});
