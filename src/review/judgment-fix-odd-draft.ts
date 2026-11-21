/** T04/T08: traspaso seguro de una propuesta Fix al siguiente plan ODD.
 * No persiste tareas, no inspecciona el modelo y no concede permisos.
 * El candidato del informe es histórico y DEBE validarse de nuevo al planificar. */
import {createHash} from "node:crypto";
import {isAbsolute} from "node:path";
import {sameWorkspaceIdentityPath} from "../runtime/workspace-store.js";
import {validatePortableReviewPaths} from "./review-tree-paths.js";
import {hasSensitiveName} from "../security/primary-tool-policy.js";
import type {StoredJudgmentFixProposal} from "./judgment-fix-proposal-journal.js";

export interface JudgmentFixOddDraft{
 readonly status:"draft-only"|"manual-triage-required";
 readonly sourceProposalId:string;
 readonly sourceReviewRequestId:string;
 readonly sourceCandidateTree:string;
 readonly sourceCandidateRevision:string;
 readonly projectId:string;
 readonly sessionId:string;
 readonly writeSurfaces:readonly string[];
 readonly modelRequested:"unknown";
 readonly modelActuallyUsed:"unknown";
 readonly instructionStatus:"not-provided";
 readonly candidateStatus:"not-revalidated";
 readonly nextCommand:"/asen-plan"|null;
 readonly requiresHumanTriage:boolean;
 readonly requiresNewOddPlan:true;
 readonly requiresFreshCandidate:true;
 readonly requiresFreshWriterConsent:true;
 readonly requiresUserInstruction:true;
 readonly writerAuthority:false;
 readonly authorized:false;
 readonly autoLaunch:false;
 readonly autoMerge:false;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
}
const hex=/^[a-f0-9]{64}$/u;
const tree=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const safe=(value:unknown,max=1024):value is string=>
 typeof value==="string"&&value.length>0&&value.length<=max&&
 value===value.trim()&&value===value.normalize("NFC")&&
 !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(value);

/** Recupera solo identidad y rutas verificables. Nunca construye instrucciones
 * de escritura a partir de texto de los jueces ni interpreta aprobación previa. */
export function draftOddFromStoredFix(input:{
 readonly proposal:StoredJudgmentFixProposal;
 readonly identity:Readonly<{sessionId:string;projectId:string}>;
}):JudgmentFixOddDraft{
 const {proposal,identity}=input??{};
 if(!proposal||!identity||!safe(identity.sessionId)||
  !safe(identity.projectId,32768)||!isAbsolute(identity.projectId)||
  !safe(proposal.id)||!hex.test(proposal.id)||!safe(proposal.requestId)||
  !safe(proposal.sessionId)||!safe(proposal.repositoryRoot,32768)||
  !isAbsolute(proposal.repositoryRoot)||
  !safe(proposal.candidateRevision)||!tree.test(proposal.candidateRevision)||
  !safe(proposal.candidateTreeIdentity)||!tree.test(proposal.candidateTreeIdentity)||
  proposal.candidateTreeIdentity!==proposal.candidateRevision||
  proposal.status!=="proposal-only"||
  !["new-odd-plan","manual-triage"].includes(proposal.requiredAction)||
  proposal.modelActual!=="unknown"||proposal.requiresFreshWriterConsent!==true||
  proposal.autoLaunch!==false||proposal.autoMerge!==false||
  proposal.acceptance!=="not-accepted"||
  proposal.sessionId!==identity.sessionId||
  !sameWorkspaceIdentityPath(proposal.repositoryRoot,identity.projectId))
  throw new Error("Stored Fix proposal is invalid or outside the owning Pi session");
 const expected=createHash("sha256").update([
  proposal.requestId,proposal.sessionId,proposal.repositoryRoot,
  proposal.candidateTreeIdentity
 ].join("\0")).digest("hex");
 if(expected!==proposal.id)throw new Error("Stored Fix proposal identity differs from its source");
 let paths:readonly string[];
 try{
  paths=validatePortableReviewPaths(proposal.paths);
  if(paths.length<1||paths.length>100||
   paths.some(hasSensitiveName)||new Set(paths).size!==paths.length||
   paths.some((path,index)=>path!==proposal.paths[index]))
   throw new Error("unsafe");
 }catch{throw new Error("Stored Fix proposal includes invalid or unsafe paths");}
 return Object.freeze({
  status:proposal.requiredAction==="manual-triage"?
   "manual-triage-required" as const:"draft-only" as const,
  sourceProposalId:proposal.id,
  sourceReviewRequestId:proposal.requestId,
  sourceCandidateTree:proposal.candidateTreeIdentity,
  sourceCandidateRevision:proposal.candidateRevision,
  projectId:identity.projectId,sessionId:identity.sessionId,
  writeSurfaces:Object.freeze([...paths]),
  modelRequested:"unknown" as const,modelActuallyUsed:"unknown" as const,
  instructionStatus:"not-provided" as const,candidateStatus:"not-revalidated" as const,
  nextCommand:proposal.requiredAction==="manual-triage"?null:"/asen-plan" as const,
  requiresHumanTriage:proposal.requiredAction==="manual-triage",
  requiresNewOddPlan:true as const,requiresFreshCandidate:true as const,
  requiresFreshWriterConsent:true as const,requiresUserInstruction:true as const,
  writerAuthority:false as const,authorized:false as const,
  autoLaunch:false as const,autoMerge:false as const,
  acceptance:"not-accepted" as const,globalFull:false as const
 });
}
