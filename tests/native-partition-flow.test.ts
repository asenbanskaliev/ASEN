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
import {bindNativeRunnerModels,captureNativeWriterBaseline,captureNativeWriterCompletionAsync} from "../src/runtime/agents/native-writer-completion.js";
import {reviewNativeIntegratedCandidate,reviewNativePartitionWithTests,acceptNativeIntegration,verifyNativeIntegrationAcceptance} from "../src/runtime/lifecycle/native-integration-review.js";
import {persistNativePartitionSuccessor} from "../src/runtime/lifecycle/native-integration-successor.js";
import {JudgmentFixProposalJournal} from "../src/review/judgment-fix-proposal-journal.js";
import {ReceiptVerifierService} from "../src/evidence/receipt-verifier.js";
import {createReviewReceiptSigned,loadReceiptSigningKey,writeReviewReceipt} from "../src/evidence/review-receipt.js";
import type {PiReviewRegistry} from "../src/review/pi-model-reviewer.js";
import {readFrozenIntegrationReviewEvidence} from "../src/review/workspace-review-session.js";
import {reconcileNativeChildTerminal} from "../src/runtime/agents/parallel-native-child-terminal.js";

for(const mode of ["approved","declined","changed","child-declined"] as const)test("ODD nativo 2+1: "+mode+" (Runner simulado; no NVIDIA)",async()=>{
 const base=await realpath(await mkdtemp(join(tmpdir(),"asen-native-odd-"))),project=join(base,"repo"),home=join(base,"home"),privateDir=join(home,".asen");
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:isolatedGitEnvironment()}).trim();
 let launched=0,partialObserved=false;
 let releaseSibling:()=>void=()=>{};
 const siblingGate=new Promise<void>(resolve=>{releaseSibling=resolve;});
 const terminalWork:Promise<unknown>[]=[];
