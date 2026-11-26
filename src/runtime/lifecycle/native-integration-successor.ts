import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {isolatedGitEnvironment,checkoutEolSettings} from "../agents/git-isolated-environment.js";
import {isIssuedNativeIntegrationCandidate,readNativeIntegrationDiff,type NativeIntegrationCandidate} from "../agents/parallel-native-integration.js";
import {isAcceptedNativeIntegration,exactPassingReceipt,inspectPartitionPolicy,type AcceptedNativeIntegration} from "./native-integration-review.js";
import type {ReviewReceiptReader} from "./review-acceptance.js";
import {parsePartitionUnitBasis,integratedSuccessorBasis,materializeIntegratedSuccessor,materializeHistoricalIntegratedSuccessor} from "./odd-unit-plan.js";
import type {ProfileLayer} from "./profiles.js";
import type {SessionTodoStore,TodoContext,TodoPlanDraft} from "./todo-store.js";

function assertIntegratedCheckout(candidate:NativeIntegrationCandidate,identity:TodoContext):void{
  const git=(...args:string[])=>execFileSync("git",["--no-replace-objects","-c","core.fsmonitor=false",...checkoutEolSettings(identity.projectId).args,"-C",identity.projectId,...args],{encoding:"utf8",env:isolatedGitEnvironment(),timeout:5000,windowsHide:true});
  try{
   if(git("config","--get-regexp","^(filter\\.|merge\\..*\\.driver$|diff\\..*\\.command$)").trim())throw Error("Configuración Git externa no admitida para continuar.");
  }catch(error){if((error as {status?:number})?.status!==1)throw error;}
  const branch=git("symbolic-ref","HEAD").trim();
  if(!branch.startsWith("refs/heads/")||["refs/heads/main","refs/heads/master"].includes(branch.toLowerCase()))throw Error("Continuación bloqueada en rama principal o sin rama.");
  if(git("rev-parse","HEAD").trim()!==candidate.commit||git("rev-parse","HEAD^{tree}").trim()!==candidate.tree||
   git("status","--porcelain=v1","--untracked-files=all").length)
   throw new Error("La integración ya no coincide con el candidato aceptado.");
}
/** Reconoce el cierre atómico del Todo después de reiniciar el proceso.
 * No reconstituye AcceptedNativeIntegration, no autoriza el Writer, no ejecuta
 * herramientas, no modifica el diario ni reintenta un agente incierto. */
