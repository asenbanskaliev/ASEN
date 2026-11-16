/** T04/T05/T08: puente de solo lectura entre ODD/TODOS, perfiles y revisión.
 * No ejecuta modelos, no crea Todos, ni transfiere autoridad Writer. */
import type {TodoContext,TodoItem} from "../runtime/lifecycle/todo-store.js";
import type {TaskEvent} from "../runtime/task-replay.js";
import type {RouteChoice} from "../runtime/lifecycle/profiles.js";
import {sameWorkspaceIdentityPath} from "../runtime/workspace-store.js";
import {isReviewLens} from "./review-lens-contracts.js";
import type {ReviewLens} from "./review-risk.js";
import type {JudgmentDayReport} from "./judgment-day.js";
import {isIssuedJudgmentDayReport} from "./judgment-day.js";
import type {PiReviewEvidence} from "./pi-model-reviewer.js";
import {isWorkspaceReviewEvidenceGenuine} from "./workspace-review-session.js";
import {validatePortableReviewPaths} from "./review-tree-paths.js";
import {hasSensitiveName} from "../security/primary-tool-policy.js";

export type ScopedOddTodo=TodoItem&{current:TaskEvent};
export type ReviewProfileObservation=Readonly<{lens:ReviewLens;model:string;thinking:string;actual:"unknown"}>;
export interface OddReviewHandoff{
 readonly status:"blocked"|"review-setup-required";
 readonly blockers:readonly string[];
 readonly taskId:string;
 readonly candidateRevision:string;
 readonly writeSurfaces:readonly string[];
 readonly workerModelRequested:string;
 readonly reviewerProfiles:readonly ReviewProfileObservation[];
 readonly reviewerModelActual:"unknown";
 readonly nextCommand:"/asen-review workspace adaptive";
 readonly requiresNewConsent:true;
 readonly accepted:false;
 readonly writerAuthority:false;
}
const sha=/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const safe=(v:unknown,max=256):v is string=>typeof v==="string"&&v.length>0&&v.length<=max&&v===v.trim()&&
 v===v.normalize("NFC")&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(v);

/** Solo propone revisión de un Worker ODD propio con candidato congelado.
 * El HEAD no prueba que el diff sea correcto: la revisión volverá a inspeccionarlo. */