const terminalErrors:unknown[]=[];
 try{
  await mkdir(project);await mkdir(privateDir,{recursive:true,mode:0o700});
  git("init","-q","-b","prueba-integracion");git("config","core.autocrlf","true");git("config","user.name","ASEN prueba");git("config","user.email","test@example.invalid");
  for(const name of ["a.txt","b.txt","c.txt"])await writeFile(join(project,name),"original");
  await writeFile(join(project,"sin-cambios.txt"),"texto sin cambios\nsegunda línea\n");
  git("add",".");git("commit","-qm","base");
  await rm(join(project,"sin-cambios.txt"));git("checkout","--","sin-cambios.txt");
  assert.equal(await readFile(join(project,"sin-cambios.txt"),"utf8"),"texto sin cambios\r\nsegunda línea\r\n");
  git("branch","main");
  await writeFile(join(privateDir,"profiles.json"),JSON.stringify({schema:"asen.runtime-profiles/v1",active:"ensayo",profiles:[{name:"ensayo",mode:"full-delegation",routes:{worker:{model:"nvidia/modelo-simulado"}}}]}));
  const todos=await SessionTodoStore.openProjectScoped(join(privateDir,"todos"),join(privateDir,"todos.json"));
  const runner:AgentRunner={run:async request=>{
   launched++;
   assert.equal(request.role,"worker");assert.equal(request.writeSurfaces?.length,1);
   assert.ok(["a.txt","b.txt"].includes(request.writeSurfaces![0]!));
   if(mode==="approved"&&request.writeSurfaces![0]==="b.txt"){
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([siblingGate,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("No se guardó el recibo parcial de A")),15000);})]);}
    finally{if(timer)clearTimeout(timer);}
   }
   // Simulación explícita: el agente no es un proceso Pi ni evidencia de proveedor.
   await writeFile(join(request.repository,request.writeSurfaces![0]!),"resultado");
   const result={id:request.id,ok:true,output:"Resultado simulado y acotado; comprobación real pendiente"};
   // Solo prueba del mecanismo de persistencia; no es evidencia de uso NVIDIA.
   bindNativeRunnerModels(result,["nvidia/modelo-simulado"]);return result;
  }};
  const agents=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner,maxConcurrency:2});
  const links=new TaskAgentLinkStore(join(privateDir,"task-agent-links.json"));
  const sourceJournal=new ParallelTodoWorktreeJournal(join(privateDir,"parallel-todo-worktrees.json"));
  const sessionJournal=new ParallelChildSessionJournal(join(privateDir,"parallel-worktree-sessions.json"),sourceJournal);
  const claims=new ParallelChildPlanClaimJournal(join(privateDir,"parallel-child-plan-claims.json"));
  const observations=new ParallelWorkerObservationJournal(join(privateDir,"parallel-worker-observations.json"));
  agents.subscribeTerminal(record=>{terminalWork.push((async()=>{
   const owned={sessionId:record.sessionId,projectId:record.projectId};
   const row=(await todos.list(owned)).find(item=>item.plan?.role==="worker");
   const first=mode==="approved"&&record.state==="completed"&&row?.plan?.writeSurfaces?.[0]==="a.txt";
   try{
    // El resultado ya quedó firmado en AgentStore. Restaurar el archivo
    // antes de recoger el recibo no debe sustituir ese árbol inmutable.
    if(first)await writeFile(join(record.projectId,"a.txt"),"original");
    const receipt=await reconcileNativeChildTerminal({record,todos,agents,links,sourceJournal,sessionJournal,claims,observations});
    if(first){assert.ok(receipt?.partial);assert.equal(receipt.observed,1);partialObserved=true;}
   }finally{if(first)releaseSibling();}
  })().catch(error=>{terminalErrors.push(error);releaseSibling();}));});
  const parent=SessionManager.create(project,join(base,"parent-sessions"));
  parent.appendMessage({role:"user",content:"Prueba local sin modelos",timestamp:Date.now()});
  const identity={sessionId:parent.getSessionId(),projectId:project};
  const tools=new Map<string,any>(),commands=new Map<string,any>(),dialogs:string[]=[];
  createAsenExtension({homeDir:()=>home,agentRuntimeFactory:async()=>agents,todoStoreFactory:async()=>todos,
   enableWorkspaceRuntime:false,enableMemoryRuntime:false,enableTodoRuntime:false,deferSessionStart:true})({
   registerCommand(name,command){commands.set(name,command);},registerTool(tool){tools.set(tool.name,tool);},on(){}
  });
  const context={cwd:project,mode:"tui",hasUI:true,sessionManager:parent,isIdle:()=>true,ui:{
   notify(){},confirm:async(title:string,message:string)=>{
    dialogs.push(title);
    if(mode==="child-declined"&&title==="Preparar sesiones hijas Pi sin iniciar modelos?"&&dialogs.length===2)return false;
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
  if(mode==="child-declined"){
   assert.equal(detail.childPreparation.status,"declined");
   assert.equal(launched,0);
   assert.equal((await sessionJournal.listSource(identity)).length,0);
   const batch=detail.worktreePreparation.batchId;
   const resumed=await commands.get("asen-worktrees").handler("prepare-native "+batch,context);
   assert.equal(resumed.status,"prepared");assert.equal(resumed.children.length,2);
   assert.equal(launched,0);
   const replay=await commands.get("asen-worktrees").handler("prepare-native "+batch,context);
   assert.equal(replay.status,"blocked");assert.equal(launched,0);
   return;
  }
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
   const durable=await observations.listSource(identity,await sessionJournal.listSource(identity));
   assert.equal(durable.length,2);assert.equal(partialObserved,true);
   const first=durable.find(row=>row.changedPaths.includes("a.txt"));
   assert.ok(first?.candidateTree);assert.equal(first.currentWorktree?.status,"clean");
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
   for(const child of children){
    assert.equal((await todos.list(child))[0]?.current.state,"succeeded");
    const records=await agents.list(child);
    const completion=(await agents.query(records[0]!.id,child))?.nativeCompletion;
    assert.ok(completion?.candidateTree);assert.deepEqual(completion.authorModelsObserved,["nvidia/modelo-simulado"]);
   }
   const reopened=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner,maxConcurrency:2});
   for(const child of children){const record=(await reopened.list(child))[0]!;assert.deepEqual((await reopened.query(record.id,child))?.nativeCompletion?.authorModelsObserved,["nvidia/modelo-simulado"]);}
   // Una edición posterior al fin de A nunca sustituye el objeto autenticado.
   await writeFile(join(children[0]!.projectId,(await todos.list(children[0]!))[0]!.plan!.writeSurfaces![0]!),"edición posterior");
   assert.equal((await buildNativeIntegrationCandidate(input)).commit,candidate.commit);
   assert.deepEqual(candidate.authorModelsObserved,["nvidia/modelo-simulado"]);
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
  if(mode==="approved"){
   const batch=(await sourceJournal.list(identity)).at(-1)!;
   const candidate=await buildNativeIntegrationCandidate({identity,batchId:batch.id,sourceJournal,sessionJournal,observations});
   // Jueces simulados: ejercicio de contratos, no prueba independiente real.
   let judgeCalls=0;
   const registry:PiReviewRegistry={getAvailable:()=>[{provider:"nvidia",id:"modelo-simulado"},{provider:"prueba",id:"juez-a"},{provider:"prueba",id:"juez-b"}],
    hasConfiguredAuth:()=>true,async *streamSimple(model){judgeCalls++;yield {type:"done",reason:"stop",message:{provider:model.provider,model:model.id,content:[{type:"text",text:JSON.stringify({verdict:"pass",summary:"Resultado de prueba sintética",findings:[]})}]}};}};
   const result=await reviewNativeIntegratedCandidate({candidate,sessionId:identity.sessionId,registry,
    judgeA:{model:"prueba/juez-a"},judgeB:{model:"prueba/juez-b"},fixJournal:new JudgmentFixProposalJournal(join(privateDir,"fixes.json")),
    requirements:"A y B deben contener resultado; C se conserva.",validate:async()=>{},confirm:async()=>true});
   assert.equal(result.status,"analysis-complete");assert.equal(judgeCalls,2);
   if(!("report" in result)||!result.report)assert.fail("Informe de dos jueces ausente");
   const receiptsDir=join(privateDir,"receipts"),receipts=new ReceiptVerifierService(receiptsDir);
   const proof={candidate,report:result.report,receipts,sessionId:identity.sessionId};
   await assert.rejects(()=>verifyNativeIntegrationAcceptance(proof),/receipt/u);
   const proportional={candidate,sessionId:identity.sessionId,todos,receipts,validate:async()=>{},confirm:async()=>true};
   await assert.rejects(()=>reviewNativePartitionWithTests(proportional),/receipt/u);
   // Las aserciones de los objetos Git anteriores son verificaciones reales
   // de este repositorio sintético, firmadas únicamente dentro de la prueba.
   await writeReviewReceipt(receiptsDir,createReviewReceiptSigned({commitSha:candidate.commit,treeSha:candidate.tree,
    oddTask:"odd/tasks/continuacion-local-flujo-de-agentes.md",testSuite:{total:3,passed:3,failed:0,durationMs:0,runner:"node:test fixture"},
    verdict:"PASSED"},await loadReceiptSigningKey(receiptsDir)));
   assert.equal((await reviewNativePartitionWithTests({...proportional,confirm:async()=>false})).status,"declined");
   const altered={list:async()=> (await todos.list(identity)).map(row=>row.taskId===candidate.sourceTodoIds[0]?{...row,current:{...row.current,revision:row.current.revision+1}}:row)};
   await assert.rejects(()=>reviewNativePartitionWithTests({...proportional,todos:altered}),/raíz ODD original cambió/u);
   const joint=await reviewNativePartitionWithTests(proportional);
   assert.equal(joint.status,"joint-tests-reviewed");
   if(!("report" in joint)||!joint.report)assert.fail("Sin revisión proporcional");
   assert.equal(joint.report.modelCalls,0);
   assert.equal(joint.report.independentReview,false);
   const jointProof={...proof,report:joint.report};
   assert.equal((await verifyNativeIntegrationAcceptance(jointProof)).reviewMode,"joint-tests");
   await assert.rejects(()=>verifyNativeIntegrationAcceptance({...jointProof,report:{...joint.report}}),/no fue emitida/u);
   await assert.rejects(()=>verifyNativeIntegrationAcceptance({...jointProof,sessionId:"otra-sesion"}),/no fue emitida/u);
   await assert.rejects(()=>acceptNativeIntegration({...proof,validate:async()=>{},confirm:async()=>{git("switch","main");return true;}}),/rama/u);
   assert.equal(git("rev-parse","refs/heads/main"),candidate.baseCommit);
   assert.equal(git("rev-parse","refs/heads/prueba-integracion"),candidate.baseCommit);
   git("switch","prueba-integracion");
   const lock=join(project,".git","refs","heads","prueba-integracion.lock");
   await writeFile(lock,"bloqueo de prueba",{flag:"wx"});
   try{await assert.rejects(()=>acceptNativeIntegration({...proof,validate:async()=>{},confirm:async()=>true}));}
   finally{await rm(lock,{force:true});}
   assert.equal(git("rev-parse","HEAD"),candidate.baseCommit);
   assert.equal(git("write-tree"),candidate.tree);
   await writeFile(join(project,"a.txt"),"edición ajena");
   await assert.rejects(()=>acceptNativeIntegration({...proof,validate:async()=>{},confirm:async()=>true}),/limpio/u);
   await writeFile(join(project,"a.txt"),"resultado");
   const accepted=await acceptNativeIntegration({...jointProof,validate:async()=>{},confirm:async()=>true});
   assert.ok(accepted);assert.equal(git("rev-parse","HEAD"),candidate.commit);
   assert.equal(git("rev-parse","refs/heads/main"),candidate.baseCommit);
   assert.equal(git("show",candidate.commit+":sin-cambios.txt"),"texto sin cambios\nsegunda línea");
   assert.equal(await readFile(join(project,"sin-cambios.txt"),"utf8"),"texto sin cambios\r\nsegunda línea\r\n");
   // Fallo después de guardar el reemplazo pero antes de cerrar sus raíces.
   let verifications=0;
   await assert.rejects(()=>persistNativePartitionSuccessor({candidate,accepted,identity,todos,profiles:{},
    validate:async()=>{},verify:async()=>{await verifyNativeIntegrationAcceptance(jointProof);if(++verifications===3)throw Error("interrupción simulada");}}),/interrupción simulada/u);
   const savedBefore=(await todos.list(identity)).find(row=>row.requestId?.startsWith("asen-plan:continuation-")&&row.plan?.role==="worker");
   assert.ok(savedBefore);
   assert.equal(JSON.parse(savedBefore.plan!.writerAuthorizationBasis!).review.kind,"none");
   assert.equal((await todos.list(identity)).filter(row=>row.requestId?.startsWith("asen-plan:continuation-")).length,1);
   const successor=await persistNativePartitionSuccessor({candidate,accepted,identity,todos,profiles:{global:{schema:"asen.runtime-profiles/v1",active:"cambiado",profiles:[{name:"cambiado",mode:"full-delegation",routes:{worker:{model:"nvidia/otro-modelo",thinking:"minimal"}}}]}},
    validate:async()=>{},verify:async()=>{await verifyNativeIntegrationAcceptance(jointProof);}});
   if(successor.status==="successor-ready")assert.equal(successor.todoId,savedBefore.taskId);
   assert.equal(successor.status,"successor-ready");
   const finalRows=await todos.list(identity);
   assert.equal(finalRows.filter(row=>candidate.sourceTodoIds.includes(row.taskId)&&row.current.state==="done").length,2);
   assert.equal(finalRows.find(row=>row.taskId===rows.find(item=>item.dependsOn?.length===2)!.taskId)?.current.state,"cancelled");
   assert.equal(finalRows.find(row=>row.requestId?.startsWith("asen-plan:continuation-")&&row.plan?.role==="worker")?.plan?.candidate?.revision,candidate.commit);
  }
 }finally{await Promise.allSettled(terminalWork);await rm(base,{recursive:true,force:true});}
});

