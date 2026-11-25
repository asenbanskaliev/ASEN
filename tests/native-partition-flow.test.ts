import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
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
import {testNativeIntegrationCandidate} from "../src/runtime/lifecycle/native-integration-tests.js";
import {persistNativePartitionSuccessor,inspectCompletedNativePartition} from "../src/runtime/lifecycle/native-integration-successor.js";
import {parsePartitionUnitBasis,materializeHistoricalIntegratedSuccessor} from "../src/runtime/lifecycle/odd-unit-plan.js";
import {createHash} from "node:crypto";
import {JudgmentFixProposalJournal} from "../src/review/judgment-fix-proposal-journal.js";
import {ReceiptVerifierService} from "../src/evidence/receipt-verifier.js";
import type {PiReviewRegistry} from "../src/review/pi-model-reviewer.js";
import {readFrozenIntegrationReviewEvidence} from "../src/review/workspace-review-session.js";
import {reconcileNativeChildTerminal} from "../src/runtime/agents/parallel-native-child-terminal.js";
import {dispatchNextPlanTask} from "../src/runtime/lifecycle/plan-dispatcher.js";
import {TaskAgentTodoReconciler} from "../src/runtime/agents/task-agent-reconciler.js";

for(const mode of ["approved","approved-legacy","declined","changed","child-declined"] as const)test("ODD nativo 2+1: "+mode+" (Runner simulado; no NVIDIA)",async()=>{
 const base=await realpath(await mkdtemp(join(tmpdir(),"asen-native-odd-"))),project=join(base,"repo"),home=join(base,"home"),privateDir=join(home,".asen");
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:isolatedGitEnvironment()}).trim();
 let launched=0,partialObserved=false;
 let releaseSibling:()=>void=()=>{};
 const siblingGate=new Promise<void>(resolve=>{releaseSibling=resolve;});
 const terminalWork:Promise<unknown>[]=[];
