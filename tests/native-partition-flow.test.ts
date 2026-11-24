import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {SessionManager} from "@earendil-works/pi-coding-agent";
import {isolatedGitEnvironment} from "../src/runtime/agents/git-isolated-environment.js";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRunner} from "../src/agents/dispatcher.js";
import {SessionTodoStore} from "../src/runtime/lifecycle/todo-store.js";
import {TaskAgentLinkStore} from "../src/runtime/agents/task-agent-link-store.js";
import {ParallelTodoWorktreeJournal} from "../src/runtime/agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../src/runtime/agents/parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "../src/runtime/agents/parallel-child-plan-claims.js";
import {ParallelWorkerObservationJournal} from "../src/runtime/agents/parallel-worker-observation-journal.js";
import {buildNativeIntegrationCandidate} from "../src/runtime/agents/parallel-native-integration.js";
import {readFrozenIntegrationReviewEvidence} from "../src/review/workspace-review-session.js";
import {reconcileNativeChildTerminal} from "../src/runtime/agents/parallel-native-child-terminal.js";

for(const mode of ["approved","declined","changed"] as const)test("ODD nativo 2+1: "+mode+" (Runner simulado; no NVIDIA)",async()=>{
 const base=await realpath(await mkdtemp(join(tmpdir(),"asen-native-odd-"))),project=join(base,"repo"),home=join(base,"home"),privateDir=join(home,".asen");
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:isolatedGitEnvironment()}).trim();
 let launched=0;
 const terminalWork:Promise<unknown>[]=[];
