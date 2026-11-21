/** T04/T08: verifica el código actual contra el árbol revisado en Judgment Day.
 * Crea objetos Git para la proyección, pero no altera archivos, índice, permisos
 * de Writer, consentimientos, trabajos Pi ni historia Git. */
import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {captureWorkspaceReviewProjection,type WorkspaceReviewProjection} from "./workspace-review-projection.js";
import type {JudgmentFixOddDraft} from "./judgment-fix-odd-draft.js";
import {validatePortableReviewPaths} from "./review-tree-paths.js";
import {hasSensitiveName} from "../security/primary-tool-policy.js";

export interface FixCandidatePreflight{
 readonly status:"candidate-revalidated";
 readonly repositoryHead:string;
 readonly candidateTreeIdentity:string;
 readonly matchedSource:true;
 readonly writerAuthority:false;
 readonly autoLaunch:false;
 readonly acceptance:"not-accepted";
}
const revision=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
/** Una proyección con archivos nuevos no inspeccionados nunca confirma un Fix,
 * aunque el hash del árbol seleccionado coincida. No expone rutas privadas. */
export function assertFixProjectionComplete(
 projection:Pick<WorkspaceReviewProjection,"unexpectedUntracked">
):void{
 if(!Array.isArray(projection.unexpectedUntracked)||
  projection.unexpectedUntracked.length!==0)
  throw new Error("Fix candidate includes unreviewed untracked files");
}
function git(root:string,...args:string[]):Buffer{
 return execFileSync("git",["-C",root,...args],{
  timeout:8000,maxBuffer:2_000_000,stdio:["ignore","pipe","pipe"],
  windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:"0"}
 });
}
function head(root:string):string{
 const value=git(root,"rev-parse","HEAD").toString("utf8").trim();
 if(!revision.test(value))throw new Error("Fix candidate has no stable Git HEAD");
 return value;
}
/** Compara el árbol completo ya revisado, independientemente del ámbito de escritura Fix. */
export function inspectLiveFixCandidate(draft:JudgmentFixOddDraft):FixCandidatePreflight{
 if(!draft||draft.status!=="draft-only"||
  draft.requiresHumanTriage||draft.authorized!==false||
  draft.writerAuthority!==false||draft.autoLaunch!==false||
  draft.acceptance!=="not-accepted"||draft.candidateStatus!=="not-revalidated"||
  !revision.test(draft.sourceCandidateTree)||draft.sourceCandidateTree!==draft.sourceCandidateRevision||
  !Array.isArray(draft.writeSurfaces)||draft.writeSurfaces.length<1)
  throw new Error("Fix draft is not eligible for fresh candidate inspection");
 return inspectStoredFixSourceTree(draft.projectId,draft.writeSurfaces,draft.sourceCandidateTree);
}
/** Revalidación exacta también en el despachador, antes y después de obtener
 * la aprobación individual. Un dato guardado no equivale a un permiso. */
export function inspectStoredFixSourceTree(
 projectId:string,writeSurfaces:readonly string[],sourceTree:string
):FixCandidatePreflight{
 if(typeof projectId!=="string"||!revision.test(sourceTree)||
  !Array.isArray(writeSurfaces)||writeSurfaces.length<1||
  writeSurfaces.length>100)
  throw new Error("Fix source tree or write scope is invalid");
 const checked=validatePortableReviewPaths(writeSurfaces);
 if(checked.length!==writeSurfaces.length||
  checked.some((value,index)=>value!==writeSurfaces[index]||hasSensitiveName(value)))
  throw new Error("Fix source scope is unsafe");
 const root=realpathSync(projectId);
 if(root!==projectId)throw new Error("Fix candidate repository identity changed");
 const before=head(root);
 const observed=git(root,"ls-files","--others","--exclude-standard","-z");
 const untracked=observed.toString("utf8").split("\0").filter(Boolean);
 // Los archivos adicionales o modificados cambian el hash del árbol completo.
 const projection=captureWorkspaceReviewProjection({
  repositoryRoot:root,intendedUntracked:untracked
 });
 assertFixProjectionComplete(projection);
 if(projection.candidateTree!==sourceTree)
  throw new Error("Fix candidate changed after the original Judgment Day review");
 if(before!==head(root))throw new Error("Fix candidate HEAD changed during inspection");
 return Object.freeze({
  status:"candidate-revalidated" as const,repositoryHead:before,
  candidateTreeIdentity:projection.candidateTree,matchedSource:true as const,
  writerAuthority:false as const,autoLaunch:false as const,
  acceptance:"not-accepted" as const
 });
}
