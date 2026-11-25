import {retainNativeGitObject} from "./native-git-evidence-ref.js";
/** Evidencia del resultado nativo, capturada antes de liberar el permiso
 * exclusivo del Writer. El recibo autenticado de AgentStore la conserva. */
import {spawn,execFileSync} from "node:child_process";
import {Worker} from "node:worker_threads";
import {existsSync,mkdtempSync,openSync,closeSync,readSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
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
/** Solo clasifica evidencia; nunca concede admisión ni permiso de escritura.
 * La sucesora debe haber superado el Dispatcher y sus dependencias originales. */
export function isNativePartitionWriterIdentity(role:string,id:string):boolean{
 return role==="worker"&&/^(?:unit|continuation)-[a-f0-9]{40}:worker$/u.test(id);
}
export function isNativePartitionWriter(request:AgentRequest):boolean{
 return isNativePartitionWriterIdentity(request.role,request.id)&&!!request.candidate&&!!request.writeSurfaces?.length;
}
/** Inventario NUL incremental: sin el límite de stdout de execFile. Se
 * mantiene un presupuesto explícito de memoria y se rechaza cualquier
 * inventario incompleto; no se silencian altas ignoradas. */
class NativePathInventory{
 private readonly paths:string[]=[];
 private pending=Buffer.alloc(0);
 private size=0;
 add(chunk:Buffer):void{
  this.size+=chunk.length;
  if(this.size>128*1024*1024)throw Error("Inventario Git supera el presupuesto de 128 MiB; revisar el worktree.");
  const data=this.pending.length?Buffer.concat([this.pending,chunk]):chunk;
  let start=0;
  for(let offset=data.indexOf(0,start);offset>=0;offset=data.indexOf(0,start)){
   if(offset===start||offset-start>65536||this.paths.length>=1_000_000)throw Error("Inventario Git inválido o demasiado grande.");
   this.paths.push(new TextDecoder("utf-8",{fatal:true}).decode(data.subarray(start,offset)));
   start=offset+1;
  }
  this.pending=Buffer.from(data.subarray(start));
  if(this.pending.length>65536)throw Error("Ruta Git supera el presupuesto.");
 }
 finish():readonly string[]{
  if(this.pending.length)throw Error("Inventario Git truncado.");
  return Object.freeze(this.paths);
 }
}
const inventoryArgs=(root:string,args:readonly string[])=>["--no-replace-objects","-c","core.fsmonitor=false","-C",root,"ls-files",...args,"-z"];
async function inventoryAsync(root:string,args:readonly string[]):Promise<readonly string[]>{
 const inventory=new NativePathInventory();
 return new Promise((resolve,reject)=>{
  const child=spawn("git",inventoryArgs(root,args),{env:isolatedGitEnvironment(),stdio:["ignore","pipe","ignore"],windowsHide:true});
  let failure:unknown;
  const fail=(error:unknown)=>{if(failure===undefined){failure=error;child.kill();}};
  const timer=setTimeout(()=>fail(Error("Tiempo agotado al inventariar Git.")),30000);
  child.stdout.on("data",(chunk:Buffer)=>{if(failure===undefined)try{inventory.add(chunk);}catch(error){fail(error);}});
  child.once("error",error=>{clearTimeout(timer);reject(error);});
  child.once("close",code=>{clearTimeout(timer);
   if(failure!==undefined||code!==0){reject(failure??Error("Git no completó el inventario."));return;}
   try{resolve(inventory.finish());}catch(error){reject(error);}
  });
 });
}
function inventorySync(root:string,args:readonly string[]):readonly string[]{
 // La captura se ejecuta en el Worker aislado; spool privado para no
 // imponer el maxBuffer de Node al inventario de dependencias del usuario.
 const dir=mkdtempSync(join(tmpdir(),"asen-path-inventory-")),file=join(dir,"paths");
 let fd:number|undefined;
 try{
  fd=openSync(file,"wx+",0o600);
  execFileSync("git",inventoryArgs(root,args),{env:isolatedGitEnvironment(),stdio:["ignore",fd,"ignore"],timeout:30000,windowsHide:true});
  const inventory=new NativePathInventory(),chunk=Buffer.alloc(65536);
  for(let position=0;;){
   const count=readSync(fd,chunk,0,chunk.length,position);if(!count)break;
   inventory.add(chunk.subarray(0,count));position+=count;
  }
  return inventory.finish();
 }finally{if(fd!==undefined)closeSync(fd);rmSync(dir,{recursive:true,force:true});}
}
/** Registrar los ignorados preexistentes ANTES de entregar la autoridad. */
export async function captureNativeWriterBaseline(request:AgentRequest):Promise<readonly string[]>{
 if(!isNativePartitionWriter(request))return Object.freeze([]);
 const paths=await inventoryAsync(request.repository,["--others","--ignored","--exclude-standard"]);
 if(paths.some(path=>request.writeSurfaces!.some(scope=>scope===path||path.startsWith(scope+"/")||scope.startsWith(path+"/"))))
  throw Error("El ámbito Writer contiene archivos ignorados preexistentes; revisar antes de lanzar.");
 return paths;
}
export function captureNativeWriterCompletion(request:AgentRequest,result:object,baseline:readonly string[]=[]):NativeWriterCompletion|undefined{
 if(!isNativePartitionWriter(request))return;
 const root=request.repository,base=request.candidate!.revision;
 const git=(...args:string[])=>execFileSync("git",["--no-replace-objects","-c","core.fsmonitor=false","-C",root,...args],
  {env:isolatedGitEnvironment(),timeout:10000,maxBuffer:1_000_000,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 const existing=new Set(baseline);
 const untracked=inventorySync(root,["--others"]).filter(path=>!existing.has(path));
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