const terminalErrors:unknown[]=[];
 let terminalCount=0,resolveTerminals:()=>void=()=>{};
 const terminalBarrier=new Promise<void>(resolve=>{resolveTerminals=resolve;});
 let cleanupAgents:AgentRuntime|undefined;
 let cleanupChildren:readonly {sessionId:string;projectId:string}[]=[];
 let expectedTerminals=0;
 try{
  await mkdir(project);await mkdir(privateDir,{recursive:true,mode:0o700});
  git("init","-q","-b","prueba-integracion");git("config","core.autocrlf","true");git("config","user.name","ASEN prueba");git("config","user.email","test@example.invalid");
  for(const name of ["a.txt","b.txt","c.txt"])await writeFile(join(project,name),"original");
  await writeFile(join(project,"sin-cambios.txt"),"texto sin cambios\nsegunda línea\n");
  await writeFile(join(project,"conjuntas.test.mjs"),"import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; test('A y B combinados',()=>{assert.equal(readFileSync('a.txt','utf8'),'resultado');assert.equal(readFileSync('b.txt','utf8'),'resultado');}); test('C intacto',()=>assert.equal(readFileSync('c.txt','utf8'),'original'));");
  await writeFile(join(project,"fallo.test.mjs"),"import test from 'node:test'; import assert from 'node:assert/strict'; test('fallo deliberado',()=>assert.fail('prueba negativa'));");
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
   if((mode==="approved"||mode==="approved-legacy")&&request.writeSurfaces![0]==="b.txt"){
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
  cleanupAgents=agents;
  const links=new TaskAgentLinkStore(join(privateDir,"task-agent-links.json"));
  const sourceJournal=new ParallelTodoWorktreeJournal(join(privateDir,"parallel-todo-worktrees.json"));
  const sessionJournal=new ParallelChildSessionJournal(join(privateDir,"parallel-worktree-sessions.json"),sourceJournal);
  const claims=new ParallelChildPlanClaimJournal(join(privateDir,"parallel-child-plan-claims.json"));
  const observations=new ParallelWorkerObservationJournal(join(privateDir,"parallel-worker-observations.json"));
  agents.subscribeTerminal(record=>{terminalWork.push((async()=>{
   const owned={sessionId:record.sessionId,projectId:record.projectId};
   const row=(await todos.list(owned)).find(item=>item.plan?.role==="worker");
   const first=(mode==="approved"||mode==="approved-legacy")&&record.state==="completed"&&row?.plan?.writeSurfaces?.[0]==="a.txt";
   try{
    // El resultado ya quedó firmado en AgentStore. Restaurar el archivo
    // antes de recoger el recibo no debe sustituir ese árbol inmutable.
    if(first)await writeFile(join(record.projectId,"a.txt"),"original");
    const receipt=await reconcileNativeChildTerminal({record,todos,agents,links,sourceJournal,sessionJournal,claims,observations});
    if(first){assert.ok(receipt?.partial);assert.equal(receipt.observed,1);partialObserved=true;}
   }finally{if(first)releaseSibling();}
  })().catch(error=>{terminalErrors.push(error);releaseSibling();}).finally(()=>{if(++terminalCount===2)resolveTerminals();}));});
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
  cleanupChildren=children;
  assert.equal(new Set(children.map(child=>child.sessionId)).size,2);
  for(const child of children){
   if(mode==="changed"&&child.sessionFile===(await sessionJournal.listSource(identity))[0]!.nativeSessionFile)continue;
   assert.equal(SessionManager.open(child.sessionFile).getSessionId(),child.sessionId);
   assert.equal(SessionManager.open(child.sessionFile).getCwd(),child.projectId);
  }
  if((mode==="approved"||mode==="approved-legacy")){
   assert.equal(detail.supervisedLaunch.status,"started");
   assert.equal(detail.supervisedLaunch.started.length,2);
   expectedTerminals=2;
   let terminalTimer:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([terminalBarrier,new Promise<never>((_,reject)=>{terminalTimer=setTimeout(()=>reject(Error("No llegaron los dos terminales nativos")),90000);})]);}
   finally{if(terminalTimer)clearTimeout(terminalTimer);}
   await Promise.all(terminalWork);
   assert.equal(terminalErrors.length,0);
   assert.equal(launched,2);
   const durable=await observations.listSource(identity,await sessionJournal.listSource(identity));
   assert.equal(durable.length,2);assert.equal(partialObserved,true);
   // Repetir la recogida con otro diario, sin volver a lanzar ningún Writer.
   // Si falla la lectura de un hijo, el recibo auténtico del otro debe persistir.
   for(const failedIndex of [0,1]){
    const recoveryObservations=new ParallelWorkerObservationJournal(join(privateDir,"observaciones-recuperacion-"+failedIndex+".json"));
    const okRecord=(await agents.list(children[1-failedIndex]!))[0]!;
    const failedRecord=(await agents.list(children[failedIndex]!))[0]!;
    const originalQuery=agents.query.bind(agents);
    agents.query=async (...args:Parameters<typeof agents.query>)=>{
     if(args[0]===failedRecord.id)throw Error("Lectura de finalización interrumpida");
     return originalQuery(...args);
    };
    const recoveryInput={record:okRecord,todos,agents,links,sourceJournal,sessionJournal,claims,observations:recoveryObservations};
    try{
     await assert.rejects(()=>reconcileNativeChildTerminal(recoveryInput),/No se pudieron recuperar todos los recibos nativos/u);
     const partial=await recoveryObservations.listSource(identity,await sessionJournal.listSource(identity));
     assert.equal(partial.length,1);
     assert.equal(partial[0]!.agentId,okRecord.id);
     assert.ok(partial[0]!.candidateTree);
    }finally{agents.query=originalQuery;}
    const recovered=await reconcileNativeChildTerminal(recoveryInput);
    assert.equal(recovered?.observed,2);
    const restored=await recoveryObservations.listSource(identity,await sessionJournal.listSource(identity));
    assert.equal(restored.length,2);
    assert.ok(restored.every(receipt=>receipt.candidateTree));
    assert.equal(launched,2);
   }
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
  if((mode==="approved"||mode==="approved-legacy")){
   const batch=(await sourceJournal.list(identity)).at(-1)!;
   const candidate=await buildNativeIntegrationCandidate({identity,batchId:batch.id,sourceJournal,sessionJournal,observations});
   // Jueces simulados: ejercicio de contratos, no prueba independiente real.
   let judgeCalls=0;
   const registry:PiReviewRegistry={getAvailable:()=>[{provider:"nvidia",id:"modelo-simulado"},{provider:"prueba",id:"juez-a"},{provider:"prueba",id:"juez-b"}],
    hasConfiguredAuth:()=>true,async *streamSimple(model){judgeCalls++;yield {type:"done",reason:"stop",message:{provider:model.provider,model:model.id,content:[{type:"text",text:JSON.stringify({verdict:"pass",summary:"Resultado de prueba sintética",findings:[]})}]}};}};
   // C2: uno o dos modelos totales (incluido el autor) no permiten dos jueces independientes.
   // No se solicita consentimiento ni se llama al transporte si falta independencia.
   for(const count of [1,2]){
    let confirmations=0;
    const restricted:PiReviewRegistry={...registry,getAvailable:()=>registry.getAvailable().slice(0,count)};
    const blocked=await reviewNativeIntegratedCandidate({candidate,sessionId:identity.sessionId,registry:restricted,
     judgeA:{model:"prueba/juez-a"},judgeB:{model:"prueba/juez-b"},fixJournal:new JudgmentFixProposalJournal(join(privateDir,"fixes.json")),
     requirements:"A y B deben contener resultado; C se conserva.",validate:async()=>{},confirm:async()=>{confirmations++;return true;}});
    assert.equal(blocked.status,"blocked");assert.equal(confirmations,0);assert.equal(judgeCalls,0);
    assert.equal(git("rev-parse","HEAD"),candidate.baseCommit);
   }
   // El catálogo completo de tres modelos continúa por la ruta explícita ya probada.
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
   const testInput={candidate,sessionId:identity.sessionId,todos,storageDir:receiptsDir,validate:async()=>{},confirm:async()=>true};
   assert.equal((await testNativeIntegrationCandidate({...testInput,testPaths:["conjuntas.test.mjs"],confirm:async()=>false})).status,"declined");
   assert.equal((await receipts.readReceiptState(candidate.commit)).status,"absent");
   await assert.rejects(()=>testNativeIntegrationCandidate({...testInput,testPaths:["fallo.test.mjs"]}),/no terminaron/u);
   assert.equal((await receipts.readReceiptState(candidate.commit)).status,"absent");
   const signed=await testNativeIntegrationCandidate({...testInput,testPaths:["conjuntas.test.mjs"]});
   assert.equal(signed.status,"tests-signed");
   if(signed.status==="tests-signed")assert.equal(signed.tests,2);
   assert.equal(git("rev-parse","HEAD"),candidate.baseCommit);
   assert.equal(git("status","--porcelain"),"");
   await assert.rejects(()=>testNativeIntegrationCandidate({...testInput,testPaths:["conjuntas.test.mjs"]}),/Ya existe/u);
   assert.equal((await reviewNativePartitionWithTests({...proportional,confirm:async()=>false})).status,"declined");
   const altered={list:async()=> (await todos.list(identity)).map(row=>row.taskId===candidate.sourceTodoIds[0]?{...row,current:{...row.current,revision:row.current.revision+1}}:row)};
   await assert.rejects(()=>reviewNativePartitionWithTests({...proportional,todos:altered}),/raíz ODD original cambió/u);
   const joint=await reviewNativePartitionWithTests(proportional);
   assert.equal(joint.status,"joint-tests-reviewed");
   if(!("report" in joint)||!joint.report)assert.fail("Sin revisión proporcional");
   assert.equal(joint.report.modelCalls,0);
   assert.equal(joint.report.independentReview,false);
   assert.equal(judgeCalls,2,"La revisión proporcional no necesita llamadas adicionales de jueces");
   const jointProof={...proof,report:joint.report};
   assert.equal((await verifyNativeIntegrationAcceptance(jointProof)).reviewMode,"joint-tests");
   let changedDuringReceipt=false;
   const dynamicTodos={list:async()=>changedDuringReceipt?altered.list():todos.list(identity)};
   const dynamic=await reviewNativePartitionWithTests({...proportional,todos:dynamicTodos});
   if(!("report" in dynamic)||!dynamic.report)assert.fail("Sin revisión proporcional");
   await assert.rejects(()=>verifyNativeIntegrationAcceptance({...jointProof,report:dynamic.report,receipts:{readReceiptState:async sha=>{changedDuringReceipt=true;return receipts.readReceiptState(sha);}}}),/raíz ODD original cambió/u);
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
   // Reconstruir desde los diarios: ni el candidato serializado ni el registro
   // Git restauran una aprobación anterior. Revisión y consentimiento nuevos.
   const rebuilt=await buildNativeIntegrationCandidate({identity,batchId:batch.id,sourceJournal,sessionJournal,observations});
   assert.notEqual(rebuilt,candidate);assert.equal(rebuilt.commit,candidate.commit);
   await assert.rejects(()=>verifyNativeIntegrationAcceptance({...jointProof,report:{...joint.report}}),/no fue emitida/u);
   const renewed=await reviewNativePartitionWithTests({...proportional,candidate:rebuilt});
   if(!("report" in renewed)||!renewed.report)assert.fail("Falta nueva revisión");
   const accepted=await acceptNativeIntegration({...jointProof,candidate:rebuilt,report:renewed.report,validate:async()=>{},confirm:async()=>true});
   assert.ok(accepted);assert.equal(git("rev-parse","HEAD"),candidate.commit);
   assert.equal(git("rev-parse","refs/heads/main"),candidate.baseCommit);
   assert.equal(git("show",candidate.commit+":sin-cambios.txt"),"texto sin cambios\nsegunda línea");
   assert.equal(await readFile(join(project,"sin-cambios.txt"),"utf8"),"texto sin cambios\r\nsegunda línea\r\n");
   // Un plan histórico conserva sus revisores, incluso después de actualizar.
   if(mode==="approved-legacy"){
    const roots=candidate.sourceTodoIds.map(id=>rows.find(row=>row.taskId===id)!);
    const old=rows.find(row=>row.dependsOn?.length===2)!;
    const parsed=parsePartitionUnitBasis(JSON.parse(old.plan!.writerAuthorizationBasis!),project,candidate.baseCommit);
    const freshId="continuation-"+createHash("sha256").update(JSON.stringify([old.requestId,candidate.commit])).digest("hex").slice(0,40);
    const graph=materializeHistoricalIntegratedSuccessor(parsed,freshId,{id:"asen-"+candidate.commit.slice(0,12),repository:project,
     revision:candidate.commit,createdAt:new Date(git("show","-s","--format=%cI",candidate.commit)).toISOString()},{});
    assert.equal(graph.tasks.filter(task=>task.role==="reviewer").length,2);
    await todos.addPlan([...roots.map(row=>({title:row.title,requestId:row.requestId!,dependsOn:[],description:row.description!,plan:row.plan!})),
     ...graph.tasks.map(task=>({title:task.title,requestId:"asen-plan:"+task.id,
      dependsOn:task.role==="worker"?roots.map(row=>row.requestId!):task.dependsOn.map(id=>"asen-plan:"+id),description:task.instruction,
      plan:{role:task.role,skillPaths:[...task.skillPaths],priority:task.priority,
       ...(task.skillSelection?{skillSelection:task.skillSelection}:{}),...(task.model?{model:task.model}:{}),...(task.thinking?{thinking:task.thinking}:{}),
       ...(task.role==="worker"&&task.candidate?{candidate:task.candidate}:{}),
       ...(task.role==="reviewer"||task.role==="verifier"?{candidateRevision:candidate.commit}:{}),
       ...(task.writeSurfaces?{writeSurfaces:[...task.writeSurfaces]}:{}),
       ...(task.writerAuthorizationBasis?{writerAuthorizationBasis:task.writerAuthorizationBasis}:{})}}))],identity);
   }
   // Fallo después de guardar el reemplazo pero antes de cerrar sus raíces.
   let verifications=0;
   await assert.rejects(()=>persistNativePartitionSuccessor({candidate,accepted,identity,todos,profiles:{},
    validate:async()=>{},verify:async()=>{await verifyNativeIntegrationAcceptance(jointProof);if(++verifications===3)throw Error("interrupción simulada");}}),/interrupción simulada/u);
   const savedBefore=(await todos.list(identity)).find(row=>row.requestId?.startsWith("asen-plan:continuation-")&&row.plan?.role==="worker");
   assert.ok(savedBefore);
   assert.equal(JSON.parse(savedBefore.plan!.writerAuthorizationBasis!).review.kind,mode==="approved-legacy"?"dual_explicit":"none");
   assert.equal((await todos.list(identity)).filter(row=>row.requestId?.startsWith("asen-plan:continuation-")).length,mode==="approved-legacy"?3:1);
   // Un proceso nuevo reconstruye los diarios y vuelve a pedir revisión y
   // consentimiento. Ningún WeakMap ni permiso del proceso padre cruza el límite.
   const restartFile=fileURLToPath(new URL("./fixtures/native-partition-restart.ts",import.meta.url));
   const restart=(phase:string)=>JSON.parse(execFileSync(process.execPath,["--import","tsx",restartFile,phase,privateDir,JSON.stringify(identity),batch.id],{
    encoding:"utf8",timeout:45000,windowsHide:true,stdio:["ignore","pipe","pipe"]}).trim());
   const successor=restart("resume");
   assert.equal(successor.todoId,savedBefore.taskId);
   assert.equal(successor.status,"successor-ready");
   assert.equal(successor.authorizations,2);
   const recovered=restart("inspect");
   assert.equal(recovered.status,"successor-already-persisted");
   assert.equal(recovered.todoId,savedBefore.taskId);
   assert.equal(recovered.todoState,"planned");
   assert.equal(recovered.authorizations,0);
   assert.equal(recovered.writerAuthority,false);
   assert.equal(recovered.autoRetry,false);
   assert.equal(launched,2);
   await assert.rejects(()=>inspectCompletedNativePartition({candidate:{...candidate},identity,todos,receipts,validate:async()=>{}}),/auténtico/u);
   const finalRows=await todos.list(identity);
   assert.equal(finalRows.filter(row=>candidate.sourceTodoIds.includes(row.taskId)&&row.current.state==="done").length,2);
   assert.equal(finalRows.find(row=>row.taskId===rows.find(item=>item.dependsOn?.length===2)!.taskId)?.current.state,"cancelled");
   assert.equal(finalRows.find(row=>row.requestId?.startsWith("asen-plan:continuation-")&&row.plan?.role==="worker")?.plan?.candidate?.revision,candidate.commit);
   if(mode==="approved"){
    const reopenedTodos=await SessionTodoStore.openProjectScoped(join(privateDir,"todos"),join(privateDir,"todos.json"));
    const reopenedLinks=new TaskAgentLinkStore(join(privateDir,"task-agent-links.json"));
    let successorCalls=0;
    const successorRunner:AgentRunner={run:async request=>{
     successorCalls++;
     assert.equal(request.repository,project);assert.equal(request.isolationKey,identity.sessionId);
     assert.equal(request.candidate?.revision,candidate.commit);
     assert.deepEqual(request.writeSurfaces,["c.txt"]);
     await writeFile(join(project,"c.txt"),"sucesora");
     const result={id:request.id,ok:true,output:"Resultado simulado de sucesora"};
     bindNativeRunnerModels(result,["nvidia/modelo-simulado"]);return result;
    }};
    const successorAgents=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner:successorRunner,maxConcurrency:1});
    const input={todos:reopenedTodos,agents:successorAgents,links:reopenedLinks,identity,
     runtimeProfiles:{global:{schema:"asen.runtime-profiles/v1" as const,active:"ensayo",profiles:[{name:"ensayo",mode:"full-delegation" as const,routes:{worker:{model:"nvidia/modelo-simulado"}}}]}},
     expectedTodoId:savedBefore.taskId,validateIdentity:async()=>{assert.equal(git("rev-parse","HEAD"),candidate.commit);}};
    let confirmations=0;
    const confirm=async(task:{id:string;candidateRevision?:string;writeSurfaces?:readonly string[]},approved:boolean)=>{
     confirmations++;assert.equal(task.id,savedBefore.taskId);assert.equal(task.candidateRevision,candidate.commit);
     assert.deepEqual(task.writeSurfaces,["c.txt"]);return approved;
    };
    try{
     const denied=await dispatchNextPlanTask({...input,confirm:task=>confirm(task,false)});
     assert.equal(denied.status,"blocked");assert.equal(confirmations,1);assert.equal(successorCalls,0);
     const dispatched=await dispatchNextPlanTask({...input,confirm:task=>confirm(task,true)});
     assert.equal(dispatched.status,"dispatched");
     if(dispatched.status!=="dispatched")assert.fail("No se despachó la sucesora exacta");
     const deadline=Date.now()+90000;
     while(Date.now()<deadline){
      const record=(await successorAgents.list(identity)).find(row=>row.id===dispatched.agentId);
      if(record&&["completed","failed","cancelled","interrupted"].includes(record.state))break;
      await new Promise(resolve=>setTimeout(resolve,100));
     }
     assert.equal((await successorAgents.list(identity)).find(row=>row.id===dispatched.agentId)?.state,"completed");
     await new TaskAgentTodoReconciler(reopenedTodos,successorAgents,reopenedLinks).reconcile(identity);
     assert.equal((await reopenedTodos.list(identity)).find(row=>row.taskId===savedBefore.taskId)?.current.state,"succeeded");
     const completion=(await successorAgents.query(dispatched.agentId,identity))?.nativeCompletion;
     assert.ok(completion);assert.equal(completion.baseCommit,candidate.commit);assert.deepEqual(completion.paths,["c.txt"]);
     assert.equal(git("show",completion.candidateTree+":c.txt"),"sucesora");
     const reloaded=await AgentRuntime.open({storeFile:join(privateDir,"agents.json"),runner:successorRunner,maxConcurrency:1});
     assert.deepEqual((await reloaded.query(dispatched.agentId,identity))?.nativeCompletion,completion);
     const duplicate=await dispatchNextPlanTask({...input,confirm:()=>{throw Error("No debe repetir el permiso");}});
     assert.equal(duplicate.status,"blocked");assert.equal(confirmations,2);assert.equal(successorCalls,1);
     assert.equal(git("rev-parse","refs/heads/main"),candidate.baseCommit);
     assert.equal(git("diff","--name-only","HEAD"),"c.txt");
    }finally{await successorAgents.cancelSession(identity);}
   }
  }
 }finally{
  releaseSibling();
  if(cleanupAgents)for(const child of cleanupChildren)await cleanupAgents.cancelSession(child);
  if(expectedTerminals===2&&terminalCount<2){
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([terminalBarrier,new Promise<void>(resolve=>{timer=setTimeout(resolve,90000);})]);}
   finally{if(timer)clearTimeout(timer);}
  }
  await Promise.allSettled(terminalWork);
  // Ante un terminal incierto no borrar un checkout que todavía puede estar en uso.
  if(expectedTerminals===0||terminalCount===2)await rm(base,{recursive:true,force:true});
 }
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

