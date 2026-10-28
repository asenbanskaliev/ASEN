import {realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {prepareOrdinaryReview,claimOrdinaryReviewRequest,bindOrdinaryReviewCheckout,type OrdinaryReviewInput,type OrdinaryReviewRequest,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";
import type {WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";
import {availableIndependentPiReviewers,runIndependentPiReview,type PiReviewRegistry,type PiReviewerModel} from "./pi-model-reviewer.js";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "./workspace-review-session.js";
import {awaitNativeRddResult,bindNativeRddResult} from "./native-rdd-result.js";
import {openBoundedCorrection,validateBoundedCorrection,type CorrectionRequest,type CorrectionValidation} from "./bounded-correction.js";

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
 readonly requirements:string;readonly intendedUntracked:readonly string[];readonly priorFiles:readonly Readonly<{path:string;mode:string;objectId:string}>[];
 readonly allowedPaths:readonly string[];used:boolean;
}
const workspaceCorrections=new Map<string,CorrectionState>();
function changedCandidatePaths(before:readonly Readonly<{path:string;mode:string;objectId:string}>[],after:readonly Readonly<{path:string;mode:string;objectId:string}>[]):string[]{
 const previous=new Map(before.map(file=>[file.path,file.mode+":"+file.objectId])),current=new Map(after.map(file=>[file.path,file.mode+":"+file.objectId]));
 return [...new Set([...previous.keys(),...current.keys()])].filter(path=>previous.get(path)!==current.get(path)).sort();
}
async function runWorkspaceReview(context:ReviewCommandContext,correctionId?:string):Promise<unknown>{
 const sessionId=context.sessionManager?.getSessionId?.(),registry=context.modelRegistry,author=context.model;
 if(!context.hasUI||!sessionId||!registry||!author||!context.ui.select||!context.ui.editor||!context.ui.confirm){
  const unavailable="Revisión independiente no disponible: se requiere una sesión Pi interactiva, modelo autor conocido y un modelo revisor autenticado distinto.";
  context.ui.notify(unavailable,"error");return {status:"unavailable",reason:unavailable};
 }
 const correction=correctionId?workspaceCorrections.get(correctionId):undefined;
 if(correctionId&&(!correction||correction.used||correction.sessionId!==sessionId||correction.repository!==realpathSync(context.cwd))){
  const unavailable="La corrección ya se consumió o no pertenece a esta sesión y proyecto.";context.ui.notify(unavailable,"error");return {status:"blocked",reason:unavailable};
 }
 if(correction)correction.used=true;
 const reviewers=availableIndependentPiReviewers(registry,author).filter(model=>!correction||"pi-model:"+model.provider+"/"+model.id!==correction.priorReviewerId),labels=reviewers.map(model=>model.provider+"/"+model.id);
 if(!reviewers.length){const unavailable="Revisión independiente no disponible: no hay otro modelo Pi autenticado en el registro.";context.ui.notify(unavailable,"error");return {status:"unavailable",reason:unavailable};}
 const selected=await context.ui.select("Selecciona un modelo revisor independiente",labels,context.signal?{signal:context.signal}:undefined);
 if(!selected)return {status:"cancelled"};
 const model=reviewers[labels.indexOf(selected)];
 if(!model)throw new Error("El modelo revisor seleccionado ya no está disponible");
 const requirements=correction?.requirements??await context.ui.editor("Requisitos que debe comprobar el revisor","Revisar el cambio completo, alcance autorizado, errores funcionales, riesgos de seguridad, regresiones y pruebas ausentes.");
 if(!requirements?.trim())return {status:"cancelled"};
 let intendedUntracked:string[];
 if(correction)intendedUntracked=[...correction.intendedUntracked];
 else{
  const untrackedText=await context.ui.editor("Rutas untracked que deben incluirse (JSON array; [] si ninguna)","[]");
  if(!untrackedText)return {status:"cancelled"};
  try{const parsed:unknown=JSON.parse(untrackedText);if(!Array.isArray(parsed))throw new Error();intendedUntracked=parsed;}catch{throw new Error("El alcance untracked debe ser un array JSON válido");}
 }
 const reviewerId="pi-model:"+model.provider+"/"+model.id;
 const workspace=openWorkspaceReview({repositoryRoot:realpathSync(context.cwd),intendedUntracked,sessionId,reviewerId,viewParent:tmpdir(),
  risk:{riskId:"pi-independent-review",reason:"Review the exact current workspace snapshot",severity:"high",lenses:["risk","resilience","reliability"]}});
 try{
  const evidence=readWorkspaceReviewEvidence(workspace),paths=evidence.modifiedFiles.map(file=>file.path);
  if(evidence.repositoryState.unexpectedUntracked.length){
   const blocked=Object.freeze({status:"blocked",reason:"Hay archivos untracked fuera del alcance; inclúyelos explícitamente o retíralos antes de revisar.",unexpectedFiles:evidence.repositoryState.unexpectedUntracked});
   context.ui.notify(JSON.stringify(blocked,null,2),"error");return blocked;
  }
  if(paths.length===0){const result={status:"not-required",reason:"El snapshot no contiene cambios revisables.",candidate:evidence.candidate};context.ui.notify(JSON.stringify(result,null,2),"info");return result;}
  if(correction){
   const currentFiles=workspace.manifest.entries.map(entry=>({path:entry.path,mode:entry.mode,objectId:entry.objectId})),changed=changedCandidatePaths(correction.priorFiles,currentFiles);
   if(evidence.candidate.treeIdentity===correction.priorRevision||changed.length===0||changed.some(path=>!correction.allowedPaths.includes(path))){
    return {status:"blocked",reason:"La corrección debe cambiar el candidato exacto y limitarse a los archivos señalados.",allowedPaths:correction.allowedPaths,changedPaths:changed};
   }
  }
  const consent=await context.ui.confirm("Enviar el diff al modelo revisor?",[
   "Pi enviará el diff completo del candidato a:",
   reviewerId,
   "",
   "Candidato: "+evidence.candidate.treeIdentity,
   "Archivos: "+(paths.join(", ")||"(sin cambios)"),
   "El índice real no se modifica. No se ejecutan pruebas en la vista.",
  ].join("\n"));
  if(!consent)return {status:"cancelled",requestId:workspace.requestId,candidate:evidence.candidate};
  const verdict=await runIndependentPiReview({registry,model,author,evidence,requirements,...(context.signal?{signal:context.signal}:{})});
  const rddProbe={schemaVersion:1,requestId:evidence.requestId,sessionId:evidence.sessionId,revision:evidence.candidate.revision,
   treeIdentity:evidence.candidate.treeIdentity,parentIdentity:evidence.candidate.parentIdentity,reviewerId:verdict.reviewerId,
   verdict:verdict.verdict,summary:JSON.stringify({summary:verdict.summary,findings:verdict.findings})};
  const bound=bindNativeRddResult(awaitNativeRddResult(workspace.session),rddProbe);
  let correctionValidation:CorrectionValidation|undefined,correctionNext:string|undefined,status:string;
  if(correction){
   correctionValidation=validateBoundedCorrection(correction.request,{priorRevision:correction.priorRevision,correctedRevision:bound.revision,validation:bound.verdict});
   workspaceCorrections.delete(correctionId!);
   status=bound.verdict==="pass"?"corrected-passed-awaiting-tests":"blocked-after-correction";
  }else if(bound.verdict==="fail"){
   const request=openBoundedCorrection(bound),findingPaths=[...new Set(verdict.findings.map(finding=>finding.path))],changedPaths=new Set(paths);
   if(!findingPaths.length||findingPaths.some(path=>!changedPaths.has(path))){status="blocked";workspaceCorrections.delete(request.correctionId);}
   else{
    const state:CorrectionState={request,repository:workspace.projection.repositoryRoot,sessionId:bound.sessionId,priorRevision:bound.revision,
     priorReviewerId:bound.reviewerId,requirements,intendedUntracked:workspace.projection.intendedUntracked,
     priorFiles:Object.freeze(workspace.manifest.entries.map(entry=>Object.freeze({path:entry.path,mode:entry.mode,objectId:entry.objectId}))),
     allowedPaths:Object.freeze(findingPaths),used:false};
    workspaceCorrections.set(request.correctionId,state);while(workspaceCorrections.size>100)workspaceCorrections.delete(workspaceCorrections.keys().next().value!);
    correctionNext=request.correctionId;status="correction-required";
   }
  }else status="passed-awaiting-tests";
  const result=Object.freeze({status,requestId:bound.requestId,resultId:bound.resultId,candidate:evidence.candidate,reviewerId:bound.reviewerId,
   verdict:bound.verdict,summary:verdict.summary,findings:verdict.findings,tests:evidence.tests,
   ...(correctionValidation?{correction:correctionValidation}:{}),...(correctionNext?{correctionId:correctionNext,allowedCorrectionPaths:workspaceCorrections.get(correctionNext)?.allowedPaths}:{}),
   acceptance:"not-accepted",deliveryAuthority:false});
  context.ui.notify(JSON.stringify(result,null,2),bound.verdict==="fail"?"error":"info");
  return result;
 }finally{closeWorkspaceReview(workspace);}
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
