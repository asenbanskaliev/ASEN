import {open} from "node:fs/promises";
import path from "node:path";
import {preparePrivateFile} from "../../io/private-file.js";
import {sameWorkspaceIdentityPath} from "../workspace-store.js";
import {bindParallelSourceTodos,type SourceTodoRow} from "../agents/parallel-todo-bindings.js";
import {ParallelTodoWorktreeJournal} from "../agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../agents/parallel-todo-session-links.js";
import {ParallelChildPlanClaimJournal} from "../agents/parallel-child-plan-claims.js";
import {inspectParallelWorktreeChanges} from "../agents/parallel-worktree-change-inspection.js";
import {createNativeChildPlanningSession,assertNativeChildPlanningSession} from "../agents/pi-native-child-session.js";
import {materializePartitionRoot,parsePartitionUnitBasis} from "./odd-unit-plan.js";
import type {ProfileLayer} from "./profiles.js";
import type {SessionTodoStore,TodoContext,TodoPlanDraft} from "./todo-store.js";

type PreparedChild={sourceTodoId:string;childTodoId:string;sessionId:string;projectId:string;sessionFile:string};
export type NativeChildPreparationResult=Readonly<{status:"prepared"|"declined"|"blocked"|"partial-needs-review";batchId:string;
 children:readonly PreparedChild[];reason?:string;grantsAuthority:false;autoRetry:false;autoMerge:false}>;
/** Prepara dos sesiones de planificación nativas de Pi y sus Todos reales.
 * No llama al modelo y no concede permisos de herramientas. Una preparación
 * parcial queda registrada y jamás se repite silenciosamente.
 */
