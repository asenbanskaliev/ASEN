/** E2A: inicia sesiones hijas solo mediante una capacidad auténtica del host Pi.
 * La apertura no da permisos de escritura ni inicia un Writer. Si el host no
 * ofrece creación y comprobación de sesiones, la operación queda bloqueada.
 * Antes del primer efecto se registra un intento único que jamás se repite.
 */
import {open,readFile} from "node:fs/promises";
import {dirname,isAbsolute} from "node:path";
import {atomicWriteText} from "../../io/atomic-write.js";
import {withExclusiveFileLock} from "../../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import {assertPreparedParallelWorktree,type ParallelWorktreeAllocation} from "./parallel-worktrees.js";
import type {ParallelChildSessionJournal} from "./parallel-todo-session-links.js";
import type {ParallelTodoWorktreeJournal} from "./parallel-todo-journal.js";
import type {TodoContext} from "../lifecycle/todo-store.js";

const schema="asen.parallel-child-opening/v1" as const;
type Intent=Readonly<{sourceSessionId:string;sourceProjectId:string;batchId:string;
 expectedHead:string;roots:readonly string[];state:"claimed-not-verified"}>;
type FileState={schema:typeof schema;records:Intent[]};
const sha=/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const id=(s:unknown):s is string=>typeof s==="string"&&s.length>0&&s.length<=1024&&
 s===s.trim()&&!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&
 typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function parse(raw:string):FileState{
 const value:unknown=JSON.parse(raw);
 if(!exact(value,["schema","records"])||value.schema!==schema||
  !Array.isArray(value.records)||value.records.length>128)
  throw new Error("Diario de arranques Pi inválido: no reutilizar intentos");
 const records:Intent[]=[];
 for(const record of value.records){
  if(!exact(record,["sourceSessionId","sourceProjectId","batchId","expectedHead","roots","state"])||
   !id(record.sourceSessionId)||!id(record.batchId)||
   typeof record.expectedHead!=="string"||!sha.test(record.expectedHead)||
   !id(record.sourceProjectId)||!isAbsolute(record.sourceProjectId as string)||
   !Array.isArray(record.roots)||record.roots.length<2||record.roots.length>4||
   record.roots.some((root:unknown)=>!id(root)||!isAbsolute(root))||
   record.state!=="claimed-not-verified")
   throw new Error("Intento Pi alterado: se requiere conciliación manual");
  const roots=record.roots as string[];
  if(roots.some((root,i)=>roots.slice(0,i).some(previous=>sameWorkspaceIdentityPath(root,previous))))
   throw new Error("Dos sesiones Pi comparten carpeta");
  const old=records.find(prior=>
   prior.batchId===record.batchId&&prior.sourceSessionId===record.sourceSessionId&&
     sameWorkspaceIdentityPath(prior.sourceProjectId,record.sourceProjectId as string)||
   prior.roots.some(root=>roots.some(next=>sameWorkspaceIdentityPath(root,next))));
  if(old)throw new Error("Intento Pi duplicado en diario privado");
  records.push(record as unknown as Intent);
 }
 return structuredClone(value) as FileState;
}
/** Registra el intento de manera duradera y atómica ANTES de llamar al host.
 * Incluso un fallo incierto consume el lote: nunca se reintenta silenciosamente.
 */
export class PiChildOpeningJournal{
 constructor(readonly file:string){if(!isAbsolute(file))throw new Error("El diario Pi requiere ruta absoluta");}
 async claim(intent:Intent):Promise<void>{
  parse(JSON.stringify({schema,records:[intent]}));
  await preparePrivateFile(this.file,true);
  await withExclusiveFileLock(this.file,async()=>{
   const exists=await preparePrivateFile(this.file);
   const state=exists?parse(await readFile(this.file,"utf8")):{schema,records:[]} as FileState;
   if(state.records.length>=128)throw new Error("Diario de intentos Pi lleno");
   const next=parse(JSON.stringify({schema,records:[...state.records,intent]}));
   await atomicWriteText(this.file,JSON.stringify(next)+"\n");
   // En POSIX, sincronizar también la entrada de directorio tras el renombrado.
   // Cualquier error bloquea la apertura antes de lanzar un Pi.
   if(process.platform!=="win32"){
    const directory=await open(dirname(this.file),"r");
    try{await directory.sync();}finally{await directory.close();}
   }
  });
 }
 async inspect():Promise<readonly Intent[]>{
  if(!await preparePrivateFile(this.file))return [];
  return parse(await readFile(this.file,"utf8")).records;
 }
}
type OpenRequest=Readonly<{sourceTodoId:string;projectId:string;expectedHead:string;readOnly:true}>;
type OpenResult=Readonly<{sessionId:string;projectId:string}>;
export interface RealPiChildHost{
 /** Debe crear una sesión nativa Pi; NO se admite un ID generado por ASEN. */
 openChildSession?:(request:OpenRequest)=>Promise<OpenResult>;
 /** Comprobación independiente de que la sesión existe y pertenece al host. */
 inspectChildSession?:(session:OpenResult)=>Promise<boolean>;
 /** Confirmación real desde la interfaz Pi de este enlace exacto. */
 confirmAttachment?:(owner:Readonly<{sourceTodoId:string;sourceHead:string;
  worktreeRoot:string;sourceProjectId:string;writeSurfaces:readonly string[];
  grantsAuthority:false}>)=>Promise<boolean>;
 validateParent?:()=>Promise<void>;
}
export type ChildOpeningResult=Readonly<{status:"blocked"|"attached-needs-worker-permission"|"partial-needs-review";
 attached:readonly Readonly<{sourceTodoId:string;sessionId:string;projectId:string}>[];
 blockers:readonly string[];grantsAuthority:false;autoRetry:false;autoMerge:false;writerStarted:false}>;
