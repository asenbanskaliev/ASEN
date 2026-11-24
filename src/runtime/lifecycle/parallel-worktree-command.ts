import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync,realpathSync,rmdirSync} from "node:fs";
import path from "node:path";
import {prepareParallelWorkerWorktrees,type ParallelWorkerUnit} from "../agents/parallel-worktrees.js";
import {bindParallelSourceTodos,selectReadyParallelSourcePair,sameSourceTodoBindings,type SourceTodoRow} from "../agents/parallel-todo-bindings.js";
import {ParallelTodoWorktreeJournal,newParallelTodoWorktreeBatchId} from "../agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../agents/parallel-todo-session-links.js";
import {inspectParallelWorktreeChanges} from "../agents/parallel-worktree-change-inspection.js";
import {reconcileParallelWorktreeBatch} from "../agents/parallel-worktree-reconciliation.js";
import {projectParallelAgentFlow} from "../ui/agent-flow-overview.js";
import {ParallelChildPlanClaimJournal} from "../agents/parallel-child-plan-claims.js";
import {ParallelWorkerObservationJournal} from "../agents/parallel-worker-observation-journal.js";
import {inspectParallelBatchWorkerOutcomes} from "../agents/parallel-batch-coordinator.js";
import {launchParentApprovedWorkers,type ParentSupervisorReadyWorker} from "../agents/parallel-parent-supervisor.js";
import {ParentSupervisorClaimJournal} from "../agents/parallel-parent-supervisor-claims.js";
import {attributeParallelChildWorker} from "../agents/parallel-worker-attribution.js";
import {buildNativeIntegrationCandidate,type NativeIntegrationCandidate} from "../agents/parallel-native-integration.js";
import type {PublicAgentRecord} from "../agents/agent-lifecycle.js";
import type {TaskAgentLink} from "../agents/task-agent-link-store.js";
import {controlledInstructionPlanCommand} from "./route-command.js";
import type {ProfileLayer} from "./profiles.js";
import type {TodoContext} from "./todo-store.js";