export async function inspectCompletedNativePartition(input:{
 candidate:NativeIntegrationCandidate;identity:TodoContext;todos:Pick<SessionTodoStore,"list">;receipts:ReviewReceiptReader;
 validate:()=>Promise<void>;
}){
 const {candidate,identity,todos}=input;
 if(!isIssuedNativeIntegrationCandidate(candidate)||identity.projectId!==candidate.repository||candidate.sourceBindings?.length!==2)
  throw Error("La recuperación requiere el lote original auténtico");
 await input.validate();
 const rows=await todos.list(identity);
 await input.validate();
 const bindings=candidate.sourceBindings;
 const roots=bindings.map(binding=>{
  const row=rows.find(item=>item.taskId===binding.taskId);
  if(!row||row.current.sessionId!==identity.sessionId||row.current.projectId!==identity.projectId||
    row.requestId!==binding.requestId||row.plan?.role!=="worker"||row.plan.candidate?.revision!==candidate.baseCommit||
    row.plan.candidate.repository!==candidate.repository||row.dependsOn?.length||
    JSON.stringify(row.plan.writeSurfaces)!==JSON.stringify(binding.writeSurfaces)||!row.plan.writerAuthorizationBasis)
   throw Error("No se conservan las raíces originales del lote");
  return row;
 });
 // Todavía no se produjo el cierre atómico: hace falta revisión y aprobación
 // nuevas, incluso si Git ya avanzó. No interpretar un índice preparado como cierre.
 if(roots.every((row,index)=>row.current.state==="planned"&&row.current.revision===bindings[index]!.taskRevision))return undefined;
 if(roots.some((row,index)=>{
  const expected=bindings[index]!.taskRevision,last=row.events.at(-1),prior=row.events.at(-2),original=row.events.at(-3);
  return row.current.state!=="done"||row.current.revision!==expected+2||last?.state!=="done"||
   last.reason!=="Child results integrated and verified at "+candidate.commit||
   prior?.state!=="running"||prior.revision!==expected+1||prior.reason!=="Verifying accepted child integration "+candidate.commit||
   original?.state!=="planned"||original.revision!==expected;
 }))throw Error("El cierre del lote es parcial, distinto o incierto; no lanzar agentes");
 const rootBases=roots.map(row=>JSON.parse(row.plan!.writerAuthorizationBasis!));
 const rootUnits=rootBases.map(basis=>parsePartitionUnitBasis(basis,identity.projectId,candidate.baseCommit));
 if(rootUnits[0]!.parentFacts.taskUnits.length===2){
  if(rootUnits[1]!.parentFacts.taskUnits.length!==2||rootUnits[0]!.unit.id===rootUnits[1]!.unit.id||
   JSON.stringify(rootBases[0].partitionOrigin)!==JSON.stringify(rootBases[1].partitionOrigin)||
   roots.some((row,index)=>rootUnits[index]!.unit.dependsOn.length||
    row.requestId!==`asen-plan:${rootUnits[index]!.facts.taskIdentity}:worker`||
    row.description!=="Perform only the authorized, scoped work for: "+rootUnits[index]!.instruction||
    JSON.stringify(row.plan!.writeSurfaces)!==JSON.stringify(rootUnits[index]!.facts.writes.map(write=>write.path)))||
   rows.some(row=>row.dependsOn?.some(id=>candidate.sourceTodoIds.includes(id))))
   throw Error("El cierre sin sucesora no coincide con el plan original.");
  readNativeIntegrationDiff(candidate);
  const receipt=await exactPassingReceipt(candidate,input.receipts);
  await input.validate();assertIntegratedCheckout(candidate,identity);
  const latest=await todos.list(identity);
  if(roots.some(row=>JSON.stringify(row)!==JSON.stringify(latest.find(item=>item.taskId===row.taskId)))||
   latest.some(row=>row.dependsOn?.some(id=>candidate.sourceTodoIds.includes(id))))
   throw Error("El estado cambió durante la recuperación; consultar el diario sin repetir");
  await input.validate();assertIntegratedCheckout(candidate,identity);
  return Object.freeze({status:"partition-already-closed" as const,commit:candidate.commit,
   tests:receipt.testSuite.total,writerAuthority:false as const,autoRetry:false as const});
 }
 const matches=rows.filter(row=>row.current.state==="cancelled"&&row.current.reason==="Superseded by a new candidate-bound ODD plan"&&
  row.plan?.role==="worker"&&row.plan.candidate?.revision===candidate.baseCommit&&row.dependsOn?.length===2&&
  candidate.sourceTodoIds.every(id=>row.dependsOn!.includes(id))&&row.requestId&&row.plan.writerAuthorizationBasis);
 if(matches.length!==1)throw Error("No existe una única sucesora original sustituida");
 const old=matches[0]!;
 const parsed=parsePartitionUnitBasis(JSON.parse(old.plan!.writerAuthorizationBasis!),identity.projectId,candidate.baseCommit);
 const predecessors=roots.map(row=>parsePartitionUnitBasis(JSON.parse(row.plan!.writerAuthorizationBasis!),identity.projectId,candidate.baseCommit));
 if(predecessors.some(item=>JSON.stringify(item.parentFacts)!==JSON.stringify(parsed.parentFacts)||item.unit.dependsOn.length)||
  JSON.stringify(predecessors.map(item=>item.unit.id).sort())!==JSON.stringify([...parsed.unit.dependsOn].sort()))
  throw Error("La sucesora no pertenece al lote original");
 const id="continuation-"+createHash("sha256").update(JSON.stringify([old.requestId,candidate.commit])).digest("hex").slice(0,40);
 const requestId="asen-plan:"+id+":worker";
 const next=rows.filter(row=>row.requestId===requestId);
 if(next.length!==1)throw Error("No se conserva la sucesora guardada");
 const task=next[0]!,basis=integratedSuccessorBasis(parsed,id).basis;
 const legacy=JSON.stringify({...JSON.parse(basis),review:{kind:"dual_explicit",estimatedMinutes:15}});
 if(task.plan?.role!=="worker"||task.plan.candidate?.repository!==candidate.repository||task.plan.candidate.revision!==candidate.commit||
  task.description!=="Perform only the authorized, scoped work for: "+parsed.instruction||
  task.dependsOn?.length!==2||!candidate.sourceTodoIds.every(id=>task.dependsOn!.includes(id))||
  JSON.stringify(task.plan.writeSurfaces)!==JSON.stringify(parsed.facts.writes.map(write=>write.path))||
  (task.plan.writerAuthorizationBasis!==basis&&task.plan.writerAuthorizationBasis!==legacy))
  throw Error("La sucesora guardada no coincide con el candidato");
 if(task.plan.writerAuthorizationBasis===legacy){
  const reviewers=rows.filter(row=>row.requestId==="asen-plan:"+id+":reviewer"||row.requestId==="asen-plan:"+id+":reviewer:2");
  if(reviewers.length!==2||reviewers.some(row=>row.plan?.role!=="reviewer"||row.plan.candidateRevision!==candidate.commit||
   row.dependsOn?.length!==1||row.dependsOn[0]!==task.taskId))
   throw Error("El plan histórico perdió sus dos revisores obligatorios");
 }
 // Sólo confirmar hechos persistidos; no restaurar consentimiento ni
 // convertir el recibo en un permiso. Revalidar el estado tras leer el recibo.
 readNativeIntegrationDiff(candidate);
 const receipt=await exactPassingReceipt(candidate,input.receipts);
 await input.validate();
 // Solo una sucesora aún planificada necesita el checkout integrado intacto.
 // Si ya se ejecutó, su resultado puede haber cambiado el worktree; aquí
 // se informa de su estado sin restaurar permisos ni aceptar esos cambios.
 if(task.current.state==="planned")assertIntegratedCheckout(candidate,identity);
 const latest=await todos.list(identity);
 const relevant=[...roots,old,task,...rows.filter(row=>row.requestId==="asen-plan:"+id+":reviewer"||row.requestId==="asen-plan:"+id+":reviewer:2")];
 if(relevant.some(row=>JSON.stringify(row)!==JSON.stringify(latest.find(item=>item.taskId===row.taskId))))
  throw Error("El estado cambió durante la recuperación; consultar el diario sin repetir");
 await input.validate();if(task.current.state==="planned")assertIntegratedCheckout(candidate,identity);
 return Object.freeze({status:"successor-already-persisted" as const,todoId:task.taskId,commit:candidate.commit,
  todoState:task.current.state,tests:receipt.testSuite.total,writerAuthority:false as const,autoRetry:false as const,
  next:task.current.state==="planned"?"La sucesora sigue planificada. Avanzar el Todo requiere autorización nueva.":"Consultar el estado del Todo y su agente existente; no repetir automáticamente."});
}