export async function prepareNativePartitionChildren(input:{
 source:TodoContext;batchId:string;sourceJournal:ParallelTodoWorktreeJournal;
 sessionJournal:ParallelChildSessionJournal;claimJournal:ParallelChildPlanClaimJournal;
 sessionDir:string;todos:SessionTodoStore;childProfiles:(identity:TodoContext)=>Promise<ProfileLayer>;
 validateParent:()=>void;confirm:(summary:string)=>Promise<boolean>;
}):Promise<NativeChildPreparationResult>{
 const children:PreparedChild[]=[];
 const result=(status:NativeChildPreparationResult["status"],reason?:string):NativeChildPreparationResult=>
  Object.freeze({status,batchId:input.batchId,children:Object.freeze([...children]),...(reason?{reason}:{}),
   grantsAuthority:false,autoRetry:false,autoMerge:false});
 const {source,batchId,sourceJournal,sessionJournal,claimJournal,todos}=input;
 const inspect=async()=>{
  input.validateParent();
  const batch=(await sourceJournal.list(source)).find(row=>row.id===batchId);
  if(!batch||batch.state!=="prepared"||batch.tasks.length!==2)
   throw new Error("No hay un lote exacto de dos worktrees preparados.");
  const rows=await todos.list(source),units=batch.tasks.map(task=>({taskId:task.taskId,writeSurfaces:task.writeSurfaces}));
  const bindings=bindParallelSourceTodos({identity:source,expectedHead:batch.sourceHead,rows,units});
  const selected=bindings.map(binding=>{
   const row=rows.find(item=>item.taskId===binding.taskId)!;
   const record=batch.tasks.find(item=>item.taskId===binding.taskId)!;
   if(binding.taskRevision!==record.taskRevision||binding.requestId!==record.requestId||!row.plan?.candidate||
    !row.plan.writerAuthorizationBasis||!row.description||(row.dependsOn?.length??0)!==0)
    throw new Error("La unidad original cambió o no es una raíz ODD.");
   const parsed=parsePartitionUnitBasis(JSON.parse(row.plan.writerAuthorizationBasis),source.projectId,batch.sourceHead);
   if(parsed.unit.dependsOn.length||row.requestId!==`asen-plan:${parsed.facts.taskIdentity}:worker`||
    row.description!=="Perform only the authorized, scoped work for: "+parsed.instruction||
    parsed.facts.writes.length!==record.writeSurfaces.length||
    parsed.facts.writes.some((write,index)=>write.path!==record.writeSurfaces[index]))
    throw new Error("La base ODD de la unidad no coincide con el lote.");
   const git=inspectParallelWorktreeChanges({sourceRoot:source.projectId,worktreeRoot:record.worktreeRoot,
    baseRevision:batch.sourceHead,writeSurfaces:record.writeSurfaces});
   if(git.status!=="clean"||!git.sourceVerified||!git.headMatchesBase)throw new Error("El worktree hijo no está intacto.");
   return {record,row,basis:row.plan.writerAuthorizationBasis,instruction:parsed.instruction};
  });
  input.validateParent();return {batch,selected};
 };
 let initial:Awaited<ReturnType<typeof inspect>>;
 try{
  initial=await inspect();
  if((await sessionJournal.listSource(source)).some(link=>link.batchId===batchId))
   return result("blocked","Ya existen sesiones asociadas al lote; revisar antes de repetir.");
 }catch{return result("blocked","El lote no es una partición ODD intacta y preparada.");}
 const summary=["Crear dos sesiones nativas de planificación Pi (sin modelo ni permisos Writer).",
  "Lote: "+batchId,"SHA: "+initial.batch.sourceHead,
  ...initial.selected.map(item=>item.record.worktreeRoot+" · "+item.row.description+" · "+item.record.writeSurfaces.join(", ")),
  "Se guardará el mensaje de delegación y la tarea ODD de cada sesión. No se ejecutarán instrucciones, credenciales ni escrituras del agente."].join("\n");
 if(await input.confirm(summary)!==true)return result("declined");
 const exact=JSON.stringify(initial);
 const validateExact=async()=>{
  input.validateParent();
  if(JSON.stringify(await inspect())!==exact)throw new Error("El lote ODD cambió durante la preparación.");
 };
 // Reserva de preparación persistida ANTES de crear una sesión. No se libera
 // tras un fallo incierto, ni se reutiliza al reiniciar el padre.
 const claimFile=path.join(input.sessionDir,batchId+".prepare");
 try{
  await validateExact();
  if(await preparePrivateFile(claimFile,true))return result("blocked","El intento de preparar sesiones ya está registrado.");
  const claim=await open(claimFile,"wx",0o600);
  try{await claim.writeFile(JSON.stringify({batchId,source,head:initial.batch.sourceHead}));await claim.sync();}
  finally{await claim.close();}
 }catch{return result("blocked","No se pudo reservar una preparación nueva; no repetir automáticamente.");}
 for(const item of initial.selected){
  try{
   await validateExact();
   const native=await createNativeChildPlanningSession(item.record.worktreeRoot,input.sessionDir,item.instruction);
   await validateExact();
   const attached=await sessionJournal.attach({childSessionId:native.sessionId,childProjectId:native.projectId,
    nativeSessionFile:native.sessionFile,validateSession:async()=>{await validateExact();await assertNativeChildPlanningSession(native);},
    confirm:async owner=>owner.sourceTodoId===item.record.taskId&&owner.sourceHead===initial.batch.sourceHead&&
     sameWorkspaceIdentityPath(owner.worktreeRoot,native.projectId)&&sameWorkspaceIdentityPath(owner.sourceProjectId,source.projectId)&&
     JSON.stringify(owner.writeSurfaces)===JSON.stringify(item.record.writeSurfaces)});
   if(attached.status!=="attached"||!attached.link)throw new Error("No se pudo asociar la sesión Pi nativa.");
   const profiles=await input.childProfiles(native);
   const candidate={...item.row.plan!.candidate!,repository:native.projectId};
   const {graph}=materializePartitionRoot(JSON.parse(item.basis),native.projectId,candidate,profiles);
   const task=graph.tasks[0]!;
   if(task.role!=="worker"||!task.candidate||!task.writeSurfaces||!task.writerAuthorizationBasis||
    task.writerAuthorizationBasis!==item.basis||task.instruction!==item.row.description||
    JSON.stringify(task.writeSurfaces)!==JSON.stringify(item.record.writeSurfaces))
    throw new Error("El plan hijo no conserva la unidad original.");
   await validateExact();await assertNativeChildPlanningSession(native);
   await claimJournal.claim(attached.link);
   const draft:TodoPlanDraft={title:task.title,requestId:"asen-plan:"+task.id,dependsOn:[],description:task.instruction,
    plan:{role:"worker",skillPaths:[...task.skillPaths],priority:task.priority,
     ...(task.skillSelection?{skillSelection:task.skillSelection}:{}),...(task.model?{model:task.model}:{}),
     ...(task.thinking?{thinking:task.thinking}:{}),candidate:task.candidate,
     writeSurfaces:[...task.writeSurfaces],writerAuthorizationBasis:task.writerAuthorizationBasis}};
   const [saved]=await todos.addPlan([draft],native,undefined,input.validateParent);
   if(!saved)throw new Error("No se guardó la unidad hija.");
   children.push(Object.freeze({sourceTodoId:item.record.taskId,childTodoId:saved.taskId,...native}));
   await validateExact();
  }catch{
   return result("partial-needs-review","Preparación interrumpida; conservar sesiones, vínculos y tareas existentes. No lanzar ni repetir automáticamente.");
  }
 }
 return result("prepared");
}