export const ASEN_WORKTREES_COMMAND="asen-worktrees";
const usage="Uso: /asen-worktrees prepare | prepare-todos | prepare-auto | prepare-native <lote> | attach | attach-plan | plan-todo | supervise | collect | integration | integration-review | integration-continue | status | review (prepare-auto selecciona las dos tareas sin editor; nunca autoriza escrituras)";
type WorktreeContext={
 cwd:string;hasUI?:boolean;mode?:string;signal?:AbortSignal|undefined;
 sessionManager?:{getSessionId?:()=>string};
 ui:{notify:(message:string,kind:"info"|"error"|"warning")=>void;
  editor?:(title:string,prefill?:string)=>Promise<string|undefined>;
  confirm?:(title:string,message:string)=>Promise<boolean>;
  select?:(title:string,options:string[],preferences?:{signal?:AbortSignal})=>Promise<string|undefined>};
};
type WorktreeCommand={description:string;handler:(args:string|undefined,ctx:WorktreeContext)=>Promise<unknown>};
function currentHead(root:string){
 const head=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:2000,windowsHide:true}).trim();
 if(!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(head))throw new Error("Worktree source needs a pinned exact Git HEAD");
 return head;
}
function readRequest(value:string):{parentDir:string;units:readonly ParallelWorkerUnit[]}{
 if(value.length>16384)throw new Error("Worktree request is too large");
 const parsed:unknown=JSON.parse(value);
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
  Object.getPrototypeOf(parsed)!==Object.prototype||
  Object.keys(parsed).length!==2||!Object.hasOwn(parsed,"parentDir")||!Object.hasOwn(parsed,"units"))
  throw new Error("Worktree request must contain exactly parentDir and units");
 const data=parsed as {parentDir?:unknown;units?:unknown};
 if(typeof data.parentDir!=="string"||!path.isAbsolute(data.parentDir)||
  !Array.isArray(data.units))throw new Error("Worktree request has invalid parentDir or units");
 return {parentDir:data.parentDir,units:data.units as ParallelWorkerUnit[]};
}
export function registerParallelWorktreeCommand(
 register:(name:string,command:WorktreeCommand)=>void,
 options?:{journalFile?:string;sessionLinksFile?:string;planClaimsFile?:string;observationFile?:string;supervisorClaimsFile?:string;
  reviewIntegratedCandidate?:(candidate:NativeIntegrationCandidate,context:WorktreeContext,validate:()=>void)=>Promise<unknown>;
  continueIntegratedCandidate?:(candidate:NativeIntegrationCandidate,context:WorktreeContext,validate:()=>void)=>Promise<unknown>;
  prepareNativeChildren?:(batchId:string,context:WorktreeContext,validate:()=>void)=>Promise<unknown>;
  planChildTodo?:(input:string,context:WorktreeContext)=>Promise<unknown>;
  childProfiles?:(identity:TodoContext)=>Promise<ProfileLayer>;
  loadTodos?:(identity:TodoContext)=>Promise<readonly SourceTodoRow[]>;
  loadChildAgents?:(identity:TodoContext)=>Promise<readonly {id:string;role:string;state:string}[]>;
  loadChildAgentRecords?:(identity:TodoContext)=>Promise<readonly PublicAgentRecord[]>;
  loadChildTaskAgentLinks?:(identity:TodoContext)=>Promise<readonly TaskAgentLink[]>;
  launchChildWorker?:(unit:ParentSupervisorReadyWorker,confirm:(task:Readonly<{
   id:string;title:string;role:string;instruction:string;
   writeSurfaces?:readonly string[];candidateRevision?:string
  }>)=>Promise<boolean>,validateParent:()=>Promise<void>,startBefore?:number)=>Promise<
   {status:"dispatched";todoId:string;agentId:string;role:string}|{status:"blocked";reason:string}>}
):Readonly<{preparePartition:(ctx:WorktreeContext,exactTodoIds:readonly string[])=>Promise<unknown>;
 supervisePartition:(ctx:WorktreeContext,batchId:string)=>Promise<unknown>}>{
 // La selección exacta solo existe en el cableado interno, no en los argumentos
 // del comando ni en los parámetros generados por el modelo.
 const handler=async(args:string|undefined,ctx:WorktreeContext,exactTodoIds?:readonly string[],exactBatchId?:string):Promise<unknown>=>{

   const raw=args?.trim()??"";
   const integrationMatch=/^(integration(?:-review|-continue)?|prepare-native)(?: ([0-9a-f-]{36}))?$/u.exec(raw);
   const action=integrationMatch?.[1]??raw;
   if(action!=="prepare-native"&&action!=="prepare"&&action!=="prepare-todos"&&action!=="prepare-auto"&&action!=="attach"&&action!=="attach-plan"&&action!=="plan-todo"&&action!=="supervise"&&action!=="collect"&&action!=="integration"&&action!=="integration-review"&&action!=="integration-continue"&&action!=="status"&&action!=="review"){
    ctx.ui.notify(usage,"info");return usage;
   }
   const id=ctx.sessionManager?.getSessionId?.();
   if(action==="prepare-native"){
    const batchId=integrationMatch?.[2];
    if(!id||!batchId||ctx.mode!=="tui"||ctx.hasUI!==true||!ctx.ui.confirm||!options?.prepareNativeChildren){
     const result={status:"unavailable",reason:"Indicar el lote exacto en /asen-worktrees prepare-native <lote> desde su sesión Pi original."};
     ctx.ui.notify(result.reason,"warning");return result;
    }
    const root=realpathSync(path.resolve(ctx.cwd)),manager=ctx.sessionManager;
    const validate=()=>{
     if(ctx.signal?.aborted||ctx.sessionManager!==manager||manager?.getSessionId?.()!==id||realpathSync(path.resolve(ctx.cwd))!==root)
      throw Error("La sesión o el proyecto cambió; revisar el lote.");
    };
    validate();
    const result=await options.prepareNativeChildren(batchId,ctx,validate);
    validate();ctx.ui.notify(JSON.stringify(result,null,2),"info");return result;
   }
   if(action==="attach-plan"){
    // Se usa la sesión Pi que realmente está abierta en el worktree.
    // Vinculación y reconstrucción siguen siendo pasos no autorizantes.
    const manager=ctx.sessionManager,cwd=ctx.cwd;
    const attached=await handler("attach",ctx) as {status?:string};
    if(attached.status!=="attached")return attached;
    if(ctx.signal?.aborted||ctx.sessionManager!==manager||manager?.getSessionId?.()!==id||ctx.cwd!==cwd)
     throw new Error("Child Pi session changed after attachment; inspect the saved link");
    const planned=await handler("plan-todo",ctx) as {status?:string};
    if(planned.status==="declined"||planned.status==="cancelled")ctx.ui.notify("Vinculación guardada. Para continuar, usa /asen-worktrees plan-todo; no repitas attach.","info");
    return planned;
   }
   if(action==="supervise"){
    if(!id||!ctx.cwd||ctx.mode!=="tui"||ctx.hasUI!==true||
     !ctx.ui.confirm||(!exactBatchId&&!ctx.ui.select)||!options?.journalFile||!options.sessionLinksFile||
     !options.planClaimsFile||!options.supervisorClaimsFile||!options.loadTodos||!options.loadChildAgentRecords||
     !options.loadChildTaskAgentLinks||!options.launchChildWorker){
     const denied={status:"unavailable" as const,reason:"T06 supervisor requires the active parent Pi TUI, prepared child ODD, trusted AgentRuntime and a fresh confirmation per Worker"};
     ctx.ui.notify(denied.reason,"warning");return denied;
    }
    const root=realpathSync(path.resolve(ctx.cwd)),manager=ctx.sessionManager,
     identity:TodoContext={sessionId:id,projectId:root};
    const validateParent=async()=>{
     if(ctx.signal?.aborted||ctx.sessionManager!==manager||
      manager?.getSessionId?.()!==id||realpathSync(path.resolve(ctx.cwd))!==root)
      throw new Error("Parent Pi session or worktree changed; stop supervised Worker launches");
    };
    const sourceJournal=new ParallelTodoWorktreeJournal(options.journalFile),
     sessionJournal=new ParallelChildSessionJournal(options.sessionLinksFile,sourceJournal),
     claimJournal=new ParallelChildPlanClaimJournal(options.planClaimsFile),
     attemptJournal=new ParentSupervisorClaimJournal(options.supervisorClaimsFile),
     batches=await sourceJournal.list(identity),batch=exactBatchId?batches.find(item=>item.id===exactBatchId):batches.at(-1);
    await validateParent();
    if(!batch||batch.state!=="prepared"){
     const denied={status:"blocked" as const,reason:"No latest fully prepared source ODD batch; review worktrees before launching"};
     ctx.ui.notify(denied.reason,"warning");return denied;
    }
    const result=await launchParentApprovedWorkers({
     source:identity,batchId:batch.id,sourceJournal,sessionJournal,claimJournal,attemptJournal,
     loadTodos:options.loadTodos,loadAgents:options.loadChildAgentRecords,
     loadTaskAgentLinks:options.loadChildTaskAgentLinks,validateParent,
     ...(exactBatchId?{exactBatchConsent:true}:{}),
     confirmBatch:async ready=>{
      await validateParent();
      const answer=await ctx.ui.confirm!(exactBatchId?"Autorizar las dos escrituras ODD exactas de este lote?":"Preparar lanzamiento Pi de Workers hijos?",[
       "Lote ODD original: "+batch.id,
       ...ready.tasks.map(unit=>unit.sourceTodoId+" · child: "+unit.childSessionId+
        " · modelo solicitado: "+unit.model+" · scope: "+unit.writeSurfaces.join(", ")),
       ...(exactBatchId?[
        "Proyecto padre: "+root,"SHA exacto: "+batch.sourceHead,
        ...ready.tasks.map(unit=>["Todo hijo: "+unit.childTodoId,"Sesión: "+unit.childSessionId,"Worktree: "+unit.childProjectId,
         "Modelo solicitado: "+unit.model,"Ámbito exacto: "+unit.writeSurfaces.join(", "),
         "Instrucción íntegra: "+unit.instruction].join("\n")),
        "Permite un único intento por cada Writer indicado, solo lectura/edición/escritura dentro de sus ámbitos. Caduca en cinco minutos para iniciar. No se reutiliza tras fallo o reinicio.",
        "Esta autorización se deriva individualmente dentro del despachador ODD real; no se amplían rutas ni se copian permisos del padre."
       ]:[
        "Solo se usarán worktrees preparados y sesiones Pi hijas ya adjuntadas por el usuario.",
        "Se solicitará una confirmación INDIVIDUAL por Worker con su instrucción y el candidato exacto."
       ]),
       "El coste real/monetario del modelo es DESCONOCIDO; consulta proveedor antes de consentir.",
       "Los Workers pueden ejecutarse simultáneamente tras lanzarse, bajo los límites del AgentRuntime.",
       ...(exactBatchId?[]:["Una denegación explícita comprobada permite ofrecer otro Worker independiente, pero solo con una aprobación individual nueva."]),
       "Si hay un fallo o resultado incierto, se detiene el lote. Ningún Worker iniciado se repite automáticamente.",
       "No se crearán sesiones ficticias, no habrá modelo de pago implícito, retry, PASS, limpieza ni merge."
      ].join("\n"));
      await validateParent();return answer===true;
     },
     confirmWorker:async(unit,task)=>{
      await validateParent();
      const approvedLabel="Sí, autorizar únicamente este Worker";
      const declinedLabel="No, rechazar expresamente este Worker";
      if(exactBatchId)return undefined; // No pedir otra autorización en la ruta exacta.
      const selected=await ctx.ui.select!([
       "Autorizar Worker Pi separado?",
       "Todo original: "+unit.sourceTodoId,"Todo hijo: "+unit.childTodoId,
       "Sesión hija previamente adjunta: "+unit.childSessionId,
       "Worktree: "+unit.childProjectId,"HEAD: "+unit.baseRevision,
       "Modelo solicitado: "+unit.model+" (precio/uso efectivo: desconocido)",
       "Write scope EXACTO: "+unit.writeSurfaces.join(", "),
       "Instrucción exacta de planificación (dato no confiable): "+task.instruction,
       "Solo autoriza este único intento Writer. Se aplica el Dispatcher ODD existente.",
       "No se transferirán credenciales ni permisos del padre; no se ejecutará merge ni reintento."
      ].join("\n"),[approvedLabel,declinedLabel],ctx.signal?{signal:ctx.signal}:undefined);
      await validateParent();
      // Escape devuelve undefined. Solo una selección explícita puede denegar.
      return selected===approvedLabel?true:selected===declinedLabel?false:undefined;
     },
     launchChild:(unit,confirm,validateExact,startBefore)=>options.launchChildWorker!(unit,confirm,validateExact,startBefore)
    });
    ctx.ui.notify(JSON.stringify(result,null,2),
     result.status==="started"?"info":"warning");
    return result;
   }
   if(action==="integration"||action==="integration-review"||action==="integration-continue"){
    if(!id||!ctx.cwd||!options?.journalFile||!options.sessionLinksFile||!options.observationFile)
     return {status:"unavailable",reason:"No existe una sesión propietaria y sus diarios de lote."};
    const source=realpathSync(path.resolve(ctx.cwd)),manager=ctx.sessionManager;
    const identity={sessionId:id,projectId:source};
    const validate=()=>{
     if(ctx.signal?.aborted||ctx.sessionManager!==manager||manager?.getSessionId?.()!==id||
      realpathSync(path.resolve(ctx.cwd))!==source)throw new Error("La sesión del lote cambió.");
    };
    const sourceJournal=new ParallelTodoWorktreeJournal(options.journalFile);
    const sessionJournal=new ParallelChildSessionJournal(options.sessionLinksFile,sourceJournal);
    const observations=new ParallelWorkerObservationJournal(options.observationFile);
    try{
     const batches=(await sourceJournal.list(identity)).filter(row=>row.state==="prepared");
     validate();
     const selected=integrationMatch?.[2]??(batches.length===1?batches[0]!.id:ctx.hasUI&&ctx.ui.select?await ctx.ui.select("Selecciona el lote ODD preparado",batches.map(row=>row.id)):undefined);
     validate();
     const batch=batches.find(row=>row.id===selected);
     if(!batch)throw new Error("Selecciona un lote ODD propio por su identificador exacto.");
     const candidate=await buildNativeIntegrationCandidate({identity,batchId:batch.id,sourceJournal,sessionJournal,observations});
     validate();
     if(action!=="integration"){
      const run=action==="integration-review"?options.reviewIntegratedCandidate:options.continueIntegratedCandidate;
      if(!run||ctx.mode!=="tui"||ctx.hasUI!==true||!ctx.ui.confirm)return {status:"unavailable",reason:"Se necesita la sesión Pi propietaria y confirmación interactiva."};
      const result=await run(candidate,ctx,validate);validate();ctx.ui.notify(JSON.stringify(result,null,2),"info");return result;
     }
     const result={status:"candidate-prepared",candidate,
      next:"Revisar el candidato exacto, ejecutar pruebas firmadas y obtener aprobación antes de integrar; las sucesoras siguen bloqueadas."};
     ctx.ui.notify(JSON.stringify(result,null,2),"info");return result;
    }catch(error){
     validate();
     const result={status:"blocked",reason:error instanceof Error?error.message:"No se pudo construir el candidato exacto.",autoMerge:false};
     ctx.ui.notify(result.reason,"warning");return result;
    }
   }
   if(action==="collect"){
    if(!id||!ctx.cwd||ctx.mode!=="tui"||ctx.hasUI!==true||!ctx.ui.confirm||
     !options?.journalFile||!options.sessionLinksFile||!options.planClaimsFile||
     !options.observationFile||!options.loadTodos||!options.loadChildAgentRecords||
     !options.loadChildTaskAgentLinks){
     const unavailable={status:"unavailable" as const,reason:"T06 collection requires a live source Pi session, approved child ODD plans and genuine agent/task-link readers"};
     ctx.ui.notify(unavailable.reason,"warning");return unavailable;
    }
    const source=realpathSync(path.resolve(ctx.cwd)),manager=ctx.sessionManager,
     sourceIdentity={sessionId:id,projectId:source};
    const current=()=>{
     if(ctx.signal?.aborted||ctx.sessionManager!==manager||manager?.getSessionId?.()!==id||
      realpathSync(path.resolve(ctx.cwd))!==source)
      throw new Error("Source Pi session or project changed during Worker evidence collection");
    };
    const sourceJournal=new ParallelTodoWorktreeJournal(options.journalFile),
     sessionJournal=new ParallelChildSessionJournal(options.sessionLinksFile,sourceJournal),
     claimJournal=new ParallelChildPlanClaimJournal(options.planClaimsFile),
     observations=new ParallelWorkerObservationJournal(options.observationFile);
    const batches=await sourceJournal.list(sourceIdentity),batch=batches.at(-1);
    current();
    if(!batch||batch.state!=="prepared"){
     const blocked={status:"blocked" as const,reason:"No last fully prepared parent ODD batch to collect; inspect the journal manually"};
     ctx.ui.notify(blocked.reason,"warning");return blocked;
    }
    const inspect=()=>inspectParallelBatchWorkerOutcomes({
     identity:sourceIdentity,sourceJournal,sessionJournal,planClaims:claimJournal,batchId:batch.id,
     loadTodos:options!.loadTodos!,loadAgents:options!.loadChildAgentRecords!,
     loadTaskAgentLinks:options!.loadChildTaskAgentLinks!
    });
    const preview=await inspect();current();
    if(preview.status!=="ready-to-record"){
     const blocked={status:"blocked" as const,batchId:batch.id,
      blockers:preview.blockers,grantsAuthority:false as const,autoRetry:false as const};
     ctx.ui.notify(JSON.stringify(blocked,null,2),"warning");return blocked;
    }
    const confirmed=await ctx.ui.confirm("Registrar observaciones de Workers de este lote?",[
     "Lote ODD: "+batch.id,
     ...preview.workers.map(unit=>unit.link.sourceTodoId+": "+unit.worker.agentState+" · "+unit.changes.status),
     "Se registrará cada estado del AgentRuntime asociado a un Todo y su diff Git.",
     "NO acredita modelo realmente consumido, test PASS, aceptación, grant, reintento ni merge.",
     "Una interrupción puede dejar registros parciales para inspección; nunca se reenvían automáticamente."
    ].join("\n"));
    current();
    if(confirmed!==true)return {status:"declined" as const,grantsAuthority:false as const,autoMerge:false as const};
    const fresh=await inspect();current();
    if(fresh.status!=="ready-to-record"||JSON.stringify(fresh)!==JSON.stringify(preview))
     throw new Error("Parent batch or child Worker observations changed during consent; no receipts were recorded");
    current();
    // All child receipts are persisted in ONE journal transaction.
    // A failure cannot leave half the batch falsely collected.
    const recorded=await observations.recordBatch(fresh.workers);
    current();
    const output={status:"observed-needs-independent-review" as const,batchId:batch.id,
     observed:recorded.map(row=>({sourceTodoId:row.sourceTodoId,agentState:row.agentState,
      changeState:row.worktreeChangeState,modelActual:"unknown" as const})),
     acceptance:"not-accepted" as const,grantsAuthority:false as const,
     autoRetry:false as const,autoMerge:false as const};
    ctx.ui.notify(JSON.stringify(output,null,2),"info");return output;
   }
   if(action==="plan-todo"){
    if(!id||ctx.mode!=="tui"||ctx.hasUI!==true||!ctx.ui.confirm||!ctx.cwd||
     !options?.journalFile||!options.sessionLinksFile||!options.planClaimsFile||
     !options.loadTodos||!options.planChildTodo){
     const denied={status:"unavailable" as const,reason:"ODD child handoff requires active Pi TUI, source Todos, confirmed child link and ODD planner"};
     ctx.ui.notify(denied.reason,"warning");return denied;
    }
    const root=realpathSync(path.resolve(ctx.cwd)),manager=ctx.sessionManager;
    const verifyContext=()=>{
     if(ctx.signal?.aborted||ctx.sessionManager!==manager||manager?.getSessionId?.()!==id||
      realpathSync(path.resolve(ctx.cwd))!==root)
      throw new Error("Child Pi session or worktree changed before ODD planning");
    };
    const sourceJournal=new ParallelTodoWorktreeJournal(options.journalFile),
     sessionJournal=new ParallelChildSessionJournal(options.sessionLinksFile,sourceJournal),
     claims=new ParallelChildPlanClaimJournal(options.planClaimsFile),
     linked=await sessionJournal.listChild({sessionId:id,projectId:root}),
     owner=await sourceJournal.findPreparedWorktree(root);
    if(linked.length!==1||!owner||linked[0]!.sourceTodoId!==owner.taskId||
     linked[0]!.batchId!==owner.batchId)
     throw new Error("Child Pi session must be attached to this exact prepared source Todo");
    const origin={sessionId:owner.sourceSessionId,projectId:owner.sourceProjectId},
     batch=(await sourceJournal.list(origin)).find(row=>row.id===owner.batchId);
    if(!batch||batch.state!=="prepared")throw new Error("Original worktree batch is not fully prepared");
    const units=batch.tasks.map(task=>({taskId:task.taskId,writeSurfaces:task.writeSurfaces}));
    const inspectAndBind=async()=>{
     verifyContext();
     const rows=await options.loadTodos!(origin);
     bindParallelSourceTodos({identity:origin,expectedHead:owner.sourceHead,rows,units});
     const inspection=inspectParallelWorktreeChanges({
      sourceRoot:owner.sourceProjectId,worktreeRoot:root,baseRevision:owner.sourceHead,
      writeSurfaces:owner.writeSurfaces
     });
     if(inspection.status!=="clean")
      throw new Error("Child worktree must remain clean and pinned to source HEAD before re-planning");
     const row=rows.find(value=>value.taskId===owner.taskId);
     const basis=row?.plan?.writerAuthorizationBasis;
     if(!basis||!row?.requestId)throw new Error("Original ODD Worker has no persisted exact authorization facts");
     const original:unknown=JSON.parse(basis);
     if(!original||typeof original!=="object"||Array.isArray(original)||
      typeof (original as {taskIdentity?:unknown}).taskIdentity!=="string"||
      typeof (original as {instruction?:unknown}).instruction!=="string"||
      (original as {taskIdentity:string}).taskIdentity!==row.requestId.slice("asen-plan:".length,-":worker".length)||
      row.description!=="Perform only the authorized, scoped work for: "+
       (original as {instruction:string}).instruction)
      throw new Error("The original ODD task identity or instruction differs from the exact saved Worker plan");
     // El padre no hereda perfiles: solo la vinculación de la sesión hija
     // puede justificar un Writer directo en delegación completa.
     const childProfiles=options.childProfiles?
      await options.childProfiles({sessionId:id,projectId:root}):undefined;
     verifyContext();
     const checked=JSON.parse(controlledInstructionPlanCommand(
      basis,root,{id:"source-todo-"+owner.taskId,repository:root,revision:owner.sourceHead,
       createdAt:new Date().toISOString()},childProfiles
     )) as {route?:string;executablePlan?:{tasks?:readonly {role:string;writeSurfaces?:readonly string[]}[]}};
     const workerTasks=checked.executablePlan?.tasks?.filter(task=>task.role==="worker")??[];
     if((checked.route!=="orchestrate"&&checked.route!=="direct")||workerTasks.length!==1||
      workerTasks[0]!.writeSurfaces?.length!==owner.writeSurfaces.length||
      workerTasks[0]!.writeSurfaces?.some((p,i)=>p!==owner.writeSurfaces[i]))
      throw new Error("Fresh child ODD policy does not produce a delegated Worker; rebuild manually");
     return basis;
    };
    const basis=await inspectAndBind();
    verifyContext();
    const approved=await ctx.ui.confirm("Reconstruir ODD en el worktree?",[
     "Source Todo: "+owner.taskId,"Worktree: "+root,"HEAD: "+owner.sourceHead,
     "Scope original: "+owner.writeSurfaces.join(", "),
     "Instrucción ODD de origen (dato no confiable): "+String(JSON.parse(basis).instruction??"").slice(0,1200),
     "El plan será recalculado con el proyecto de esta sesión Pi (no importará grants previos).",
     "La planificación existente puede iniciar tareas de lectura; Writer exigirá un SEGUNDO consentimiento individual.",
     "Un intento interrumpido quedará registrado; NO habrá reintento automático ni merge."
    ].join("\n"));
    verifyContext();
    if(approved!==true)return {status:"declined",grantsAuthority:false,autoDispatch:false};
    const freshBasis=await inspectAndBind();
    if(freshBasis!==basis)throw new Error("ODD source basis changed during child consent");
    const afterLinks=await sessionJournal.listChild({sessionId:id,projectId:root});
    if(afterLinks.length!==1||JSON.stringify(afterLinks[0])!==JSON.stringify(linked[0]))
     throw new Error("Child Pi session attribution changed before ODD handoff");
    // Claim BEFORE calling the existing planner: crash/restart is never replay permission.
    await claims.claim(linked[0]!);
    verifyContext();
    const planned=await options.planChildTodo(basis,ctx);
    verifyContext();
    const result={status:"handed-to-own-odd-planner" as const,sourceTodoId:owner.taskId,
     grantsAuthority:false as const,autoMerge:false as const,autoRetry:false as const,
     plannerResult:planned};
    ctx.ui.notify("ASEN delegó la tarea al planificador ODD de esta sesión; los permisos Writer siguen sujetos a confirmación nueva.","info");
    return result;
   }
   if(action==="attach"){
    if(!id||ctx.mode!=="tui"||ctx.hasUI!==true||!ctx.ui.confirm||
     !ctx.cwd||!options?.journalFile||!options?.sessionLinksFile){
     const blocked={status:"unavailable" as const,reason:"Child session attachment requires live Pi TUI, consent and the private source journal"};
     ctx.ui.notify(blocked.reason,"warning");return blocked;
    }
    const root=realpathSync(path.resolve(ctx.cwd)),manager=ctx.sessionManager;
    const validate=()=>{
     if(ctx.signal?.aborted||ctx.sessionManager!==manager||
      manager?.getSessionId?.()!==id||
      realpathSync(path.resolve(ctx.cwd))!==root)
      throw new Error("Child Pi session or Git worktree changed during attachment");
    };
    const saved=await new ParallelChildSessionJournal(options.sessionLinksFile,
     new ParallelTodoWorktreeJournal(options.journalFile)).attach({
     childSessionId:id,childProjectId:root,validateSession:validate,
     confirm:async owner=>{
      validate();
      const accepted=await ctx.ui.confirm!("Asociar sesión Pi con Todo de origen?",[
       "Tarea original: "+owner.sourceTodoId,"Proyecto origen: "+owner.sourceProjectId,
       "HEAD de origen: "+owner.sourceHead,"Worktree: "+owner.worktreeRoot,
       "Scope original: "+owner.writeSurfaces.join(", "),
       "No se iniciarán agentes. Esta asociación NO copia grants, credenciales ni permisos de escritura.",
       "Para escribir, crea un plan ODD nuevo en este worktree y autoriza explícitamente su Worker."
      ].join("\n"));
      validate();return accepted===true;
     }
    });
    const display={status:saved.status,grantsAuthority:false as const,autoDispatch:false as const,
     ...(saved.link?{sourceTodoId:saved.link.sourceTodoId,childProjectId:saved.link.childProjectId,
       childSessionId:saved.link.childSessionId}:{} )};
    ctx.ui.notify(JSON.stringify(display,null,2),"info");return display;
   }
   if(action==="status"||action==="review"){
    if(!id||!options?.journalFile||!ctx.cwd){
     const unavailable={status:"unavailable" as const,reason:"Worktree journal or owned Pi session unavailable"};
     ctx.ui.notify(unavailable.reason,"warning");return unavailable;
    }
    const root=realpathSync(path.resolve(ctx.cwd));
    const records=await new ParallelTodoWorktreeJournal(options.journalFile).list({sessionId:id,projectId:root});
    const rows=options.loadTodos?await options.loadTodos({sessionId:id,projectId:root}):[];
    const linked=options.sessionLinksFile?await new ParallelChildSessionJournal(
     options.sessionLinksFile,new ParallelTodoWorktreeJournal(options.journalFile)
    ).listSource({sessionId:id,projectId:root}):[];
    const linkedBySource=new Map(linked.map(link=>[link.sourceTodoId,link]));
    const claimed=options.planClaimsFile?await new ParallelChildPlanClaimJournal(
     options.planClaimsFile
    ).listSource({sessionId:id,projectId:root},linked):[];
    const claimedTasks=new Set(claimed.map(item=>item.sourceTodoId));
    const receipts=options.observationFile?await new ParallelWorkerObservationJournal(
     options.observationFile
    ).listSource({sessionId:id,projectId:root},linked):[];
    const receiptByTask=new Map(receipts.map(item=>[item.sourceTodoId,item]));
    const supervisorClaims=options.supervisorClaimsFile?
     await new ParentSupervisorClaimJournal(options.supervisorClaimsFile)
      .listSource({sessionId:id,projectId:root}):[];
    const supervisorClaimedBatches=new Set(supervisorClaims.map(item=>item.batchId));
    const childObserved=new Map<string,Readonly<{agents:readonly {id:string;role:string;state:string}[];
     todos:readonly {taskId:string;role?:string;state:string}[]}>>();
    for(const link of linked){
     const identity={sessionId:link.childSessionId,projectId:link.childProjectId};
     const task=records.find(batch=>batch.id===link.batchId)?.tasks.find(t=>t.taskId===link.sourceTodoId);
     if(!task)throw new Error("Linked Pi child does not match any reserved source Todo");
     const todos=options.loadTodos?await options.loadTodos(identity):[];
     let attributed:readonly {id:string;role:string;state:string}[]=[];
     if(claimedTasks.has(link.sourceTodoId)&&options.loadChildAgentRecords&&options.loadChildTaskAgentLinks){
      const [records,links]=await Promise.all([
       options.loadChildAgentRecords(identity),options.loadChildTaskAgentLinks(identity)
      ]);
      const worker=attributeParallelChildWorker({
       owner:link,writeSurfaces:task.writeSurfaces,todos,agents:records,taskAgentLinks:links
      });
      if(worker)attributed=[{id:worker.agentId,role:"worker",state:worker.agentState}];
     }
     childObserved.set(link.sourceTodoId,{
      agents:attributed,
      todos:todos.map(t=>({taskId:t.taskId,...(t.plan?.role?{role:t.plan.role}:{}),state:t.current.state}))
     });
    }
    const auditRows=records.map(record=>({
      batchId:record.id,createdAt:record.createdAt,state:record.state,sourceHead:record.sourceHead,
      supervisorClaimed:supervisorClaimedBatches.has(record.id),
      tasks:record.tasks.map(task=>{
       const live=rows.find(row=>row.taskId===task.taskId);
       return {sourceTodoId:task.taskId,sourceRequestId:task.requestId,sourceRevision:task.taskRevision,
        sourceTodoState:live?.current.state??"missing",
        sourceTodoUnchanged:live?.current.revision===task.taskRevision&&live?.current.state==="planned",
        worktreeRoot:task.worktreeRoot,worktreePresent:existsSync(task.worktreeRoot),
        writeSurfaces:task.writeSurfaces,handoffClaimed:claimedTasks.has(task.taskId),
        ...(receiptByTask.has(task.taskId)?{workerReceipt:receiptByTask.get(task.taskId)}:{}),
        changes:record.state==="prepared"?inspectParallelWorktreeChanges({
         sourceRoot:record.projectId,worktreeRoot:task.worktreeRoot,
         baseRevision:record.sourceHead,writeSurfaces:task.writeSurfaces
        }):{status:"unavailable" as const,changedPaths:[],outOfScopePaths:[],
         sourceVerified:false,headMatchesBase:false,acceptance:"not-accepted" as const,autoMerge:false as const},
        ...(linkedBySource.has(task.taskId)?{childSession:{
         id:linkedBySource.get(task.taskId)!.childSessionId,
         project:linkedBySource.get(task.taskId)!.childProjectId,
         agents:childObserved.get(task.taskId)?.agents??[],
         todos:childObserved.get(task.taskId)?.todos??[]
        }}:{}),
        acceptance:"not-accepted"};
      })
     }));
    const result={
     status:action==="review"?"review-preview" as const:"audit-only" as const,
     grantsAuthority:false as const,autoResume:false as const,autoMerge:false as const,
     records:auditRows,
     supervisorAttempts:supervisorClaims.map(item=>({
      batchId:item.batchId,claimedAt:item.claimedAt,status:item.status,
      grantsAuthority:false as const,autoRetry:false as const,autoMerge:false as const
     })),
     flowOverview:projectParallelAgentFlow(auditRows),
     ...(action==="review"?{reconciliation:auditRows.map(record=>({
      batchId:record.batchId,
      ...reconcileParallelWorktreeBatch({
       batchState:record.state,
       units:record.tasks.map(task=>({
        taskId:task.sourceTodoId,sourceTodoUnchanged:task.sourceTodoUnchanged,
        changes:task.changes,...("childSession" in task?{childSession:task.childSession}:{})
       }))
      })
     }))}:{})
    };
    ctx.ui.notify(JSON.stringify(result,null,2),"info");return result;
   }
   const automatic=action==="prepare-auto";
   if(!id||ctx.mode!=="tui"||ctx.hasUI!==true||(!automatic&&!ctx.ui.editor)||!ctx.ui.confirm){
    const blocked={status:"unavailable" as const,reason:"Worktree creation requires live Pi TUI, editor, confirmation and an owned session"};
    ctx.ui.notify(blocked.reason,"warning");return blocked;
   }
   const root=realpathSync(path.resolve(ctx.cwd)),head=currentHead(root),
    manager=ctx.sessionManager;
   const linked=action==="prepare-todos"||automatic;
   if(linked&&(!options?.loadTodos||!options.journalFile)){
    const unavailable={status:"unavailable" as const,reason:"Linked worktree preparation needs Todo runtime and a private journal"};
    ctx.ui.notify(unavailable.reason,"warning");return unavailable;
   }
   const owner:TodoContext={sessionId:id,projectId:root};
   const checkIdentity=()=>{
    if(ctx.signal?.aborted||ctx.sessionManager!==manager||
      manager?.getSessionId?.()!==id||
      realpathSync(path.resolve(ctx.cwd))!==root)
     throw new Error("Worktree preparation session or project changed; inspect any already-created worktrees");
   };
   const journal=linked?new ParallelTodoWorktreeJournal(options!.journalFile!):undefined;
   const currentTodos=linked?await options!.loadTodos!(owner):[];
   checkIdentity();
   const planned=currentTodos.filter(row=>row.current.state==="planned"&&row.plan?.role==="worker"&&
    row.plan.candidate?.revision===head&&row.plan.writeSurfaces?.length);
   if(linked&&planned.length<2){
    const blocked={status:"blocked" as const,reason:"Prepare at least two candidate-bound planned ODD Worker Todos before linking worktrees"};
    ctx.ui.notify(blocked.reason,"warning");return blocked;
   }

   // El plan natural ya conoce las dos raíces guardadas. Nunca se
   // seleccionan tareas de otro plan para completar un lote exacto.
   const exactRows=exactTodoIds?exactTodoIds.map(todoId=>planned.find(todo=>todo.taskId===todoId)):undefined;
   if(exactTodoIds&&(exactTodoIds.length!==2||new Set(exactTodoIds).size!==2||
    exactRows?.some(row=>!row||!!row.dependsOn?.length))){
    const blocked={status:"blocked" as const,reason:"Las dos unidades ODD originales ya no están disponibles; no se preparan otras tareas."};
    ctx.ui.notify(blocked.reason,"warning");return blocked;
   }
   if(exactTodoIds&&journal){
    const prior=await journal.list(owner);
    checkIdentity();
    if(prior.some(batch=>batch.tasks.some(task=>exactTodoIds.includes(task.taskId)))){
     const blocked={status:"blocked" as const,reason:"Las unidades de este plan ya tienen una reserva; revisar el lote existente sin repetirlo."};
     ctx.ui.notify(blocked.reason,"warning");return blocked;
    }
   }
   const proposed=planned.map(todo=>({taskId:todo.taskId,writeSurfaces:todo.plan!.writeSurfaces!}));
   const excluded=linked?await journal!.blockedSourceTodoIds(owner,proposed):undefined;
   checkIdentity();
   const compatible=linked?selectReadyParallelSourcePair({identity:owner,expectedHead:head,rows:exactRows?exactRows.map(row=>row!):currentTodos,
    ...(excluded?{excludedTaskIds:excluded}:{})}):[];
   if(automatic&&compatible.length!==2){
    const blocked={status:"blocked" as const,reason:"No hay dos Writers listos, sin dependencias pendientes ni ámbitos solapados o reservados; no se crean carpetas ni se solicitan permisos."};
    ctx.ui.notify(blocked.reason,"warning");return blocked;
   }
   const sample={
    parentDir:path.join(path.dirname(root),path.basename(root)+"-worktrees"),
    units:linked?(compatible.length===2?compatible:proposed.slice(0,2)):
     [{taskId:"backend",writeSurfaces:["src/backend"]},{taskId:"frontend",writeSurfaces:["src/frontend"]}]
   };
   // Dos tareas ODD y ámbitos persistidos: no se permite ampliar rutas por el editor.
   const edited=automatic?undefined:await ctx.ui.editor!("Preparar worktrees: directorio padre existente y dos a cuatro scopes separados (JSON)",JSON.stringify(sample,null,2));
   checkIdentity();
   if(!automatic&&!edited?.trim())return {status:"cancelled",grantsAuthority:false};
   const selection=automatic?sample:readRequest(edited!);

   const bound=linked?bindParallelSourceTodos({
    identity:owner,expectedHead:head,rows:currentTodos,units:selection.units
   }):undefined;
   const batchId=linked?newParallelTodoWorktreeBatchId():undefined;
   let pendingReservation:Readonly<{id:string;sourceHead:string;parentDir:string}>|undefined;
   let gitAddAttempted=false,createdParent=false,consented=false;
   let result:Awaited<ReturnType<typeof prepareParallelWorkerWorktrees>>;
   try{
   if(automatic){
    // El único permiso de esta fase vincula exactamente el proyecto, SHA,
    // tareas, ámbitos y directorio. No es autorización de escritura.
    checkIdentity();
    consented=await ctx.ui.confirm!("Preparar dos carpetas Git aisladas?",[
     "Origen: "+root,"SHA: "+head,"Directorio: "+selection.parentDir,
     ...selection.units.map(unit=>unit.taskId+": "+unit.writeSurfaces.join(", ")),
     "La carpeta se creará si no existe. No se abrirán sesiones Pi ni se iniciarán Writers.",
     "Sin permisos de escritura, sin reintentos y sin fusión automática."
    ].join("\n"))===true;
    checkIdentity();
    if(!consented)return {status:"declined" as const,grantsAuthority:false as const};
    if(!existsSync(selection.parentDir)){
     mkdirSync(selection.parentDir);
     createdParent=true;
    }
   }
   result=await prepareParallelWorkerWorktrees({
    sourceRoot:root,parentDir:selection.parentDir,expectedHead:head,units:selection.units,
    onBeforeWorktreeAdd:()=>{gitAddAttempted=true;},
    ...(batchId?{batchId}:{}),
    ...(ctx.signal?{signal:ctx.signal}:{}),
    confirm:async summary=>{
     checkIdentity();
     const message=[
      "Se crearán "+summary.creates+" worktrees en "+selection.parentDir,
      "Origen: "+summary.sourceRoot,
      "HEAD exacto: "+summary.revision,
      ...summary.scopes.map(unit=>unit.taskId+": "+unit.writeSurfaces.join(", ")),
      "NO se lanzará ningún Worker ni se concederá autorización de escritura.",
      "Los Workers requerirán una sesión, un plan ODD y un consentimiento nuevo por worktree.",
      "NO habrá fusión ni borrado automático. Inspecciona cada worktree al terminar."
     ].join("\n");
     const approved=automatic?
      consented&&summary.sourceRoot===root&&summary.revision===head&&
       summary.creates===selection.units.length&&
       summary.taskIds.every((id,i)=>id===selection.units[i]?.taskId)&&
       summary.scopes.every((unit,i)=>unit.taskId===selection.units[i]?.taskId&&
        JSON.stringify(unit.writeSurfaces)===JSON.stringify(selection.units[i]?.writeSurfaces)):
      await ctx.ui.confirm!("Crear los worktrees Git aislados?",message)===true;
     // No crear ni reservar nada si el usuario cambió de sesión durante el diálogo.
     checkIdentity();
     if(!approved)return false;
     if(linked){
      checkIdentity();
      const freshRows=await options!.loadTodos!(owner);
      checkIdentity(); // Evitar un cambio de sesión durante la lectura.
      const fresh=bindParallelSourceTodos({
       identity:owner,expectedHead:head,rows:freshRows,units:selection.units
      });
      if(!bound||!sameSourceTodoBindings(bound,fresh))
       throw new Error("Source ODD Todo state changed while awaiting confirmation; no worktrees were created");
      pendingReservation=await journal!.reserve({
       identity:owner,id:batchId!,head,parentDir:selection.parentDir,bindings:bound
      });
      checkIdentity(); // Git no se ha intentado todavía.
     }
     return true;
    }
   });
   }catch(error){
    // Antes del primer intento Git puede liberarse solo la reserva exacta.
    // Después de cualquier intento, la incertidumbre impide liberarla.
    if(pendingReservation&&!gitAddAttempted){
     try{
      await journal!.releaseUnstarted({identity:owner,id:pendingReservation.id,
       head:pendingReservation.sourceHead,parentDir:pendingReservation.parentDir});
     }catch{
      throw new Error("No se pudo liberar la reserva T06 previa a Git. Inspección manual obligatoria.",{cause:error});
     }
    }
    if(createdParent&&!gitAddAttempted)try{rmdirSync(selection.parentDir);}catch{/* No borrar carpetas que ya contengan datos. */}
    throw error;
   }
   checkIdentity();
   if(result.status==="declined"){
    if(createdParent&&!gitAddAttempted)try{rmdirSync(selection.parentDir);}catch{/* Sin borrado forzoso. */}
    ctx.ui.notify("Preparación cancelada sin crear worktrees.","info");return result;
   }
   if(linked)await journal!.markPrepared({identity:owner,id:batchId!,allocations:result.allocations});
   const display={status:"prepared" as const,
    ...(linked?{batchId,sourceTodoBound:true as const}:
      {sourceTodoBound:false as const}),
    worktrees:result.allocations.map(a=>({taskId:a.taskId,root:a.root,head:a.baseRevision,writeSurfaces:a.writeSurfaces})),
    grantsAuthority:false as const,autoMerge:false as const,
    next:automatic?"Dos tareas ODD aisladas preparadas sin editar JSON. Faltan sesiones Pi hijas reales y consentimiento Worker individual.":"Abrir una sesión Pi por worktree, preparar ODD y obtener consentimiento Worker individual. Revisión e integración manuales."};
   ctx.ui.notify(JSON.stringify(display,null,2),"info");return display;
  };
 register(ASEN_WORKTREES_COMMAND,{
  description:"Prepare 2–4 isolated Git worktrees after explicit confirmation; Worker authority and integration remain separate",
  handler:(args,ctx)=>handler(args,ctx)
 });
 return Object.freeze({preparePartition:(ctx:WorktreeContext,ids:readonly string[])=>handler("prepare-auto",ctx,Object.freeze([...ids])),
  supervisePartition:(ctx:WorktreeContext,batchId:string)=>handler("supervise",ctx,undefined,batchId)});
}