test("La captura nativa conserva altas y finales mixtos de texto explícito como blobs Git canónicos",async()=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),"asen-native-eol-")));
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",env:isolatedGitEnvironment(),stdio:["ignore","pipe","pipe"]});
 try{
  git("init","-q");git("config","user.name","ASEN");git("config","user.email","test@example.invalid");
  git("config","core.autocrlf","false");
  await writeFile(join(project,".gitattributes"),"*.txt text eol=crlf\n");
  await writeFile(join(project,"existente.txt"),"original\n");
  git("add",".");git("commit","--no-gpg-sign","-qm","base");
  const request={id:"unit-"+"b".repeat(40)+":worker",role:"worker" as const,repository:project,prompt:"Prueba",
   candidate:{id:"fixture",repository:project,revision:git("rev-parse","HEAD").trim(),createdAt:new Date().toISOString()},
   writeSurfaces:["existente.txt","nuevo.txt"]};
  const baseline=await captureNativeWriterBaseline(request);
  await writeFile(join(project,"existente.txt"),"cambiado\r\nsegunda\n");
  await writeFile(join(project,"nuevo.txt"),"nuevo\r\nsegunda\n");
  const result={};bindNativeRunnerModels(result,["nvidia/modelo-simulado"]);
  const completion=await captureNativeWriterCompletionAsync(request,result,baseline,new AbortController().signal);
  assert.ok(completion);
  assert.deepEqual(completion.paths,["existente.txt","nuevo.txt"]);
  assert.equal(git("show",completion.candidateTree+":existente.txt"),"cambiado\nsegunda\n");
  assert.equal(git("show",completion.candidateTree+":nuevo.txt"),"nuevo\nsegunda\n");
  assert.equal(await readFile(join(project,"nuevo.txt"),"utf8"),"nuevo\r\nsegunda\n");
 }finally{await rm(project,{recursive:true,force:true});}
});

