import {realpathSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import {prepareOrdinaryReview,claimOrdinaryReviewRequest,bindOrdinaryReviewCheckout,type OrdinaryReviewInput,type OrdinaryReviewRequest,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";
import type {WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";
import {availableIndependentPiReviewers,runIndependentPiReview,runPiLensReview,type PiReviewRegistry,type PiReviewerModel} from "./pi-model-reviewer.js";
import {REVIEW_LENSES} from "./review-lens-contracts.js";
import {consolidatePiLensReviews} from "./review-results.js";
import {selectAdaptiveReviewLenses} from "./review-lens-selection.js";
import {runJudgmentDay} from "./judgment-day.js";
import {projectOddReviewHandoff,proposeJudgmentFixHandoff,type ScopedOddTodo,type JudgmentFixHandoff} from "./odd-agent-review-flow.js";
import type {StoredJudgmentFixProposal} from "./judgment-fix-proposal-journal.js";
import {draftOddFromStoredFix} from "./judgment-fix-odd-draft.js";
import {inspectLiveFixCandidate} from "./judgment-fix-odd-preflight.js";
import type {RouteChoice} from "../runtime/lifecycle/profiles.js";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview,WorkspaceReviewScopeError} from "./workspace-review-session.js";
import {awaitNativeRddResult,bindNativeRddResult} from "./native-rdd-result.js";
import {openBoundedCorrection,validateBoundedCorrection,type CorrectionRequest,type CorrectionValidation} from "./bounded-correction.js";
import {assertReviewSessionOpen} from "./review-session.js";
import {assertWorkspaceProjectionRepository,revalidateWorkspaceReviewProjection,type WorkspaceReviewProjection} from "./workspace-review-projection.js";
import {captureReviewRepositoryBinding,assertReviewRepositoryBinding} from "./review-tree-inspection.js";
import {validatePortableReviewPaths} from "./review-tree-paths.js";
import {hasSensitiveName} from "../security/primary-tool-policy.js";
import {prepareReviewPanelDescriptor,renderReviewPanel} from "../runtime/ui/review-panel.js";
import {createNativeRddControl,type NativeRddControl,type NativeRddObservation} from "./native-rdd-control.js";
import type {ReviewLens,ReviewRiskInput} from "./review-risk.js";

interface CandidateReviewComponent{render(width:number):string[];invalidate():void;handleInput(data:string):void}
interface CandidateReviewBindings{matches(data:string,action:"tui.select.cancel"|"tui.select.confirm"):boolean}
type CandidateReviewCustom=(factory:(tui:{requestRender():void},theme:unknown,bindings:CandidateReviewBindings|undefined,done:(value:unknown)=>void)=>CandidateReviewComponent)=>Promise<unknown>;
interface ReviewCommandContext{
 cwd:string;hasUI?:boolean;signal?:AbortSignal;modelRegistry?:PiReviewRegistry;model?:PiReviewerModel;
 sessionManager:{getSessionId():string};
 ui:{notify(message:string,level:"info"|"error"):void;select?:(title:string,options:string[],opts?:{signal?:AbortSignal})=>Promise<string|undefined>;editor?:(title:string,prefill?:string)=>Promise<string|undefined>;confirm?:(title:string,message:string)=>Promise<boolean>;custom?:CandidateReviewCustom};
}
interface ReviewCommand{
 description:string;handler(args:string|undefined,context:ReviewCommandContext):Promise<OrdinaryReviewCheckout|string|unknown>|OrdinaryReviewCheckout|string;
}
export interface OrdinaryReviewCommandController{
 prepare(candidate:WorkUnitReviewCandidate,input:OrdinaryReviewInput):OrdinaryReviewRequest;
}
interface CandidateReviewScope{
 readonly manager:ReviewCommandContext["sessionManager"];readonly sessionId:string;
 readonly cwd:string;readonly repository:string;readonly signal:AbortSignal|undefined;
}
/** Inspection only: project the genuine checkout afresh without consuming its review authority. */
async function showPreparedReviewCandidate(context:ReviewCommandContext,checkout:OrdinaryReviewCheckout,scope:CandidateReviewScope,complete:()=>OrdinaryReviewCheckout):Promise<OrdinaryReviewCheckout>{
 const unavailable=()=>new Error("Review scope or candidate changed; no view published");
 const descriptor=()=>{
  try{
   if(context.sessionManager!==scope.manager||scope.manager.getSessionId()!==scope.sessionId||context.cwd!==scope.cwd||context.signal!==scope.signal||scope.signal?.aborted||checkout.repository!==scope.repository||realpathSync(context.cwd)!==scope.repository)return null;
   return prepareReviewPanelDescriptor({checkout});
  }catch{return null;}
 };
 const ui=context.ui,custom=ui.custom;
 if(typeof custom!=="function"||descriptor()===null)throw unavailable();
 let closeModal:(()=>void)|undefined;
 const abort=()=>closeModal?.();
 scope.signal?.addEventListener("abort",abort,{once:true});
 try{
  await custom.call(ui,(_tui,_theme,bindings,done)=>{
   let closed=false;
   const close=()=>{if(!closed){closed=true;done(undefined);}};closeModal=close;
   const component:CandidateReviewComponent={
    render:width=>[...renderReviewPanel(descriptor(),width)],
    invalidate(){},
    handleInput(data){if(descriptor()===null||!bindings||bindings.matches(data,"tui.select.cancel")||bindings.matches(data,"tui.select.confirm"))close();},
   };
   if(descriptor()===null)close();
   return component;
  });
 }finally{scope.signal?.removeEventListener("abort",abort);closeModal=undefined;}
 if(descriptor()===null)throw unavailable();
 return complete();
}
interface BoundOddReview{
 readonly writeSurfaces:readonly string[];readonly requirements:string;
 readonly revalidate:()=>Promise<void>;
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
export const REVIEW_FINDING_CLAIM_MAX_BYTES=1024;
export const REVIEW_FINDING_CLAIMS_MAX_BYTES=8192;
/** Cuts at the last whole character that still fits within maxBytes UTF-8 bytes. */
export function truncateClaim(claim:string,maxBytes:number):{text:string;truncated:boolean}{
 if(Buffer.byteLength(claim)<=maxBytes)return {text:claim,truncated:false};
 let kept="",bytes=0;
 for(const character of claim){
  const size=Buffer.byteLength(character);
  if(bytes+size>maxBytes)break;
  kept+=character;bytes+=size;
 }
 return {text:kept,truncated:true};
}
/** Retained v4.8.0 relay bound (reference lib/review-coordinator.ts): untrusted reviewer claims never travel whole.
 * The correction/acknowledgment envelope owned by P22/P23 is its consumer; nothing here routes on the text.
 * Claims are added in ids order until the next one would pass the total bound; the rest are only listed as omitted.
 * An id with no single matching claim is skipped, so neither case can pass for a whole claim. */
export function boundedFindingClaims(ids:readonly string[],findings:readonly {id:string;claim:string}[]):{claims:Record<string,string>;truncated:readonly string[];omitted:readonly string[]}|undefined{
 const entries:[string,string][]=[],truncated:string[]=[],omitted:string[]=[];
 let total=0;
 for(const id of ids){
  const matches=findings.filter(finding=>finding.id===id);
  if(matches.length!==1)continue;
  const {text,truncated:cut}=truncateClaim(matches[0]!.claim,REVIEW_FINDING_CLAIM_MAX_BYTES),size=Buffer.byteLength(text);
  if(omitted.length>0||total+size>REVIEW_FINDING_CLAIMS_MAX_BYTES){omitted.push(id);continue;}
  total+=size;entries.push([id,text]);
  if(cut)truncated.push(id);
 }
 return entries.length===0?undefined:Object.freeze({claims:Object.fromEntries(entries),truncated:Object.freeze(truncated),omitted:Object.freeze(omitted)});
}
const DEFAULT_REVIEW_RISK:Readonly<{riskId:string;reason:string;severity:"low"|"high";lenses:readonly ReviewLens[]}>={riskId:"pi-independent-review",reason:"Review the exact current workspace snapshot",severity:"high",lenses:["risk","resilience","reliability"]};
/** Mirrors the canonical lens whitelist owned by planReviewRisk in review-risk.ts (that set is module-private). */
const ALLOWED_REVIEW_LENSES:readonly ReviewLens[]=["risk","resilience","readability","reliability"];
const ASSESSMENT_LENSES:Readonly<Record<"passive"|"medium"|"high",readonly ReviewLens[]>>=Object.freeze({passive:["risk"],medium:["risk","reliability"],high:["risk","resilience","reliability"]});
const REVIEW_RISK_REASON_MAX_BYTES=400;
function assessmentText(value:unknown):string{
 return typeof value==="string"?value.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").replace(/\s+/gu," ").trim():"";
}
function recommendedLenses(value:unknown):ReviewLens[]{
 if(!Array.isArray(value))return [];
 const selected:ReviewLens[]=[];
 for(const item of value){
  const lens=assessmentText(item) as ReviewLens;
  if(ALLOWED_REVIEW_LENSES.includes(lens)&&!selected.includes(lens))selected.push(lens);
 }
 return selected;
}
/** Descriptive mapping of one read-only native assess observation to the workspace review risk.
 * It never grants review, acknowledgment or delivery authority, and any missing or unusable payload keeps the default triple. */
export function reviewRiskFromNativeAssessment(observation:NativeRddObservation|undefined):ReviewRiskInput{
 const fallback={...DEFAULT_REVIEW_RISK,lenses:[...DEFAULT_REVIEW_RISK.lenses]};
 if(observation===undefined||observation.status!=="available")return fallback;
 const data=observation.data;
 const risk=assessmentText(data.risk).toLowerCase();
 if(risk!=="passive"&&risk!=="medium"&&risk!=="high")return fallback;
 const recommended=recommendedLenses(data.lenses);
 const lenses=recommended.length?recommended:[...ASSESSMENT_LENSES[risk]];
 const codes=[...new Set((Array.isArray(data.reasons)?data.reasons:[]).map(reason=>assessmentText((reason as {code?:unknown}|null)?.code)).filter(Boolean))].slice(0,4);
 const due=data.review_due===true||data.review_due===false?" review due "+(data.review_due?"yes":"no"):"";
 const parts=[`native assess risk ${risk}`,...codes.map(code=>`native reason ${code}`),due].filter(Boolean);
 const reason=truncateClaim([DEFAULT_REVIEW_RISK.reason,parts.join("; ")].join("; "),REVIEW_RISK_REASON_MAX_BYTES).text;
 return {riskId:DEFAULT_REVIEW_RISK.riskId,reason:reason||DEFAULT_REVIEW_RISK.reason,severity:risk==="high"?"high":"low",lenses};
}
/** Silent read-only observation: the explicit `native assess` command keeps its own notification, this one only informs the plan. */
async function assessWorkspaceReviewRisk(nativeRdd:NativeRddControl,context:ReviewCommandContext):Promise<ReviewRiskInput>{
 try{
  const observation=await nativeRdd.observe("assess",{cwd:context.cwd,sessionManager:context.sessionManager,ui:{notify:()=>{}},...(context.signal?{signal:context.signal}:{})});
  return reviewRiskFromNativeAssessment(observation);
 }catch{return reviewRiskFromNativeAssessment(undefined);}
}
async function runWorkspaceReview(context:ReviewCommandContext,nativeRdd:NativeRddControl,correctionId?:string,fourR=false,resolveLensRoute?:(context:ReviewCommandContext,lens:ReviewLens|"jd-judge-a"|"jd-judge-b"|"jd-fix-agent")=>Promise<RouteChoice|undefined>,adaptive=false,judgmentDay=false,boundOdd?:BoundOddReview,persistFixProposal?:(context:ReviewCommandContext,proposal:JudgmentFixHandoff)=>Promise<{id:string}>):Promise<unknown>{
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
 const assertOddCurrent=async()=>{if(boundOdd){await boundOdd.revalidate();assertContextCurrent();}};
 try{
 assertCorrectionReserved();
 await assertOddCurrent();
 const reviewers=availableIndependentPiReviewers(registry,author).filter(model=>!correction||"pi-model:"+model.provider+"/"+model.id!==correction.priorReviewerId),labels=reviewers.map(model=>model.provider+"/"+model.id);
 if(!reviewers.length){const unavailable="Revisión independiente no disponible: no hay otro modelo Pi autenticado en el registro.";context.ui.notify(unavailable,"error");return {status:"unavailable",reason:unavailable};}
 const selected=await context.ui.select("Selecciona un modelo revisor independiente",labels,context.signal?{signal:context.signal}:undefined);
 assertCorrectionReserved();assertContextCurrent();
 if(!selected)return {status:"cancelled"};
 const model=reviewers[labels.indexOf(selected)];
 if(!model)throw new Error("El modelo revisor seleccionado ya no está disponible");
 const requirements=correction?.requirements??await context.ui.editor("Requisitos que debe comprobar el revisor",boundOdd?.requirements??"Revisar el cambio completo, alcance autorizado, errores funcionales, riesgos de seguridad, regresiones y pruebas ausentes.");
 assertContextCurrent();
 if(!requirements?.trim())return {status:"cancelled"};
 let reviewPaths:readonly string[];
 if(correction)reviewPaths=correction.reviewPaths;
 else if(boundOdd){
  reviewPaths=validatePortableReviewPaths([...boundOdd.writeSurfaces]);
  assertNoSensitiveReviewPaths(reviewPaths);
  await assertOddCurrent();
 }else{
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
   const validated=validatePortableReviewPaths(parsed);assertNoSensitiveReviewPaths(validated);
   if(boundOdd&&validated.some(path=>!boundOdd.writeSurfaces.includes(path)))
    throw new Error("ODD review cannot add untracked paths outside the frozen task scope");
   intendedUntracked=[...validated];
  }catch(error){
   if(error instanceof Error&&error.message.startsWith("La revisión independiente no puede incluir rutas sensibles"))throw error;
   throw new Error("El alcance untracked debe ser un array JSON válido y no incluir rutas sensibles");
  }
 }
 assertNoSensitiveReviewPaths([...reviewPaths,...intendedUntracked]);
 await assertOddCurrent();
 const assessed=await assessWorkspaceReviewRisk(nativeRdd,context);
 const selectedLenses:readonly ReviewLens[]=fourR?[...REVIEW_LENSES]:adaptive?selectAdaptiveReviewLenses(assessed).lenses:[];
 const specialized=fourR||adaptive;
 const risk:ReviewRiskInput=specialized?{...assessed,lenses:[...selectedLenses]}:assessed;
 const lensModels=new Map<ReviewLens,PiReviewerModel>();
 if(specialized){
  for(const lens of selectedLenses){
   const route=await resolveLensRoute?.(context,lens);
   assertContextCurrent();
   // The in-process provider interface has no verified per-call effort override.
   // Refuse it rather than silently advertising an effort that was not used.
   if(route?.thinking!==undefined)throw new Error("Specialized review thinking is configured but the current Pi review API cannot prove applying it; remove this effort or use a supported agent route");
   const chosen=route?.model;
   const selectedModel=chosen===undefined?model:reviewers.find(entry=>entry.provider+"/"+entry.id===chosen);
   if(!selectedModel)throw new Error("Configured specialized lens model is unavailable, unauthenticated or the same as author: "+lens);
   lensModels.set(lens,selectedModel);
  }
 }
 assertContextCurrent();
 let judges:readonly [PiReviewerModel,PiReviewerModel]|undefined;
 if(judgmentDay){
  const modelId=(candidate:PiReviewerModel)=>candidate.provider+"/"+candidate.id;
  const routeA=await resolveLensRoute?.(context,"jd-judge-a");
  assertContextCurrent();
  const routeB=await resolveLensRoute?.(context,"jd-judge-b");
  assertContextCurrent();
  if(routeA?.thinking!==undefined||routeB?.thinking!==undefined)
   throw new Error("Judgment Day thinking is configured but the in-process Pi review API cannot prove applying it");
  const judgeA=routeA?.model===undefined?model:reviewers.find(candidate=>modelId(candidate)===routeA.model);
  if(!judgeA)throw new Error("Judgment Day Judge A model is not authenticated or differs from available Pi models");
  const candidates=reviewers.filter(candidate=>modelId(candidate)!==modelId(judgeA));
  if(candidates.length===0)throw new Error("Judgment Day requires a second independent authenticated reviewer model");
  let judgeB:PiReviewerModel|undefined;
  if(routeB?.model!==undefined){
   judgeB=candidates.find(candidate=>modelId(candidate)===routeB.model);
  }else{
   const choice=await context.ui.select("Selecciona segundo modelo independiente para Judgment Day",candidates.map(modelId),context.signal?{signal:context.signal}:{});
   assertContextCurrent();
   if(!choice)return {status:"cancelled",reason:"No second judge selected"};
   judgeB=candidates.find(candidate=>modelId(candidate)===choice);
  }
  if(!judgeB)throw new Error("Judgment Day Judge B must be different, authenticated and available");
  judges=[judgeA,judgeB];
 }
 await assertOddCurrent();
 const reviewerId="pi-model:"+(judges?judges[0].provider+"/"+judges[0].id:model.provider+"/"+model.id);
 let workspace:ReturnType<typeof openWorkspaceReview>;
 try{workspace=openWorkspaceReview({repositoryRoot:projectRoot,intendedUntracked,sessionId,reviewerId,viewParent:tmpdir(),
  risk},{reviewPaths},correction?{previousProjection:correction.priorProjection,allowedPaths:correction.allowedPaths}:undefined);}
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
  const consent=await context.ui.confirm(judgmentDay?"Autorizar dos jueces independientes Judgment Day?":fourR?"Autorizar cuatro solicitudes de revisión 4R?":adaptive?`Autorizar ${selectedLenses.length} revisiones proporcionales?`:"Enviar el diff al modelo revisor?",[
   judgmentDay?"Pi enviará el mismo diff en DOS llamadas separadas a dos modelos independientes (posible coste por llamada):":fourR?"Pi enviará el mismo diff en CUATRO llamadas separadas a los modelos indicados abajo (posible coste por llamada):":adaptive?`Pi enviará el mismo diff en ${selectedLenses.length} llamadas separadas (posible coste por llamada):`:"Pi enviará el diff completo del candidato a:",
   reviewerId,
   "",
   ...(specialized?["Lentes y modelos verificados: "+selectedLenses.map(lens=>lens+" = "+lensModels.get(lens)!.provider+"/"+lensModels.get(lens)!.id).join("; "),"Estas revisiones son análisis; no conceden autorización RDD ni de escritura."]:[]),
   ...(judgmentDay?["Judge A: "+judges![0].provider+"/"+judges![0].id,"Judge B: "+judges![1].provider+"/"+judges![1].id,"Judgment Day NO inicia Fix Agent ni autoriza escrituras o integración."]:[]),
   "Candidato: "+evidence.candidate.treeIdentity,
   "Archivos: "+(paths.join(", ")||"(sin cambios)"),
   "El índice real no se modifica. No se ejecutan pruebas en la vista.",
  ].join("\n"));
  assertContextCurrent();await assertOddCurrent();assertReviewSessionOpen(workspace.session);
  if(!consent)return {status:"cancelled",requestId:workspace.requestId,candidate:evidence.candidate};
  assertCorrectionReserved();
  assertNoSensitiveReviewPaths([...evidence.modifiedFiles.map(file=>file.path),...evidence.candidateFiles.map(file=>file.path)]);
  revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});
  if(judgmentDay){
   assertContextCurrent();await assertOddCurrent();assertReviewSessionOpen(workspace.session);
   const report=await runJudgmentDay({registry,author,judgeA:judges![0],judgeB:judges![1],evidence,requirements,...(context.signal?{signal:context.signal}:{}),validateBeforeJudge:async()=>{await assertOddCurrent();assertContextCurrent();assertReviewSessionOpen(workspace.session);revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});}});
   await assertOddCurrent();
   revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});
   assertContextCurrent();
   let fixProfile:RouteChoice|undefined,fixProfileUnavailable=false;
   if(report.status!=="analysis-complete"){
    try{fixProfile=await resolveLensRoute?.(context,"jd-fix-agent");}
    catch{fixProfileUnavailable=true;}
   }
   await assertOddCurrent();assertContextCurrent();
   const fixHandoff=proposeJudgmentFixHandoff({
    report,evidence,...(fixProfile?{fixProfile}:{}),fixProfileUnavailable
   });
   let fixStorage:"not-required"|"stored"|"unavailable"="not-required";
   let fixProposalId:string|undefined;
   if(fixHandoff.status==="fix-planning-required"||
    fixHandoff.status==="manual-triage-required"){
    fixStorage="unavailable";
    if(persistFixProposal)try{
     await assertOddCurrent();assertContextCurrent();
     const receipt=await persistFixProposal(context,fixHandoff);
     await assertOddCurrent();assertContextCurrent();
     if(!/^[a-f0-9]{64}$/u.test(receipt.id))throw new Error("Invalid Fix proposal journal receipt");
     fixProposalId=receipt.id;fixStorage="stored";
    }catch{
     await assertOddCurrent();assertContextCurrent();
     // La revisión auténtica sigue visible; ningún fallo de diario concede Writer.
    }
   }
   const visible=report.findings.slice(0,40).map(({judge,reviewerId,finding})=>({judge,reviewerId,...finding}));
   const result=Object.freeze({
    status:report.status,requestId:report.requestId,candidate:evidence.candidate,judges:report.judges,
    findings:visible,omittedFindings:report.findings.length-visible.length,
    acceptance:report.acceptance,deliveryAuthority:report.deliveryAuthority,autoMerge:report.autoMerge,
    fixAgent:report.fixAgent,fixHandoff,fixStorage,...(fixProposalId?{fixProposalId}:{}),nativeRddAdmission:"not-attempted"
   });
   closeWorkspace();
   revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});
   assertContextCurrent();context.ui.notify(JSON.stringify(result,null,2),report.status==="analysis-complete"?"info":"error");
   return result;
  }
  if(specialized){
   const reports=[];
   for(const lens of selectedLenses){
    assertCorrectionReserved();assertContextCurrent();await assertOddCurrent();assertReviewSessionOpen(workspace.session);
    revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});
    reports.push(await runPiLensReview({registry,model:lensModels.get(lens)!,author,evidence,requirements,lens,...(context.signal?{signal:context.signal}:{})}));
   }
   await assertOddCurrent();
   const bundle=consolidatePiLensReviews({
    requestId:evidence.requestId,sessionId:evidence.sessionId,
    candidateTreeIdentity:evidence.candidate.treeIdentity,candidateRevision:evidence.candidate.revision,
    lenses:selectedLenses
   },reports);
   const visible=bundle.findings.slice(0,40).map(({lens,reviewerId,finding})=>({lens,reviewerId,...finding}));
   const result=Object.freeze({
    status:bundle.status==="fail"?(fourR?"4r-findings-require-review":"adaptive-findings-require-review"):(fourR?"4r-analysis-complete":"adaptive-analysis-complete"),
    requestId:bundle.requestId,candidate:evidence.candidate,reviewerId,
    lenses:bundle.lenses,reviews:bundle.reports.map(report=>({lens:report.lens,reviewerId:report.reviewerId,
      verdict:report.verdict,findingsCount:report.findings.length})),
    findings:visible,omittedFindings:bundle.findings.length-visible.length,
    acceptance:"not-accepted",deliveryAuthority:false,nativeRddAdmission:"not-attempted",
    ...(adaptive?{independentVerification:assessed.severity==="high"?"required-not-run":"not-required"}:{})
   });
   closeWorkspace();
   revalidateWorkspaceReviewProjection(workspace.projection,{repositoryRoot:workspace.projection.repositoryRoot,intendedUntracked:workspace.projection.intendedUntracked});
   assertContextCurrent();context.ui.notify(JSON.stringify(result,null,2),bundle.status==="fail"?"error":"info");
   return result;
  }
  await assertOddCurrent();
  const verdict=await runIndependentPiReview({registry,model,author,evidence,requirements,...(context.signal?{signal:context.signal}:{})});
  assertCorrectionReserved();assertContextCurrent();await assertOddCurrent();
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
   verdict:bound.verdict,risk:evidence.risks,summary:verdict.summary,findings:verdict.findings,tests:evidence.tests,
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
export function registerOrdinaryReviewCommand(register:(name:string,command:ReviewCommand)=>void,nativeRdd:NativeRddControl=createNativeRddControl(),resolveLensRoute?:(context:ReviewCommandContext,lens:ReviewLens|"jd-judge-a"|"jd-judge-b"|"jd-fix-agent")=>Promise<RouteChoice|undefined>,readOddTodos?:(context:ReviewCommandContext)=>Promise<readonly ScopedOddTodo[]>,fixProposals?:Readonly<{
 record:(context:ReviewCommandContext,proposal:JudgmentFixHandoff)=>Promise<{id:string}>;
 list:(context:ReviewCommandContext)=>Promise<readonly StoredJudgmentFixProposal[]>;
}>):OrdinaryReviewCommandController{
 const pending=new Map<string,OrdinaryReviewRequest>();
 register("asen-review",{description:"Revisión manual ASEN del workspace o candidato preparado; native status | native assess observa RDD en solo lectura, sin aprobación Go ni autorización de entrega; cancelar/confirmar cierra la vista, sin UI devuelve checkout",handler:(args,context)=>{
  const command=(args??"").trim();
  if(command==="native status"||command==="native assess")return nativeRdd.observe(command==="native status"?"status":"assess",context);
  if(command==="fixes"){
   if(!fixProposals)return Promise.resolve({status:"unavailable",reason:"Fix proposal journal is not configured"});
   return fixProposals.list(context);
  }
  const fixPlanMatch=/^fix-plan ([a-f0-9]{64})(?: (verify))?$/u.exec(command);
  if(fixPlanMatch){
   if(!fixProposals)return Promise.resolve({status:"unavailable",reason:"Fix proposal journal is not configured"});
   return (async()=>{
    const manager=context.sessionManager,sessionId=manager?.getSessionId?.();
    if(!manager||!sessionId||!context.cwd||context.signal?.aborted)
     throw new Error("Fix ODD draft requires the original live Pi session");
    const projectId=realpathSync(context.cwd),identity={sessionId,projectId};
    const validate=()=>{
     if(context.signal?.aborted||context.sessionManager!==manager||
      manager.getSessionId()!==sessionId||realpathSync(context.cwd)!==projectId)
      throw new Error("Fix ODD draft session changed; new inspection required");
    };
    const original=(await fixProposals.list(context)).find(row=>row.id===fixPlanMatch[1]);
    validate();
    if(!original)return {status:"blocked" as const,reason:"The original Fix proposal is not available to this Pi session"};
    const first=JSON.stringify(original);
    const draft=draftOddFromStoredFix({proposal:original,identity});
    const current=(await fixProposals.list(context)).find(row=>row.id===fixPlanMatch[1]);
    validate();
    if(!current||JSON.stringify(current)!==first)
     throw new Error("Fix proposal changed during ODD draft preparation");
    // 'verify' reads the live Git candidate. A matching tree is evidence of
    // source identity, never permission to write or an ODD plan submission.
    const result=fixPlanMatch[2]==="verify"?
     Object.freeze({draft,candidateCheck:inspectLiveFixCandidate(draft)}):draft;
    validate();
    context.ui.notify(JSON.stringify(result,null,2),draft.status==="manual-triage-required"?"error":"info");
    return result;
   })();
  }
  const oddMatch=/^todo (todo-[a-f0-9-]{36})(?: (adaptive))?$/u.exec(command);
  if(oddMatch){
   if(!readOddTodos)return Promise.resolve({status:"unavailable",reason:"ODD Todo store is not enabled"});
   return (async()=>{
    const manager=context.sessionManager,sessionId=manager?.getSessionId?.(),cwd=context.cwd;
    if(!sessionId||!context.hasUI||!cwd||context.signal?.aborted)
     throw new Error("ODD review needs the active Pi UI session");
    const projectId=realpathSync(cwd),identity={sessionId,projectId};
    const validate=()=>{
     if(context.signal?.aborted||context.sessionManager!==manager||
      manager.getSessionId()!==sessionId||realpathSync(context.cwd)!==projectId)
      throw new Error("ODD review session changed; fresh inspection required");
    };
    const gitHead=()=>execFileSync("git",["rev-parse","HEAD"],{
     cwd:projectId,encoding:"utf8",timeout:2000,windowsHide:true,
     stdio:["ignore","pipe","ignore"]}).trim();
    const first=(await readOddTodos(context)).find(row=>row.taskId===oddMatch[1]);
    validate();
    if(!first)throw new Error("The requested ODD Todo is absent from the owning session");
    const head=gitHead();
    const lenses=["risk","resilience","reliability","readability"] as const;
    const profiles=await Promise.all(lenses.map(async lens=>{
     const choice=await resolveLensRoute?.(context,lens);
     return {lens,...(choice?{choice}:{})};
    }));
    validate();
    const current=(await readOddTodos(context)).find(row=>row.taskId===oddMatch[1]);
    validate();
    if(!current||JSON.stringify(current)!==JSON.stringify(first)||head!==gitHead())
     throw new Error("ODD Todo or Git candidate changed while preparing review");
    const result=projectOddReviewHandoff({identity,todo:current,currentHead:head,profiles});
    if(oddMatch[2]==="adaptive"&&result.status==="review-setup-required"){
     const snapshot=JSON.stringify(current);
     const revalidate=async()=>{
      validate();
      const latest=(await readOddTodos(context)).find(row=>row.taskId===oddMatch[1]);
      validate();
      if(!latest||JSON.stringify(latest)!==snapshot||gitHead()!==head)
       throw new Error("ODD Todo or Git HEAD changed; review cancelled before model use");
     };
     await revalidate();
     return runWorkspaceReview(context,nativeRdd,undefined,false,resolveLensRoute,true,false,{
      writeSurfaces:result.writeSurfaces,
      requirements:(current.description??current.title).slice(0,2048),
      revalidate
     });
    }
    context.ui.notify(JSON.stringify(result,null,2),result.status==="blocked"?"error":"info");
    return result;
   })();
  }
  if(command==="workspace")return runWorkspaceReview(context,nativeRdd);
  if(command==="workspace 4r")return runWorkspaceReview(context,nativeRdd,undefined,true,resolveLensRoute);
  if(command==="workspace adaptive")return runWorkspaceReview(context,nativeRdd,undefined,false,resolveLensRoute,true);
  if(command==="workspace judgment-day")return runWorkspaceReview(context,nativeRdd,undefined,false,resolveLensRoute,false,true,undefined,fixProposals?.record);
  const correctionMatch=/^workspace\s+correction\s+([a-f0-9]{64})$/u.exec(command);
  if(correctionMatch)return runWorkspaceReview(context,nativeRdd,correctionMatch[1]);
  if(typeof args!=="string"||! /^[a-f0-9]{64}$/.test(args)){
   const usage="Uso: /asen-review <solicitud-id> | /asen-review workspace | /asen-review workspace 4r | /asen-review workspace adaptive | /asen-review workspace judgment-day | /asen-review todo <id> | /asen-review todo <id> adaptive | /asen-review fixes | /asen-review fix-plan <id> | /asen-review fix-plan <id> verify | /asen-review native status | /asen-review native assess (solo lectura; revisión manual ASEN no es aprobación Go)";context.ui.notify(usage,"info");return usage;
  }
  const request=pending.get(args);
  if(!request)throw new Error("No existe solicitud pendiente en esta instancia de ASEN");
  pending.delete(args);
  try{
   const manager=context.sessionManager,sessionId=manager.getSessionId(),cwd=context.cwd,repository=realpathSync(cwd);
   const checkout=bindOrdinaryReviewCheckout(request,sessionId,repository);
   const complete=()=>{context.ui.notify("Candidato y sesión verificados; revisión nativa RDD pendiente. No hay autorización de entrega.","info");return checkout;};
   if(context.hasUI===true&&typeof context.ui.custom==="function")return showPreparedReviewCandidate(context,checkout,{manager,sessionId,cwd,repository,signal:context.signal},complete);
   return complete();
  }catch{
   // También consume si el host falla antes de llegar a la comprobación del checkout.
   const reject=():never=>{context.ui.notify("No se pudo verificar la solicitud; se requiere una preparación nueva.","error");throw new Error("Solicitud de revisión rechazada y retirada");};
   try{claimOrdinaryReviewRequest(request,"");}catch{return reject();}
   return reject();
  }
 }});
 return Object.freeze({prepare:(candidate:WorkUnitReviewCandidate,input:OrdinaryReviewInput)=>{
  const request=prepareOrdinaryReview(candidate,input);
  if(pending.has(request.requestId))throw new Error("Ya existe una solicitud pendiente para este candidato y sesión");
  pending.set(request.requestId,request);return request;
 }});
}
