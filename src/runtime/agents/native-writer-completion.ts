import {retainNativeGitObject} from "./native-git-evidence-ref.js";
/** Evidencia del resultado nativo, capturada antes de liberar el permiso
 * exclusivo del Writer. El recibo autenticado de AgentStore la conserva. */
import {execFile,execFileSync} from "node:child_process";
import {Worker} from "node:worker_threads";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
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
export function isNativePartitionWriter(request:AgentRequest):boolean{
 return request.role==="worker"&&/^unit-[a-f0-9]{40}:worker$/u.test(request.id)&&!!request.candidate&&!!request.writeSurfaces?.length;
}
/** Registrar los ignorados preexistentes ANTES de entregar la autoridad.
 * Los archivos ignorados nuevos no se ocultan. Un ignorado que ya ocupa el
 * ámbito exacto requiere intervención previa: no atribuir sus bytes al Writer. */
export async function captureNativeWriterBaseline(request:AgentRequest):Promise<readonly string[]>{
 if(!isNativePartitionWriter(request))return Object.freeze([]);
 const raw=await new Promise<Buffer>((resolve,reject)=>execFile("git",
  ["--no-replace-objects","-c","core.fsmonitor=false","-C",request.repository,"ls-files","--others","--ignored","--exclude-standard","-z"],
  {env:isolatedGitEnvironment(),encoding:"buffer",timeout:10000,maxBuffer:1_000_000,windowsHide:true},
  (error,stdout)=>error?reject(error):resolve(stdout)));
 const paths=new TextDecoder("utf-8",{fatal:true}).decode(raw).split("\0").filter(Boolean);
 if(paths.some(path=>request.writeSurfaces!.some(scope=>scope===path||path.startsWith(scope+"/")||scope.startsWith(path+"/"))))
  throw Error("El ámbito Writer contiene archivos ignorados preexistentes; revisar antes de lanzar.");
 return Object.freeze(paths);
}
export function captureNativeWriterCompletion(request:AgentRequest,result:object,baseline:readonly string[]=[]):NativeWriterCompletion|undefined{
 if(!isNativePartitionWriter(request))return;
 const root=request.repository,base=request.candidate!.revision;
 const git=(...args:string[])=>execFileSync("git",["--no-replace-objects","-c","core.fsmonitor=false","-C",root,...args],
  {env:isolatedGitEnvironment(),timeout:10000,maxBuffer:1_000_000,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 const existing=new Set(baseline);
 const untracked=new TextDecoder("utf-8",{fatal:true}).decode(git("ls-files","--others","-z")).split("\0").filter(path=>!!path&&!existing.has(path));
 const projection=captureWorkspaceReviewProjection({repositoryRoot:root,intendedUntracked:untracked},request.writeSurfaces,undefined,true);
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

/** La proyección de un árbol entero y la retención del objeto Git no bloquean
 * la sesión Pi padre. El hilo recibe solo identidad, ámbito y modelos observados,
 * nunca prompt, credenciales, permisos, tokens del agente ni configuración ejecutable. */
export async function captureNativeWriterCompletionAsync(request:AgentRequest,result:object,baseline:readonly string[],signal:AbortSignal):Promise<NativeWriterCompletion|undefined>{
 if(!isNativePartitionWriter(request)||signal.aborted)return;
 let module=import.meta.url,loader:string|undefined;
 if(module.endsWith(".ts")){
  try{loader=import.meta.resolve("tsx/esm/api");}
  catch{
   const compiled=new URL("../../../dist/runtime/agents/native-writer-completion.js",module);
   if(!existsSync(fileURLToPath(compiled)))throw Error("Captura nativa aislada no disponible");
   module=compiled.href;
  }
 }
 const env=isolatedGitEnvironment();
 // La lectura de core.autocrlf necesita el contexto de configuración del
 // checkout, pero el Worker no recibe las credenciales del proveedor.
 for(const key of ["HOME","USERPROFILE","XDG_CONFIG_HOME","GIT_CONFIG_GLOBAL","GIT_CONFIG_SYSTEM","GIT_CONFIG_NOSYSTEM"]){
  if(process.env[key]===undefined)delete env[key];else env[key]=process.env[key];
 }
 const data={module,loader,request:{id:request.id,role:request.role,repository:request.repository,candidate:request.candidate,writeSurfaces:[...request.writeSurfaces!]},
  models:[...(observedModels.get(result)??[])],baseline:[...baseline]};
 const worker=new Worker(`
  const {parentPort,workerData:d}=require("node:worker_threads");
  (async()=>{
   const m=d.loader?await (await import(d.loader)).tsImport(d.module,d.module):await import(d.module);
   const receipt={};m.bindNativeRunnerModels(receipt,d.models);
   parentPort.postMessage(m.captureNativeWriterCompletion(d.request,receipt,d.baseline));
  })().catch(()=>parentPort.postMessage(undefined));
 `,{eval:true,execArgv:[],env,workerData:data});
 return new Promise(resolve=>{
  let settled=false;
  const finish=(value:NativeWriterCompletion|undefined)=>{
   if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener("abort",abort);
   void worker.terminate().then(()=>resolve(value),()=>resolve(undefined));
  };
  const abort=()=>finish(undefined),timer=setTimeout(abort,60000);
  worker.once("message",(value:unknown)=>{
   if(signal.aborted||!validNativeWriterCompletion(value)||value.baseCommit!==request.candidate!.revision||
    value.paths.some(path=>!request.writeSurfaces!.includes(path))||
    JSON.stringify(value.authorModelsObserved)!==JSON.stringify(data.models)){finish(undefined);return;}
   finish(Object.freeze({...value,paths:Object.freeze([...value.paths]),authorModelsObserved:Object.freeze([...value.authorModelsObserved])}));
  });
  worker.once("error",abort);worker.once("exit",abort);
  signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
 });
}
