import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
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
