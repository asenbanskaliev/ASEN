/**
 * Test T07 en un HOST Pi TUI auténtico, usando registros ODD de prueba.
 * Los dos Workers están instrumentados: NO se llama a NVIDIA y esta prueba
 * NO acredita dos Writers Pi reales, permisos ni aceptación de cambios.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {PersistentAgentStore} from "../src/runtime/agents/agent-store.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {bindParallelSourceTodos} from "../src/runtime/agents/parallel-todo-bindings.js";
import {ParallelTodoWorktreeJournal,newParallelTodoWorktreeBatchId} from "../src/runtime/agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../src/runtime/agents/parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "../src/runtime/agents/parallel-child-plan-claims.js";
import {prepareParallelWorkerWorktrees} from "../src/runtime/agents/parallel-worktrees.js";
const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const expected=process.env.ASEN_EXPECTED_SHA??"";
assert.match(expected,/^[0-9a-f]{40}$/u);
const git=(cwd,...args)=>execFileSync("git",["-C",cwd,...args],{
 encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:15000
}).trim();
assert.equal(git(repo,"rev-parse","HEAD"),expected);
const require=createRequire(import.meta.url),pty=require("node-pty");
const piMeta=JSON.parse(readFileSync(join(repo,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
assert.equal(piMeta.version,"1.6.0");
const piBin=join(repo,"node_modules","@earendil-works","pi-coding-agent",
 typeof piMeta.bin==="string"?piMeta.bin:piMeta.bin.pi);
const temp=realpathSync(mkdtempSync(join(tmpdir(),"asen-t07-pi-live-")));
const project=join(temp,"proyecto"),parent=join(temp,"hermanos"),home=join(temp,"home");
for(const dir of [project,parent,home])mkdirSync(dir,{mode:0o700});
const ready=join(temp,"sesion.json"),shutdown=join(temp,"cerrar"),probe=join(temp,"sonda.ts");
git(project,"init","-q");git(project,"config","user.name","ASEN T07");
git(project,"config","user.email","t07@example.invalid");
writeFileSync(join(project,"a.mjs"),"export const a=0;\n");
writeFileSync(join(project,"b.mjs"),"export const b=0;\n");
git(project,"add","a.mjs","b.mjs");git(project,"commit","-qm","base");
const revision=git(project,"rev-parse","HEAD");
writeFileSync(probe,[
 'import {existsSync,writeFileSync} from "node:fs";',
 'export default function(pi){',
 ' pi.on("before_agent_start",()=>{throw Error("T07: prohibidas las llamadas a modelos");});',
 ' pi.on("session_start",(_ev,ctx)=>{',
 '  writeFileSync('+JSON.stringify(ready)+',JSON.stringify({sessionId:ctx.sessionManager?.getSessionId?.(),cwd:ctx.cwd}));',
 '  const interval=setInterval(()=>{if(existsSync('+JSON.stringify(shutdown)+')){clearInterval(interval);clearTimeout(safety);ctx.shutdown();}},150);',
 '  const safety=setTimeout(()=>{clearInterval(interval);ctx.shutdown();},95000);',
 ' });',
 '}'
].join("\n")+"\n");
const env={...process.env,HOME:home,USERPROFILE:home,
 PI_CODING_AGENT_DIR:join(home,"pi"),ASEN_NO_SKILL_REGISTRY:"1",
 PI_TELEMETRY:"0",TERM:"xterm-256color",NO_COLOR:"1",FORCE_COLOR:"0",COLORTERM:""};
for(const key of Object.keys(env))
 if(key.startsWith("GIT_")||/(?:API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu.test(key))
  delete env[key];
const terminal=pty.spawn(process.execPath,[piBin,"--no-extensions",
 "--extension",join(repo,"extensions","asen.ts"),"--extension",probe,
 "--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"],{
 cwd:project,env,cols:160,rows:75,name:"xterm-256color"
});
let output="",exited;
terminal.onData(data=>{output=(output+data).slice(-600000);});
terminal.onExit(result=>{exited=result;});
const plain=s=>s.replace(/\u001b\][^\u0007]*\u0007/gu,"")
 .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu,"")
 .replace(/\u001b[@-Z\\-_]/gu,"");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(predicate,label,timeout=30000)=>{
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  if(predicate())return;
  if(exited)throw Error(label+": Pi terminó prematuramente");
  await sleep(150);
 }
 throw Error(label+": no se observó en la salida del TUI");
};
const report={
 schema:"asen.t07.pisession-worktree-flow/v1",sha:expected,piVersion:piMeta.version,
 fixture:"dos-sesiones-hijas-instrumentadas-sin-modelos",
 realPiTuiObserved:false,childJournalsVerified:false,initialRunningObserved:false,
 terminalRefreshObserved:false,realNvidiaWriterObserved:false,
 humanWriterApprovalObserved:false,acceptance:"not-accepted",
 autoRetry:false,autoMerge:false,globalFull:false,result:"FAIL"
};
try{
 await until(()=>existsSync(ready),"Inicio de Pi",22000);
 const host=JSON.parse(readFileSync(ready,"utf8"));
 assert.ok(typeof host.sessionId==="string"&&host.sessionId.length>0);
 assert.equal(realpathSync(host.cwd),realpathSync(project));
 report.realPiTuiObserved=true;
 const dir=join(home,".asen");mkdirSync(dir,{recursive:true,mode:0o700});
 const todos=await SessionTodoStore.openProjectScoped(join(dir,"todos"),join(dir,"todos.json"));
 const source={sessionId:host.sessionId,projectId:realpathSync(project)};
 const specs=[{name:"a",file:"a.mjs"},{name:"b",file:"b.mjs"}];
 const plan=(file,repository,id)=>({
  role:"worker",skillPaths:["skills/asen-apply/SKILL.md"],
  skillSelection:{phase:"apply",codeChange:true},
  model:"nvidia/nemotron-3.5-lightning-30b-a3b",
  candidate:{id,repository,revision,createdAt:new Date().toISOString()},
  writeSurfaces:[file],
  writerAuthorizationBasis:JSON.stringify({instruction:"Prueba T07 sin ejecución del modelo"})
 });
 const rows=await todos.addPlan(specs.map(item=>({
  title:"Fuente "+item.name,description:"Observación de "+item.file,
  requestId:"asen-plan:parent-"+item.name+":worker",dependsOn:[],
  plan:plan(item.file,source.projectId,"parent-"+item.name)
 })),source);
 const units=specs.map((item,i)=>({taskId:rows[i].taskId,writeSurfaces:[item.file]}));
 const bindings=bindParallelSourceTodos({identity:source,expectedHead:revision,
  rows:await todos.list(source),units});
 const journal=new ParallelTodoWorktreeJournal(join(dir,"parallel-todo-worktrees.json"));
 const batchId=newParallelTodoWorktreeBatchId();
 await journal.reserve({identity:source,id:batchId,head:revision,parentDir:parent,bindings});
 const worktrees=await prepareParallelWorkerWorktrees({sourceRoot:source.projectId,parentDir:parent,
  expectedHead:revision,units,batchId,confirm:async()=>true});
 await journal.markPrepared({identity:source,id:batchId,allocations:worktrees.allocations});
 const sessions=new ParallelChildSessionJournal(join(dir,"parallel-worktree-sessions.json"),journal);
 const claims=new ParallelChildPlanClaimJournal(join(dir,"parallel-child-plan-claims.json"));
 const links=new TaskAgentLinkStore(join(dir,"task-agent-links.json"));
 const {store:agents}=await PersistentAgentStore.open(join(dir,"agents.json"));
 const children=[];
 for(let i=0;i<2;i++){
  const spec=specs[i],allocated=worktrees.allocations[i];
  const child={sessionId:"t07-test-child-"+randomUUID(),projectId:allocated.root};
  const bound=await sessions.attach({
   childSessionId:child.sessionId,childProjectId:child.projectId,confirm:async()=>true
  });
  assert.equal(bound.status,"attached");
  await claims.claim(bound.link);
  const requestId="asen-plan:child-"+spec.name+":worker";
  const created=await todos.addPlan([{
   title:"Hijo "+spec.name,description:"Estado de prueba "+spec.name,
   requestId,dependsOn:[],plan:plan(spec.file,child.projectId,"child-"+spec.name)
  }],child);
  const agentId=requestId.slice("asen-plan:".length);
  await links.bind({taskId:created[0].taskId,agentId,
   sessionId:child.sessionId,projectId:child.projectId,createdAt:new Date().toISOString()});
  await agents.queued({id:agentId,role:"worker",
   owner:{kind:"user",id:"pi:"+child.sessionId},
   sessionId:child.sessionId,projectId:child.projectId,createdAt:new Date().toISOString()});
  await agents.running(agentId);
  const observed=(await todos.list(child))[0];
  await todos.update(observed.taskId,child,observed.current.revision,"running");
  children.push({child,agentId,taskId:observed.taskId,allocated,spec});
 }
 report.childJournalsVerified=true;
 const opening=output.length;
 terminal.write("/asen-panel\r");
 await until(()=>plain(output.slice(opening)).includes("Worktree Workers: 2 active observed"),
  "Panel T07 con ambos hijos");
 report.initialRunningObserved=true;
 const refreshFrom=output.length;
 for(const state of children){
  writeFileSync(join(state.allocated.root,state.spec.file),"export const resultado=1;\n");
  // Un resultado COMPLETED exige un recibo irrepetible del Dispatcher real.
  // No fabricar tal recibo en un ensayo sin modelo: producir un fallo genuino
  // instrumentado y comprobar que T07 lo bloquea, nunca que lo acepta.
  await agents.failed(state.agentId,"Fallo controlado de prueba sin proveedor");
  const todo=(await todos.list(state.child)).find(item=>item.taskId===state.taskId);
  assert.ok(todo);
  await todos.update(todo.taskId,state.child,todo.current.revision,"blocked",
   "Fallo controlado de Worker en ensayo visual sin modelo");
 }
 await until(()=>plain(output.slice(refreshFrom)).includes("Worktree Workers: 0 active observed")&&
  plain(output.slice(refreshFrom)).includes("2 blocked"),
  "Actualización del panel Pi al bloquear ambos hijos",20000);
 report.terminalRefreshObserved=true;
 terminal.write("q");
 writeFileSync(shutdown,"1");
 const deadline=Date.now()+9000;
 while(!exited&&Date.now()<deadline)await sleep(150);
 assert.ok(exited,"No se cerró el proceso Pi tras la prueba");
 report.result="PASS_TUI_INSTRUMENTED_CHILDREN_ONLY";
}finally{
 try{writeFileSync(shutdown,"1");}catch{}
 if(!exited)try{terminal.kill();}catch{}
 const evidenceFile=process.env.ASEN_T07_NATIVE_TUI_REPORT;
 if(evidenceFile){
  mkdirSync(dirname(evidenceFile),{recursive:true});
  writeFileSync(evidenceFile,JSON.stringify(report,null,2)+"\n",{mode:0o600,flag:"wx"});
 }
 try{rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}
}
assert.equal(report.result,"PASS_TUI_INSTRUMENTED_CHILDREN_ONLY");
console.log(JSON.stringify({result:report.result,sha:expected,
 realPiTuiObserved:report.realPiTuiObserved,
 initialRunningObserved:report.initialRunningObserved,
 terminalRefreshObserved:report.terminalRefreshObserved,
 realNvidiaWriterObserved:false,globalFull:false}));
