import {realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {prepareOrdinaryReview,claimOrdinaryReviewRequest,bindOrdinaryReviewCheckout,type OrdinaryReviewInput,type OrdinaryReviewRequest,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";
import type {WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";
import {availableIndependentPiReviewers,runIndependentPiReview,type PiReviewRegistry,type PiReviewerModel} from "./pi-model-reviewer.js";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview,WorkspaceReviewScopeError} from "./workspace-review-session.js";
import {awaitNativeRddResult,bindNativeRddResult} from "./native-rdd-result.js";
import {openBoundedCorrection,validateBoundedCorrection,type CorrectionRequest,type CorrectionValidation} from "./bounded-correction.js";
import {assertReviewSessionOpen} from "./review-session.js";
import {assertWorkspaceProjectionRepository,revalidateWorkspaceReviewProjection,type WorkspaceReviewProjection} from "./workspace-review-projection.js";
import {captureReviewRepositoryBinding,assertReviewRepositoryBinding} from "./review-tree-inspection.js";
import {validatePortableReviewPaths} from "./review-tree-paths.js";
import {hasSensitiveName} from "../security/primary-tool-policy.js";

interface ReviewCommandContext{
 cwd:string;hasUI?:boolean;signal?:AbortSignal;modelRegistry?:PiReviewRegistry;model?:PiReviewerModel;
 sessionManager:{getSessionId():string};
 ui:{notify(message:string,level:"info"|"error"):void;select?:(title:string,options:string[],opts?:{signal?:AbortSignal})=>Promise<string|undefined>;editor?:(title:string,prefill?:string)=>Promise<string|undefined>;confirm?:(title:string,message:string)=>Promise<boolean>};
}
interface ReviewCommand{
 description:string;handler(args:string|undefined,context:ReviewCommandContext):Promise<OrdinaryReviewCheckout|string|unknown>|OrdinaryReviewCheckout|string;
}
export interface OrdinaryReviewCommandController{
 prepare(candidate:WorkUnitReviewCandidate,input:OrdinaryReviewInput):OrdinaryReviewRequest;
}
interface CorrectionState{
 readonly request:CorrectionRequest;readonly repository:string;readonly sessionId:string;readonly priorRevision:string;readonly priorReviewerId:string;
 readonly baseCommit:string|null;readonly baseTree:string;
 readonly priorProjection:WorkspaceReviewProjection;
 readonly requirements:string;readonly reviewPaths:readonly string[];readonly intendedUntracked:readonly string[];readonly priorFiles:readonly Readonly<{path:string;mode:string;objectId:string}>[];
 readonly allowedPaths:readonly string[];used:boolean;
}
const workspaceCorrections=new Map<string,CorrectionState>();
function reserveCorrectionSlot():{evicted?:readonly [string,CorrectionState]}|undefined{
 if(workspaceCorrections.size<100)return {};
 for(const [id,state] of workspaceCorrections){if(!state.used){workspaceCorrections.delete(id);return {evicted:[id,state]};}}
 return undefined;
}
function changedCandidatePaths(before:readonly Readonly<{path:string;mode:string;objectId:string}>[],after:readonly Readonly<{path:string;mode:string;objectId:string}>[]):string[]{
 const previous=new Map(before.map(file=>[file.path,file.mode+":"+file.objectId])),current=new Map(after.map(file=>[file.path,file.mode+":"+file.objectId]));
 return [...new Set([...previous.keys(),...current.keys()])].filter(path=>previous.get(path)!==current.get(path)).sort();
}
function assertNoSensitiveReviewPaths(paths:readonly string[]):void{
 if(paths.some(hasSensitiveName))throw new Error("La revisión independiente no puede incluir rutas sensibles (.env*, *.pem, *.key)");
}
async function runWorkspaceReview(context:ReviewCommandContext,correctionId?:string):Promise<unknown>{
 const sessionId=context.sessionManager?.getSessionId?.(),registry=context.modelRegistry,author=context.model;
 if(!context.hasUI||!sessionId||!registry||!author||!context.ui.select||!context.ui.editor||!context.ui.confirm){
  const unavailable="Revisión independiente no disponible: se requiere una sesión Pi interactiva, modelo autor conocido y un modelo revisor autenticado distinto.";
  context.ui.notify(unavailable,"error");return {status:"unavailable",reason:unavailable};
 }
 const projectRoot=realpathSync(context.cwd);
 const projectBinding=captureReviewRepositoryBinding(projectRoot);
 const correction=correctionId?workspaceCorrections.get(correctionId):undefined;
 if(correctionId&&(!correction||correction.used||correction.sessionId!==sessionId||correction.repository!==projectRoot)){
  const unavailable="La corrección ya se consumió o no pertenece a esta sesión y proyecto.";context.ui.notify(unavailable,"error");return {status:"blocked",reason:unavailable};
 }
 if(correction)correction.used=true;
 let retireCorrection=false,workspaceOpened=false;
 const assertCorrectionReserved=()=>{
  if(!correction)return;
  if(workspaceCorrections.get(correctionId!)!==correction||!correction.used)throw new Error("Correction review is no longer live");
  try{assertWorkspaceProjectionRepository(correction.priorProjection);}catch{retireCorrection=true;throw new Error("Correction repository changed; start a new review");}
 };
 const assertContextCurrent=()=>{
  try{if(context.sessionManager.getSessionId()!==sessionId||realpathSync(context.cwd)!==projectRoot)throw new Error();assertReviewRepositoryBinding(projectBinding);}
  catch{if(correction)retireCorrection=true;throw new Error("Review session or project changed; start a new review");}
 };
 try{
 assertCorrectionReserved();
 const reviewers=availableIndependentPiReviewers(registry,author).filter(model=>!correction||"pi-model:"+model.provider+"/"+model.id!==correction.priorReviewerId),labels=reviewers.map(model=>model.provider+"/"+model.id);
 if(!reviewers.length){const unavailable="Revisión independiente no disponible: no hay otro modelo Pi autenticado en el registro.";context.ui.notify(unavailable,"error");return {status:"unavailable",reason:unavailable};}
 const selected=await context.ui.select("Selecciona un modelo revisor independiente",labels,context.signal?{signal:context.signal}:undefined);
 assertCorrectionReserved();assertContextCurrent();
 if(!selected)return {status:"cancelled"};
 const model=reviewers[labels.indexOf(selected)];
 if(!model)throw new Error("El modelo revisor seleccionado ya no está disponible");
 const requirements=correction?.requirements??await context.ui.editor("Requisitos que debe comprobar el revisor","Revisar el cambio completo, alcance autorizado, errores funcionales, riesgos de seguridad, regresiones y pruebas ausentes.");
 assertContextCurrent();
 if(!requirements?.trim())return {status:"cancelled"};
 let reviewPaths:readonly string[];
 if(correction)reviewPaths=correction.reviewPaths;
 else{
  const reviewPathsText=await context.ui.editor("Rutas exactas incluidas en esta revisión (JSON array; incluye archivos eliminados)","[]");
  assertContextCurrent();
  if(!reviewPathsText)return {status:"cancelled"};
  try{
   const selected:unknown=JSON.parse(reviewPathsText);
   if(!Array.isArray(selected)||selected.some(path=>typeof path!=="string")||new Set(selected).size!==selected.length)throw new Error();
   // The selection spans both the base and candidate trees: a deleted path
   // and a new path may overlap or differ only by case, although each tree
   // is materialized separately under its own stricter collision rules.
   const validated=selected.map(path=>validatePortableReviewPaths([path])[0]!);
   assertNoSensitiveReviewPaths(validated);
   reviewPaths=Object.freeze(validated.sort());
  }catch(error){
   if(error instanceof Error&&error.message.startsWith("La revisión independiente no puede incluir rutas sensibles"))throw error;
   throw new Error("El alcance de revisión debe ser un array JSON de rutas exactas válidas");
  }
 }
 let intendedUntracked:string[];
 if(correction)intendedUntracked=[...correction.intendedUntracked];
 else{
  const untrackedText=await context.ui.editor("Rutas untracked que deben incluirse (JSON array; [] si ninguna)","[]");
  assertContextCurrent();
  if(!untrackedText)return {status:"cancelled"};
  try{
   const parsed:unknown=JSON.parse(untrackedText);if(!Array.isArray(parsed))throw new Error();
   const validated=validatePortableReviewPaths(parsed);assertNoSensitiveReviewPaths(validated);intendedUntracked=[...validated];
  }catch(error){
   if(error instanceof Error&&error.message.startsWith("La revisión independiente no puede incluir rutas sensibles"))throw error;
   throw new Error("El alcance untracked debe ser un array JSON válido y no incluir rutas sensibles");
  }
 }
 assertNoSensitiveReviewPaths([...reviewPaths,...intendedUntracked]);
 const reviewerId="pi-model:"+model.provider+"/"+model.id;
 let workspace:ReturnType<typeof openWorkspaceReview>;
 try{workspace=openWorkspaceReview({repositoryRoot:projectRoot,intendedUntracked,sessionId,reviewerId,viewParent:tmpdir(),
  risk:{riskId:"pi-independent-review",reason:"Review the exact current workspace snapshot",severity:"high",lenses:["risk","resilience","reliability"]}},{reviewPaths},correction?{previousProjection:correction.priorProjection,allowedPaths:correction.allowedPaths}:undefined);}
 catch(error){
  if(!(error instanceof WorkspaceReviewScopeError))throw error;
  if(correction&&error.kind!=="unchanged-correction")retireCorrection=true;
  const blocked=error.kind==="correction-base"
   ?Object.freeze({status:"blocked",reason:"La base del candidato cambió; se requiere una revisión nueva."})
   :error.kind==="unchanged-correction"
   ?Object.freeze({status:"blocked",reason:"La corrección debe cambiar el candidato exacto y limitarse a los archivos señalados.",allowedPaths:correction?.allowedPaths,changedPaths:error.changedPaths})
   :error.kind==="outside-correction"
   ?Object.freeze({status:"blocked",reason:"La corrección debe cambiar el candidato exacto y limitarse a los archivos señalados.",allowedPaths:correction?.allowedPaths,changedPaths:error.changedPaths,outsideReview:error.paths})
   :error.kind==="unexpected-untracked"
   ?Object.freeze({status:"blocked",reason:"Hay archivos untracked fuera del alcance; inclúyelos explícitamente o retíralos antes de revisar.",unexpectedFiles:error.paths})
   :Object.freeze({status:"blocked",reason:"Hay archivos modificados fuera del alcance seleccionado para la revisión.",outsideReview:error.paths,...(correction?{allowedPaths:correction.allowedPaths}:{})});
  context.ui.notify(JSON.stringify(blocked,null,2),"error");return blocked;
 }
 workspaceOpened=true;
 let closeAttempted=false,issuedCorrectionId:string|undefined,issuedCorrection:CorrectionState|undefined,evictedCorrection:readonly [string,CorrectionState]|undefined;
 const undoIssuedCorrection=()=>{
  if(issuedCorrectionId&&workspaceCorrections.get(issuedCorrectionId)===issuedCorrection)workspaceCorrections.delete(issuedCorrectionId);
  if(evictedCorrection&&!workspaceCorrections.has(evictedCorrection[0])&&workspaceCorrections.size<100)workspaceCorrections.set(...evictedCorrection);
  evictedCorrection=undefined;
 };
 const closeWorkspace=()=>{closeAttempted=true;try{closeWorkspaceReview(workspace);}catch(error){
  if(correction)retireCorrection=true;
  undoIssuedCorrection();
  throw error;
 }};
 try{
  const evidence=readWorkspaceReviewEvidence(workspace),paths=evidence.modifiedFiles.map(file=>file.path);
  assertNoSensitiveReviewPaths([...evidence.modifiedFiles.map(file=>file.path),...evidence.candidateFiles.map(file=>file.path)]);
  if(correction){
   const currentFiles=workspace.manifest.entries.map(entry=>({path:entry.path,mode:entry.mode,objectId:entry.objectId})),changed=changedCandidatePaths(correction.priorFiles,currentFiles);
   if(workspace.projection.baseCommit!==correction.baseCommit||workspace.projection.baseTree!==correction.baseTree){
    retireCorrection=true;
    const result={status:"blocked",reason:"La base del candidato cambió; se requiere una revisión nueva."};
    closeWorkspace();context.ui.notify(JSON.stringify(result,null,2),"error");return result;
   }
   if(evidence.candidate.treeIdentity===correction.priorRevision||changed.length===0||changed.some(path=>!correction.allowedPaths.includes(path))){
    if(changed.some(path=>!correction.allowedPaths.includes(path))||paths.length===0)retireCorrection=true;
    const result={status:"blocked",reason:"La corrección debe cambiar el candidato exacto y limitarse a los archivos señalados.",allowedPaths:correction.allowedPaths,changedPaths:changed};
    closeWorkspace();context.ui.notify(JSON.stringify(result,null,2),"error");return result;
   }
  }
  if(paths.length===0){const result={status:"not-required",reason:"El snapshot no contiene cambios revisables.",candidate:evidence.candidate};closeWorkspace();context.ui.notify(JSON.stringify(result,null,2),"info");return result;}
  const consent=await context.ui.confirm("Enviar el diff al modelo revisor?",[
   "Pi enviará el diff completo del candidato a:",
   reviewerId,
   "",
   "Candidato: "+evidence.candidate.treeIdentity,
   "Archivos: "+(paths.join(", ")||"(sin cambios)"),
   "El índice real no se modifica. No se ejecutan pruebas en la vista.",
  ].join("\n"));
  assertContextCurrent();assertReviewSessionOpen(workspace.session);
  if(!consent)return {status:"cancelled",requestId:workspace.requestId,candidate:evidence.candidate};
  assertCorrectionReserved();
  assertNoSensitiveReviewPaths([...evidence.modifiedFiles.map(file=>file.path),...evidence.candidateFiles.map(file=>file.path)]);
  revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});
  const verdict=await runIndependentPiReview({registry,model,author,evidence,requirements,...(context.signal?{signal:context.signal}:{})});
  assertCorrectionReserved();assertContextCurrent();
  if(context.signal?.aborted)throw new Error("Independent review was cancelled");
  const rddProbe={schemaVersion:1,requestId:evidence.requestId,sessionId:evidence.sessionId,revision:evidence.candidate.revision,
   treeIdentity:evidence.candidate.treeIdentity,parentIdentity:evidence.candidate.parentIdentity,reviewerId:verdict.reviewerId,
   verdict:verdict.verdict,summary:JSON.stringify({summary:verdict.summary,findings:verdict.findings})};
  const bound=bindNativeRddResult(awaitNativeRddResult(workspace.session),rddProbe);
  let correctionValidation:CorrectionValidation|undefined,correctionNext:string|undefined,status:string;
  if(correction){
   correctionValidation=validateBoundedCorrection(correction.request,{priorRevision:correction.priorRevision,correctedRevision:bound.revision,validation:bound.verdict});
   if(workspaceCorrections.get(correctionId!)===correction)workspaceCorrections.delete(correctionId!);
   status=bound.verdict==="pass"?"corrected-passed-awaiting-tests":"blocked-after-correction";
  }else if(bound.verdict==="fail"){
   const request=openBoundedCorrection(bound),findingPaths=[...new Set(verdict.findings.map(finding=>finding.path))],changedPaths=new Set(paths);
   const slot=!findingPaths.length||findingPaths.some(path=>!changedPaths.has(path))||workspaceCorrections.has(request.correctionId)?undefined:reserveCorrectionSlot();
   if(!slot){status="blocked";}
   else{
    evictedCorrection=slot.evicted;
    const state:CorrectionState={request,repository:workspace.projection.repositoryRoot,sessionId:bound.sessionId,priorRevision:bound.revision,
     priorReviewerId:bound.reviewerId,baseCommit:workspace.projection.baseCommit,baseTree:workspace.projection.baseTree,priorProjection:workspace.projection,requirements,reviewPaths,intendedUntracked:workspace.projection.intendedUntracked,
     priorFiles:Object.freeze(workspace.manifest.entries.map(entry=>Object.freeze({path:entry.path,mode:entry.mode,objectId:entry.objectId}))),
     allowedPaths:Object.freeze(findingPaths),used:false};
    workspaceCorrections.set(request.correctionId,state);
    issuedCorrectionId=request.correctionId;issuedCorrection=state;
    correctionNext=request.correctionId;status="correction-required";
   }
  }else status="passed-awaiting-tests";
  const result=Object.freeze({status,requestId:bound.requestId,resultId:bound.resultId,candidate:evidence.candidate,reviewerId:bound.reviewerId,
   verdict:bound.verdict,summary:verdict.summary,findings:verdict.findings,tests:evidence.tests,
   ...(correctionValidation?{correction:correctionValidation}:{}),...(correctionNext?{correctionId:correctionNext,allowedCorrectionPaths:workspaceCorrections.get(correctionNext)?.allowedPaths}:{}),
   acceptance:"not-accepted",deliveryAuthority:false});
  closeWorkspace();
  revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});
  assertContextCurrent();
  context.ui.notify(JSON.stringify(result,null,2),bound.verdict==="fail"?"error":"info");
  return result;
 }catch(error){
  undoIssuedCorrection();
  if(correction){try{assertReviewSessionOpen(workspace.session);}catch{retireCorrection=true;}}
  throw error;
 }finally{if(!closeAttempted)closeWorkspace();}
 }catch(error){
  if(correction&&!workspaceOpened&&!context.signal?.aborted)retireCorrection=true;
  throw error;
 }finally{
  // A cancelled or failed attempt made no correction itself. Permit a fresh
  // review, but never allow two calls to consume the same correction at once.
  if(correction&&workspaceCorrections.get(correctionId!)===correction){if(retireCorrection)workspaceCorrections.delete(correctionId!);else correction.used=false;}
 }
}
/** Registro propio de ASEN: prepara el traspaso; no emite dictamen ni autorización RDD. */
export function registerOrdinaryReviewCommand(register:(name:string,command:ReviewCommand)=>void):OrdinaryReviewCommandController{
 const pending=new Map<string,OrdinaryReviewRequest>();
 register("asen-review",{description:"Revisar de forma independiente el workspace o verificar una solicitud preparada; no autoriza entrega",handler:(args,context)=>{
  const command=(args??"").trim();
  if(command==="workspace")return runWorkspaceReview(context);
  const correctionMatch=/^workspace\s+correction\s+([a-f0-9]{64})$/u.exec(command);
  if(correctionMatch)return runWorkspaceReview(context,correctionMatch[1]);
  if(typeof args!=="string"||! /^[a-f0-9]{64}$/.test(args)){
   const usage="Uso: /asen-review <solicitud-id> | /asen-review workspace";context.ui.notify(usage,"info");return usage;
  }
  const request=pending.get(args);
  if(!request)throw new Error("No existe solicitud pendiente en esta instancia de ASEN");
  pending.delete(args);
  try{
   const sessionId=context.sessionManager.getSessionId();
   const checkout=bindOrdinaryReviewCheckout(request,sessionId,realpathSync(context.cwd));
   context.ui.notify("Candidato y sesión verificados; revisión nativa RDD pendiente. No hay autorización de entrega.","info");
   return checkout;
  }catch{
   // También consume si el host falla antes de llegar a la comprobación del checkout.
   try{claimOrdinaryReviewRequest(request,"");}catch{}
   context.ui.notify("No se pudo verificar la solicitud; se requiere una preparación nueva.","error");
   throw new Error("Solicitud de revisión rechazada y retirada");
  }
 }});
 return Object.freeze({prepare:(candidate:WorkUnitReviewCandidate,input:OrdinaryReviewInput)=>{
  const request=prepareOrdinaryReview(candidate,input);
  if(pending.has(request.requestId))throw new Error("Ya existe una solicitud pendiente para este candidato y sesión");
  pending.set(request.requestId,request);return request;
 }});
}