const result=(status:ChildOpeningResult["status"],attached:ChildOpeningResult["attached"],blockers:readonly string[]):ChildOpeningResult=>
 Object.freeze({status,attached:Object.freeze([...attached]),blockers:Object.freeze([...blockers]),
  grantsAuthority:false as const,autoRetry:false as const,autoMerge:false as const,writerStarted:false as const});
export async function openVerifiedPiChildSessions(input:{
 readonly source:TodoContext;readonly batchId:string;
 readonly allocations:readonly ParallelWorktreeAllocation[];
 readonly sessions:ParallelChildSessionJournal;readonly attempts:PiChildOpeningJournal;
 readonly host?:RealPiChildHost;
}):Promise<ChildOpeningResult>{
 const host=input.host;
 if(!host?.openChildSession||!host.inspectChildSession||!host.confirmAttachment||!host.validateParent)
  return result("blocked",[],["El anfitrión Pi no expone apertura, verificación y confirmación reales de sesiones hijas"]);
 if(!id(input.source?.sessionId)||!isAbsolute(input.source?.projectId??"")||
  !id(input.batchId)||!Array.isArray(input.allocations)||
  input.allocations.length<2||input.allocations.length>4)
  throw new Error("Un lote Pi necesita identidad y 2-4 árboles exactos");
 await host.validateParent();
 const owners:Array<NonNullable<Awaited<ReturnType<ParallelTodoWorktreeJournal["findPreparedWorktree"]>>>>=[];
 for(const allocation of input.allocations){
  assertPreparedParallelWorktree(allocation);
  const owner=await input.sessions.sourceJournal.findPreparedWorktree(allocation.root);
  if(!owner||owner.batchId!==input.batchId||
   owner.sourceSessionId!==input.source.sessionId||
   !sameWorkspaceIdentityPath(owner.sourceProjectId,input.source.projectId)||
   owner.taskId!==allocation.taskId||owner.sourceHead!==allocation.baseRevision||
   !sameWorkspaceIdentityPath(owner.worktreeRoot,allocation.root)||
   owner.writeSurfaces.length!==allocation.writeSurfaces.length||
   owner.writeSurfaces.some((path,i)=>path!==allocation.writeSurfaces[i]))
   throw new Error("La reserva ODD del hijo Pi no coincide con el árbol preparado");
  owners.push(owner);
 }
 const head=owners[0]!.sourceHead;
 if(owners.some(o=>o.sourceHead!==head)||
  owners.some((o,i)=>owners.slice(0,i).some(previous=>
   previous.taskId===o.taskId||sameWorkspaceIdentityPath(previous.worktreeRoot,o.worktreeRoot))))
  throw new Error("Lote Pi con revisión o carpetas incompatibles");
 await host.validateParent();
 await input.attempts.claim({sourceSessionId:input.source.sessionId,
  sourceProjectId:input.source.projectId,batchId:input.batchId,expectedHead:head,
  roots:owners.map(x=>x.worktreeRoot),state:"claimed-not-verified"});
 const attached:ChildOpeningResult["attached"][number][]=[];
 const seenSessions=new Set<string>();
 for(const owner of owners){
  try{
   await host.validateParent();
   const session=await host.openChildSession({sourceTodoId:owner.taskId,
    projectId:owner.worktreeRoot,expectedHead:head,readOnly:true});
   // Ningún nombre de sesión inventado o carpeta diferente hereda este intento.
   if(!id(session?.sessionId)||!id(session?.projectId)||
    !sameWorkspaceIdentityPath(session.projectId,owner.worktreeRoot)||
    seenSessions.has(session.sessionId)||
    await host.inspectChildSession(session)!==true)
    throw new Error("El host no acreditó la sesión Pi hija exacta");
   seenSessions.add(session.sessionId);
   await host.validateParent();
   const link=await input.sessions.attach({childSessionId:session.sessionId,
    childProjectId:session.projectId,
    confirm:owner=>host.confirmAttachment!(owner),
    validateSession:async()=>{
     await host.validateParent!();
     if(await host.inspectChildSession!(session)!==true)
      throw new Error("Sesión Pi hija no verificable durante el enlace");
    }});
   if(link.status!=="attached"||link.link?.sourceTodoId!==owner.taskId||
    link.link.childSessionId!==session.sessionId)
    throw new Error("El enlace Pi fue rechazado o cambió");
   attached.push(Object.freeze({sourceTodoId:owner.taskId,
    sessionId:session.sessionId,projectId:session.projectId}));
  }catch{
   return result("partial-needs-review",attached,
    [owner.taskId+": apertura o enlace con resultado incierto; inspeccionar sesiones y diarios. No repetir"]);
  }
 }
 return result("attached-needs-worker-permission",attached,[]);
}
