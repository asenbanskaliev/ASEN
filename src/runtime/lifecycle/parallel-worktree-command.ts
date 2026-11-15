import {execFileSync} from "node:child_process";
import {existsSync,realpathSync} from "node:fs";
import path from "node:path";
import {prepareParallelWorkerWorktrees,type ParallelWorkerUnit} from "../agents/parallel-worktrees.js";
import {bindParallelSourceTodos,sameSourceTodoBindings,type SourceTodoRow} from "../agents/parallel-todo-bindings.js";
import {ParallelTodoWorktreeJournal,newParallelTodoWorktreeBatchId} from "../agents/parallel-todo-journal.js";
import {ParallelChildSessionJournal} from "../agents/parallel-todo-session-links.js";
import {inspectParallelWorktreeChanges} from "../agents/parallel-worktree-change-inspection.js";
import {reconcileParallelWorktreeBatch} from "../agents/parallel-worktree-reconciliation.js";
import {ParallelChildPlanClaimJournal} from "../agents/parallel-child-plan-claims.js";
import {controlledInstructionPlanCommand} from "./route-command.js";
import type {TodoContext} from "./todo-store.js";

export const ASEN_WORKTREES_COMMAND="asen-worktrees";
const usage="Uso: /asen-worktrees prepare | prepare-todos | attach | plan-todo | status | review (plan-todo pide nuevo consentimiento ODD en la sesión hija)";
type WorktreeContext={
 cwd:string;hasUI?:boolean;mode?:string;signal?:AbortSignal;
 sessionManager?:{getSessionId?:()=>string};
 ui:{notify:(message:string,kind:"info"|"error"|"warning")=>void;
  editor?:(title:string,prefill?:string)=>Promise<string|undefined>;
  confirm?:(title:string,message:string)=>Promise<boolean>};
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
 options?:{journalFile?:string;sessionLinksFile?:string;planClaimsFile?:string;
  planChildTodo?:(input:string,context:WorktreeContext)=>Promise<unknown>;
  loadTodos?:(identity:TodoContext)=>Promise<readonly SourceTodoRow[]>;
  loadChildAgents?:(identity:TodoContext)=>Promise<readonly {id:string;role:string;state:string}[]>}
):void{
 register(ASEN_WORKTREES_COMMAND,{
  description:"Prepare 2–4 isolated Git worktrees after explicit confirmation; Worker authority and integration remain separate",
  handler:async(args,ctx)=>{
   const action=args?.trim();
   if(action!=="prepare"&&action!=="prepare-todos"&&action!=="attach"&&action!=="plan-todo"&&action!=="status"&&action!=="review"){
    ctx.ui.notify(usage,"info");return usage;
   }
   const id=ctx.sessionManager?.getSessionId?.();
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
     const checked=JSON.parse(controlledInstructionPlanCommand(
      basis,root,{id:"source-todo-"+owner.taskId,repository:root,revision:owner.sourceHead,
       createdAt:new Date().toISOString()}
     )) as {route?:string;executablePlan?:{tasks?:readonly {role:string;writeSurfaces?:readonly string[]}[]}};
     const workerTasks=checked.executablePlan?.tasks?.filter(task=>task.role==="worker")??[];
     if(checked.route!=="orchestrate"||workerTasks.length!==1||
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
    const childObserved=new Map<string,Readonly<{agents:readonly {id:string;role:string;state:string}[];
     todos:readonly {taskId:string;role?:string;state:string}[]}>>();
    for(const link of linked){
     const identity={sessionId:link.childSessionId,projectId:link.childProjectId};
     const [agents,todos]=await Promise.all([
      options.loadChildAgents?options.loadChildAgents(identity):Promise.resolve([]),
      options.loadTodos?options.loadTodos(identity):Promise.resolve([])
     ]);
     childObserved.set(link.sourceTodoId,{
      agents:agents.map(a=>({id:a.id,role:a.role,state:a.state})),
      todos:todos.map(t=>({taskId:t.taskId,...(t.plan?.role?{role:t.plan.role}:{}),state:t.current.state}))
     });
    }
    const auditRows=records.map(record=>({
      batchId:record.id,createdAt:record.createdAt,state:record.state,sourceHead:record.sourceHead,
      tasks:record.tasks.map(task=>{
       const live=rows.find(row=>row.taskId===task.taskId);
       return {sourceTodoId:task.taskId,sourceRequestId:task.requestId,sourceRevision:task.taskRevision,
        sourceTodoState:live?.current.state??"missing",
        sourceTodoUnchanged:live?.current.revision===task.taskRevision&&live?.current.state==="planned",
        worktreeRoot:task.worktreeRoot,worktreePresent:existsSync(task.worktreeRoot),
        writeSurfaces:task.writeSurfaces,handoffClaimed:claimedTasks.has(task.taskId),
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
   if(!id||ctx.mode!=="tui"||ctx.hasUI!==true||!ctx.ui.editor||!ctx.ui.confirm){
    const blocked={status:"unavailable" as const,reason:"Worktree creation requires live Pi TUI, editor, confirmation and an owned session"};
    ctx.ui.notify(blocked.reason,"warning");return blocked;
   }
   const root=realpathSync(path.resolve(ctx.cwd)),head=currentHead(root);
   const linked=action==="prepare-todos";
   if(linked&&(!options?.loadTodos||!options.journalFile)){
    const unavailable={status:"unavailable" as const,reason:"Linked worktree preparation needs Todo runtime and a private journal"};
    ctx.ui.notify(unavailable.reason,"warning");return unavailable;
   }
   const owner:TodoContext={sessionId:id,projectId:root};
   const journal=linked?new ParallelTodoWorktreeJournal(options!.journalFile!):undefined;
   const currentTodos=linked?await options!.loadTodos!(owner):[];
   const planned=currentTodos.filter(row=>row.current.state==="planned"&&row.plan?.role==="worker"&&
    row.plan.candidate?.revision===head&&row.plan.writeSurfaces?.length);
   if(linked&&planned.length<2){
    const blocked={status:"blocked" as const,reason:"Prepare at least two candidate-bound planned ODD Worker Todos before linking worktrees"};
    ctx.ui.notify(blocked.reason,"warning");return blocked;
   }
   const checkIdentity=()=>{
    if(ctx.signal?.aborted||ctx.sessionManager?.getSessionId?.()!==id||
      realpathSync(path.resolve(ctx.cwd))!==root)
     throw new Error("Worktree preparation session or project changed; inspect any already-created worktrees");
   };
   const sample={
    parentDir:path.join(path.dirname(root),path.basename(root)+"-worktrees"),
    units:linked?planned.slice(0,2).map(todo=>({taskId:todo.taskId,writeSurfaces:todo.plan!.writeSurfaces!})):
     [{taskId:"backend",writeSurfaces:["src/backend"]},{taskId:"frontend",writeSurfaces:["src/frontend"]}]
   };
   const edited=await ctx.ui.editor("Preparar worktrees: directorio padre existente y dos a cuatro scopes separados (JSON)",JSON.stringify(sample,null,2));
   checkIdentity();
   if(!edited?.trim())return {status:"cancelled",grantsAuthority:false};
   const selection=readRequest(edited);
   const bound=linked?bindParallelSourceTodos({
    identity:owner,expectedHead:head,rows:currentTodos,units:selection.units
   }):undefined;
   const batchId=linked?newParallelTodoWorktreeBatchId():undefined;
   const result=await prepareParallelWorkerWorktrees({
    sourceRoot:root,parentDir:selection.parentDir,expectedHead:head,units:selection.units,
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
     const approved=await ctx.ui.confirm!("Crear los worktrees Git aislados?",message)===true;
     if(!approved)return false;
     if(linked){
      checkIdentity();
      const fresh=bindParallelSourceTodos({
       identity:owner,expectedHead:head,rows:await options!.loadTodos!(owner),units:selection.units
      });
      if(!bound||!sameSourceTodoBindings(bound,fresh))
       throw new Error("Source ODD Todo state changed while awaiting confirmation; no worktrees were created");
      await journal!.reserve({identity:owner,id:batchId!,head,parentDir:selection.parentDir,bindings:bound});
     }
     return true;
    }
   });
   checkIdentity();
   if(result.status==="declined"){ctx.ui.notify("Preparación cancelada sin crear worktrees.","info");return result;}
   if(linked)await journal!.markPrepared({identity:owner,id:batchId!,allocations:result.allocations});
   const display={status:"prepared" as const,
    ...(linked?{batchId,sourceTodoBound:true as const}:
      {sourceTodoBound:false as const}),
    worktrees:result.allocations.map(a=>({taskId:a.taskId,root:a.root,head:a.baseRevision,writeSurfaces:a.writeSurfaces})),
    grantsAuthority:false as const,autoMerge:false as const,
    next:"Abrir una sesión Pi por worktree, preparar ODD y obtener consentimiento Worker individual. Revisión e integración manuales."};
   ctx.ui.notify(JSON.stringify(display,null,2),"info");return display;
  }
 });
}