export async function persistNativePartitionSuccessor(input:{
 candidate:NativeIntegrationCandidate;accepted:AcceptedNativeIntegration;identity:TodoContext;
 todos:SessionTodoStore;profiles:ProfileLayer;validate:()=>Promise<void>;
 verify:()=>Promise<void>;signal?:AbortSignal;
}){
 const {candidate,accepted,identity,todos}=input;
 if(!isAcceptedNativeIntegration(accepted,candidate,identity.sessionId)||identity.projectId!==candidate.repository)
  throw new Error("La sucesora requiere la integración auténtica de su lote.");
 const assertCurrent=async()=>{
  await input.validate();await input.verify();await input.validate();
  assertIntegratedCheckout(candidate,identity);
 };
 await assertCurrent();
 const rows=await todos.list(identity);
 const roots=candidate.sourceTodoIds.map(id=>rows.find(row=>row.taskId===id));
 if(roots.length!==2||roots.some(row=>!row||row.current.state!=="planned"||row.plan?.candidate?.revision!==candidate.baseCommit||
  !row.requestId||!row.plan.writerAuthorizationBasis||!row.description))throw new Error("Las raíces originales cambiaron.");
 const rootBasis=parsePartitionUnitBasis(JSON.parse(roots[0]!.plan!.writerAuthorizationBasis!),identity.projectId,candidate.baseCommit);
 if(rootBasis.parentFacts.taskUnits.length===2){
  await inspectPartitionPolicy(candidate,identity.sessionId,todos);
  await todos.acceptIntegratedPartition({context:identity,roots:roots.map(row=>row!),commit:candidate.commit,
   verify:assertCurrent,...(input.signal?{signal:input.signal}:{})});
  return Object.freeze({status:"partition-closed" as const,commit:candidate.commit,writerAuthority:false as const,autoRetry:false as const});
 }
 const matches=rows.filter(row=>row.current.state==="planned"&&row.plan?.candidate?.revision===candidate.baseCommit&&!!row.plan.writerAuthorizationBasis&&row.dependsOn?.length===2&&
  candidate.sourceTodoIds.every(id=>row.dependsOn!.includes(id)));
 if(matches.length!==1)return Object.freeze({status:"blocked" as const,reason:"Esta continuación admite una única sucesora que dependa exactamente de las dos raíces."});
 const old=matches[0]!,basis=old.plan?.writerAuthorizationBasis;
 if(!basis||old.plan?.candidate?.revision!==candidate.baseCommit)throw new Error("La sucesora original no conserva su base ODD.");
 const parsed=parsePartitionUnitBasis(JSON.parse(basis),identity.projectId,candidate.baseCommit);
 const predecessorUnits=roots.map(row=>parsePartitionUnitBasis(JSON.parse(row!.plan!.writerAuthorizationBasis!),identity.projectId,candidate.baseCommit));
 if(predecessorUnits.some(item=>JSON.stringify(item.parentFacts)!==JSON.stringify(parsed.parentFacts)||item.unit.dependsOn.length)||
  JSON.stringify(predecessorUnits.map(item=>item.unit.id).sort())!==JSON.stringify([...parsed.unit.dependsOn].sort()))
  throw new Error("Los predecesores no pertenecen a la misma partición ODD.");
 const freshId="continuation-"+createHash("sha256").update(JSON.stringify([old.requestId,candidate.commit])).digest("hex").slice(0,40);
 const facts=parsed.facts;
 const pinned={
  id:"asen-"+candidate.commit.slice(0,12),repository:identity.projectId,revision:candidate.commit,
  createdAt:new Date(execFileSync("git",["-C",identity.projectId,"show","-s","--format=%cI",candidate.commit],{encoding:"utf8",env:isolatedGitEnvironment(),timeout:5000}).trim()).toISOString()
 };
 const existing=rows.find(row=>row.requestId==="asen-plan:"+freshId+":worker");
 let graph=materializeIntegratedSuccessor(parsed,freshId,pinned,input.profiles);
 if(existing&&existing.plan?.writerAuthorizationBasis!==graph.tasks[0]?.writerAuthorizationBasis){
  const historical=materializeHistoricalIntegratedSuccessor(parsed,freshId,pinned,input.profiles);
  const legacyWorker=historical.tasks.find(task=>task.role==="worker");
  if(!legacyWorker?.writerAuthorizationBasis||existing.plan?.writerAuthorizationBasis!==legacyWorker.writerAuthorizationBasis)
   throw Error("La base guardada de la sucesora no coincide con el contrato vigente ni histórico.");
  graph=historical; // addPlan validará exactamente todas las filas históricas, incluidos los dos revisores.
 }
 const workers=graph.tasks.filter(task=>task.role==="worker");
 if(workers.length!==1||!workers[0]?.writerAuthorizationBasis||!workers[0].candidate||
  JSON.stringify(workers[0].writeSurfaces)!==JSON.stringify(facts.writes.map(write=>write.path)))
  throw new Error("No existe un nuevo Writer exacto para la sucesora.");
 const worker=workers[0],replacementRequestId="asen-plan:"+worker.id;
 const rootRows=roots.map(row=>row!);
 const drafts:TodoPlanDraft[]=rootRows.map(row=>({title:row.title,requestId:row.requestId!,dependsOn:[],description:row.description!,plan:row.plan!}));
 for(const task of graph.tasks){
  // Una preparación previa puede haber guardado el plan antes de cerrar
  // las raíces. Reutilizar sus rutas exactas, no el perfil modificado.
  // addPlan sigue comprobando todos los restantes metadatos y dependencias.
  const persisted=rows.find(row=>row.requestId==="asen-plan:"+task.id);
  const model=persisted?persisted.plan?.model:task.model;
  const thinking=persisted?persisted.plan?.thinking:task.thinking;
  drafts.push({title:task.title,requestId:"asen-plan:"+task.id,
   dependsOn:task.role==="worker"?rootRows.map(row=>row.requestId!):task.dependsOn.map(id=>"asen-plan:"+id),
   description:task.instruction,plan:{role:task.role,skillPaths:[...task.skillPaths],priority:task.priority,
    ...(task.skillSelection?{skillSelection:task.skillSelection}:{}),...(model?{model}:{}),
    ...(thinking?{thinking}:{}),...(task.role==="worker"&&task.candidate?{candidate:task.candidate}:{}),
    ...(task.role==="reviewer"||task.role==="verifier"?{candidateRevision:candidate.commit}:{}),
    ...(task.writeSurfaces?{writeSurfaces:[...task.writeSurfaces]}:{}),
    ...(task.writerAuthorizationBasis?{writerAuthorizationBasis:task.writerAuthorizationBasis}:{})}});
 }
 await assertCurrent();
 const saved=await todos.addPlan(drafts,identity,input.signal);
 await todos.acceptIntegratedPartition({context:identity,roots:rootRows,superseded:old,replacementRequestId,commit:candidate.commit,
  verify:assertCurrent,...(input.signal?{signal:input.signal}:{})});
 const next=saved.find(row=>row.requestId===replacementRequestId);
 if(!next)throw new Error("La sucesora guardada no está disponible.");
 return Object.freeze({status:"successor-ready" as const,todoId:next.taskId,commit:candidate.commit,writerAuthority:false as const});
}
