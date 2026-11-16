/** T04/T08: verifica el código actual contra el árbol revisado en Judgment Day.
 * Crea objetos Git para la proyección, pero no altera archivos, índice, permisos
 * de Writer, consentimientos, trabajos Pi ni historia Git. */
import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {captureWorkspaceReviewProjection} from "./workspace-review-projection.js";
import type {JudgmentFixOddDraft} from "./judgment-fix-odd-draft.js";

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
/** Rechaza incluso cambios fuera de las rutas autorizables, y todo archivo no
 * rastreado no incluido. Revalidar una vez más justo antes de guardar el ODD. */
export function inspectLiveFixCandidate(draft:JudgmentFixOddDraft):FixCandidatePreflight{
 if(!draft||draft.status!=="draft-only"||
  draft.requiresHumanTriage||draft.authorized!==false||
  draft.writerAuthority!==false||draft.autoLaunch!==false||
  draft.acceptance!=="not-accepted"||draft.candidateStatus!=="not-revalidated"||
  !revision.test(draft.sourceCandidateTree)||draft.sourceCandidateTree!==draft.sourceCandidateRevision||
  !Array.isArray(draft.writeSurfaces)||draft.writeSurfaces.length<1)
  throw new Error("Fix draft is not eligible for fresh candidate inspection");
 const root=realpathSync(draft.projectId);
 if(root!==draft.projectId)throw new Error("Fix candidate repository identity changed");
 const before=head(root);
 const observed=git(root,"ls-files","--others","--exclude-standard","-z");
 const untracked=observed.toString("utf8").split("\0").filter(Boolean);
 if(untracked.some(file=>!draft.writeSurfaces.includes(file)))
  throw new Error("Fix candidate contains unreviewed files outside the original scope");
 const projection=captureWorkspaceReviewProjection({
  repositoryRoot:root,intendedUntracked:untracked
 },draft.writeSurfaces);
 if(projection.candidateTree!==draft.sourceCandidateTree)
  throw new Error("Fix candidate changed after the original Judgment Day review");
 if(before!==head(root))throw new Error("Fix candidate HEAD changed during inspection");
 return Object.freeze({
  status:"candidate-revalidated" as const,repositoryHead:before,
  candidateTreeIdentity:projection.candidateTree,matchedSource:true as const,
  writerAuthority:false as const,autoLaunch:false as const,
  acceptance:"not-accepted" as const
 });
}