test("El inventario de ignorados supera el antiguo límite de stdout y conserva el ámbito",async()=>{
 const project=await realpath(await mkdtemp(join(tmpdir(),"asen-inventory-large-")));
 const git=(...args:string[])=>execFileSync("git",["-C",project,...args],{encoding:"utf8",env:isolatedGitEnvironment(),stdio:["ignore","pipe","pipe"]}).trim();
 try{
  git("init","-q");git("config","user.name","ASEN");git("config","user.email","test@example.invalid");
  await writeFile(join(project,".gitignore"),"dep-*\n");git("add",".gitignore");git("commit","--no-gpg-sign","-qm","base");
  // Rutas largas en directorios, no nombres de archivo que excedan límites Windows.
  const dirs=Array.from({length:96},(_,i)=>"dep-"+i+"-"+"x".repeat(75));
  for(const dir of dirs){
   await mkdir(join(project,dir));
   await Promise.all(Array.from({length:120},(_,i)=>writeFile(join(project,dir,"f-"+i+"-"+"y".repeat(25)),"")));
  }
  const request={id:"unit-"+"c".repeat(40)+":worker",role:"worker" as const,repository:project,prompt:"Prueba",
   candidate:{id:"fixture",repository:project,revision:git("rev-parse","HEAD"),createdAt:new Date().toISOString()},writeSurfaces:["resultado.txt"]};
  const baseline=await captureNativeWriterBaseline(request);
  assert.equal(baseline.length,96*120);
  assert.ok(Buffer.byteLength(baseline.join("\0"))>1_000_000);
  await writeFile(join(project,"resultado.txt"),"resultado");
  const result={};bindNativeRunnerModels(result,["nvidia/modelo-simulado"]);
  const completion=await captureNativeWriterCompletionAsync(request,result,baseline,new AbortController().signal);
  assert.deepEqual(completion?.paths,["resultado.txt"]);
  const temp=await realpath(await mkdtemp(join(tmpdir(),"asen-inventory-cleanup-")));
  const keys=["TMPDIR","TMP","TEMP"] as const,previous=keys.map(key=>process.env[key]);
  try{
   for(const key of keys)process.env[key]=temp;
   const controller=new AbortController();
   const pending=captureNativeWriterCompletionAsync(request,result,baseline,controller.signal);
   // El directorio se crea antes del primer await; cancelar un hilo real.
   controller.abort();
   assert.equal(await pending,undefined);
   assert.deepEqual(await readdir(temp),[]);
   const completed=await captureNativeWriterCompletionAsync(request,result,baseline,new AbortController().signal);
   assert.deepEqual(completed?.paths,["resultado.txt"]);
   assert.deepEqual(await readdir(temp),[]);
  }finally{
   keys.forEach((key,index)=>{const value=previous[index];if(value===undefined)delete process.env[key];else process.env[key]=value;});
   await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
 }finally{await rm(project,{recursive:true,force:true});}
});