export function projectOddReviewHandoff(input:{
 readonly identity:TodoContext;
 readonly todo:ScopedOddTodo;
 readonly currentHead:string;
 readonly profiles:readonly Readonly<{lens:ReviewLens;choice?:RouteChoice}>[];
}):OddReviewHandoff{
 const {identity,todo}=input;
 if(!identity||!safe(identity.sessionId,1024)||!safe(identity.projectId,32768)||
  !todo||!safe(todo.taskId,128)||!todo.current||!Array.isArray(input.profiles)||
  input.profiles.length!==4||new Set(input.profiles.map(x=>x.lens)).size!==4||
  input.profiles.some(x=>!x||!isReviewLens(x.lens)||
   (x.choice?.model!==undefined&&!safe(x.choice.model))||
   (x.choice?.thinking!==undefined&&!safe(x.choice.thinking,32))))
  throw new Error("Invalid ODD review handoff request");
 const blockers:string[]=[];
 const plan=todo.plan;
 if(todo.current.sessionId!==identity.sessionId||
  !sameWorkspaceIdentityPath(todo.current.projectId,identity.projectId))
  blockers.push("Todo belongs to another Pi session or Git project");
 if(plan?.role!=="worker"||!todo.requestId?.startsWith("asen-plan:")||
  !todo.requestId.endsWith(":worker")||!plan.writerAuthorizationBasis)
  blockers.push("Todo is not an exact planned ODD Worker");
 if(todo.current.state!=="succeeded")
  blockers.push("Worker Todo has no observed succeeded result awaiting review");
 const candidate=plan?.candidate;
 if(!candidate||!sha.test(candidate.revision)||!sameWorkspaceIdentityPath(candidate.repository,identity.projectId))
  blockers.push("Worker candidate is absent or belongs to another project");
 if(!sha.test(input.currentHead)||candidate?.revision!==input.currentHead)
  blockers.push("Git HEAD differs from the frozen ODD candidate");
 let scope:readonly string[]=[];
 try{
  scope=validatePortableReviewPaths(plan?.writeSurfaces??[]);
  if(scope.length<1||scope.some(hasSensitiveName))throw new Error("invalid scope");
 }catch{blockers.push("Worker write scope is empty, sensitive or invalid");}
 const profiles=Object.freeze(input.profiles.map(row=>Object.freeze({
  lens:row.lens,model:row.choice?.model??"unknown",
  thinking:row.choice?.thinking??"unknown",actual:"unknown" as const
 })));
 return Object.freeze({
  status:blockers.length?"blocked" as const:"review-setup-required" as const,
  blockers:Object.freeze(blockers),taskId:todo.taskId,
  candidateRevision:candidate?.revision??"unknown",
  writeSurfaces:Object.freeze([...scope]),
  workerModelRequested:plan?.model??"unknown",
  reviewerProfiles:profiles,reviewerModelActual:"unknown" as const,
  nextCommand:"/asen-review workspace adaptive" as const,
  requiresNewConsent:true as const,accepted:false as const,writerAuthority:false as const
 });
}
export interface JudgmentFixHandoff{
 readonly status:"not-needed"|"manual-triage-required"|"fix-planning-required"|"blocked";
 readonly paths:readonly string[];
 readonly blockers:readonly string[];
 readonly candidateRevision:string;
 readonly candidateTreeIdentity:string;
 readonly fixModelRequested:string;
 readonly fixThinkingRequested:string;
 readonly fixModelActual:"unknown";
 readonly nextCommand:"/asen-plan";
 readonly requiresFreshOddPlan:true;
 readonly requiresFreshWriterConsent:true;
 readonly writerAuthority:false;
 readonly autoLaunch:false;
 readonly autoMerge:false;
 readonly acceptance:"not-accepted";
}
/** Una recomendación verificable para planificar correcciones: NUNCA un Fix lanzado. */
export function proposeJudgmentFixHandoff(input:{
 readonly report:JudgmentDayReport;
 readonly evidence:PiReviewEvidence;
 readonly fixProfile?:RouteChoice;
}):JudgmentFixHandoff{
 const {report,evidence,fixProfile}=input;
 if(!isIssuedJudgmentDayReport(report)||!isWorkspaceReviewEvidenceGenuine(evidence))
  throw new Error("Only genuine issued Judgment Day evidence may propose a Fix");
 if(report.requestId!==evidence.requestId||report.sessionId!==evidence.sessionId||
  report.candidateRevision!==evidence.candidate.revision||
  report.candidateTreeIdentity!==evidence.candidate.treeIdentity||
  report.fixAgent!=="not-launched"||report.acceptance!=="not-accepted"||
  report.deliveryAuthority!==false||report.autoMerge!==false||
  (fixProfile?.model!==undefined&&!safe(fixProfile.model))||
  (fixProfile?.thinking!==undefined&&!safe(fixProfile.thinking,32)))
  throw new Error("Judgment Day candidate or model route changed");
 const blockers:string[]=[];
 let paths:readonly string[]=[];
 if(report.status!=="analysis-complete"){
  try{
   const allowed=validatePortableReviewPaths(evidence.modifiedFiles.map(f=>f.path));
   const requested=validatePortableReviewPaths(report.findings.map(x=>x.finding.path));
   if(requested.length===0||requested.length>100||
    requested.some(path=>!allowed.includes(path)||hasSensitiveName(path)))
    throw new Error("unsafe finding path");
   paths=Object.freeze([...new Set(requested)].sort());
  }catch{blockers.push("Findings lack exact safe paths in the reviewed candidate");}
 }
 const status=blockers.length?"blocked" as const:
  report.status==="analysis-complete"?"not-needed" as const:
  report.status==="disagreement-requires-review"?"manual-triage-required" as const:
  "fix-planning-required" as const;
 return Object.freeze({
  status,paths,blockers:Object.freeze(blockers),
  candidateRevision:report.candidateRevision,
  candidateTreeIdentity:report.candidateTreeIdentity,
  fixModelRequested:fixProfile?.model??"unknown",
  fixThinkingRequested:fixProfile?.thinking??"unknown",
  fixModelActual:"unknown" as const,
  nextCommand:"/asen-plan" as const,
  requiresFreshOddPlan:true as const,requiresFreshWriterConsent:true as const,
  writerAuthority:false as const,autoLaunch:false as const,autoMerge:false as const,
  acceptance:"not-accepted" as const
 });
}