test("El resultado nativo aislado excluye ignorados anteriores y conserva ignorados nuevos del ámbito",async()=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),"asen-ignored-writer-")));
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",env:isolatedGitEnvironment(),stdio:["ignore","pipe","pipe"]}).trim();
 try{
  git("init","-q");git("config","user.name","ASEN");git("config","user.email","test@example.invalid");
  await writeFile(join(project,".gitignore"),"*.cache\n");
  git("add",".gitignore");git("commit","--no-gpg-sign","-qm","base");
  await writeFile(join(project,"existente.cache"),"no pertenece al Writer");
  const request={id:"unit-"+"a".repeat(40)+":worker",role:"worker" as const,repository:project,prompt:"Prueba",
   candidate:{id:"fixture",repository:project,revision:git("rev-parse","HEAD"),createdAt:new Date().toISOString()},writeSurfaces:["nuevo.cache"]};
  const baseline=await captureNativeWriterBaseline(request);
  assert.deepEqual(baseline,["existente.cache"]);
  await assert.rejects(()=>captureNativeWriterBaseline({...request,writeSurfaces:["existente.cache"]}),/ignorados preexistentes/u);
  await writeFile(join(project,"nuevo.cache"),"nuevo resultado");
  const result={};bindNativeRunnerModels(result,["nvidia/modelo-simulado"]);
  const completion=await captureNativeWriterCompletionAsync(request,result,baseline,new AbortController().signal);
  assert.deepEqual(completion?.paths,["nuevo.cache"]);assert.equal(git("show",completion!.candidateTree+":nuevo.cache"),"nuevo resultado");
  await writeFile(join(project,"ajeno.cache"),"fuera del ámbito");
  assert.equal(await captureNativeWriterCompletionAsync(request,result,baseline,new AbortController().signal),undefined);
 }finally{await rm(project,{recursive:true,force:true});}
});
