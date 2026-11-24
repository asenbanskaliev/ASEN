import {retainNativeGitObject} from "./native-git-evidence-ref.js";
/** Evidencia del resultado nativo, capturada antes de liberar el permiso
 * exclusivo del Writer. El recibo autenticado de AgentStore la conserva. */
import {execFileSync} from "node:child_process";
import {captureWorkspaceReviewProjection} from "../../review/workspace-review-projection.js";
import {validatePortableReviewPaths} from "../../review/review-tree-paths.js";
import {hasSensitiveName} from "../../security/primary-tool-policy.js";
import {isolatedGitEnvironment} from "./git-isolated-environment.js";
import type {AgentRequest} from "../../agents/dispatcher.js";

export interface NativeWriterCompletion{
 readonly baseCommit:string;readonly candidateTree:string;
 readonly paths:readonly string[];readonly authorModelsObserved:readonly string[];
}
const oid=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const model=/^[a-z0-9][a-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9_./:@-]{0,190}$/u;
export function validNativeWriterCompletion(value:unknown):value is NativeWriterCompletion{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||
  Object.keys(value).sort().join("|")!=="authorModelsObserved|baseCommit|candidateTree|paths")return false;
 const row=value as NativeWriterCompletion;
 try{return typeof row.baseCommit==="string"&&oid.test(row.baseCommit)&&typeof row.candidateTree==="string"&&oid.test(row.candidateTree)&&
  Array.isArray(row.paths)&&row.paths.length>0&&row.paths.length<=256&&
  validatePortableReviewPaths(row.paths).length===row.paths.length&&!row.paths.some(hasSensitiveName)&&
  Array.isArray(row.authorModelsObserved)&&row.authorModelsObserved.length<=9&&
  new Set(row.authorModelsObserved).size===row.authorModelsObserved.length&&row.authorModelsObserved.every(m=>typeof m==="string"&&model.test(m));}catch{return false;}
}
/** Observación privada del transporte Pi, no de la respuesta de texto. */
const observedModels=new WeakMap<object,readonly string[]>();
export function bindNativeRunnerModels(result:object,models:readonly string[]):void{
 if(models.length&&models.length<=9&&new Set(models).size===models.length&&models.every(m=>model.test(m)))
  observedModels.set(result,Object.freeze([...models]));
}
export function captureNativeWriterCompletion(request:AgentRequest,result:object):NativeWriterCompletion|undefined{
 if(request.role!=="worker"||!/^unit-[a-f0-9]{40}:worker$/u.test(request.id)||!request.candidate||!request.writeSurfaces?.length)return;
 const root=request.repository,base=request.candidate.revision;
 const git=(...args:string[])=>execFileSync("git",["--no-replace-objects","-c","core.fsmonitor=false","-C",root,...args],
  {env:isolatedGitEnvironment(),timeout:10000,maxBuffer:1_000_000,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 const untracked=git("ls-files","--others","-z").toString("utf8").split("\0").filter(Boolean);
 const projection=captureWorkspaceReviewProjection({repositoryRoot:root,intendedUntracked:untracked},request.writeSurfaces);
 if(projection.baseCommit!==base||projection.unexpectedUntracked.length)return;
 const paths=new TextDecoder("utf-8",{fatal:true}).decode(git("diff-tree","-r","--name-only","--no-renames","--no-commit-id","-z",projection.baseTree,projection.candidateTree)).split("\0").filter(Boolean).sort();
 // Los gitlinks sin cambios aparecen en la proyección pero no en el diff.
 if(!paths.length||paths.some(p=>!request.writeSurfaces!.includes(p)))return;
 const entries=projection.entries.filter(entry=>paths.includes(entry.path));
 if(entries.length!==paths.length||entries.some(entry=>!["100644","100755"].includes(entry.mode)||entry.change==="gitlink"))return;
 retainNativeGitObject(root,"worker-tree",projection.candidateTree);
 const evidence={baseCommit:base,candidateTree:projection.candidateTree,paths,authorModelsObserved:observedModels.get(result)??[]};
 return validNativeWriterCompletion(evidence)?Object.freeze({...evidence,paths:Object.freeze(paths),authorModelsObserved:Object.freeze([...evidence.authorModelsObserved])}):undefined;
}