const terminalErrors:unknown[]=[];
 try{
  await mkdir(project);await mkdir(privateDir,{recursive:true,mode:0o700});
  git("init","-q");git("config","user.name","ASEN prueba");git("config","user.email","test@example.invalid");
  for(const name of ["a.txt","b.txt","c.txt"])await writeFile(join(project,name),"original");
  git("add",".");git("commit","-qm","base");
  await writeFile(join(privateDir,"profiles.json"),JSON.stringify({schema:"asen.runtime-profiles/v1",active:"ensayo",profiles:[{name:"ensayo",mode:"full-delegation",routes:{worker:{model:"nvidia/modelo-simulado"}}}]}));
  const todos=await SessionTodoStore.openProjectScoped(join(privateDir,"todos"),join(privateDir,"todos.json"));
  const runner:AgentRunner={run:async request=>{
   launched++;
   assert.equal(request.role,"worker");assert.equal(request.writeSurfaces?.length,1);
   assert.ok(["a.txt","b.txt"].includes(request.writeSurfaces![0]!));
   // Simulación explícita: el agente no es un proceso Pi ni evidencia de proveedor.
   await writeFile(join(request.repository,request.writeSurfaces![0]!),"resultado");
   return {id:request.id,ok:true,output:"Resultado simulado y acotado; comprobación real pendiente"};
  }};
  const agents=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner,maxConcurrency:2});
  const links=new TaskAgentLinkStore(join(privateDir,"task-agent-links.json"));
  const sourceJournal=new ParallelTodoWorktreeJournal(join(privateDir,"parallel-todo-worktrees.json"));
  const sessionJournal=new ParallelChildSessionJournal(join(privateDir,"parallel-worktree-sessions.json"),sourceJournal);
  const claims=new ParallelChildPlanClaimJournal(join(privateDir,"parallel-child-plan-claims.json"));
  const observations=new ParallelWorkerObservationJournal(join(privateDir,"parallel-worker-observations.json"));
  agents.subscribeTerminal(record=>{terminalWork.push(reconcileNativeChildTerminal({record,todos,agents,links,sourceJournal,sessionJournal,claims,observations}).catch(error=>{terminalErrors.push(error);}));});
  const parent=SessionManager.create(project,join(base,"parent-sessions"));
  parent.appendMessage({role:"user",content:"Prueba local sin modelos",timestamp:Date.now()});
  const identity={sessionId:parent.getSessionId(),projectId:project};
  const tools=new Map<string,any>(),dialogs:string[]=[];
  createAsenExtension({homeDir:()=>home,agentRuntimeFactory:async()=>agents,todoStoreFactory:async()=>todos,
   enableWorkspaceRuntime:false,enableMemoryRuntime:false,enableTodoRuntime:false,deferSessionStart:true})({
   registerCommand(){},registerTool(tool){tools.set(tool.name,tool);},on(){}
  });
  const context={cwd:project,mode:"tui",hasUI:true,sessionManager:parent,isIdle:()=>true,ui:{
   notify(){},confirm:async(title:string,message:string)=>{
    dialogs.push(title);
    if(title==="Autorizar las dos escrituras ODD exactas de este lote?"){
     assert.match(message,/a\.txt/u);assert.match(message,/b\.txt/u);
     assert.match(message,/Instrucción íntegra/u);assert.match(message,/Caduca en cinco minutos/u);
     if(mode==="changed"){
      const sessions=await sessionJournal.listSource(identity);
      await rm(sessions[0]!.nativeSessionFile!);
     }
     return mode!=="declined";
    }
    return true;
   }
  }};
  const params={instruction:"Completar dos archivos y después la integración",intent:"implementation",
   scope:{kind:"known",expectedPaths:["a.txt","b.txt","c.txt"]},
   writes:["a.txt","b.txt","c.txt"].map(path=>({path,changeKind:"documentation"})),
   riskOperations:[],session:{estimatedMinutes:120,continuation:false},testing:{kind:"required"},
   review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[],taskUnits:[
    {id:"a",objective:"Preparar A",estimatedMinutes:40,dependsOn:[],writePaths:["a.txt"]},
    {id:"b",objective:"Preparar B",estimatedMinutes:40,dependsOn:[],writePaths:["b.txt"]},
    {id:"c",objective:"Integración",estimatedMinutes:40,dependsOn:["a","b"],writePaths:["c.txt"]}
   ]};
  const result=await tools.get("asen_plan_request").execute("call",params,undefined,undefined,context);
  const detail=result.details;
  assert.equal(detail.persistence.status,"saved");
  assert.equal(detail.worktreePreparation.status,"prepared");
  assert.equal(detail.childPreparation.status,"prepared");
  const children=detail.childPreparation.children as Array<{sessionId:string;projectId:string;sessionFile:string;childTodoId:string}>;
  assert.equal(children.length,2);
  assert.equal(dialogs.length,3);
  assert.equal(new Set(children.map(child=>child.sessionId)).size,2);
  for(const child of children){
   if(mode==="changed"&&child.sessionFile===(await sessionJournal.listSource(identity))[0]!.nativeSessionFile)continue;
   assert.equal(SessionManager.open(child.sessionFile).getSessionId(),child.sessionId);
   assert.equal(SessionManager.open(child.sessionFile).getCwd(),child.projectId);
  }
  if(mode==="approved"){
   assert.equal(detail.supervisedLaunch.status,"started");
   assert.equal(detail.supervisedLaunch.started.length,2);
   for(let i=0;i<200;i++){
    const states=(await Promise.all(children.map(child=>agents.list(child)))).flat();
    if(terminalWork.length===2&&states.length===2&&states.every(state=>state.state==="completed"||state.state==="failed"))break;
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   await Promise.all(terminalWork);
   assert.equal(terminalErrors.length,0);
   assert.equal(launched,2);
   assert.equal((await observations.listSource(identity,await sessionJournal.listSource(identity))).length,2);
   const batch=(await sourceJournal.list(identity)).at(-1)!;
   const input={identity,batchId:batch.id,sourceJournal,sessionJournal,observations};
   const candidate=await buildNativeIntegrationCandidate(input);
   assert.deepEqual(candidate.paths,["a.txt","b.txt"]);
   assert.equal(git("show",candidate.commit+":a.txt"),"resultado");
   assert.equal(git("show",candidate.commit+":b.txt"),"resultado");
   assert.equal(git("show",candidate.commit+":c.txt"),"original");
   assert.equal((await buildNativeIntegrationCandidate(input)).commit,candidate.commit);
   assert.equal(git("rev-parse","HEAD"),candidate.baseCommit);
   const evidence=readFrozenIntegrationReviewEvidence(candidate,identity.sessionId,"pi-model:prueba/revisor",base);
   assert.equal(evidence.candidate.treeIdentity,candidate.tree);
   assert.deepEqual(evidence.modifiedFiles.map(file=>file.path).sort(),["a.txt","b.txt"]);
   for(const child of children)assert.equal((await todos.list(child))[0]?.current.state,"succeeded");
  }else{
   assert.equal(launched,0);
   assert.ok(["declined","blocked"].includes(detail.supervisedLaunch?.status));
   assert.equal((await observations.listSource(identity,await sessionJournal.listSource(identity))).length,0);
  }
  const rows=await todos.list(identity);
  assert.equal(rows.length,3);
  assert.equal(rows.find(row=>row.dependsOn?.length===2)?.current.state,"planned");
  assert.equal(await readFile(join(project,"a.txt"),"utf8"),"original");
  assert.equal(await readFile(join(project,"b.txt"),"utf8"),"original");
  assert.equal(git("status","--porcelain"),"");
 }finally{await Promise.allSettled(terminalWork);await rm(base,{recursive:true,force:true});}
});
