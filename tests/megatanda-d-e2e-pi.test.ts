import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdir,mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {selectSkills} from "../src/skills/registry.js";
import {acceptIndependentReview} from "../src/runtime/lifecycle/review-acceptance.js";
import {loadReceiptSigningKey,createReviewReceiptSigned,writeReviewReceipt} from "../src/evidence/review-receipt.js";
import {ReceiptVerifierService} from "../src/evidence/receipt-verifier.js";

test("G49-D: Pi recorre dos tareas dependientes y exige recibo + consentimiento para aceptar el verificador",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-g49-d-")),root=join(home,"proyecto");
 await mkdir(root);await writeFile(join(root,"README.md"),"Base verificada\n");
 await writeFile(join(root,".gitignore"),".asen/\n");
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("add","README.md",".gitignore");
 git("-c","user.name=ASEN D","-c","user.email=asen@example.invalid","commit","-qm","Base de prueba");
 const sha=git("rev-parse","HEAD"),tree=git("rev-parse","HEAD^{tree}");
 const identity={sessionId:"sesion-e2e-d",projectId:root};
 const todos=await SessionTodoStore.open(join(home,"todos.json"));
 const links=new TaskAgentLinkStore(join(home,".asen","task-agent-links.json"));
 const requests:Array<{role:string;model?:string;id:string}>=[];
 const verdict=JSON.stringify({verdict:"pass",evidence:["Comprobación de pruebas en el SHA","Ámbito exacto examinado"]});
 const agents=await AgentRuntime.open({storeFile:join(home,"agents.json"),runner:{
  run:async(request:{role:string;id:string;model?:string})=>{
   requests.push({role:request.role,id:request.id,...(request.model?{model:request.model}:{})});
   return {id:request.id,ok:true,output:request.role==="verifier"?verdict:"Investigación concluida sin escritura"};
  }
 } as never});
 const events=new Map<string,Array<(event:any,context:any)=>unknown>>();
 const tools=new Map<string,any>();let approvals=0;
 const context:any={cwd:root,mode:"rpc",hasUI:true,
  sessionManager:{getSessionId:()=>identity.sessionId,getEntries:()=>[]},
  ui:{notify(){},setWidget(){},setStatus(){},confirm:async()=>{approvals++;return true;}}
 };
 const pi={
  registerTool(tool:any){tools.set(tool.name,tool);},registerCommand(){},
  on(name:string,handler:(event:any,ctx:any)=>unknown){events.set(name,[...(events.get(name)??[]),handler]);}
 };
 createAsenExtension({
  homeDir:()=>home,agentRuntimeFactory:()=>Promise.resolve(agents),
  todoStoreFactory:()=>Promise.resolve(todos),
  autoAdvancePlans:false,enableMemoryRuntime:false,enableWorkspaceRuntime:false
 })(pi as any);
 t.after(async()=>{
  try{for(const handler of events.get("session_shutdown")??[])await handler({},context);}
  finally{await rm(home,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 for(const handler of events.get("session_start")??[])await handler({reason:"new"},context);
 const explorer="asen-plan:g49-d:explorer",verification="asen-plan:g49-d:verifier";
 const read={phase:"explore"} as const,verify={phase:"verify"} as const;
 const [first,second]=await todos.addPlan([
  {requestId:explorer,title:"Inspección de dependencia",dependsOn:[],description:"Leer el contexto ya aprobado",
   plan:{role:"explorer",priority:1,skillSelection:read,skillPaths:selectSkills(read).map(s=>s.path)}},
  {requestId:verification,title:"Comprobación independiente",dependsOn:[explorer],
   description:"Validar el trabajo sin escritura",
   plan:{role:"verifier",priority:2,skillSelection:verify,skillPaths:selectSkills(verify).map(s=>s.path),
    candidateRevision:sha}},
 ],identity);
 assert.ok(first&&second);
 const invoke=async()=>tools.get("asen_plan_dispatch_next").execute(
  "g49-d-ejecutar",{},new AbortController().signal,()=>{},context
 );
 const waitState=async(id:string,expected:string)=>{
  for(let i=0;i<250;i++){
   const row=(await todos.list(identity)).find(x=>x.taskId===id);
   if(row?.current.state===expected)return row;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail("El Todo no llegó al estado "+expected);
 };
 const start=await invoke();assert.equal(start.details.status,"dispatched");
 assert.equal(start.details.role,"explorer");
 await waitState(first.taskId,"done");
 const pending=(await todos.list(identity)).find(x=>x.taskId===second.taskId);
 assert.equal(pending?.current.state,"planned");
 const review=await invoke();assert.equal(review.details.status,"dispatched");assert.equal(review.details.role,"verifier");
 await waitState(second.taskId,"blocked");
 assert.deepEqual(requests.map(x=>x.role),["explorer","verifier"]);
 assert.equal(approvals,0,"las lecturas no necesitan autorización de escritura");
 assert.equal((await agents.list(identity)).filter(x=>x.state==="completed").length,2);
 const accept=(confirm:Parameters<typeof acceptIndependentReview>[0]["confirm"],withReceipt:boolean)=>acceptIndependentReview({
  todos,agents,links,identity,taskId:second.taskId,
  validateIdentity:async()=>{},confirm,
  ...(withReceipt?{receipts:new ReceiptVerifierService(join(home,"recibos"))}:{})
 });
 let requested=0;
 const absent=await accept(async()=>{requested++;return true;},false);
 assert.equal(absent.status,"blocked");assert.equal(requested,0,"sin recibo firmado no se pide aceptar");
 const key=await loadReceiptSigningKey(join(home,"recibos"));
 await writeReviewReceipt(join(home,"recibos"),createReviewReceiptSigned({
  commitSha:sha,treeSha:tree,oddTask:"odd/tasks/megatanda-d.md",
  testSuite:{total:2,passed:2,failed:0,durationMs:1,runner:"node --test"},
  verdict:"PASSED"
 },key));
 const rejected=await accept(async()=>{requested++;return false;},true);
 assert.equal(rejected.status,"blocked");assert.equal(requested,1,rejected.status==="blocked"?rejected.reason:"unexpected acceptance");
 assert.equal((await todos.list(identity)).find(x=>x.taskId===second.taskId)?.current.state,"blocked");
 const approved=await accept(async details=>{
  requested++;assert.equal(details.candidateRevision,sha);
  assert.equal(details.role,"verifier");
  assert.equal(details.verification.mode,"signed-receipt");return true;
 },true);
 assert.deepEqual(approved,{status:"accepted",taskId:second.taskId,role:"verifier"});
 assert.equal(requested,2);
 assert.equal((await todos.list(identity)).find(x=>x.taskId===second.taskId)?.current.state,"done");
 const duplicate=await accept(async()=>{throw Error("No pedir permiso dos veces");},true);
 assert.equal(duplicate.status,"blocked");
 assert.equal(requests.length,2,"ningún proceso se ejecuta de nuevo por aceptar el resultado");
});
